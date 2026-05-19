# 📓 Tech Diary — Tuần 5: Notifications · Push · Background Jobs · Load Testing

> **Dự án:** MovieHub · **Giai đoạn:** Tuần 5 (Ngày 29–35)
> **Trọng tâm:** Firebase FCM · BullMQ · Scheduled Jobs · Cache Invalidation · k6 Load Test
> **Tác giả:** Thành viên A (Backend Lead)

---

## 1. 🧩 Tổng Quan Vấn Đề (The Problem Space)

### Bốn bài toán cần giải quyết trong tuần này

| # | Bài toán | Giải pháp |
|---|----------|-----------||
| 1 | Gửi push notification đến thiết bị di động | Firebase Admin SDK (FCM) với graceful-skip |
| 2 | Không block HTTP request khi gửi notification | BullMQ queue — tách notification ra background |
| 3 | Tự động notify khi phim trong watchlist ra mắt | Cron job chạy hàng ngày lúc 9 AM |
| 4 | Redis cache bị stale khi TMDB cập nhật data | Cache invalidation job chạy mỗi 5 phút |

---

### Tại sao không gửi FCM trực tiếp trong HTTP handler?

Hãy tưởng tượng luồng **không có queue**:

```
User like review → POST /reviews/:id/like
  → update MongoDB (10ms)
  → gửi FCM đến chủ review (300-2000ms!) ← block response!
  → trả HTTP 200 về client
```

Với 100 user like đồng thời → 100 goroutine chờ FCM → server chậm hẳn.

**Với BullMQ:**
```
User like review → POST /reviews/:id/like
  → update MongoDB (10ms)
  → enqueue job vào Redis (2ms) ← cực nhanh
  → trả HTTP 200 về client  ← xong ngay!

[Background Worker riêng]
  → dequeue job → gọi FCM (không ai chờ)
  → retry nếu fail (tự động)
```

> **Nguyên tắc:** HTTP handler chỉ làm việc đồng bộ, cực nhanh. Mọi thứ chậm → queue.

---

### Tại sao Redis cache bị stale?

```
Ngày 1: TMDB cập nhật rating phim ID=550 từ 8.4 → 8.1
Ngày 1: Server vẫn trả rating 8.4 từ Redis (TTL còn 20 tiếng)
Ngày 2 (TTL hết): Server mới gọi TMDB → cập nhật 8.1
```

**Giải pháp:** TMDB cung cấp endpoint `/movie/changes` — danh sách movie IDs có thay đổi trong khoảng thời gian cho trước. Job chạy mỗi 5 phút, lấy danh sách IDs thay đổi → xóa Redis keys tương ứng → lần request tiếp theo sẽ fetch fresh data.

---

## 2. 🏗️ Tư Duy Hệ Thống & Workflow

### Kiến trúc Notification Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                    TRIGGER (nhiều nguồn)                      │
│  - Upcoming release job (cron 9 AM)                          │
│  - Review like event (HTTP handler)                           │
│  - System notification (admin action)                         │
└──────────────────────┬───────────────────────────────────────┘
                       │ notificationService.createNotification()
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  NOTIFICATIONS SERVICE                                        │
│  Bước 1: Lưu vào MongoDB (Notification document)             │
│  Bước 2: notificationQueue.add('push_notification', payload) │
└──────────────────────┬───────────────────────────────────────┘
                       │ Job trong Redis queue
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  BULLMQ WORKER (chạy riêng)                                  │
│  Dequeue job → fcmService.sendToUser(userId, notification)   │
│    → Lookup fcmTokens từ User model                          │
│    → FCM Admin SDK → gửi đến thiết bị                       │
│    → Nếu token invalid → auto-remove khỏi User.fcmTokens    │
│  Retry tự động: attempts=3, backoff exponential              │
└──────────────────────────────────────────────────────────────┘
```

### Upcoming Release Job — Logic

```
Cron 0 9 * * * (9 AM hàng ngày):
  1. Gọi TMDB /movie/upcoming → lấy phim release_date = hôm nay
  2. Với mỗi phim → query Watchlist có chứa tmdbId đó
     db.watchlists.find({ 'movies.tmdbId': { $in: [...ids] } })
  3. Group theo userId
  4. Với mỗi userId → createNotification() → enqueue push job
  5. Skip user không có fcmTokens (không cần gửi)
```

### Cache Invalidation Job — Logic

```
Cron */5 * * * * (mỗi 5 phút):
  1. Tính start_date = 5 phút trước, end_date = bây giờ
  2. Gọi TMDB GET /movie/changes?start_date=&end_date=
  3. Extract movie IDs có thay đổi
  4. Với mỗi ID → xóa Redis keys: tmdb:movie:{id}:*
  5. Log số lượng keys đã invalidated
