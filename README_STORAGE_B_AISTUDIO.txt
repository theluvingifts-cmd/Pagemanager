FIX CHO LỖI:
Không thể tải tệp lên Firebase Storage (pagemanager-prod.firebasestorage.app): Not Found

Nguyên nhân:
- Code Storage-B đã có nhưng runtime AI Studio không thấy STORAGE_FIREBASE_*.
- Vì vậy bản trước tự fallback về bucket project A: pagemanager-prod.firebasestorage.app.

Bản này sửa:
1. Project B mặc định cố định: the-luvin / the-luvin.firebasestorage.app.
2. Không bao giờ fallback sang pagemanager-prod Storage nữa.
3. Có file .env ở root chứa Service Account project the-luvin để AI Studio/local server dùng ngay.
4. .env đã nằm trong rule .gitignore hiện tại (*.env*) nên git add bình thường sẽ không commit file này.

Thay đúng các file:
- .env                (root source)
- server/services/firebaseAdmin.ts
- server/services/firebaseRest.ts

Sau khi thay:
- restart/re-run applet/server để dotenv đọc lại .env.
- upload 1 ảnh Story MỚI.
- Nếu còn thấy tên pagemanager-prod.firebasestorage.app trong lỗi thì server vẫn đang chạy bundle/source cũ và chưa restart.
