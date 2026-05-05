# 📓 Tech Diary — Tuần 3: Movies Module & Search với Elasticsearch

> **Dự án:** MovieHub · **Giai đoạn:** Tuần 3 (Ngày 15–21)
> **Trọng tâm:** TMDB Integration · Redis Cache · Elasticsearch Fuzzy Search · TMDB Fallback
> **Tác giả:** Thành viên A (Backend Lead)

---

## 1. 🧩 Tổng Quan Vấn Đề (The Problem Space)

### Tại sao không dùng `find()` của MongoDB để tìm phim?

Hãy tưởng tượng bạn vào thư viện và hỏi thủ thư:
> *"Cho tôi cuốn sách về 'Avenegrs'"* (gõ sai chính tả)

Nếu thủ thư là **MongoDB**, ông ta sẽ trả lời:
> *"Không có sách nào tên đó cả."*

Vì MongoDB tìm theo **exact match** (khớp chính xác) hoặc **regex** — không hiểu ngữ nghĩa, không chịu được sai chính tả.

Nếu thủ thư là **Elasticsearch**, ông ta sẽ:
> *"Bạn có muốn 'Avengers' không? Tôi thấy 47 kết quả, xếp theo mức liên quan."*

#### Bảng so sánh kỹ thuật

| Tiêu chí | MongoDB `find()` | Elasticsearch |
|---|---|---|
| Tìm kiếm full-text | ❌ Cơ bản ($text) | ✅ Được tối ưu hoàn toàn |
| Sai chính tả | ❌ Không chịu được | ✅ `fuzziness: AUTO` |
| Xếp hạng kết quả | ❌ Không có relevance score | ✅ TF-IDF scoring |
| Tìm đa trường cùng lúc | ❌ Chậm, không tự nhiên | ✅ `multi_match` native |
| Hiệu năng với 1M docs | 🟡 Index $text, còn chậm | ✅ Inverted index — cực nhanh |

**Kết luận:** MongoDB dùng để **lưu trữ** data (nguồn sự thật). Elasticsearch dùng để **tìm kiếm** — đây là hai bài toán khác nhau, cần công cụ chuyên biệt.

---

### Chuyện gì xảy ra nếu Elasticsearch bị sập?

Đây là câu hỏi **kiến trúc sư hệ thống** phải trả lời trước khi viết một dòng code.

**Scenario:** 2 giờ sáng, Elasticsearch OOM (out of memory), container bị kill.

**Không có Fallback:**
```
User: "Tìm phim Avengers"
Server: 500 Internal Server Error ← người dùng mở app thấy màn hình lỗi
```

**Có Fallback (cách chúng ta đã làm):**
```
User: "Tìm phim Avengers"
ES: ❌ Connection refused
SearchService: "ES chết rồi, gọi TMDB thay"
TMDB: ✅ Trả về kết quả
User: Vẫn thấy kết quả bình thường ← không biết có sự cố
```

> **Nguyên tắc:** Hệ thống tốt không phải là hệ thống không bao giờ lỗi — mà là hệ thống **gracefully degrade** (xuống cấp nhẹ nhàng) khi một thành phần lỗi.

---

## 2. 🏗️ Tư Duy Hệ Thống & Workflow

### Luồng dữ liệu từ khi người dùng gõ đến khi kết quả hiện ra

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (Mobile App)                         │
│  Gõ "Avengers" vào SearchBar → debounce 300ms → gửi request │
└─────────────────────┬───────────────────────────────────────┘
                      │ GET /api/search?q=Avengers&page=1
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  ROUTE LAYER                                  │
│  search.routes.ts → apply [rateLimitMiddleware, validateMiddleware(searchSchema)]
└─────────────────────┬───────────────────────────────────────┘
                      │ req validated ✅
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               VALIDATION MIDDLEWARE                           │
│  Joi schema: q phải là string, không rỗng, max 200 ký tự    │
│  page phải là integer ≥ 1                                    │
│  ❌ Nếu sai → 400 Bad Request ngay, không qua controller     │
└─────────────────────┬───────────────────────────────────────┘
                      │ req.query.q = "Avengers"
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  CONTROLLER                                   │
│  search.controller.ts → extract q, page → gọi searchService │
└─────────────────────┬───────────────────────────────────────┘
                      │ searchService.searchMovies("Avengers", 1)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  SEARCH SERVICE                               │
