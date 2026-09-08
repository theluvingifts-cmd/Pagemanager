import crypto from 'crypto';
import express, { Router, Request, Response } from 'express';
import { getAdminDb } from '../services/firebaseAdmin';
import { runBackgroundMessengerAutomationForPage } from '../services/automation/messengerAutomationWorker';

export const metaWebhookRouter = Router();

function verifySignature(rawBody: Buffer, signatureHeader: string) {
  const secret = String(process.env.META_APP_SECRET || '').trim();
  if (!secret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  if (!signatureHeader || signatureHeader.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

metaWebhookRouter.get('/', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  const expected = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (mode === 'subscribe' && expected && token === expected) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

metaWebhookRouter.post('/', express.raw({ type: 'application/json', limit: '2mb' }), async (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const requireSignature = String(process.env.META_WEBHOOK_REQUIRE_SIGNATURE || 'true').toLowerCase() !== 'false';
  if (requireSignature && !verifySignature(raw, String(req.headers['x-hub-signature-256'] || ''))) {
    return res.sendStatus(401);
  }

  let payload: any;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }

  // Ack Meta immediately; processing continues asynchronously.
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const db = getAdminDb();
      const entries = Array.isArray(payload?.entry) ? payload.entry : [];
      for (const entry of entries) {
        const pageId = String(entry?.id || '').trim();
        if (!pageId) continue;
        const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
        const inboundCount = messaging.filter((event: any) => event?.message && !event?.message?.is_echo).length;
        const eventTypes = Array.from(new Set(messaging.map((event: any) => event?.message ? (event.message.is_echo ? 'message_echo' : 'message') : event?.read ? 'read' : event?.delivery ? 'delivery' : event?.postback ? 'postback' : 'other')));
        const pages = await db.collection('facebookPages').where('pageId', '==', pageId).limit(10).get();
        for (const doc of pages.docs) {
          const data = doc.data() || {};
          const now = new Date().toISOString();
          await doc.ref.update({
            'backgroundAutomation.lastWebhookAt': now,
            'backgroundAutomation.lastWebhookEvent': {
              object: String(payload?.object || 'page'),
              eventTypes,
              eventCount: messaging.length,
              inboundCount,
            },
          }).catch(() => undefined);
          if (data?.backgroundAutomation?.enabled && inboundCount > 0) {
            // Webhook wakes the worker immediately for CRM/status detection; timed rules are still guaranteed by scheduler ticks.
            runBackgroundMessengerAutomationForPage(doc.id).catch(err => console.error('[Meta Webhook Worker]', err));
          }
        }
      }
    } catch (err) {
      console.error('[Meta Webhook]', err);
    }
  });
});
