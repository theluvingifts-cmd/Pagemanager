import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  createDocument,
  isFirebaseRestConfigured,
  queryDocuments,
  uploadStorageObject,
} from '../services/firebaseRest.js';
import { authenticateRequest } from '../middleware/authMiddleware.js';

export const mediaRouter = Router();

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

mediaRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!isFirebaseRestConfigured()) return res.status(503).json({ media: [], error: 'Firebase chưa được cấu hình' });

    const records = await queryDocuments<any>(user.idToken, 'media', [
      { field: 'userId', value: user.id },
    ]);

    const media = records.map(record => ({
      id: record.id,
      user_id: record.data.userId,
      content_id: record.data.contentId || null,
      file_name: record.data.fileName,
      file_size: record.data.fileSize,
      media_type: record.data.mediaType,
      storage_path: record.data.storagePath,
      public_url: record.data.downloadUrl || record.data.publicUrl,
      created_at: record.data.createdAt,
    }));

    media.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return res.json({ media });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách media' });
  }
});

mediaRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!req.file) return res.status(400).json({ error: 'Không tìm thấy tệp tải lên' });

    const file = req.file;
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'Chỉ hỗ trợ hình ảnh hoặc video.' });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const storagePath = `users/${user.id}/${fileName}`;
    const mediaType = isImage ? 'image' : 'video';

    let downloadUrl = '';
    try {
      downloadUrl = await uploadStorageObject(
        user.idToken,
        storagePath,
        file.buffer,
        file.mimetype
      );
    } catch (storageErr: any) {
      // Local fallback is intentionally restricted to development. Production
      // media must live in Firebase Storage so Meta can fetch it reliably.
      if (process.env.NODE_ENV === 'production') {
        throw storageErr;
      }
      console.warn('Firebase Storage upload failed; using local dev fallback:', storageErr?.message || storageErr);
      fs.writeFileSync(path.join(uploadDir, fileName), file.buffer);
      const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
      const protocol = forwardedProto || req.protocol;
      const baseUrl = process.env.APP_URL || `${protocol}://${req.get('host')}`;
      downloadUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${fileName}`;
    }

    const now = new Date().toISOString();
    const record = await createDocument(user.idToken, 'media', {
      userId: user.id,
      contentId: req.body.content_id || null,
      storagePath,
      downloadUrl,
      mediaType,
      fileName: file.originalname,
      fileSize: file.size,
      createdAt: now,
    });

    return res.json({
      success: true,
      media: {
        id: record.id,
        user_id: user.id,
        content_id: req.body.content_id || null,
        file_name: file.originalname,
        file_size: file.size,
        media_type: mediaType,
        storage_path: storagePath,
        public_url: downloadUrl,
        downloadUrl,
        created_at: now,
      },
    });
  } catch (err: any) {
    console.error('Media upload error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi tải tệp lên Firebase Storage' });
  }
});