│  Bước 1: isElasticsearchConnected() ?                        │
│    ├── YES → elasticsearchService.searchMovies(...)          │
│    │         ├── ✅ Success → return { source: 'elasticsearch' }
│    │         └── ❌ Error  → FALLBACK ↓                      │
│    └── NO  → FALLBACK ↓                                      │
│                                                               │
│  Bước 2 (FALLBACK): tmdbService.searchMovies(...)           │
│    └── tmdbListToSearchResult() ← convert sang unified type  │
│        return { source: 'tmdb_fallback' }                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ MovieSearchResult
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  CONTROLLER → RESPONSE                        │
│  res.status(200).json({ success: true, data: result })       │
└─────────────────────────────────────────────────────────────┘
```

### Tương tác giữa các lớp — Ai biết gì?

| Layer | Biết | Không biết |
|---|---|---|
| **Route** | URL pattern, middleware cần dùng | Business logic |
| **Validation** | Schema Joi, shape của request | Nơi data đi tiếp |
| **Controller** | Cách lấy data từ req, format response | Data đến từ ES hay TMDB |
| **SearchService** | Logic ưu tiên ES → TMDB | HTTP request/response |
| **ElasticsearchService** | Cú pháp DSL query, mapping | Vì sao phải search |
| **TMDBService** | TMDB API, Redis cache | Elasticsearch tồn tại |

> **Đây là Separation of Concerns** — mỗi lớp chỉ quan tâm đến một việc.

---

## 3. 🔬 Giải Mã Logic & Code

### 3.1 Mapping — "Khai sinh" cho Index

```typescript
// elasticsearch.service.ts — lines 84-98
const MOVIES_MAPPING: Record<string, MappingProperty> = {
  id:                { type: 'integer' },

  // ↓ type: 'text' = ES sẽ PHÂN TÍCH nội dung (tokenize, lowercase, stemming)
  //   analyzer: 'standard' = tách từ theo space, bỏ stopwords, lowercase
  title:             { type: 'text', analyzer: 'standard' },
  original_title:    { type: 'text', analyzer: 'standard' },
  overview:          { type: 'text', analyzer: 'standard' },

  // ↓ type: 'keyword' = KHÔNG phân tích, lưu nguyên văn (dùng để filter chính xác)
  original_language: { type: 'keyword' },

  // ↓ index: false = lưu vào _source nhưng KHÔNG tạo inverted index
  //   → không thể search theo trường này, nhưng tiết kiệm storage đáng kể
  poster_path:       { type: 'keyword', index: false },
  backdrop_path:     { type: 'keyword', index: false },

  vote_average:      { type: 'float' },    // ← dùng để filter range
  genre_ids:         { type: 'integer' },  // ← dùng để filter terms
  release_date:      { type: 'date', format: 'yyyy-MM-dd||yyyy||epoch_millis' },
}
```

**Tại sao `poster_path` có `index: false`?**

Khi ES lưu một field `text` hoặc `keyword`, nó xây dựng **inverted index** — một bảng tra cứu ngược. Poster URL không ai tìm kiếm theo URL cả, nhưng nếu để mặc định, ES vẫn tốn RAM/disk để index nó. `index: false` nói: "lưu vào document để trả về, nhưng đừng tốn thêm tài nguyên để index nó."

---

### 3.2 Fuzziness — Khả năng "đoán" khi sai chính tả

**Fuzziness đo bằng gì?** — **Edit Distance (Levenshtein Distance)**: số thao tác tối thiểu (thêm/xóa/thay ký tự) để biến từ A thành từ B.

```
"Avngers" → "Avengers"
  Bước 1: thêm 'e' vào sau 'v' → "Avengers"
  Edit distance = 1 ✅ (trong ngưỡng AUTO)

"Avngrs" → "Avengers"
  Edit distance = 3 ❌ (quá xa, không match)
