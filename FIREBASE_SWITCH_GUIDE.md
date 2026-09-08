# Chuyển Page Manager sang Firebase project riêng

Mục tiêu:
- Vercel dùng Firebase project bình thường của bạn.
- `pagemanager.vercel.app` thêm được vào Authorized domains.
- AI Studio Preview vẫn có thể fallback về `firebase-applet-config.json`.
- Không vô tình dùng database ID riêng của AI Studio khi đã chuyển project.

## 1. Tạo Firebase project mới

Firebase Console > Add project.

Tên gợi ý:
`pagemanager-prod`

Sau đó:

### Authentication
Authentication > Sign-in method:
- bật Email/Password
- bật Google

Authentication > Settings > Authorized domains:
- thêm `pagemanager.vercel.app`

### Firestore
Firestore Database > Create database.
Dùng database mặc định `(default)`.

### Web app
Project settings > General > Your apps > Web > Add app.

Copy các giá trị:
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

## 2. Thêm ENV trên Vercel

Project > Settings > Environment Variables.

Thêm:

VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID

FIREBASE_API_KEY
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIRESTORE_DATABASE_ID=(default)

APP_URL=https://pagemanager.vercel.app

Nếu Meta OAuth production dùng Vercel:
META_REDIRECT_URI=https://pagemanager.vercel.app/api/facebook/callback

Sau khi thêm ENV: Redeploy.

## 3. Firestore Rules

Project mới cần Rules tương thích với app trước khi ghi dữ liệu.
Không mở `allow read, write: if true`.

Nếu project cũ đang có Rules đã chạy ổn, copy đúng Rules đó sang project mới.

## 4. Tài khoản người dùng

Firebase Auth không tự migrate người dùng giữa 2 project.

Cách đơn giản:
- đăng nhập Google lại trên Firebase mới, hoặc
- đăng ký lại email/password.

UID mới có thể khác UID cũ.

Vì dữ liệu Firestore hiện dùng `userId`, KHÔNG copy dữ liệu cũ sang project mới một cách mù quáng.
Nếu cần giữ dữ liệu cũ, phải migrate và đổi `userId` sang UID mới.

## 5. Facebook / Meta

Sau khi đăng nhập Firebase mới:
- kết nối lại Facebook trong Page Manager;
- Page Access Token / Meta connection sẽ được lưu vào Firebase mới.

Trong Meta Developer:
Valid OAuth Redirect URI production:
`https://pagemanager.vercel.app/api/facebook/callback`

## 6. Kiểm tra sau deploy

Mở:
`https://pagemanager.vercel.app`

Kiểm tra theo thứ tự:
1. đăng nhập Firebase;
2. không còn `auth/unauthorized-domain`;
3. tạo/đọc được dữ liệu Firestore;
4. kết nối lại Facebook;
5. Messenger đọc được hội thoại;
6. automation test nhanh chạy;
7. sau đó mới cấu hình webhook + cron 24/7.

## Vì sao ZIP này cần thiết?

Source cũ ưu tiên `firebase-applet-config.json` ở phía client, nên dù Vercel có ENV Firebase mới,
frontend vẫn có thể tiếp tục trỏ vào project AI Studio cũ.

Bản sửa này đổi thứ tự:
ENV production > AI Studio applet config fallback.

Ngoài ra nó ngăn backend lấy nhầm `firestoreDatabaseId` custom của project AI Studio khi
`FIREBASE_PROJECT_ID` đã chuyển sang project mới.
