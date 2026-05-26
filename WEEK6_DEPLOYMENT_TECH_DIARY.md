# Week 6: Production Deployment & CI/CD Pipeline

## 1. Overview
Tuần 6 tập trung vào quá trình đóng gói và triển khai (Deployment) toàn bộ hệ thống Backend lên môi trường Production (Render). Mục tiêu chính là thiết lập một luồng CI/CD hoàn chỉnh, tự động hoá việc kiểm tra chất lượng code và triển khai, đồng thời cấu hình hệ thống sao cho có thể hoạt động ổn định và linh hoạt xử lý các dịch vụ bên thứ 3 (Graceful Degradation).

## 2. CI/CD Pipeline Architecture
Dự án áp dụng luồng Tích hợp liên tục (CI) và Triển khai liên tục (CD) tự động:

### 2.1. Continuous Integration (GitHub Actions)
Được định nghĩa tại `.github/workflows/ci.yml`. Pipeline tự động kích hoạt khi có code push hoặc Pull Request vào nhánh `develop` hoặc `main`.
- **Môi trường ảo**: Sử dụng Ubuntu, khởi tạo sẵn MongoDB và Redis thông qua Docker services để mô phỏng môi trường thật.
- **Tiến trình kiểm tra**:
  1. Cài đặt thư viện: `npm ci`
  2. Linting: `npm run lint` (Đảm bảo quy tắc viết code).
  3. Type Checking: `npm run type-check` (Kiểm tra nghiêm ngặt kiểu dữ liệu TypeScript, đặc biệt là các thay đổi liên quan đến `@elastic/elasticsearch`).
  4. Unit Tests: `npm run test` (Chạy toàn bộ test suites với ngưỡng phủ code >70%).

### 2.2. Continuous Deployment (Render)
Hệ thống kết nối tự động giữa GitHub và Render. Sau khi code vượt qua CI:
- **Build Phase**: Render kéo code về, cài đặt dependencies và chạy `npm run build` để compile TypeScript (`src`) sang JavaScript (`dist`).
- **Start Phase**: Ứng dụng khởi động bằng lệnh `node dist/server.js`. 
- **Kết nối hạ tầng**:
  - MongoDB Atlas: Database chính.
  - Upstash Redis (kết nối qua TLS `rediss://`): Xử lý Cache và BullMQ.

## 3. Quá trình xử lý lỗi (Troubleshooting) & Tối ưu cấu hình

Trong quá trình triển khai thực tế trên Render, một số vấn đề phát sinh đã được khắc phục để đảm bảo hệ thống có thể boot up thành công:

### 3.1. Lỗi mất file Swagger khi biên dịch
- **Vấn đề**: Trình biên dịch TypeScript (`tsc`) không tự động copy các file không phải code (như `swagger.yaml`) sang thư mục `dist`. Dẫn đến lỗi `ENOENT: no such file or directory` khi truy cập `/api/docs`.
- **Giải pháp**: Cập nhật logic load file trong `app.ts`. Sử dụng `process.cwd()` làm fallback để hệ thống có thể đọc trực tiếp `swagger.yaml` từ thư mục gốc của dự án thay vì tìm trong `dist`.

### 3.2. Lỗi xác thực Redis (Upstash)
- **Vấn đề**: Bị văng lỗi `WRONGPASS invalid username-password pair`.
- **Giải pháp**: Lỗi do quá trình copy URL từ Upstash (mật khẩu bị ẩn dưới dạng `********`). Đã khắc phục bằng cách lấy chính xác mật khẩu plain-text và cập nhật lại biến môi trường `REDIS_URL` trên Render, sử dụng giao thức bảo mật `rediss://`.

### 3.3. Graceful Degradation (Khả năng chịu lỗi linh hoạt)
- **Vấn đề**: File cấu hình `index.ts` và `elasticsearch.ts` ném lỗi (throw Error) làm crash server nếu thiếu cấu hình AWS S3, SendGrid, hoặc Elasticsearch ở môi trường Production. 
- **Giải pháp**: Xoá bỏ các đoạn code kiểm tra bắt buộc (strict checks). Đổi từ ném lỗi sang cảnh báo (Log Warning). 
  - Nếu thiếu AWS / SendGrid, hệ thống vẫn khởi động bình thường.
  - Nếu thiếu URL Elasticsearch, hệ thống tự động Fallback sang TMDB để thực hiện tìm kiếm mà không làm gián đoạn trải nghiệm người dùng.

## 4. Kết quả hoàn thành
- Server đã deploy thành công 100% trên Render.
- Hệ thống CI/CD khép kín, an toàn và chuyên nghiệp.
- Mọi API endpoint đã sẵn sàng để App Mobile kết nối.
- Tài liệu API trực quan có thể truy cập thông qua đường dẫn `/api/docs`.