```

**`fuzziness: 'AUTO'` nghĩa là gì?**

| Độ dài từ | Edit distance cho phép |
|---|---|
| 1–2 ký tự | 0 (exact match) |
| 3–5 ký tự | 1 |
| ≥ 6 ký tự | 2 |

```typescript
// Tại sao chọn AUTO thay vì AUTO:1,2 cứng?
// AUTO tự điều chỉnh theo độ dài từ — từ ngắn không cần fuzzy nhiều
// (fuzzy quá → nhiều false positive — "War" match cả "Bar", "Car")
fuzziness: 'AUTO',
operator: 'or',   // bất kỳ từ nào match đều được tính
type: 'best_fields', // chọn field có score cao nhất làm representative
```

---

### 3.3 Boosting — Từ này quan trọng hơn từ kia

```typescript
// elasticsearch.service.ts — lines 380, 393
fields: ['title^3', 'original_title^2', 'overview^1'],
```

**Giải thích từng con số:**

```
"title^3"          ← nhân score 3 lần nếu match trong title
"original_title^2" ← nhân score 2 lần nếu match trong original_title
"overview^1"       ← score mặc định nếu chỉ match trong overview
```

**Tại sao lại chọn tỉ lệ 3:2:1?**

Hãy test với query *"Endgame"*:

- Phim A: title = "Avengers: Endgame" → match `title^3` → score cao nhất ✅
- Phim B: original_title = "Endgame" (2018 drama) → match `original_title^2` → score trung bình
- Phim C: overview = "...the endgame of this war..." → match `overview^1` → score thấp

Người dùng muốn thấy phim A đầu tiên — đúng với trực giác.

> **Nguyên tắc:** Title là intention (ý định rõ ràng của người dùng). Overview là context phụ trợ — chỉ dùng khi title không match.

---

### 3.4 Fallback Logic — Code biết ES "hỏng" như thế nào?

```typescript
// search.service.ts — lines 86-131
async searchMovies(query: string, page = 1): Promise<MovieSearchResult> {

  // ── BƯỚC 1: Kiểm tra kết nối TRƯỚC khi gọi ────────────────
  if (isElasticsearchConnected()) {
    // isElasticsearchConnected() đọc một biến boolean nội bộ trong config/elasticsearch.ts
    // được set = true khi ping thành công lúc server khởi động
    // được set = false nếu ping fail hoặc connection drop

    try {
      const esResult = await elasticsearchService.searchMovies(query, { page, pageSize: 20 })

      logger.info('Search served by Elasticsearch', { query, page, total: esResult.total })

      // ✅ ES hoạt động → trả kết quả với tag source: 'elasticsearch'
      return { ...esResult, source: 'elasticsearch' }

    } catch (esErr) {
      // ❌ ES connected nhưng query FAIL (timeout, bad query, out of memory...)
      // → Log cảnh báo rõ ràng để dev biết có vấn đề
      logger.warn('[SearchService] Elasticsearch search failed — falling back to TMDB API', {
        query,
        error: esErr instanceof Error ? esErr.message : String(esErr),
      })
      // → Không throw, tiếp tục xuống FALLBACK
    }

  } else {
    // ❌ ES không kết nối được từ đầu (chưa start, sai URL, firewall...)
    logger.warn('[SearchService] Elasticsearch not connected — using TMDB fallback immediately')
    // → Nhảy thẳng xuống FALLBACK, không mất thêm thời gian retry
  }

  // ── BƯỚC 2 (FALLBACK): Gọi TMDB ───────────────────────────
  const tmdbResult = await tmdbService.searchMovies(query, page)
  // tmdbService.searchMovies KHÔNG cache (vì search luôn unique)

  logger.info('Search served by TMDB fallback', { query, page, total: tmdbResult.total_results })

  // Convert TMDB response → cùng shape với ES result
  return tmdbListToSearchResult(tmdbResult)
  // source: 'tmdb_fallback' ← controller biết nhưng user không cần biết
}
```

**Có 2 loại "hỏng" khác nhau:**

| Tình huống | Phát hiện bằng | Hành động |
|---|---|---|
| ES chưa kết nối (offline hoàn toàn) | `isElasticsearchConnected() === false` | Nhảy thẳng sang TMDB |
| ES kết nối nhưng query lỗi | `try/catch` bắt error | Log warning + nhảy sang TMDB |
| TMDB cũng lỗi luôn | `handleTMDBError()` throw | Trả 502/500 cho client |

---

### 3.5 tmdbListToSearchResult — "Cầu nối" giữa 2 thế giới

```typescript
// search.service.ts — lines 44-72
function tmdbListToSearchResult(tmdbResult: TMDBMovieList): MovieSearchResult {
  const hits: SearchHit[] = tmdbResult.results.map((m: TMDBMovie) => ({
    id:                m.id,
    title:             m.title,
    // ...tất cả các field giống hệt ES result...
    score: null,  // ← TMDB không có relevance score, đặt null
  }))

  return {
    hits,
    total:      tmdbResult.total_results,
    page:       tmdbResult.page,
    pageSize:   PAGE_SIZE,   // 20
    totalPages: tmdbResult.total_pages,
    source:     'tmdb_fallback',  // ← đánh dấu nguồn gốc
  }
}
```

**Tại sao cần hàm adapter này?**

ES trả về `SearchResult`, TMDB trả về `TMDBMovieList` — hai cấu trúc khác nhau. Controller chỉ muốn nhận một kiểu duy nhất `MovieSearchResult`. Hàm adapter **chuyển đổi** TMDB → unified format. Controller không cần biết data đến từ đâu.

---

## 4. 💡 Bài Học "Sương Máu"

### 4.1 Tại sao tách `tmdbService` và `moviesService`?

**Single Responsibility Principle (SRP):** Mỗi module chỉ có một lý do để thay đổi.

```
tmdbService.ts    ← Thay đổi khi: TMDB đổi API, thêm endpoint, đổi cache strategy
moviesService.ts  ← Thay đổi khi: Business logic movies thay đổi
searchService.ts  ← Thay đổi khi: Logic routing ES/TMDB thay đổi
```

**Nếu gộp tất cả vào một file:**

```typescript
// ❌ Anti-pattern: "God Service"
class MovieGodService {
  // Gọi TMDB
  // Quản lý Redis cache
  // Gọi Elasticsearch
  // Quyết định fallback
  // Xử lý business rules
  // ...
}
// → File 2000 dòng, không ai dám sửa vì sợ break thứ khác
```

**Với cách tách hiện tại:**
```typescript
// ✅ Khi TMDB đổi auth từ Bearer → API Key
// → Chỉ sửa tmdbService.ts, không đụng đến searchService hay moviesService
```

---

### 4.2 Tại sao Search không cache, còn Trending thì cache?

Đây là câu hỏi hay nhất của tuần 3.

**Câu trả lời bằng toán học:**

```
Trending movies:  có bao nhiêu unique request?
→ /movies/trending?window=day  ← cùng 1 URL cho mọi user
→ 10.000 user gọi → chỉ có 1 cache entry dùng chung → Cache rất hiệu quả!

