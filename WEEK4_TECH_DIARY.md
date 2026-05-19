# 📓 Tech Diary — Tuần 4: Watchlist · Reviews · Socket.IO · S3 Avatar Upload

> **Dự án:** MovieHub · **Giai đoạn:** Tuần 4 (Ngày 22–28)
> **Trọng tâm:** Watchlist CRUD · Review System · Socket.IO Realtime · S3 Presigned Upload
> **Tác giả:** Thành viên A (Backend Lead)

---

## 1. 🧩 Tổng Quan Vấn Đề (The Problem Space)

### Bốn bài toán cần giải quyết trong tuần này

| # | Bài toán | Giải pháp |
|---|----------|-----------|
| 1 | User muốn lưu danh sách phim muốn xem | Watchlist CRUD với ownership guard |
| 2 | User muốn đánh giá và like review của người khác | Review module + toggle like |
| 3 | Nhiều thiết bị của cùng 1 user phải đồng bộ realtime | Socket.IO với room theo userId |
| 4 | Upload ảnh avatar không nên đi qua server | S3 Presigned URL — client upload thẳng |

---

### Tại sao cần Ownership Guard?

Hãy tưởng tượng không có ownership check:

```
User A: DELETE /watchlist/abc123   ← watchlist của User B
Server: OK, đã xóa ✅
User B: Watchlist của tôi đâu?!
```

**Với `findOwnedWatchlist()`:**
```typescript
// watchlist.service.ts
async function findOwnedWatchlist(watchlistId: string, userId: string) {
  const watchlist = await WatchlistModel.findById(watchlistId).lean()
  if (!watchlist) throw new AppError('Not found', 404, 'WATCHLIST_NOT_FOUND')

  if (watchlist.userId.toString() !== userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN')  // ← chặn ở đây
  }
  return watchlist
}
```

Mọi mutation (update, delete, add movie, remove movie) đều phải qua hàm này trước. **Không có ngoại lệ.**

---

### Tại sao không upload avatar qua server?

**Cách naive (qua server):**
```
Client → [file 5MB] → Backend Server → [file 5MB] → AWS S3
```
- Server phải đọc toàn bộ file vào RAM
- Tốn bandwidth của server 2 lần (nhận + gửi)
- Với 1000 user upload đồng thời → server OOM

**Cách đúng (Presigned URL):**
```
Client → POST /users/avatar/upload-url → Backend → [chỉ trả URL] → Client
Client → [file 5MB] → AWS S3 trực tiếp
Client → PUT /users/profile { avatar: fileUrl } → Backend → MongoDB
```
- Server chỉ tạo một URL có chữ ký, không đụng đến file
- S3 nhận file trực tiếp từ client
- Server load = 0 cho việc upload

---

## 2. 🏗️ Tư Duy Hệ Thống & Workflow

### Luồng Watchlist — Từ request đến Socket event

```
┌──────────────────────────────────────────────────────────────┐
│                    USER (Mobile App)                          │
│  POST /watchlists/:id/movies  { tmdbId, tmdbTitle }          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  MIDDLEWARE CHAIN                                             │
│  requireAuth → validate(addMovieSchema)                      │
│  ❌ No token? → 401  ❌ Bad body? → 400                      │
└──────────────────────┬───────────────────────────────────────┘
                       │ req.user.id, req.body validated
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  CONTROLLER                                                   │
│  watchlist.controller.ts → extract params → gọi service      │
└──────────────────────┬───────────────────────────────────────┘
                       │ addMovieToWatchlist(watchlistId, userId, dto)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  SERVICE                                                      │
│  Bước 1: findOwnedWatchlist() ← kiểm tra ownership          │
│    ❌ Not found → 404   ❌ Not owner → 403                   │
│  Bước 2: Kiểm tra phim đã tồn tại chưa?                     │
│    ❌ Đã có → 409 WATCHLIST_MOVIE_EXISTS                     │
│  Bước 3: findOneAndUpdate với atomic check                   │
│    { 'movies.tmdbId': { $ne: tmdbId } } ← double-check race │
│  Bước 4: emitWatchlistEvent() → Socket.IO                    │
└──────────────────────┬──────────────────┬────────────────────┘
                       │                  │ Socket event
                       ▼                  ▼
              HTTP 201 response    io.to(userId).emit(
              { watchlist }          'watchlist:movie_added', payload)
                                  → Tất cả thiết bị của user nhận ngay
```

---

### Luồng S3 Presigned Upload

