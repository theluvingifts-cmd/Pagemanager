import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { facebookRouter } from './server/routes/facebookRoutes.js';
import { contentRouter } from './server/routes/contentRoutes.js';
import { mediaRouter } from './server/routes/mediaRoutes.js';
import { aiRouter } from './server/routes/aiRoutes.js';
import { messengerRouter } from './server/routes/messengerRoutes.js';
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
app.use('/api/messenger', messengerRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api/automation/background', backgroundAutomationRouter);

// Production (Vercel): phục vụ bundle Vite từ dist.
// Development / AI Studio: gắn Vite middleware.
async function attachFrontend() {
  if (process.env.NODE_ENV === 'production' || isVercel) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));

    // Express 4 SPA fallback. API đã mount phía trên nên không bị nuốt thành HTML.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return res.sendFile(path.join(distPath, 'index.html'));
    });
    return;
  }

  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

async function start() {
  await attachFrontend();

  const port = Number(process.env.PORT || 3000);

  // Vercel 2026 hỗ trợ root server.ts như Node server thật.
  // Vì vậy PHẢI listen cả trên Vercel; không dùng api/index.ts wrapper nữa.
  app.listen(port, '0.0.0.0', () => {
    console.log(`[PAGE MANAGER] listening on ${port} | vercel=${isVercel}`);

    // Không chạy setInterval trong Vercel. Automation nền sẽ đi qua cron/webhook.
    if (!isVercel) {
      startBackgroundAutomationLoop();
    }
  });
}

void start().catch(error => {
  console.error('[PAGE MANAGER] Startup failed:', error);
  process.exitCode = 1;
});

export default app;