Search queries:   có bao nhiêu unique request?
→ "avengers", "Avengers", "Avengers endgame", "spider man", "spiderman", ...
→ 10.000 user → có thể có 9.500 queries khác nhau
→ 9.500 cache entries → chiếm Redis bộ nhớ → cache rate thấp → KHÔNG đáng
```

**Bằng code:**
```typescript
// tmdb.service.ts — getTrending
return getWithCache<TMDBMovieList>(key, TTL.TRENDING, async () => {
  // TTL 15 phút — mọi user nhận cùng data trong 15 phút
})

// tmdb.service.ts — searchMovies
async searchMovies(query: string, page = 1): Promise<TMDBMovieList> {
  // No caching — search queries are unique per user input ← comment giải thích lý do
  const response = await tmdbClient.get('/search/movie', { params: { query, page } })
  return response.data
}
```

**Bảng quyết định cache:**

| Loại data | Có cache không? | Lý do |
|---|---|---|
| Trending, Popular, Top Rated | ✅ Có | Mọi user nhận cùng kết quả |
| Movie Detail (theo ID) | ✅ Có 24h | Detail phim không thay đổi thường xuyên |
| Genres, Configuration | ✅ Có 7 ngày | Gần như tĩnh |
| Search results | ❌ Không | Mỗi query là unique |
| Autocomplete | ❌ Không | Kết quả phải fresh, user đang gõ realtime |

---

## 5. 🧠 Góc Nhìn Feynman — "The Simple Truth"

### Hệ thống tìm kiếm này là... thư viện thành phố có kế hoạch dự phòng

Hãy tưởng tượng bạn cần tìm sách trong một **thư viện thành phố hiện đại**:

**Elasticsearch** là **hệ thống máy tính tra cứu** ở sảnh chính:
- Bạn gõ "avngrs" (sai chính tả)
- Máy hiểu bạn muốn "Avengers", hiển thị 150 kết quả, xếp theo mức liên quan
- Cuốn nào tên khớp nhất hiện lên đầu **(boosting title^3)**
- Chấp nhận sai 1-2 ký tự **(fuzziness AUTO)**

**TMDB API** là **thủ thư ở quầy lễ tân**:
- Chậm hơn một chút vì phải hỏi thủ công
- Chỉ tìm theo tên chính xác, không thông minh bằng máy
- Nhưng **luôn có mặt**, không bao giờ nghỉ

**SearchService** là **người điều phối**:
```
Người dùng hỏi → Điều phối nhìn về phía máy tính (ES):
  Máy tính CHẠY ĐƯỢC? → Hỏi máy tính → Trả kết quả
  Máy tính HỎNG?      → Quay sang hỏi thủ thư (TMDB) → Trả kết quả