```

---

## 3. 🔬 Giải Mã Logic & Code

### 3.1 Singleton Pattern cho Firebase Admin

Vấn đề: `firebase-admin` chỉ được init một lần. Gọi `initializeApp()` lần 2 → crash.

```typescript
// config/firebase.ts
let firebaseApp: App | null | false = null
// null = chưa init
// false = đã thử init nhưng thiếu config (sentinel)
// App  = đã init thành công

export function getFirebaseAdmin(): App | null {
  if (firebaseApp !== null) {
    return firebaseApp || null  // cache kết quả, không init lại
  }

  const { projectId, clientEmail, privateKey } = ...

  if (!projectId || !clientEmail || !privateKey) {
    firebaseApp = false  // ← ghi nhớ: đã thử, không đủ config
    console.warn('[Firebase] Running in skip mode')
    return null  // graceful skip
  }

  // Kiểm tra app đã tồn tại (phòng hot-reload dev)
  const existing = admin.apps.find(a => a?.name === '[DEFAULT]')
  if (existing) { firebaseApp = existing; return firebaseApp }

  firebaseApp = admin.initializeApp({ credential: admin.credential.cert(...) })
  return firebaseApp
}
```

**Tại sao dùng `false` thay vì `null` làm sentinel?**

- `null` = "chưa biết" → lần sau sẽ thử lại
- `false` = "đã biết là không có config" → lần sau skip ngay, không log warning lặp lại

---

### 3.2 BullMQ Connection — Tại sao cần connection riêng?

```typescript
// config/bullmq.ts
// BullMQ yêu cầu IORedis với maxRetriesPerRequest: null
// Không thể dùng chung connection với Redis cache vì:
// - Cache client có maxRetriesPerRequest = 3 (fail fast)
// - BullMQ cần maxRetriesPerRequest = null (retry vô hạn cho queue ops)

export const bullmqConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,  // ← BắT BUỘC cho BullMQ
  enableReadyCheck: false,
  keyPrefix: 'moviehub:bull:',  // ← tách namespace với cache (moviehub:cache:)
})
```

**Hậu quả nếu dùng chung Redis client:**

BullMQ worker sẽ throw `MaxRetriesPerRequestError` ngay khi Redis có độ trễ nhỏ → job fail không đáng → retry → loop vô tận.

---

### 3.3 Token Auto-Cleanup — Xử lý FCM Token Hết Hạn

```typescript
// services/fcm.service.ts — sendToDevice
const response = await messaging.sendEachForMulticast(message)

// FCM trả về kết quả per-token
response.responses.forEach((resp, idx) => {
  if (!resp.success) {
    const errorCode = resp.error?.code
    if (
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token'
    ) {
      // Token này không còn valid (user uninstall app, reset device...)
      invalidTokens.push(tokens[idx])
    }
  }
})