```
┌─────────────────────────────────────────────────────────────┐
│  BƯỚC 1: Lấy presigned URL                                   │
│  Client → POST /users/avatar/upload-url                      │
│           { fileType: 'image/jpeg' }                         │
│                    ↓                                         │
│  Backend → generatePresignedUploadUrl(userId, mimeType)      │
│          → PutObjectCommand (chỉ tạo lệnh, chưa upload)      │
│          → getSignedUrl() → URL có chữ ký AWS, hết hạn 5 phút│
│                    ↓                                         │
│  Response: { uploadUrl, fileUrl, key, expiresIn: 300 }       │
└─────────────────────────────────────────────────────────────┘
                    ↓ Client nhận URL
┌─────────────────────────────────────────────────────────────┐
│  BƯỚC 2: Upload thẳng lên S3                                 │
│  Client → PUT [uploadUrl] với binary data của ảnh            │
│  S3 → xác thực chữ ký → nhận file → lưu vào bucket          │
│  (Server backend KHÔNG tham gia bước này)                    │
└─────────────────────────────────────────────────────────────┘
                    ↓ Upload xong
┌─────────────────────────────────────────────────────────────┐
│  BƯỚC 3: Cập nhật DB                                         │
│  Client → PUT /users/profile { avatar: fileUrl }             │
│  Backend → UserModel.findByIdAndUpdate → lưu URL vào MongoDB │
└─────────────────────────────────────────────────────────────┘
```

---

### Kiến trúc Socket.IO — Room theo userId

```
Server khởi động:
  initializeSocketServer(httpServer) → io = new Server(...)
  io.use(authenticateSocket) ← JWT middleware

Client kết nối:
  socket.handshake.auth.token = "Bearer eyJ..."
  → verifyAccessToken() → payload.sub = userId
  → socket.data.user = { id: userId }
  → socket.join(userId)  ← mỗi user có 1 room riêng

Service emit event:
  io.to(userId).emit('watchlist:created', payload)
  → Chỉ các socket trong room của userId nhận được
  → User A KHÔNG nhận event của User B
```

---

## 3. 🔬 Giải Mã Logic & Code

### 3.1 Atomic Check khi thêm phim vào Watchlist

Vấn đề: Nếu user nhấn nút "Add" 2 lần liên tiếp nhanh, có thể có 2 request cùng lúc:

```
Request 1: kiểm tra movies → chưa có tmdbId=123 → thêm vào
Request 2: kiểm tra movies → chưa có tmdbId=123 → thêm vào ← RACE CONDITION!
```

**Giải pháp — Service check + MongoDB atomic filter:**

```typescript
// watchlist.service.ts — addMovieToWatchlist
// Bước 1: Application-level check (fast fail, thân thiện)
if (watchlist.movies.some((item) => item.tmdbId === movie.tmdbId)) {
  throw new AppError('Movie already exists in watchlist', 409, 'WATCHLIST_MOVIE_EXISTS')
}

// Bước 2: Atomic DB-level check (bảo vệ khỏi race condition)
const updated = await WatchlistModel.findOneAndUpdate(
  {
    _id: watchlistId,
    userId,
    'movies.tmdbId': { $ne: movie.tmdbId },  // ← chỉ update nếu CHƯA có
  },
  { $push: { movies: movieToAdd } },
  { returnDocument: 'after', runValidators: true }
).lean()

if (!updated) {
  // findOneAndUpdate trả null → điều kiện $ne thất bại → đã tồn tại
  throw new AppError('Movie already exists in watchlist', 409, 'WATCHLIST_MOVIE_EXISTS')
}
```

**Tại sao cần cả 2 lớp?**
- Lớp 1 (application check): Fail nhanh, thân thiện, không tốn DB write
- Lớp 2 (MongoDB atomic): Bảo vệ thực sự khỏi concurrent requests

---

### 3.2 Toggle Like — Idempotent bằng Array mutation

```typescript
// reviews.service.ts — toggleReviewLike
const alreadyLiked = reviewDoc.likes.some(
  (likedUserId) => likedUserId.toString() === userId
)
const action = alreadyLiked ? 'unliked' : 'liked'

if (alreadyLiked) {
  // Unlike: lọc ra userId khỏi mảng
  reviewDoc.likes = reviewDoc.likes.filter(
    (likedUserId) => likedUserId.toString() !== userId
  )
} else {
  // Like: thêm userId vào mảng
  reviewDoc.likes.push(userId as unknown as Types.ObjectId)
}

await reviewDoc.save()
```

**Tại sao dùng array thay vì counter?**