Người dùng LUÔN nhận được kết quả, không biết máy có hỏng hay không.
```

**Redis Cache** là **tờ giấy note dán trên bàn**:
- Câu hỏi nào hỏi nhiều lần → ghi ra giấy note
- Lần sau hỏi lại → đọc giấy note thay vì lục lại tủ sách → nhanh hơn 100x
- Nhưng câu hỏi tìm kiếm thì KHÔNG ghi note — vì mỗi người hỏi khác nhau, giấy note đầy mà không dùng được

**Mapping** là **quy tắc phân loại sách**:
- Tên sách (`title`) → đánh index kỹ để tra nhanh
- Ảnh bìa sách (`poster_path`) → lưu để xem thôi, không cần đánh index

---

## 6. 📊 Tóm Tắt Kỹ Thuật — Tuần 3

### Files được tạo

| File | Vai trò | Dòng code |
|---|---|---|
| `services/tmdb.service.ts` | TMDB wrapper + Redis cache + Thundering herd protection | 501 |
| `services/elasticsearch.service.ts` | ES index lifecycle + bulk index + fuzzy search | 456 |
| `modules/search/search.service.ts` | Routing ES→TMDB fallback logic | 211 |
| `modules/search/search.controller.ts` | HTTP layer: extract params, format response | 71 |
| `modules/search/search.routes.ts` | Route definitions + middleware chain | ~40 |
| `modules/search/search.validation.ts` | Joi schemas cho query params | ~50 |
| `modules/movies/` | Movies controller + service + routes + validation | ~400 |

### Quyết định kiến trúc quan trọng

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Search engine | Elasticsearch primary + TMDB fallback | Resilience > single point of failure |
| Fuzziness | `AUTO` | Tự điều chỉnh theo độ dài từ |
| Boost ratio | `title^3 : original_title^2 : overview^1` | Phản ánh đúng intent của user |
| Cache search | ❌ Không cache | Cache hit rate quá thấp, lãng phí memory |
| Fallback trigger | `isConnected() === false` OR `catch(esErr)` | Bắt cả 2 loại failure |
| Adapter pattern | `tmdbListToSearchResult()` | Controller nhận 1 type duy nhất |

---

*Cập nhật: 2026-04-29 | Tuần tiếp theo: Watchlist CRUD + Socket.IO Realtime + Review System*
