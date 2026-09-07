# PAGE MANAGER — Hệ Thống Quản Lý & Xuất Bản Facebook Page Trực Tiếp

**PAGE MANAGER** là ứng dụng web full-stack hoàn chỉnh phục vụ việc quản lý nội dung và xuất bản bài viết trực tiếp lên các Facebook Page được kết nối thông qua **Meta Graph API thật** và **Cơ sở dữ liệu Supabase (PostgreSQL) thật**.

> ⚠️ **Cam kết kỹ thuật:** Ứng dụng KHÔNG dùng dữ liệu giả (mock data), KHÔNG mô phỏng quy trình đăng bài. Khi nhấn **"Đăng bài"**, yêu cầu được gửi trực tiếp tới máy chủ backend, giải mã Page Access Token trong môi trường an toàn và gọi Meta Graph API v21.0 để đưa bài viết lên dòng thời gian của Facebook Page.

---

## 1. Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Frontend (React + Vite)              │
│  - Giao diện tiếng Việt chuẩn hóa                           │
│  - Supabase Auth Context & Session Management               │
│  - Facebook Context (OAuth Popup, Đồng bộ bài viết, Trạng thái) │
│  - Content Context (Soạn thảo, Quản lý trạng thái, Đăng bài)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP REST / Proxy
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Node.js / Express Backend                   │
│  - Xác thực phiên làm việc người dùng (JWT Supabase Auth)   │
│  - Quản lý mã hóa/giải mã AES-256-GCM cho Access Token      │
│  - Trao đổi OAuth Code lấy Long-lived User & Page Tokens     │
│  - Gọi Meta Graph API v21.0 (Feed, Photos, Permalinks)      │
│  - Tải tệp lên Supabase Storage (/api/media/upload)         │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│  Supabase (PostgreSQL + RLS) │ │    Meta Graph API (v21.0)   │
│  - profiles                  │ │  - OAuth Token Exchange     │
│  - facebook_connections      │ │  - /{page-id}/feed          │
│  - facebook_pages (Encrypted)│ │  - /{page-id}/photos        │
│  - contents & media          │ │  - /{post-id}?fields=...    │
└──────────────────────────────┘ └─────────────────────────────┘
```

### Bảo Mật Token & RLS
- **Tuyệt đối không lưu Page Access Token dưới dạng văn bản thuần (plaintext).**
- Toàn bộ Token của User và Page được mã hóa bằng thuật toán **AES-256-GCM** kèm vector khởi tạo (IV 12-byte) và authentication tag (16-byte). Khóa mã hóa `TOKEN_ENCRYPTION_KEY` chỉ tồn tại tại backend server.
- Phía Client Frontend chỉ nhìn thấy định danh Page, tên Page, avatar, và ID; không bao giờ tiếp cận Secret hoặc Token.
- Toàn bộ bảng dữ liệu trong PostgreSQL kích hoạt **Row Level Security (RLS)** đảm bảo mỗi người dùng chỉ thao tác trên Page và nội dung của chính họ.

---

## 2. Các Biến Môi Trường Cần Thiết (.env)

Tạo file `.env` tại thư mục gốc của dự án (tham khảo `.env.example`):

```env
# 1. Cấu hình Supabase (Cơ sở dữ liệu & Authentication)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# 2. Cấu hình Meta Developer App (OAuth & Graph API)
META_APP_ID=1234567890123456
META_APP_SECRET=abcdef1234567890abcdef1234567890
META_REDIRECT_URI=http://localhost:3000/api/facebook/callback

