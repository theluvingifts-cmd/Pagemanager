import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { facebookRouter } from './server/routes/facebookRoutes.js';
import { contentRouter } from './server/routes/contentRoutes.js';
import { mediaRouter } from './server/routes/mediaRoutes.js';
import { aiRouter } from './server/routes/aiRoutes.js';
import { messengerRouter } from './server/routes/messengerRoutes.js';
import { messengerTokenRepairMiddleware } from './server/routes/messengerTokenRepairMiddleware.js';
import { instagramRouter } from './server/routes/instagramRoutes.js';
import { metaWebhookRouter } from './server/routes/metaWebhookRoutes.js';
import {
  backgroundAutomationRouter,
  startBackgroundAutomationLoop,
} from './server/routes/backgroundAutomationRoutes.js';
import {
  getFirebaseRuntimeConfig,
  isFirebaseRestConfigured,
} from './server/services/firebaseRest.js';

dotenv.config();

const app = express();
const isVercel = Boolean(process.env.VERCEL);

app.set('trust proxy', 1);

// Meta webhook trước JSON parser nếu route cần raw body.
app.use('/api/meta/webhook', metaWebhookRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (!isVercel) {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
}

// Endpoint chẩn đoán phải luôn trả JSON.
app.get('/api/config-status', (req, res) => {
  try {
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

    res.json({
      status: 'ok',
      runtime: isVercel ? 'vercel-node-server' : 'node-express',
      metaConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      firebaseConfigured: isFirebaseRestConfigured(),
      firebaseProjectId: firebaseConfig.projectId,
      firestoreDatabaseId: firebaseConfig.databaseId,
      appUrl: baseUrl,
      redirectUri,
      graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v23.0',
    });
  } catch (error: any) {
    console.error('[config-status]', error);
    res.status(500).json({
      status: 'error',
      error: error?.message || 'Không đọc được runtime config',
    });
  }
});

app.use('/api/facebook', facebookRouter);
app.use('/api/contents', contentRouter);
app.use('/api/media', mediaRouter);
app.use('/api/ai', aiRouter);

// Repair legacy AI-Studio/browser encrypted Page tokens before the existing
// Messenger router reads them. Messenger business logic itself stays intact.
app.use('/api/messenger', messengerTokenRepairMiddleware);
app.use('/api/messenger', messengerRouter);

app.use('/api/instagram', instagramRouter);
app.use('/api/automation/background', backgroundAutomationRouter);

// Local / AI Studio only: attach Vite middleware and start a real listener.
// Production Vercel serves the Vite dist separately and imports this app via /api.
async function attachLocalFrontend() {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

async function startLocalServer() {
  await attachLocalFrontend();

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`[PAGE MANAGER] listening on ${port} | vercel=false`);
    startBackgroundAutomationLoop();
  });
}

// Important: on Vercel, do not start a listener and do not attach static/Vite middleware.
// The Vercel API wrapper imports the prebuilt backend bundle and exports this Express app.
if (!isVercel) {
  void startLocalServer().catch(error => {
    console.error('[PAGE MANAGER] Startup failed:', error);
    process.exitCode = 1;
  });
}

export default app;
