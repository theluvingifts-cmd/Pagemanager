import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { facebookRouter } from './server/routes/facebookRoutes';
import { contentRouter } from './server/routes/contentRoutes';
import { mediaRouter } from './server/routes/mediaRoutes';
import { isFirebaseAdminConfigured } from './server/services/firebaseAdmin';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static uploads serving
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // Health and System Config Status endpoint
  app.get('/api/config-status', (req, res) => {
    const metaAppId = process.env.META_APP_ID;
    const metaAppSecret = process.env.META_APP_SECRET;
    const metaConfigured = Boolean(metaAppId && metaAppSecret);
    const firebaseConfigured =
      isFirebaseAdminConfigured() ||
      Boolean(process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_PROJECT_ID);

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = process.env.META_REDIRECT_URI || `${baseUrl.replace(/\/$/, '')}/api/facebook/callback`;

    res.json({
      status: 'ok',
      appName: 'PAGE MANAGER',
      metaConfigured,
      firebaseConfigured,
      metaAppId: metaAppId ? `${metaAppId.slice(0, 4)}...` : null,
      appUrl: process.env.APP_URL || null,
      redirectUri,
    });
  });

  // Register API routes
  app.use('/api/facebook', facebookRouter);
  app.use('/api/contents', contentRouter);
  app.use('/api/media', mediaRouter);

  // Vite middleware for development vs Static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PAGE MANAGER] Server đang chạy tại http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
