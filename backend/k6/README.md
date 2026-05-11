# k6 Load Test — MovieHub Backend

> **Phase 5 — Tuần 5**: Performance Testing & Tuning  
> Script: `k6/load-test.js`

---

## 📋 Mục Lục

1. [Cài Đặt k6](#1-cài-đặt-k6)
2. [Chuẩn Bị Server](#2-chuẩn-bị-server)
3. [Lấy JWT Token](#3-lấy-jwt-token)
4. [Chạy Load Test](#4-chạy-load-test)
5. [Đọc Kết Quả](#5-đọc-kết-quả)
6. [Scenarios & Thresholds](#6-scenarios--thresholds)
7. [Performance Tuning](#7-performance-tuning)
8. [Endpoints Được Test](#8-endpoints-được-test)

---

## 1. Cài Đặt k6

k6 **không** phải là npm package — cần cài riêng qua package manager hệ điều hành.

### Windows (Chocolatey)

```powershell
# Nếu chưa có Chocolatey: https://chocolatey.org/install
choco install k6 -y
```

### Windows (Winget)

```powershell
winget install k6
```

### Windows (Manual Download)

1. Vào [github.com/grafana/k6/releases](https://github.com/grafana/k6/releases)
2. Tải file `.msi` mới nhất (vd: `k6-v0.56.0-windows-amd64.msi`)
3. Chạy installer

### Verify cài đặt thành công

```powershell
k6 version
# Output: k6 v0.56.0 (...)
```

---

## 2. Chuẩn Bị Server

> ⚠️ Server phải đang chạy trước khi chạy k6.

### Option A — Development mode

```powershell
# Trong thư mục backend/
npm run dev
```

### Option B — Production build (recommended for accurate results)

```powershell
npm run build
npm start
```

### Kiểm tra server healthy

```powershell
curl http://localhost:4000/api/v1/health
# Expected: {"success": true, "data": {"status": "ok", ...}}
```

Cũng cần chắc chắn rằng:
- ✅ **MongoDB** đang kết nối (Atlas hoặc local)
- ✅ **Redis** đang chạy (`redis-server` hoặc Docker)
- ✅ **Elasticsearch** đang chạy (nếu muốn test search endpoint)

---

## 3. Lấy JWT Token

Để test các protected endpoints (`/watchlists`, `/notifications`), bạn cần JWT access token:

```powershell
# Đăng nhập để lấy token
$response = Invoke-RestMethod `
  -Uri "http://localhost:4000/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "your@email.com", "password": "yourpassword"}'

$token = $response.data.accessToken
Write-Host "JWT Token: $token"
```

Hoặc dùng **Postman / Insomnia** → POST `/api/v1/auth/login` → lấy `data.accessToken`.

---

## 4. Chạy Load Test

### Chạy cơ bản (chỉ public endpoints)

```powershell
cd backend
k6 run k6/load-test.js
```

### Chạy với server tùy chỉnh

```powershell
k6 run --env BASE_URL=http://localhost:4000 k6/load-test.js
```

### Chạy với JWT (bao gồm protected endpoints)

```powershell
# Thay <YOUR_TOKEN> bằng token thực
k6 run --env JWT_TOKEN=<YOUR_TOKEN> k6/load-test.js
```

### Chạy với cả hai env vars

```powershell
k6 run `
  --env BASE_URL=http://localhost:4000 `
  --env JWT_TOKEN=<YOUR_TOKEN> `
  k6/load-test.js
```

### Chạy nhanh — chỉ 1 VU để smoke test

```powershell
k6 run --vus 1 --duration 30s k6/load-test.js
```

### Xuất kết quả ra file JSON

```powershell
k6 run --out json=k6/results.json k6/load-test.js
```

### Xuất kết quả ra CSV

```powershell
k6 run --out csv=k6/results.csv k6/load-test.js
```

---

## 5. Đọc Kết Quả

Sau khi k6 chạy xong, output sẽ có dạng:

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: k6/load-test.js
     output: -

  scenarios: (100.00%) 3 scenarios, 150 max VUs, 6m10s max duration
           * rampUp:         ramping VUs (100 max)
           * publicSoak:     20 looping VUs for 5m0s
           * protectedStress:ramping VUs (30 max)

     ✓ GET /movies/trending: status 200
     ✓ GET /movies/trending: has data
     ...

     checks.........................: 99.82%  ✓ 48291  ✗ 87
   ✓ custom_error_rate.............: 0.00%   ✓ 0      ✗ 241
   ✓ duration_movie_detail.........: avg=187ms  med=152ms  p(90)=321ms  p(95)=412ms
   ✓ duration_search...............: avg=234ms  med=198ms  p(90)=534ms  p(95)=687ms
   ✓ duration_trending.............: avg=8ms    med=6ms    p(90)=18ms   p(95)=24ms
   ✓ http_req_duration.............: avg=156ms  p(90)=389ms  p(95)=478ms
   ✓ http_req_failed...............: 0.00%   ✓ 0      ✗ 7438
     http_reqs......................: 7438   23.87/s
```

### Các Metric Quan Trọng

| Metric | Mô tả | Target |
|--------|-------|--------|
| `http_req_duration p(95)` | 95th percentile response time | **< 500ms** ✅ |
| `http_req_failed` | Tỉ lệ request thất bại | **< 1%** ✅ |
| `duration_trending p(95)` | Trending endpoint (Redis cached) | **< 300ms** |
| `duration_movie_detail p(95)` | Movie detail (Redis cached) | **< 400ms** |
| `duration_search p(95)` | Search (Elasticsearch) | **< 800ms** |
| `duration_watchlist p(95)` | Watchlist (MongoDB) | **< 600ms** |
| `cache_hit_count` | Số lần Redis cache hit | Càng cao càng tốt |

### Đọc kết quả threshold

- ✅ **PASSED** — threshold đạt yêu cầu
- ❌ **FAILED** — threshold bị vi phạm → cần optimize

---

## 6. Scenarios & Thresholds

### Scenarios

| Scenario | VUs | Duration | Mục đích |
|----------|-----|----------|----------|
| `rampUp` | 10 → 100 | 5 min | Simulate organic traffic growth |
| `publicSoak` | 20 | 5 min | Verify Redis cache under sustained load |
| `protectedStress` | 0 → 30 | 3 min | Stress test authenticated endpoints |

### Traffic Distribution (mainScenario)

| Endpoint Group | % Traffic | Lý do |
|----------------|-----------|-------|
| Movie Lists | 25% | High frequency — homepage |
| Movie Detail | 25% | Most common action |
| Search | 20% | ES-backed, more expensive |
| Genres/Discover | 10% | Filter browsing |
| Persons | 10% | Actor detail page |
| Protected | 10% | Watchlist/Notification |

### Thresholds Summary

```javascript
// Trong load-test.js
thresholds: {
  'http_req_duration':      ['p(95)<500', 'p(99)<1000'],
  'http_req_failed':        ['rate<0.01'],
  'duration_trending':      ['p(95)<300'],
  'duration_movie_detail':  ['p(95)<400'],
  'duration_search':        ['p(95)<800'],
  'duration_watchlist':     ['p(95)<600'],
  'custom_error_rate':      ['rate<0.01'],
}
```

---

## 7. Performance Tuning

Nếu k6 báo threshold FAILED, thực hiện các bước sau:

### 7.1 Kiểm tra Redis Cache Hit Ratio

```powershell
# Kết nối Redis CLI (cần redis-cli cài sẵn hoặc qua Docker)
redis-cli info stats | findstr "keyspace_hits\|keyspace_misses"

# Expected: keyspace_hits >> keyspace_misses
```

Nếu cache miss cao → kiểm tra `cacheMiddleware` đang hoạt động đúng không.

### 7.2 MongoDB — Tìm Slow Queries

Kích hoạt MongoDB profiler để tìm slow queries (> 100ms):

```javascript
// Trong MongoDB shell (mongosh)
use moviehub
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find({}).sort({ ts: -1 }).limit(10).pretty()
```

Sau đó tạo index tương ứng:

```javascript
// Ví dụ: index cho notification queries
db.notifications.createIndex({ userId: 1, createdAt: -1 })

// Index cho watchlist movie lookup (upcoming release job)
db.watchlists.createIndex({ 'movies.tmdbId': 1 })

// Verify indexes
db.notifications.getIndexes()
```

### 7.3 Kiểm tra Mongoose `.lean()`

Với các query **read-only** (không cần Mongoose document methods), dùng `.lean()` để tăng tốc:

```typescript
// BEFORE — trả về Mongoose Document object (chậm hơn)
const notifications = await Notification.find({ userId }).limit(20)

// AFTER — trả về plain JS object (nhanh hơn ~40%)
const notifications = await Notification.find({ userId }).lean().limit(20)
```

Kiểm tra các service files và thêm `.lean()` nếu chưa có.

### 7.4 MongoDB Connection Pool

Mặc định Mongoose dùng pool size = 5. Với 100 concurrent VUs, cần tăng:

```typescript
// Trong config/database.ts — thêm option
await mongoose.connect(uri, {
  maxPoolSize: 20,  // tăng từ default 5 lên 20
  minPoolSize: 5,
})
```

### 7.5 Elasticsearch — Caching Layer

Search endpoint không được cache (theo spec). Nếu search quá chậm:
- Kiểm tra Elasticsearch index mapping
- Xem xét tăng `max_result_window`
- Kiểm tra connection pool settings

---

## 8. Endpoints Được Test

### Public Endpoints (không cần auth)

| Method | Endpoint | Cache TTL |
|--------|----------|-----------|
| GET | `/api/v1/movies/trending?window=day` | 24h |
| GET | `/api/v1/movies/now-playing?page=1` | 1h |
| GET | `/api/v1/movies/popular?page=1` | 1h |
| GET | `/api/v1/movies/upcoming?page=1` | 6h |
| GET | `/api/v1/movies/:id` | 24h |
| GET | `/api/v1/movies/:id/similar` | 24h |
| GET | `/api/v1/genres` | 7d |
| GET | `/api/v1/discover?genre=28` | 1h |
| GET | `/api/v1/search?q=batman` | No cache |
| GET | `/api/v1/search/suggestions?q=bat` | No cache |
| GET | `/api/v1/persons/:id` | 24h |
| GET | `/api/v1/persons/:id/credits` | 24h |
| GET | `/api/v1/health` | No cache |

### Protected Endpoints (cần JWT Bearer token)

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/v1/watchlists` | ✅ JWT required |
| GET | `/api/v1/notifications?page=1` | ✅ JWT required |

---

## 9. Troubleshooting

### k6 không tìm thấy lệnh

```powershell
# Kiểm tra PATH
where k6

# Nếu không có → restart terminal sau khi cài
```

### Lỗi "ECONNREFUSED"

→ Server chưa chạy. Kiểm tra:
```powershell
curl http://localhost:4000/api/v1/health
```

### Nhiều request 401 ở protected endpoints

→ JWT token đã hết hạn (mặc định 15 phút). Lấy token mới:
```powershell
k6 run --env JWT_TOKEN=<new_token> k6/load-test.js
```

### Elasticsearch timeout (search p95 > 800ms)

→ Elasticsearch chưa warm up. Chạy smoke test 1 VU trước:
```powershell
k6 run --vus 1 --duration 1m k6/load-test.js
```
Sau đó chạy full test.

---

## 10. CI Integration (Optional)

Thêm vào GitHub Actions workflow để tự động chạy load test:

```yaml
# .github/workflows/load-test.yml
- name: Run k6 load test
  uses: grafana/k6-action@v0.3.0
  with:
    filename: backend/k6/load-test.js
  env:
    BASE_URL: http://localhost:4000
```

> ⚠️ Load test nên chạy trong môi trường staging, **không** production.
