import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
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

// Cloud Run / AI Studio / Vercel terminate TLS before Express.
app.set('trust proxy', 1);

// Meta webhook needs untouched raw body before the JSON parser.
app.use('/api/meta/webhook', metaWebhookRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

app.get('/api/config-status', (req, res) => {
  const metaConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  const firebaseConfigured = isFirebaseRestConfigured();
  const firebaseConfig = getFirebaseRuntimeConfig();

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProto || req.protocol;
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
  if (!process.env.TOKEN_ENCRYPTION_KEY && !process.env.META_APP_SECRET) {
    missing.push('TOKEN_ENCRYPTION_KEY');
  }
  if (!firebaseConfig.projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!firebaseConfig.apiKey) missing.push('FIREBASE_API_KEY');

  res.json({
    status: 'ok',
    appName: 'PAGE MANAGER',
    runtime: isVercel ? 'vercel-express' : 'node-express',
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
    aiConfigured: Boolean(
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    ),
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

// AI Studio / local development: keep Vite middleware.
// Vercel: NODE_ENV=production and the built Vite files are bundled into the
// Express function via vercel.json.
if (!isVercel && process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));

  // SPA fallback. API routes are already registered above, so they never
  // fall through to index.html.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Vercel's Express runtime needs the application exported, not only a listener.
// This is what prevents /api/* from being served as Vite's index.html/404 page.
export default app;

// AI Studio / local Node still needs a real listener.
// Do not open a second listener inside Vercel's managed Express runtime.
if (!isVercel) {
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PAGE MANAGER] Server đang chạy tại http://0.0.0.0:${PORT}`);
    startBackgroundAutomationLoop();
  });
}
