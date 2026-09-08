import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { facebookRouter } from './server/routes/facebookRoutes';
import { contentRouter } from './server/routes/contentRoutes';
import { mediaRouter } from './server/routes/mediaRoutes';
import { aiRouter } from './server/routes/aiRoutes';
import { messengerRouter } from './server/routes/messengerRoutes';
import { instagramRouter } from './server/routes/instagramRoutes';
import { metaWebhookRouter } from './server/routes/metaWebhookRoutes';
import {
  backgroundAutomationRouter,
  startBackgroundAutomationLoop,
} from './server/routes/backgroundAutomationRoutes';
import {
  getFirebaseRuntimeConfig,
  isFirebaseRestConfigured,
} from './server/services/firebaseRest';

dotenv.config();

const app = express();
const isVercel = Boolean(process.env.VERCEL);

app.set('trust proxy', 1);

// Webhook must be mounted before JSON parsing if it needs the raw body.
app.use('/api/meta/webhook', metaWebhookRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// uploads/ is only a local / AI Studio convenience.
// Vercel must not rely on a writable local filesystem.
if (!isVercel) {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
}

app.get('/api/config-status', (req, res) => {
  const metaConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  const firebaseConfigured = isFirebaseRestConfigured();
  const firebaseConfig = getFirebaseRuntimeConfig();

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const baseUrl = (
    process.env.APP_URL ||
    `${protocol}://${req.get('host')}`
  ).replace(/\/$/, '');

  const redirectUri =
    process.env.META_REDIRECT_URI ||
    `${baseUrl}/api/facebook/callback`;

  const missing: string[] = [];
  if (!process.env.META_APP_ID) missing.push('META_APP_ID');
  if (!process.env.META_APP_SECRET) missing.push('META_APP_SECRET');
  if (!firebaseConfig.projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!firebaseConfig.apiKey) missing.push('FIREBASE_API_KEY');

  res.json({
    status: 'ok',
    appName: 'PAGE MANAGER',
    runtime: isVercel ? 'vercel-api-function' : 'node-express',
    metaConfigured,
    firebaseConfigured,
    metaAppId: process.env.META_APP_ID
      ? `${process.env.META_APP_ID.slice(0, 4)}...`
      : null,
    graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v23.0',
    appUrl: baseUrl,
    redirectUri,
    firebaseProjectId: firebaseConfig.projectId,
    firestoreDatabaseId: firebaseConfig.databaseId,
    dataAccessMode: 'firebase-id-token + Firestore REST',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    aiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    missing,
  });
});

app.use('/api/facebook', facebookRouter);
app.use('/api/contents', contentRouter);
app.use('/api/media', mediaRouter);
app.use('/api/ai', aiRouter);
app.use('/api/messenger', messengerRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api/automation/background', backgroundAutomationRouter);

export default app;

async function startLocalServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Dynamic import keeps Vite out of the Vercel API runtime.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PAGE MANAGER] Server đang chạy tại http://0.0.0.0:${PORT}`);
    startBackgroundAutomationLoop();
  });
}

// AI Studio / local Node owns its listener.
// Vercel invokes api/index.ts as a managed function.
if (!isVercel) {
  void startLocalServer().catch(error => {
    console.error('[PAGE MANAGER] Không thể khởi động server:', error);
    process.exitCode = 1;
  });
}