# 3. Khóa bí mật mã hóa Access Token (Bắt buộc chuỗi Hex 64 ký tự = 32 bytes)
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# 4. Port máy chủ
PORT=3000
```

> **Cách tạo nhanh khóa TOKEN_ENCRYPTION_KEY:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 3. Khởi Tạo Cơ Sở Dữ Liệu Supabase

1. Mở trang quản trị dự án Supabase của bạn tại [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Vào mục **SQL Editor**.
3. Mở file `supabase/migrations/20260907000000_create_pagemanager_schema.sql` trong dự án, sao chép toàn bộ nội dung và dán vào SQL Editor rồi bấm **Run**.
4. Vào mục **Storage** trên Supabase, đảm bảo bucket `pagemanager-media` đã được tạo (schema migration đã bao gồm câu lệnh tự động tạo bucket công khai).

---

## 4. Cấu Hình Meta for Developers

1. Truy cập [developers.facebook.com](https://developers.facebook.com) và tạo một Ứng dụng mới:
   - Loại ứng dụng: **Doanh nghiệp (Business)** hoặc **Khác (Other)**.
2. Thêm sản phẩm: **Facebook Login for Business**.
3. Vào **Facebook Login for Business** > **Cài đặt (Settings)**:
   - Trong ô **Valid OAuth Redirect URIs**, điền địa chỉ:
     `http://localhost:3000/api/facebook/callback` (hoặc domain triển khai thật của bạn).
   - Bấm **Lưu thay đổi**.
4. Vào **Cài đặt** > **Cơ bản**:
   - Lấy **App ID** (điền vào `META_APP_ID`).
   - Lấy **App Secret** (điền vào `META_APP_SECRET`).
5. Vào **Xem xét ứng dụng** hoặc **Quyền & tính năng**:
   - Trong quá trình phát triển (Development Mode), bạn có thể quản lý ngay bất kỳ Page nào mà tài khoản Admin/Developer/Tester của App sở hữu với các quyền:
     - `pages_show_list`
     - `pages_read_engagement`
     - `pages_manage_posts`
     - `pages_manage_engagement`

---

## 5. Quy Trình Xuất Bản Bài Viết Thật

1. **Đăng nhập:** Người dùng đăng ký/đăng nhập bằng Supabase Auth.
2. **Kết nối Facebook:** Tại trang *Cài đặt & Facebook* hoặc *Tổng quan*, người dùng nhấn "Kết nối Facebook".
3. **Cửa sổ OAuth Popup:** Đăng nhập tài khoản Meta và đồng ý cấp quyền quản lý Page.
4. **Lưu trữ bảo mật:** Backend nhận Authorization Code, đổi lấy Short-lived User Token, tiếp tục đổi lấy Long-lived Token (thời hạn 60 ngày), và lấy Page Access Token vĩnh viễn (Never Expires). Toàn bộ token được mã hóa AES-256-GCM trước khi lưu vào bảng `facebook_pages`.
5. **Soạn bài & Đăng:**
   - Người dùng soạn bài viết, đính kèm ảnh (tải lên Supabase Storage).
   - Nhấn **"Đăng ngay lên Facebook"**.
   - Backend giải mã Page Access Token và gửi request POST trực tiếp lên Meta Graph API:
     - Bài viết dạng Text/Link: `POST https://graph.facebook.com/v21.0/{page-id}/feed`
     - Bài viết có Ảnh: `POST https://graph.facebook.com/v21.0/{page-id}/photos` (kèm `url` và `caption`).
   - Meta phản hồi `{ id: "pageid_postid" }`. Backend cập nhật bài viết thành `status = 'published'`, lưu `facebook_post_id` và tạo `permalink` thật để người dùng có thể nhấp vào xem trực tiếp trên Facebook.
6. **Đồng bộ:** Nút "Đồng bộ bài viết" sẽ gọi `GET https://graph.facebook.com/v21.0/{page-id}/posts` để kéo các bài viết mới nhất từ Facebook về cơ sở dữ liệu.

---

## 6. Hướng Dẫn Chạy Dự Án

### Cài đặt dependencies:
```bash
npm install
```

### Chạy chế độ phát triển (Development):
```bash
npm run dev
```
Dev server sẽ khởi động cả Express backend và Vite frontend tại `http://localhost:3000`.

### Biên dịch và khởi chạy cho Production:
```bash
npm run build
npm start
```

---
*Phát triển bởi đội ngũ kỹ sư Full-stack & Meta Graph API.*