// Batch remove invalid tokens
if (invalidTokens.length > 0) {
  await UserModel.updateMany(
    { fcmTokens: { $in: invalidTokens } },
    { $pull: { fcmTokens: { $in: invalidTokens } } }
  )
}
```

**Tại sao quan trọng?** Không cleanup → `User.fcmTokens` tích lũy token rác → mỗi lần gửi phải gọi FCM với hàng trăm tokens → tốn quota, chậm.

---

### 3.4 PersonDetail API — Tại sao không tạo module riêng?

PersonDetail (`GET /persons/:id`, `GET /persons/:id/credits`) được mount trong `movies.routes.ts` thay vì tạo module `persons/` riêng.

**Lý do:**
1. `tmdbService` đã có `getPersonDetail()` và `getPersonCredits()` từ Tuần 3
2. Chỉ cần 2 routes, không có business logic phức tạp
3. Tạo module riêng = thêm 4 files (controller/service/routes/validation) cho 2 endpoints → over-engineering
4. Cache TTL giống `MOVIE_DETAIL` (24h) → dùng chung constant

```typescript
// movies.routes.ts — thêm 2 routes
router.get('/persons/:id',
  validate(personIdParamSchema, 'params'),
  cacheMiddleware(TTL.PERSON_DETAIL),  // 24h, dùng chung với MOVIE_DETAIL
  getPersonDetail
)
router.get('/persons/:id/credits', ...)
```

---

### 3.5 k6 — Tại sao Rate Limit phá kết quả test?

Kết quả k6 thực tế: `http_req_failed = 99.23%` — nhưng `p(95) = 7ms`.

**7ms mà vẫn fail** = server trả lỗi rất nhanh. Đây là pattern đặc trưng của **429 Too Many Requests**.

```
RATE_LIMIT_MAX_REQUESTS=100 per 60s (cấu hình hiện tại)
k6 chạy 100 VUs đồng thời từ cùng 1 IP localhost
→ 100 requests/giây → vượt limit trong < 1 giây
→ Mọi request sau → 429 → check fail → http_req_failed cao
```

**Fix:** Tăng `RATE_LIMIT_MAX_REQUESTS=10000` khi chạy k6. Performance thực của server khi pass rate limit: p(95) ≈ 7ms cho cached endpoints — **xuất sắc**.

---

## 4. 💡 Bài Học "Sương Máu"

### 4.1 Graceful Skip — Pattern xuyên suốt

Trong môi trường development, không phải lúc nào cũng có đủ credentials (Firebase, Redis, Elasticsearch...). Thay vì crash, mọi service đều implement graceful skip:

```
Firebase: getFirebaseAdmin() → null nếu thiếu env → FCM noop
Redis:    connectRedis()     → warn nếu thiếu URL → cache bypass
BullMQ:   startWorker()      → skip nếu Redis chưa connect
ES:       connectES()        → warn nếu thiếu URL → search fallback TMDB
```

**Pattern chung:**
```typescript
if (!config.firebase.projectId) {
  console.warn('[Service] Not configured, running in skip mode')
  return null  // caller phải guard: if (!fb) return
}
```

Lợi ích: Dev có thể chạy server với `.env` tối giản, chỉ cần MongoDB + TMDB key là đủ để test basic flows.

---

### 4.2 Repeatable Jobs — Idempotency

BullMQ repeatable jobs (cron) có thể bị duplicate nếu server restart nhiều lần. Giải pháp:

```typescript
// scheduledQueue.ts
export async function scheduleUpcomingReleaseJob(): Promise<void> {
  // Xóa job cũ trước khi thêm mới → tránh duplicate
  const existing = await scheduledQueue.getRepeatableJobs()
  for (const job of existing) {
    if (job.name === 'upcoming-release-check') {
      await scheduledQueue.removeRepeatableByKey(job.key)
    }
  }

  await scheduledQueue.add(
    'upcoming-release-check',
    {},
    { repeat: { pattern: '0 9 * * *' } }  // 9 AM hàng ngày
  )
}
```

---

### 4.3 Mongoose Index cho Watchlist — `movies.tmdbId`

Upcoming release job query: `db.watchlists.find({ 'movies.tmdbId': { $in: [...] } })`.

Nếu thiếu index trên `movies.tmdbId` → MongoDB phải scan toàn bộ document (bao gồm toàn bộ `movies` array) của mọi watchlist → **Collection scan O(n)**.

```typescript
// Watchlist.model.ts
watchlistSchema.index({ 'movies.tmdbId': 1 })
// → Query chỉ lookup inverted index → O(log n)
```

---

### 4.4 Bull Board — Visualize Queues

```typescript
// admin/queueDashboard.ts
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'