| Cách | Lưu | Ưu điểm | Nhược điểm |
|------|-----|---------|------------|
| Counter `likeCount: number` | Đơn giản | Nhỏ gọn | Không biết ai đã like, user like 2 lần được |
| Array `likes: ObjectId[]` | `[userId1, userId2, ...]` | Biết ai like, tự nhiên idempotent | Chiếm nhiều space hơn |

Với social app, cần biết "User này đã like chưa?" để render nút UI đúng → **Array là lựa chọn đúng.**

---

### 3.3 Magic Bytes — Tại sao không tin vào Content-Type?

```typescript
// s3.service.ts — detectAvatarFileType
function detectAvatarFileType(buffer: Buffer): AvatarFileType | null {
  // JPEG: luôn bắt đầu bằng FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: '.jpg' }
  }

  // PNG: magic bytes 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 /* P */ && buffer[2] === 0x4e /* N */ ...) {
    return { mime: 'image/png', extension: '.png' }
  }

  // WebP: RIFF????WEBP
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', extension: '.webp' }
  }

  return null  // ← không phải ảnh hợp lệ
}
```

**Tấn công nếu không check magic bytes:**
```
Attacker: curl -X POST /users/avatar \
  -F "avatar=@malware.exe" \
  -H "Content-Type: image/jpeg"   ← giả mạo content-type
```

- `file.mimetype` = `'image/jpeg'` (do client gửi, server tin tưởng) ✅
- `file.buffer[0..2]` = `4D 5A 90` (MZ header của .exe, không phải FF D8 FF) ❌

**Kết quả:** Hàm `detectAvatarFileType()` trả về `null` → server từ chối upload.

> **Nguyên tắc bảo mật:** "Trust but verify" — nhận Content-Type từ client nhưng luôn verify bằng nội dung thực tế của file.

---

### 3.4 Duplicate Review — Mongoose unique index

```typescript
// Review.model.ts
const reviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  tmdbMovieId: { type: Number },
  // ...
})

// Compound unique index: mỗi user chỉ được review 1 lần mỗi phim
reviewSchema.index({ userId: 1, tmdbMovieId: 1 }, { unique: true })
```

**Xử lý lỗi duplicate ở service:**

```typescript
// reviews.service.ts
function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000  // MongoDB error code cho duplicate key
}

export async function createReview(...) {
  try {
    const review = await ReviewModel.create({ ... })
    return toDto(review)
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError('You have already reviewed this movie', 409, 'REVIEW_ALREADY_EXISTS')
    }
    throw error  // ← rethrow lỗi khác
  }
}
```

**Tại sao bắt error code 11000 thay vì check trước?**

```typescript
// ❌ Cách naive — dễ race condition
const existing = await ReviewModel.findOne({ userId, tmdbMovieId })
if (existing) throw new AppError(...)
await ReviewModel.create(...)   // ← 2 request đồng thời đều qua được check!

// ✅ Cách đúng — để DB tự enforce
await ReviewModel.create(...)   // ← chỉ 1 cái thành công, cái kia bị index reject
```

---

### 3.5 TypeScript Function Overloads cho Socket Events

```typescript
// watchlist.service.ts — emitWatchlistEvent
// Khai báo overload cho từng event type
function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.CREATED,
  payload: WatchlistCreatedPayload
): void
function emitWatchlistEvent(
  userId: string,
  event: typeof WATCHLIST_SOCKET_EVENTS.UPDATED,
  payload: WatchlistUpdatedPayload
): void
// ... các overload khác

// Implementation thực sự
function emitWatchlistEvent(
  userId: string,
  event: keyof WatchlistEmitPayloadMap,
  payload: WatchlistEmitPayloadMap[keyof WatchlistEmitPayloadMap]
): void {
  const socketServer = getSocketServer()
  if (!socketServer) return  // ← graceful: Socket không bắt buộc

  switch (event) {
    case WATCHLIST_SOCKET_EVENTS.CREATED:
      socketServer.to(userId).emit(event, payload as WatchlistCreatedPayload)
      break
    // ...
  }
}
```

**Tại sao cần overloads?**

Nếu không có overloads, TypeScript cho phép gọi sai:
```typescript
// ❌ TypeScript không bắt được lỗi này nếu không có overloads
emitWatchlistEvent(userId, WATCHLIST_SOCKET_EVENTS.CREATED, deletedPayload)
//                                                  ↑ CREATED     ↑ DELETED payload — sai!
```

Với overloads, TypeScript báo lỗi tại compile time — không chờ đến runtime.

---

## 4. 💡 Bài Học "Sương Máu"

### 4.1 Tại sao users module bị tách làm 2 branch?

Đây là bài học thực tế về **feature dependency trong Git workflow**.

