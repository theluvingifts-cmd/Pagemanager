import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getAdminStorage,
  getAdminDb,
  isFirebaseAdminConfigured,
} from '../services/firebaseAdmin';
import { authenticateRequest } from '../middleware/authMiddleware';

export const mediaRouter = Router();

// Ensure local uploads directory exists as backup
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Memory storage to stream to Firebase Storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max
});

/**
 * Get all media uploaded by the authenticated user
 */
mediaRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    if (!isFirebaseAdminConfigured()) {
      return res.json({ media: [] });
    }

    const db = getAdminDb();
    const snap = await db
      .collection('media')
      .where('userId', '==', user.id)
      .get();

    const mediaList = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        user_id: data.userId,
        content_id: data.contentId,
        file_name: data.fileName,
        file_size: data.fileSize,
        media_type: data.mediaType,
        storage_path: data.storagePath,
        public_url: data.downloadUrl || data.publicUrl,
        created_at: data.createdAt,
      };
    });

    mediaList.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({ media: mediaList });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách media' });
  }
});

/**
 * Upload an image or video asset to Firebase Storage
 */
mediaRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy tệp tải lên' });
    }

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideo = file.mimetype.startsWith('video');
    const isImage = file.mimetype.startsWith('image');

    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'Chỉ hỗ trợ tệp định dạng Hình ảnh (JPG, PNG, WebP) hoặc Video (MP4)' });
    }

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const storagePath = `users/${user.id}/${fileName}`;
    const mediaType = isImage ? 'image' : 'video';

    let downloadUrl = '';

    // Attempt Firebase Storage upload
    if (isFirebaseAdminConfigured()) {
      try {
        const bucket = getAdminStorage().bucket();
        const fileRef = bucket.file(storagePath);

        await fileRef.save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
            metadata: {
              uploadedBy: user.id,
              originalName: file.originalname,
            },
          },
        });

        // Make publicly accessible or get public download URL
        try {
          await fileRef.makePublic();
          downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        } catch (pubErr) {
          // If uniform bucket-level access prevents makePublic, get signed URL or public URL format
          downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
        }
      } catch (storageErr) {
        console.warn('Firebase Storage upload warning, falling back to local storage:', storageErr);
      }
    }

    // Fallback if Firebase Storage upload was skipped or failed
    if (!downloadUrl) {
      const localFilePath = path.join(uploadDir, fileName);
      fs.writeFileSync(localFilePath, file.buffer);
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      downloadUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${fileName}`;
    }

    // Save metadata in Firestore
    const now = new Date().toISOString();
    let mediaDocId = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (isFirebaseAdminConfigured()) {
      try {
        const db = getAdminDb();
        const mediaRef = db.collection('media').doc();
        mediaDocId = mediaRef.id;

        await mediaRef.set({
          id: mediaRef.id,
          userId: user.id,
          contentId: req.body.content_id || null,
          storagePath,
          downloadUrl,
          mediaType,
          fileName: file.originalname,
          fileSize: file.size,
          createdAt: now,
        });
      } catch (dbErr) {
        console.error('Firestore media record save error:', dbErr);
      }
    }

    res.json({
      success: true,
      media: {
        id: mediaDocId,
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
    console.error('Media upload general error:', err);
    res.status(500).json({ error: err.message || 'Lỗi tải tệp lên' });
  }
});
