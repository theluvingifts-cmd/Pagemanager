PAGEMANAGER - FIREBASE STORAGE PROJECT B FIX

Mục tiêu:
- Firebase project A: giữ nguyên Authentication + Firestore của Page Manager.
- Firebase project B: the-luvin, chỉ dùng Storage cho ảnh/video.
- Không dùng local /uploads nữa.
- Ảnh được chuẩn hóa thành JPEG trước khi gửi Meta.
- URL Storage dùng Firebase download token để Meta đọc được mà không cần Firebase Auth.

Vercel Environment Variables bắt buộc cho Storage project B:

STORAGE_FIREBASE_PROJECT_ID=the-luvin
STORAGE_FIREBASE_BUCKET=the-luvin.firebasestorage.app

Cách 1 - khuyên dùng: dán nguyên JSON service account vào 1 biến:
STORAGE_FIREBASE_SERVICE_ACCOUNT={...toàn bộ JSON service account...}

Cách 2 - tách biến:
STORAGE_FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@the-luvin.iam.gserviceaccount.com
STORAGE_FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n

Chỉ cần dùng MỘT trong hai cách credential trên.
Sau khi thêm ENV: Redeploy Vercel, sau đó upload LẠI ảnh Story cũ để nhận URL Storage B mới.

File cần thay đúng theo cấu trúc source:
- server/services/firebaseAdmin.ts
- server/services/firebaseRest.ts
- server/routes/mediaRoutes.ts
- server/services/meta/metaStoryService.ts
- .env.example
- package.json

Lưu ý:
- package.json có thêm dependency sharp; Vercel npm install sẽ tự cài.
- Không cần public Storage Rules vì URL mới dùng Firebase download token.
- Story cũ có URL /uploads hoặc URL cũ vẫn phải upload lại.