`users` module ban đầu có đầy đủ avatar upload (dùng `s3.service` + `upload.middleware`). Khi push lên branch `feat/week4-review` mà không kèm 2 file S3, CI đã fail:

```
Error: Cannot find module '../../services/s3.service'
Error: Cannot find module '../../middleware/upload.middleware'
```

**Giải pháp:** Tách thành 2 branch rõ ràng:
- `feat/week4-review` → Users profile không có avatar (CI pass)
- `feat/week4-s3-upload` → Thêm S3 + khôi phục avatar upload (CI pass)

**Bài học:** Khi exclude một feature khỏi commit, phải loại cả các file **phụ thuộc** vào feature đó, không chỉ file chính.

---

### 4.2 Lazy Singleton cho S3Client

```typescript
// s3.service.ts
let s3Client: S3Client | null = null  // ← null khi chưa cần

function getS3Client(): S3Client {
  if (!config.s3.region || !config.s3.bucket) {
    throw new AppError('S3 is not configured', 500, 'S3_NOT_CONFIGURED')
  }

  if (!s3Client) {
    s3Client = new S3Client({ region: config.s3.region })  // ← tạo 1 lần duy nhất
  }

  return s3Client
}
```

**Tại sao không tạo S3Client ở top-level module?**

```typescript
// ❌ Top-level initialization
const s3Client = new S3Client({ region: config.s3.region })
// → Nếu S3 chưa cấu hình, server crash khi import module này
// → Trong test environment: mọi test import module đều phải mock S3

// ✅ Lazy singleton
// → Chỉ tạo khi thực sự cần
// → Test không cần mock nếu không test S3 feature
// → Nếu S3 chưa cấu hình, chỉ throw khi gọi, không crash server
```

---

### 4.3 DTO Pattern — Không bao giờ expose raw Document

```typescript
// ❌ Trả thẳng Mongoose document
const watchlist = await WatchlistModel.findById(id)
return watchlist  // ← lộ _id, __v, và tất cả Mongoose internals

// ✅ Convert qua DTO
function toDto(doc: WatchlistLeanDoc): WatchlistDto {
  return {
    id: doc._id.toString(),  // ← _id ObjectId → string
    userId: doc.userId.toString(),
    name: doc.name,
    isPublic: doc.isPublic,
    shareSlug: doc.shareSlug,
    movieCount: doc.movies.length,  // ← computed field
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    // ← movies array KHÔNG expose (tiết kiệm bandwidth, bảo mật)
  }
}
```

**Lợi ích của DTO:**
1. **Kiểm soát shape**: Thay đổi DB schema không break API response
2. **Bảo mật**: Không vô tình expose field nhạy cảm
3. **Computed fields**: `movieCount` tính từ `movies.length` thay vì lưu riêng

---

### 4.4 shareSlug — Tại sao không dùng ID?

```typescript
// Watchlist.model.ts
shareSlug: {
  type: String,
  unique: true,
  default: () => randomUUID(),
}
```

**So sánh:**

| URL | Vấn đề |
|-----|--------|
| `/watchlist/68193abc...` (MongoDB ObjectId) | Lộ thông tin hệ thống, có thể enumerate |
| `/watchlist/share/a3f2e1b4-...` (UUID slug) | Random, không đoán được, safe |

Người dùng có thể share public watchlist qua slug mà không lo người khác dò ra watchlist private của họ.

---

## 5. 🧠 Góc Nhìn Feynman — "The Simple Truth"

### Hệ thống Watchlist + Socket là... bảng trắng chia sẻ realtime

Hãy tưởng tượng bạn và các thiết bị của mình như đang xem cùng một **bảng trắng trong phòng họp**:

**Watchlist** là bảng trắng — mỗi user có bảng riêng, có thể public hoặc private.

**Socket.IO Room** là phòng họp — mỗi user có phòng riêng với ID là userId. Khi bạn đăng nhập từ điện thoại và tablet, cả 2 đều vào cùng phòng đó.

**Service emit event** là người thư ký trong phòng — khi bạn thêm phim từ điện thoại, thư ký thông báo cho TẤT CẢ người trong phòng (tablet của bạn cũng nghe thấy).

```
Điện thoại thêm "Avengers" vào watchlist
→ Server cập nhật DB
→ Server gọi io.to(userId).emit('watchlist:movie_added', ...)
→ Tablet cũng đang kết nối với cùng room → nhận event ngay lập tức
→ Tablet tự cập nhật UI — không cần reload
```

---

**Presigned URL** là như **phiếu xuất kho có dấu xác nhận**:

