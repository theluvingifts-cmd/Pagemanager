import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import {
  createDocument,
  isFirebaseRestConfigured,
  queryDocuments,
  uploadStorageObject,
} from '../services/firebaseRest.js';
import { authenticateRequest } from '../middleware/authMiddleware.js';

export const mediaRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

async function assertRemoteMedia(url: string, mediaType: 'image' | 'video') {
  let response = await fetch(url, { method: 'HEAD', redirect: 'follow' });

  // Some storage/CDN endpoints do not implement HEAD correctly. Fall back to a
  // tiny range request so we can still validate status and Content-Type.
  if (!response.ok) {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    });
  }

  if (!response.ok && response.status !== 206) {
    throw new Error(`URL media vừa tải lên không truy cập công khai được (HTTP ${response.status}).`);
  }

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (mediaType === 'image' && !contentType.startsWith('image/')) {
    throw new Error(`URL ảnh trả về sai định dạng (${contentType || 'không có Content-Type'}).`);
  }
  if (mediaType === 'video' && !contentType.startsWith('video/')) {
    throw new Error(`URL video trả về sai định dạng (${contentType || 'không có Content-Type'}).`);
  }

  try { await response.body?.cancel(); } catch {}
}

async function normalizeImage(buffer: Buffer) {
  try {
    return await sharp(buffer, { failOn: 'none' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error('Ảnh không hợp lệ hoặc không thể chuyển sang JPEG chuẩn cho Meta.');
  }
}

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

    const mediaType: 'image' | 'video' = isImage ? 'image' : 'video';
    let uploadBytes = file.buffer;
    let uploadMime = file.mimetype;
    let ext = path.extname(file.originalname).toLowerCase() || '.bin';

    // Meta/Instagram is much more reliable with a real JPEG than with HEIC,
    // WebP, PNG with alpha, or files whose extension/MIME do not match.
    if (isImage) {
      uploadBytes = await normalizeImage(file.buffer);
      uploadMime = 'image/jpeg';
      ext = '.jpg';
    }

    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const storagePath = `users/${user.id}/${fileName}`;

    // No local /uploads fallback. Story media must always live at a URL that
    // Meta can fetch from the public internet.
    const downloadUrl = await uploadStorageObject(
      user.idToken,
      storagePath,
      uploadBytes,
      uploadMime
    );

    await assertRemoteMedia(downloadUrl, mediaType);

    const now = new Date().toISOString();
    const record = await createDocument(user.idToken, 'media', {
      userId: user.id,
      contentId: req.body.content_id || null,
      storagePath,
      downloadUrl,
      mediaType,
      fileName: file.originalname,
      fileSize: uploadBytes.length,
      originalFileSize: file.size,
      contentType: uploadMime,
      createdAt: now,
    });

    return res.json({
      success: true,
      media: {
        id: record.id,
        user_id: user.id,
        content_id: req.body.content_id || null,
        file_name: file.originalname,
        file_size: uploadBytes.length,
        media_type: mediaType,
        storage_path: storagePath,
        public_url: downloadUrl,
        downloadUrl,
        content_type: uploadMime,
        created_at: now,
      },
    });
  } catch (err: any) {
    console.error('Media upload error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi tải tệp lên Firebase Storage' });
  }
});