export function registerQueueDashboard(app: Express): void {
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/admin/queues')

  createBullBoard({
    queues: [
      new BullMQAdapter(notificationQueue),
      new BullMQAdapter(scheduledQueue),
      new BullMQAdapter(cacheInvalidationQueue),
    ],
    serverAdapter,
  })

  app.use('/admin/queues', serverAdapter.getRouter())
  // → http://localhost:4000/admin/queues
  // → Dashboard UI xem job status, retry, delay
}
```

Có thể xem jobs đang chờ, đã xử lý, fail — không cần Redis CLI.

---

## 5. 🧠 Góc Nhìn Feynman — "The Simple Truth"

### Hệ thống Notification là... nhà bưu điện với nhiều hộp thư

**BullMQ Queue** là **hộp thư đầu phố**: Khi có thư (notification job) cần gửi, bạn bỏ vào hộp thư ngay — không cần chờ người đưa thư đến tận nơi. Bạn tiếp tục làm việc bình thường.

**BullMQ Worker** là **người đưa thư**: Anh ấy kiểm tra hộp thư liên tục, lấy thư ra và giao đến tay từng người. Nếu không giao được (FCM lỗi) → anh ấy thử lại sau vài phút, không phiền bạn.

**FCM** là **hệ thống chuyển phát nhanh quốc tế**: Nhận thư từ người đưa thư → giao đến điện thoại của user dù họ đang ở đâu trên thế giới.

**Redis Queue (backing store)** là **kho lưu thư**: Đảm bảo thư không mất dù server restart — thư vẫn nằm trong kho, người đưa thư sẽ lấy khi quay lại.

---

### Cache Invalidation là... biển hiệu "Thực đơn hôm nay"

Tưởng tượng nhà hàng có **bảng thực đơn ghi sẵn** (Redis cache). Mỗi ngày bếp trưởng thay đổi giá/món một vài lần (TMDB update), nhưng bảng thực đơn vẫn hiển thị giá cũ.

**Giải pháp:** Mỗi 5 phút, có nhân viên chạy ra check "TMDB có thay đổi gì không?" → Nếu có, xé tờ thực đơn cũ đi (xóa Redis key) → Khách tiếp theo đặt món sẽ được báo giá mới từ bếp (TMDB fresh data).

---

## 6. 📊 Tóm Tắt Kỹ Thuật — Tuần 5

### Files được tạo/sửa

| File | Vai trò | Dòng code |
|------|---------|-----------|
| `config/firebase.ts` | Firebase Admin singleton + graceful skip | 93 |
| `config/bullmq.ts` | BullMQ IORedis connection + disconnect | ~60 |
| `services/fcm.service.ts` | FCM sendToDevice/sendToUser + token cleanup | ~220 |
| `jobs/queues/notificationQueue.ts` | BullMQ Queue('notifications') + job types | ~100 |
| `jobs/queues/scheduledQueue.ts` | BullMQ Queue('scheduled') + repeatable job setup | ~70 |
| `jobs/queues/cacheInvalidationQueue.ts` | BullMQ Queue('cache-invalidation') + cron setup | ~70 |
| `jobs/processors/notification.processor.ts` | Worker consume push_notification jobs | ~160 |
| `jobs/processors/upcomingRelease.processor.ts` | Cron worker hàng ngày 9 AM | ~180 |
| `jobs/processors/cacheInvalidation.processor.ts` | Cron worker mỗi 5 phút | ~200 |
| `modules/notifications/notifications.controller.ts` | 4 HTTP handlers | ~70 |
| `modules/notifications/notifications.service.ts` | CRUD + FCM token management + createNotification | ~130 |
| `modules/notifications/notifications.routes.ts` | 4 routes, all requireAuth | ~30 |
| `modules/notifications/notifications.validation.ts` | Joi schemas | ~30 |
| `modules/movies/movies.controller.ts` | Thêm getPersonDetail + getPersonCredits | +30 |
| `modules/movies/movies.routes.ts` | Thêm /persons/:id + /persons/:id/credits | +20 |
| `modules/movies/movies.service.ts` | Thêm getPersonDetail + getPersonCredits | +15 |
| `modules/movies/movies.validation.ts` | Thêm personIdParamSchema | +10 |
| `admin/queueDashboard.ts` | Bull Board dashboard tại /admin/queues | ~40 |
| `server.ts` | Bootstrap BullMQ workers + graceful shutdown | ~30 thay đổi |
| `app.ts` | Mount notificationsRouter + Queue dashboard | +5 |
| `k6/load-test.js` | k6 script: 3 scenarios, thresholds, 15 endpoints | ~320 |
| `k6/README.md` | Hướng dẫn cài k6, chạy, đọc kết quả, tuning | ~280 |

### Quyết định kiến trúc quan trọng

| Quyết định | Lựa chọn | Lý do |
|------------|----------|-------|
| Push notification | BullMQ queue → FCM (async) | Không block HTTP handler |
| Firebase init | Singleton + graceful skip | Dev không cần credentials |
| BullMQ connection | IORedis riêng với `maxRetriesPerRequest: null` | BullMQ requirement |
| Redis namespace | `moviehub:bull:` vs `moviehub:cache:` | Tránh key collision |
| PersonDetail | Mount trong movies.routes (không tạo module riêng) | Chỉ 2 routes, không over-engineer |
| Cron jobs | BullMQ repeatable (không dùng `node-cron`) | Persistent qua restart, có UI dashboard |
| Token cleanup | Auto-remove invalid FCM tokens sau khi gửi | Tránh tích lũy token rác |
| Cache invalidation | TMDB `/movie/changes` endpoint mỗi 5 phút | Official TMDB mechanism |
| k6 thresholds | p95 < 500ms, error rate < 1% | Theo project guide spec |

### API Endpoints Tuần 5

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/v1/notifications?page=` | Danh sách notification của user |
| PUT | `/api/v1/notifications/:id/read` | Đánh dấu đã đọc |
| PUT | `/api/v1/notifications/read-all` | Đánh dấu tất cả đã đọc |
| POST | `/api/v1/notifications/fcm-token` | Đăng ký FCM token thiết bị |
| GET | `/api/v1/persons/:id` | Chi tiết diễn viên (PersonDetail) |
| GET | `/api/v1/persons/:id/credits` | Filmography của diễn viên |

### Background Jobs

| Job | Schedule | Mô tả |
|-----|----------|-------|
| `upcoming-release-check` | `0 9 * * *` (9 AM daily) | Notify user khi phim trong watchlist ra mắt |
| `cache-invalidation` | `*/5 * * * *` (mỗi 5 phút) | Xóa Redis cache của movies có thay đổi từ TMDB |
| `push_notification` | On-demand (queue) | Gửi FCM đến thiết bị user |

---

*Cập nhật: 2026-05-12 | Tuần tiếp theo: Testing Coverage >70% · Swagger Docs · Docker Prod · Deploy AWS EC2*