- Bạn xin phiếu từ kho trưởng (Backend) — phiếu có ghi rõ "Được phép đặt hàng vào ô kệ `avatars/userId/xxx.jpg`, hiệu lực 5 phút"
- Bạn mang phiếu đến kho (S3) và tự đặt hàng vào đúng ô kệ đó
- Kho trưởng không cần có mặt — kho S3 tự xác nhận phiếu hợp lệ

---

## 6. 📊 Tóm Tắt Kỹ Thuật — Tuần 4

### Files được tạo

| File | Vai trò | Dòng code |
|------|---------|-----------|
| `models/Watchlist.model.ts` | Schema MongoDB cho watchlist + movies array | ~80 |
| `modules/watchlist/watchlist.service.ts` | CRUD + ownership guard + socket emit | 310 |
| `modules/watchlist/watchlist.controller.ts` | HTTP handlers, extract params | ~120 |
| `modules/watchlist/watchlist.routes.ts` | Route definitions + middleware chain | ~40 |
| `modules/watchlist/watchlist.validation.ts` | Joi schemas cho request body | ~60 |
| `modules/watchlist/watchlist.test.ts` | Integration tests với test DB | ~200 |
| `models/Review.model.ts` | Schema MongoDB + compound unique index | ~70 |
| `modules/reviews/reviews.service.ts` | CRUD + toggle like + report + socket | 219 |
| `modules/reviews/reviews.controller.ts` | HTTP handlers | ~100 |
| `modules/reviews/reviews.routes.ts` | Route definitions | ~40 |
| `modules/reviews/reviews.validation.ts` | Joi schemas | ~50 |
| `modules/reviews/reviews.test.ts` | Integration tests | ~180 |
| `modules/users/users.service.ts` | Get/update profile + avatar upload | ~130 |
| `modules/users/users.controller.ts` | HTTP handlers + presigned URL endpoint | ~77 |
| `modules/users/users.routes.ts` | Route definitions | ~15 |
| `sockets/socket.server.ts` | Socket.IO server init + JWT auth middleware | 81 |
| `sockets/watchlist.socket.ts` | Event type definitions + payloads | ~100 |
| `services/s3.service.ts` | S3 upload + magic bytes check + presigned URL | 154 |
| `middleware/upload.middleware.ts` | Multer config (memory storage, size limit) | ~50 |

### Quyết định kiến trúc quan trọng

| Quyết định | Lựa chọn | Lý do |
|------------|----------|-------|
| Ownership check | `findOwnedWatchlist()` tái sử dụng | DRY — tránh check lặp lại ở mỗi function |
| Race condition | App check + MongoDB atomic `$ne` filter | Defense in depth — 2 lớp bảo vệ |
| Like storage | Array `ObjectId[]` thay vì counter | Biết ai đã like, idempotent tự nhiên |
| Duplicate review | Compound unique index + catch code 11000 | DB tự enforce, không cần pre-check |
| Avatar upload | Presigned URL (client → S3 trực tiếp) | Không tốn server bandwidth |
| File validation | Magic bytes check (không tin Content-Type) | Bảo mật chống file spoofing |
| S3 client | Lazy singleton | Không crash khi chưa cấu hình S3 |
| Socket room | `io.to(userId)` — room theo userId | Cô lập event giữa các user |
| DTO conversion | `toDto()` tường minh | Không expose Mongoose internals |

### API Endpoints Tuần 4

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/watchlists` | Lấy tất cả watchlist của user |
| POST | `/api/watchlists` | Tạo watchlist mới |
| PUT | `/api/watchlists/:id` | Cập nhật tên/visibility |
| DELETE | `/api/watchlists/:id` | Xóa watchlist |
| POST | `/api/watchlists/:id/movies` | Thêm phim |
| DELETE | `/api/watchlists/:id/movies/:tmdbId` | Xóa phim |
| GET | `/api/movies/:tmdbId/reviews` | Lấy reviews của phim |
| POST | `/api/movies/:tmdbId/reviews` | Tạo review |
| PUT | `/api/reviews/:id` | Cập nhật review |
| DELETE | `/api/reviews/:id` | Xóa review |
| POST | `/api/reviews/:id/like` | Toggle like |
| POST | `/api/reviews/:id/report` | Report review |
| GET | `/api/users/profile` | Lấy profile |
| PUT | `/api/users/profile` | Cập nhật profile |
| POST | `/api/users/avatar` | Upload avatar (qua server) |
| POST | `/api/users/avatar/upload-url` | Lấy presigned URL |

---

*Cập nhật: 2026-05-06 | Tuần tiếp theo: Push Notifications · Background Jobs · FCM Integration*
