import { Router, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { queryDocuments, setDocument } from '../services/firebaseRest.js';
import { decryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest } from '../services/meta/metaConfigService.js';
import { encryptBackgroundPageToken, getBackgroundEncryptionKey } from '../services/automation/backgroundTokenService.js';
import { getAdminDb } from '../services/firebaseAdmin.js';
import { runAllBackgroundMessengerAutomations, runBackgroundMessengerAutomationForPage } from '../services/automation/messengerAutomationWorker.js';
import { runScheduledStoryAutomation } from '../services/automation/storyAutomationWorker.js';

export const backgroundAutomationRouter = Router();

function baseUrlFromRequest(req: Request) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  return String(process.env.APP_URL || `${protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function hasCronSecret() {
  return Boolean(String(process.env.AUTOMATION_CRON_SECRET || '').trim());
}

function isAuthorizedCron(req: Request) {
  const expected = String(process.env.AUTOMATION_CRON_SECRET || '').trim();
  if (!expected) return false;
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = String(req.headers['x-automation-secret'] || '').trim();
  return bearer === expected || header === expected;
}

async function findOwnedPage(user: any, pageIdOrDocId: string) {
  const pages = await queryDocuments<any>(user.idToken, 'facebookPages', [{ field: 'userId', value: user.id }], 50);
  return pages.find(page => page.id === pageIdOrDocId || page.data?.id === pageIdOrDocId || page.data?.pageId === pageIdOrDocId) || null;
}

async function subscribePageWebhook(pageId: string, pageToken: string, graphVersion: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/subscribed_apps`);
  url.searchParams.set('subscribed_fields', 'messages,messaging_postbacks,message_reads,message_deliveries');
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${pageToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const message = data?.error?.message || `Meta webhook subscribe HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

backgroundAutomationRouter.get('/status', async (req: Request, res: Response) => {
  const pageId = String(req.query.pageId || req.query.page_id || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Chưa đăng nhập.' });
    const page = await findOwnedPage(user, pageId);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy Page.' });
    const background = page.data?.backgroundAutomation || {};
    const baseUrl = baseUrlFromRequest(req);
    return res.json({
      success: true,
      enabled: Boolean(background.enabled),
      ready: Boolean(background.enabled && background.encryptedPageAccessToken && hasCronSecret() && process.env.META_WEBHOOK_VERIFY_TOKEN),
      schedulerConfigured: hasCronSecret(),
      webhookVerifyConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
      webhookSubscribed: Boolean(background.webhookSubscribed),
      callbackUrl: `${baseUrl}/api/meta/webhook`,
      cronUrl: `${baseUrl}/api/automation/background/cron`,
      enabledAt: background.enabledAt || null,
      lastRunAt: background.lastRunAt || null,
      lastWebhookAt: background.lastWebhookAt || null,
      lastWebhookEvent: background.lastWebhookEvent || null,
      lastResult: background.lastResult || null,
      lastError: background.lastError || null,
      note: 'Để chạy 24/7 thật trên Cloud Run, Cloud Scheduler phải POST vào cronUrl định kỳ. Webhook dùng callbackUrl để nhận sự kiện Messenger realtime.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Không đọc được trạng thái automation nền.' });
  }
});

backgroundAutomationRouter.post('/enable', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Chưa đăng nhập.' });
    getBackgroundEncryptionKey();
    const page = await findOwnedPage(user, pageId);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy Page.' });
    const vaultKey = getVaultKeyFromRequest(req, true);
    const pageToken = decryptToken(String(page.data?.encryptedPageAccessToken || ''), vaultKey);
    if (!pageToken) return res.status(400).json({ success: false, error: 'Page chưa có access token hợp lệ.' });
    const encryptedBackgroundToken = encryptBackgroundPageToken(pageToken);
    const graphApiVersion = String(page.data?.graphApiVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');
    const realPageId = String(page.data?.pageId || pageId);

    let webhookSubscribed = false;
    let webhookSubscribeError: string | null = null;
    try {
      await subscribePageWebhook(realPageId, pageToken, graphApiVersion);
      webhookSubscribed = true;
    } catch (err: any) {
      webhookSubscribeError = err?.message || 'Không subscribe được webhook Page.';
    }

    const now = new Date().toISOString();
    await setDocument(user.idToken, 'facebookPages', page.id, {
      backgroundAutomation: {
        ...(page.data?.backgroundAutomation || {}),
        enabled: true,
        userId: user.id,
        encryptedPageAccessToken: encryptedBackgroundToken,
        enabledAt: now,
        webhookSubscribed,
        webhookSubscribeError,
      },
      updatedAt: now,
    }, true);

    const baseUrl = baseUrlFromRequest(req);
    return res.json({
      success: true,
      enabled: true,
      webhookSubscribed,
      webhookSubscribeError,
      schedulerConfigured: hasCronSecret(),
      webhookVerifyConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
      callbackUrl: `${baseUrl}/api/meta/webhook`,
      cronUrl: `${baseUrl}/api/automation/background/cron`,
      message: webhookSubscribed
        ? 'Đã bật token chạy nền và subscribe Messenger webhook.'
        : 'Đã bật token chạy nền; webhook chưa subscribe được, hãy kiểm tra callback/quyền Meta.',
    });
  } catch (err: any) {
    return res.status(Number(err?.status) || 500).json({ success: false, error: err?.message || 'Không bật được automation chạy nền.' });
  }
});

backgroundAutomationRouter.post('/disable', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Chưa đăng nhập.' });
    const page = await findOwnedPage(user, pageId);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy Page.' });
    const now = new Date().toISOString();
    await setDocument(user.idToken, 'facebookPages', page.id, {
      backgroundAutomation: {
        ...(page.data?.backgroundAutomation || {}),
        enabled: false,
        encryptedPageAccessToken: null,
        disabledAt: now,
      },
      updatedAt: now,
    }, true);
    return res.json({ success: true, enabled: false, message: 'Đã tắt automation chạy nền cho Page này.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Không tắt được automation chạy nền.' });
  }
});

backgroundAutomationRouter.post('/run-page', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Chưa đăng nhập.' });
    const page = await findOwnedPage(user, pageId);
    if (!page) return res.status(404).json({ success: false, error: 'Không tìm thấy Page.' });
    const result = await runBackgroundMessengerAutomationForPage(page.id, { dryRun: Boolean(req.body?.dryRun) });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Không chạy được automation nền.' });
  }
});

backgroundAutomationRouter.post('/cron', async (req: Request, res: Response) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ success: false, error: 'Cron secret không hợp lệ.' });
  try {
    const results = await runAllBackgroundMessengerAutomations({ dryRun: Boolean(req.body?.dryRun), limit: Number(req.body?.limit) || 20 });
    const storyResults = req.body?.dryRun ? [] : await runScheduledStoryAutomation(Number(req.body?.limit) || 20);
    return res.json({
      success: true,
      pages: results.length,
      sent: results.reduce((sum, item) => sum + (item.result.sent || 0), 0),
      detected: results.reduce((sum, item) => sum + (item.result.detected || 0), 0),
      reminders: results.reduce((sum, item) => sum + (item.result.reminders || 0), 0),
      failed: results.filter(item => !item.result.success).length,
      results,
      stories: {
        processed: storyResults.length,
        published: storyResults.filter(item => item.success).length,
        failed: storyResults.filter(item => !item.success).length,
        results: storyResults,
      },
      ranAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Cron automation thất bại.' });
  }
});

// Best-effort helper for local preview / always-on servers. Cloud Run may sleep, so Cloud Scheduler is still required for true 24/7.
let loopStarted = false;
export function startBackgroundAutomationLoop() {
  if (loopStarted || String(process.env.AUTOMATION_INTERNAL_LOOP || '').toLowerCase() !== 'true') return;
  loopStarted = true;
  const intervalMs = Math.max(60_000, Number(process.env.AUTOMATION_INTERNAL_LOOP_MS) || 120_000);
  const tick = async () => {
    try { await Promise.all([runAllBackgroundMessengerAutomations({ limit: 20 }), runScheduledStoryAutomation(20)]); } catch (err) { console.error('[Background Automation Loop]', err); }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, intervalMs).unref?.();
}
