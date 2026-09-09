import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { getDocument, queryDocuments, setDocument } from '../services/firebaseRest.js';
import { decryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest, resolveMetaConfig } from '../services/meta/metaConfigService.js';
import {
  DEFAULT_MESSENGER_CRM,
  MessengerCRMContactData,
  mergeMessengerCRM,
  normalizeMessengerCRM,
} from '../services/crm/messengerCrmService.js';
import {
  getMessengerConversation,
  listMessengerConversations,
  markMessengerSeen,
  MessengerGraphError,
  sendMessengerAttachmentBuffer,
  sendMessengerText,
} from '../services/meta/messengerService.js';

export const messengerRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const REQUIRED_PERMISSIONS = ['pages_messaging', 'pages_manage_metadata', 'pages_read_engagement'];
const automationLocks = new Set<string>();

export interface MessengerAutomationState {
  lastNoStaffAutoReplyMessageId?: string | null;
  lastNoCustomerFollowupMessageId?: string | null;
  reengageDueForMessageId?: string | null;
  reengageDueAt?: string | null;
  reengageDismissedForMessageId?: string | null;
  autoDetectedStatus?: 'new' | 'interested' | 'quoted' | 'waiting' | 'ordered' | 'delivered' | 'closed' | null;
  autoDetectedAt?: string | null;
  autoDetectionReason?: string | null;
  lastAutomationActionAt?: string | null;
}

export type MessengerReplyFormulaMode = 'inherit' | 'hot_lead' | 'quoted' | 'nurture' | 'manual' | 'custom';

export interface MessengerReplyFormula {
  mode: MessengerReplyFormulaMode;
  testOnly?: boolean;
  noStaffDelayHours?: number;
  noCustomerDelayHours?: number;
  reengageAfterDays?: number;
  noStaffTemplate?: string;
  noCustomerTemplate?: string;
  reengageTemplate?: string;
}

export interface MessengerCustomerMeta {
  tags: string[];
  note: string;
  starred: boolean;
  status: 'new' | 'interested' | 'quoted' | 'waiting' | 'ordered' | 'delivered' | 'closed';
  statusLocked?: boolean;
  automation?: MessengerAutomationState;
  replyFormula?: MessengerReplyFormula;
  crm?: MessengerCRMContactData;
  updatedAt?: string | null;
}

export interface MessengerQuickTemplate {
  id: string;
  title: string;
  text: string;
  category?: 'general' | 'price' | 'followup' | 'order' | 'support';
}

export interface MessengerAutomationConfig {
  enabled: boolean;
  testMode: boolean;
  timezone: string;
  workingHours: {
    enabled: boolean;
    start: string;
    end: string;
    days: number[];
  };
  noStaffReply: {
    enabled: boolean;
    delayHours: number;
    template: string;
  };
  noCustomerReply: {
    enabled: boolean;
    delayHours: number;
    template: string;
  };
  reengage: {
    enabled: boolean;
    afterDays: number;
    mode: 'reminder_only';
    template: string;
  };
  autoDetect: {
    enabled: boolean;
    autoApplyInterested: boolean;
    autoApplyQuoted: boolean;
    autoApplyOrdered: boolean;
  };
}

const DEFAULT_META: MessengerCustomerMeta = {
  tags: [],
  note: '',
  starred: false,
  status: 'new',
  statusLocked: false,
  automation: {},
  replyFormula: { mode: 'inherit', testOnly: false },
  crm: DEFAULT_MESSENGER_CRM,
  updatedAt: null,
};

const DEFAULT_TEMPLATES: MessengerQuickTemplate[] = [
  { id: 'price', title: 'Báo giá', category: 'price', text: 'Dạ {{name}}, shop gửi bạn thông tin và báo giá ngay đây ạ. Bạn đang quan tâm mẫu nào để shop tư vấn chính xác nhất?' },
  { id: 'need-info', title: 'Xin thông tin', category: 'support', text: '{{name}} gửi shop giúp mình mẫu bạn chọn + thông tin cần cá nhân hoá nhé, shop kiểm tra và lên phương án cho bạn ngay ạ.' },
  { id: 'slow-reply', title: 'Xin lỗi phản hồi chậm', category: 'support', text: 'Shop xin lỗi vì để {{name}} chờ hơi lâu ạ. Bên mình đã nhận được tin nhắn và đang kiểm tra để phản hồi bạn ngay đây.' },
  { id: 'followup', title: 'Follow-up nhẹ', category: 'followup', text: '{{name}} ơi, mình nhắn lại để bạn khỏi bị trôi tin ạ. Nếu bạn còn cần mẫu này thì shop hỗ trợ tiếp ngay nhé.' },
  { id: 'order-info', title: 'Xin thông tin chốt đơn', category: 'order', text: 'Nếu mình chốt mẫu này, {{name}} gửi shop giúp tên người nhận + SĐT + địa chỉ nhận hàng nhé. Shop kiểm tra đơn cho bạn ngay ạ.' },
  { id: 'thank-you', title: 'Cảm ơn đã chốt', category: 'order', text: 'Cảm ơn {{name}} đã tin tưởng {{page}} ạ. Shop đã ghi nhận thông tin và sẽ cập nhật tiến độ cho bạn trong tin nhắn này nhé.' },
];

const DEFAULT_AUTOMATION: MessengerAutomationConfig = {
  enabled: false,
  testMode: false,
  timezone: 'Asia/Ho_Chi_Minh',
  workingHours: { enabled: true, start: '08:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
  noStaffReply: {
    enabled: false,
    delayHours: 3,
    template: 'Shop xin lỗi vì để {{name}} chờ hơi lâu ạ. Bên mình đã nhận được tin nhắn và đang kiểm tra để phản hồi bạn ngay đây.',
  },
  noCustomerReply: {
    enabled: false,
    delayHours: 4,
    template: '{{name}} ơi, mình nhắn lại để bạn khỏi bị trôi tin ạ. Nếu bạn còn cần mẫu này thì shop hỗ trợ tiếp ngay nhé.',
  },
  reengage: {
    enabled: true,
    afterDays: 2,
    mode: 'reminder_only',
    template: '{{name}} ơi, shop nhắn lại hỏi thăm mẫu mình xem hôm trước ạ. Nếu bạn còn cần thì mình hỗ trợ tiếp nhé.',
  },
  autoDetect: {
    enabled: true,
    autoApplyInterested: true,
    autoApplyQuoted: true,
    autoApplyOrdered: true,
  },
};

async function getOwnedPages(user: any) {
  return queryDocuments<any>(user.idToken, 'facebookPages', [{ field: 'userId', value: user.id }], 50);
}

async function findOwnedPage(user: any, pageIdOrDocId: string) {
  const pages = await getOwnedPages(user);
  return pages.find(page => page.id === pageIdOrDocId || page.data.id === pageIdOrDocId || page.data.pageId === pageIdOrDocId) || null;
}

async function resolvePageRuntime(req: Request, pageIdOrDocId: string) {
  const user = await authenticateRequest(req);
  if (!user) throw Object.assign(new Error('Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.'), { status: 401 });

  const page = await findOwnedPage(user, pageIdOrDocId);
  if (!page) throw Object.assign(new Error('Không tìm thấy Facebook Page đã kết nối.'), { status: 404 });

  const vaultKey = getVaultKeyFromRequest(req, true);
  let pageToken = '';
  try {
    pageToken = decryptToken(String(page.data.encryptedPageAccessToken || ''), vaultKey);
  } catch {
    throw Object.assign(new Error('Không giải mã được Page Access Token trên trình duyệt này. Hãy kết nối lại Facebook.'), { status: 400 });
  }

  const metaConfig = await resolveMetaConfig(user, '', false);
  const graphApiVersion = String(page.data.graphApiVersion || metaConfig.graphApiVersion || 'v23.0');

  return {
    user,
    page,
    pageId: String(page.data.pageId || pageIdOrDocId),
    pageName: String(page.data.pageName || 'Facebook Page'),
    pageToken,
    graphApiVersion,
  };
}

function sendError(res: Response, err: any, fallback: string) {
  console.error('[Messenger API]', err);
  if (err instanceof MessengerGraphError) {
    return res.status(err.status === 401 ? 401 : 400).json({
      success: false,
      error: err.message || fallback,
      code: err.code || null,
      subcode: err.subcode || null,
      requiredPermissions: REQUIRED_PERMISSIONS,
      reconnectRequired: true,
    });
  }
  return res.status(Number(err?.status) || 500).json({ success: false, error: err?.message || fallback, requiredPermissions: REQUIRED_PERMISSIONS });
}

function contactKey(pageId: string, customerId: string) {
  return `${pageId}_${customerId}`;
}

async function getMessengerContactsMap(user: any): Promise<Record<string, MessengerCustomerMeta>> {
  const userDoc = await getDocument<any>(user.idToken, 'users', user.id);
  return userDoc?.data?.messengerContacts && typeof userDoc.data.messengerContacts === 'object'
    ? userDoc.data.messengerContacts
    : {};
}

function normalizeReplyFormula(raw: any): MessengerReplyFormula {
  const modes = new Set<MessengerReplyFormulaMode>(['inherit', 'hot_lead', 'quoted', 'nurture', 'manual', 'custom']);
  const mode = modes.has(String(raw?.mode) as MessengerReplyFormulaMode) ? String(raw.mode) as MessengerReplyFormulaMode : 'inherit';
  return {
    mode,
    testOnly: Boolean(raw?.testOnly),
    noStaffDelayHours: clampNumber(raw?.noStaffDelayHours, 1, 12, 3),
    noCustomerDelayHours: clampNumber(raw?.noCustomerDelayHours, 1, 12, 4),
    reengageAfterDays: clampNumber(raw?.reengageAfterDays, 2, 14, 2),
    noStaffTemplate: raw?.noStaffTemplate ? String(raw.noStaffTemplate).slice(0, 1800) : '',
    noCustomerTemplate: raw?.noCustomerTemplate ? String(raw.noCustomerTemplate).slice(0, 1800) : '',
    reengageTemplate: raw?.reengageTemplate ? String(raw.reengageTemplate).slice(0, 1800) : '',
  };
}

function normalizeMeta(raw: any): MessengerCustomerMeta {
  const allowed = new Set(['new', 'interested', 'quoted', 'waiting', 'ordered', 'delivered', 'closed']);
  const automationRaw = raw?.automation && typeof raw.automation === 'object' ? raw.automation : {};
  return {
    tags: Array.isArray(raw?.tags) ? raw.tags.map((v: any) => String(v).trim()).filter(Boolean).slice(0, 12) : [],
    note: String(raw?.note || '').slice(0, 4000),
    starred: Boolean(raw?.starred),
    status: allowed.has(String(raw?.status)) ? raw.status : 'new',
    statusLocked: Boolean(raw?.statusLocked),
    automation: {
      lastNoStaffAutoReplyMessageId: automationRaw.lastNoStaffAutoReplyMessageId ? String(automationRaw.lastNoStaffAutoReplyMessageId) : null,
      lastNoCustomerFollowupMessageId: automationRaw.lastNoCustomerFollowupMessageId ? String(automationRaw.lastNoCustomerFollowupMessageId) : null,
      reengageDueForMessageId: automationRaw.reengageDueForMessageId ? String(automationRaw.reengageDueForMessageId) : null,
      reengageDueAt: automationRaw.reengageDueAt ? String(automationRaw.reengageDueAt) : null,
      reengageDismissedForMessageId: automationRaw.reengageDismissedForMessageId ? String(automationRaw.reengageDismissedForMessageId) : null,
      autoDetectedStatus: allowed.has(String(automationRaw.autoDetectedStatus)) ? automationRaw.autoDetectedStatus : null,
      autoDetectedAt: automationRaw.autoDetectedAt ? String(automationRaw.autoDetectedAt) : null,
      autoDetectionReason: automationRaw.autoDetectionReason ? String(automationRaw.autoDetectionReason).slice(0, 500) : null,
      lastAutomationActionAt: automationRaw.lastAutomationActionAt ? String(automationRaw.lastAutomationActionAt) : null,
    },
    replyFormula: normalizeReplyFormula(raw?.replyFormula),
    crm: normalizeMessengerCRM(raw?.crm),
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null,
  };
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeClock(value: any, fallback: string) {
  const text = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function normalizeAutomationConfig(raw: any): MessengerAutomationConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  const days = Array.isArray(src?.workingHours?.days)
    ? src.workingHours.days.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v) && v >= 0 && v <= 6)
    : DEFAULT_AUTOMATION.workingHours.days;
  return {
    enabled: Boolean(src.enabled),
    testMode: Boolean(src.testMode),
    timezone: String(src.timezone || DEFAULT_AUTOMATION.timezone).slice(0, 80),
    workingHours: {
      enabled: src?.workingHours?.enabled !== false,
      start: normalizeClock(src?.workingHours?.start, DEFAULT_AUTOMATION.workingHours.start),
      end: normalizeClock(src?.workingHours?.end, DEFAULT_AUTOMATION.workingHours.end),
      days: days.length ? Array.from(new Set(days)) : DEFAULT_AUTOMATION.workingHours.days,
    },
    noStaffReply: {
      enabled: Boolean(src?.noStaffReply?.enabled),
      delayHours: clampNumber(src?.noStaffReply?.delayHours, 1, 12, 3),
      template: String(src?.noStaffReply?.template || DEFAULT_AUTOMATION.noStaffReply.template).slice(0, 1800),
    },
    noCustomerReply: {
      enabled: Boolean(src?.noCustomerReply?.enabled),
      delayHours: clampNumber(src?.noCustomerReply?.delayHours, 1, 12, 4),
      template: String(src?.noCustomerReply?.template || DEFAULT_AUTOMATION.noCustomerReply.template).slice(0, 1800),
    },
    reengage: {
      enabled: src?.reengage?.enabled !== false,
      afterDays: clampNumber(src?.reengage?.afterDays, 2, 14, 2),
      mode: 'reminder_only',
      template: String(src?.reengage?.template || DEFAULT_AUTOMATION.reengage.template).slice(0, 1800),
    },
    autoDetect: {
      enabled: src?.autoDetect?.enabled !== false,
      autoApplyInterested: src?.autoDetect?.autoApplyInterested !== false,
      autoApplyQuoted: src?.autoDetect?.autoApplyQuoted !== false,
      autoApplyOrdered: src?.autoDetect?.autoApplyOrdered !== false,
    },
  };
}

function normalizeTemplates(raw: any): MessengerQuickTemplate[] {
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_TEMPLATES;
  return source.slice(0, 30).map((item: any, index: number) => ({
    id: String(item?.id || `template-${index}-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `template-${index}`,
    title: String(item?.title || `Tin mẫu ${index + 1}`).trim().slice(0, 80),
    text: String(item?.text || '').trim().slice(0, 1800),
    category: ['general', 'price', 'followup', 'order', 'support'].includes(String(item?.category)) ? item.category : 'general',
  })).filter((item: MessengerQuickTemplate) => item.text);
}

async function getMessengerAutomationData(user: any) {
  const userDoc = await getDocument<any>(user.idToken, 'users', user.id);
  const data = userDoc?.data || {};
  return {
    config: normalizeAutomationConfig(data.messengerAutomation || DEFAULT_AUTOMATION),
    templates: normalizeTemplates(data.messengerTemplates || DEFAULT_TEMPLATES),
  };
}

function renderTemplate(text: string, context: { name?: string; page?: string }) {
  return String(text || '')
    .replace(/{{\s*name\s*}}/gi, context.name || 'bạn')
    .replace(/{{\s*page\s*}}/gi, context.page || 'shop')
    .trim();
}

type EffectiveConversationRules = {
  testOnly: boolean;
  formulaMode: MessengerReplyFormulaMode;
  noStaffReply: MessengerAutomationConfig['noStaffReply'];
  noCustomerReply: MessengerAutomationConfig['noCustomerReply'];
  reengage: MessengerAutomationConfig['reengage'];
};

function resolveConversationRules(config: MessengerAutomationConfig, meta: MessengerCustomerMeta): EffectiveConversationRules {
  const formula = normalizeReplyFormula(meta.replyFormula);
  const base: EffectiveConversationRules = {
    testOnly: Boolean(formula.testOnly),
    formulaMode: formula.mode,
    noStaffReply: { ...config.noStaffReply },
    noCustomerReply: { ...config.noCustomerReply },
    reengage: { ...config.reengage },
  };
  if (formula.mode === 'inherit') return base;
  if (formula.mode === 'manual') return { ...base, noStaffReply: { ...base.noStaffReply, enabled: false }, noCustomerReply: { ...base.noCustomerReply, enabled: false }, reengage: { ...base.reengage, enabled: false } };
  if (formula.mode === 'hot_lead') return { ...base, noStaffReply: { ...base.noStaffReply, enabled: true, delayHours: 1 }, noCustomerReply: { ...base.noCustomerReply, enabled: true, delayHours: 2 }, reengage: { ...base.reengage, enabled: true, afterDays: 2 } };
  if (formula.mode === 'quoted') return { ...base, noStaffReply: { ...base.noStaffReply, enabled: true, delayHours: 2 }, noCustomerReply: { ...base.noCustomerReply, enabled: true, delayHours: 4 }, reengage: { ...base.reengage, enabled: true, afterDays: 2 } };
  if (formula.mode === 'nurture') return { ...base, noStaffReply: { ...base.noStaffReply, enabled: true, delayHours: 4 }, noCustomerReply: { ...base.noCustomerReply, enabled: true, delayHours: 8 }, reengage: { ...base.reengage, enabled: true, afterDays: 4 } };
  return {
    ...base,
    noStaffReply: { ...base.noStaffReply, enabled: true, delayHours: formula.noStaffDelayHours || 3, template: formula.noStaffTemplate || base.noStaffReply.template },
    noCustomerReply: { ...base.noCustomerReply, enabled: true, delayHours: formula.noCustomerDelayHours || 4, template: formula.noCustomerTemplate || base.noCustomerReply.template },
    reengage: { ...base.reengage, enabled: true, afterDays: formula.reengageAfterDays || 2, template: formula.reengageTemplate || base.reengage.template },
  };
}

function stripDiacritics(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function detectCustomerStage(detail: any): { status: MessengerCustomerMeta['status'] | null; score: number; reason: string } {
  const messages = Array.isArray(detail?.messages) ? detail.messages.slice(-20) : [];
  const customerTexts = messages.filter((m: any) => !m.isFromPage).map((m: any) => stripDiacritics(m.text || '')).filter(Boolean);
  const pageTexts = messages.filter((m: any) => m.isFromPage).map((m: any) => stripDiacritics(m.text || '')).filter(Boolean);
  const customerBlob = customerTexts.join(' | ');
  const pageBlob = pageTexts.join(' | ');

  let orderScore = 0;
  const orderSignals: string[] = [];
  const orderWords = ['chot', 'minh lay', 'em lay', 'lay mau', 'dat don', 'dat hang', 'ship cho', 'giao den', 'giao toi', 'cod', 'chuyen khoan', 'ck nhe', 'ok lay'];
  for (const word of orderWords) {
    if (customerBlob.includes(word)) { orderScore += 2; orderSignals.push(word); }
  }
  if (/(?:\+?84|0)[0-9]{8,10}/.test(customerBlob)) { orderScore += 2; orderSignals.push('so dien thoai'); }
  if (/dia chi|phuong|quan |thanh pho|duong |hem |ngo /.test(customerBlob)) { orderScore += 2; orderSignals.push('dia chi'); }
  if (orderScore >= 4) return { status: 'ordered', score: orderScore, reason: `Có tín hiệu chốt: ${orderSignals.slice(0, 4).join(', ')}` };

  const interestedWords = ['bao nhieu', 'gia', 'mau nao', 'con hang', 'ship', 'lam duoc', 'thoi gian', 'bao lau', 'tu van', 'size', 'kich thuoc'];
  let interestedScore = 0;
  const interestedSignals: string[] = [];
  for (const word of interestedWords) {
    if (customerBlob.includes(word)) { interestedScore += 1; interestedSignals.push(word); }
  }

  const quoted = /(?:\b\d{2,4}\s?k\b)|bao gia|gia la|tong (?:la|het)|phi ship/.test(pageBlob);
  if (quoted && interestedScore >= 1) return { status: 'quoted', score: 3, reason: 'Shop đã báo giá và khách đang trao đổi về sản phẩm.' };
  if (interestedScore >= 2) return { status: 'interested', score: interestedScore, reason: `Khách có tín hiệu quan tâm: ${interestedSignals.slice(0, 4).join(', ')}` };
  return { status: null, score: 0, reason: '' };
}

function getZonedParts(date: Date, timeZone: string) {
  // Asia/Ho_Chi_Minh is fixed UTC+7 (no DST). Handle it explicitly so
  // Cloud Run / preview Intl timezone data cannot make business-hour checks drift.
  if (timeZone === 'Asia/Ho_Chi_Minh' || timeZone === 'Asia/Saigon') {
    const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const hour = shifted.getUTCHours();
    const minute = shifted.getUTCMinutes();
    return {
      weekday: shifted.getUTCDay(),
      minutes: hour * 60 + minute,
      localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      timeZone: 'Asia/Ho_Chi_Minh',
    };
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hour = Number(parts.hour || 0);
    const minute = Number(parts.minute || 0);
    return {
      weekday: weekdayMap[parts.weekday] ?? date.getDay(),
      minutes: hour * 60 + minute,
      localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      timeZone,
    };
  } catch {
    return getZonedParts(date, 'Asia/Ho_Chi_Minh');
  }
}

function getWorkingHoursSnapshot(config: MessengerAutomationConfig, now = new Date()) {
  const zone = (config.timezone || 'Asia/Ho_Chi_Minh').trim() || 'Asia/Ho_Chi_Minh';
  const parts = getZonedParts(now, zone);
  const start = clockToMinutes(config.workingHours.start);
  const end = clockToMinutes(config.workingHours.end);
  const dayEnabled = config.workingHours.days.includes(parts.weekday);
  let workingNow = true;

  if (config.workingHours.enabled) {
    if (!dayEnabled) workingNow = false;
    else if (start === end) workingNow = true;
    else if (start < end) workingNow = parts.minutes >= start && parts.minutes < end;
    else workingNow = parts.minutes >= start || parts.minutes < end;
  }

  return {
    workingNow,
    currentLocalTime: parts.localTime,
    currentWeekday: parts.weekday,
    dayEnabled,
    timezone: parts.timeZone || zone,
    workingWindow: `${config.workingHours.start}–${config.workingHours.end}`,
    serverNowUtc: now.toISOString(),
  };
}

function clockToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isWithinWorkingHours(config: MessengerAutomationConfig, now = new Date()) {
  return getWorkingHoursSnapshot(config, now).workingNow;
}

function ageMs(value?: string | null) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SAFE_RESPONSE_WINDOW = 23.5 * HOUR;

messengerRouter.get('/status', async (req: Request, res: Response) => {
  const pageId = String(req.query.pageId || req.query.page_id || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.', requiredPermissions: REQUIRED_PERMISSIONS });
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const conversations = await listMessengerConversations(runtime.pageId, runtime.pageToken, 1, runtime.graphApiVersion);
    return res.json({
      success: true,
      connected: true,
      pageId: runtime.pageId,
      pageName: runtime.pageName,
      graphApiVersion: runtime.graphApiVersion,
      requiredPermissions: REQUIRED_PERMISSIONS,
      sampleConversationCount: conversations.length,
      mode: 'polling',
      realtimeWebhook: false,
      message: 'Messenger API đã kết nối. Có thể đọc hội thoại, file đính kèm và trả lời từ Page Manager.',
    });
  } catch (err: any) {
    return sendError(res, err, 'Không thể kiểm tra Messenger API.');
  }
});

messengerRouter.get('/conversations', async (req: Request, res: Response) => {
  const pageId = String(req.query.pageId || req.query.page_id || '').trim();
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 50));
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });

  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const [conversations, contactsMap] = await Promise.all([
      listMessengerConversations(runtime.pageId, runtime.pageToken, limit, runtime.graphApiVersion),
      getMessengerContactsMap(runtime.user),
    ]);

    const enriched = conversations.map(item => ({
      ...item,
      customerMeta: item.customer?.id
        ? normalizeMeta(contactsMap[contactKey(runtime.pageId, item.customer.id)] || DEFAULT_META)
        : DEFAULT_META,
    }));

    return res.json({
      success: true,
      pageId: runtime.pageId,
      pageName: runtime.pageName,
      conversations: enriched,
      count: enriched.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return sendError(res, err, 'Không thể tải hội thoại Messenger.');
  }
});

messengerRouter.get('/conversations/:conversationId', async (req: Request, res: Response) => {
  const pageId = String(req.query.pageId || req.query.page_id || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });

  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const conversation = await getMessengerConversation(req.params.conversationId, runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
    const contactsMap = await getMessengerContactsMap(runtime.user);
    const customerMeta = conversation.customer?.id
      ? normalizeMeta(contactsMap[contactKey(runtime.pageId, conversation.customer.id)] || DEFAULT_META)
      : DEFAULT_META;
    return res.json({ success: true, conversation: { ...conversation, customerMeta }, fetchedAt: new Date().toISOString() });
  } catch (err: any) {
    return sendError(res, err, 'Không thể tải nội dung hội thoại.');
  }
});

messengerRouter.put('/customer-meta', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  const customerId = String(req.body?.customerId || '').trim();
  if (!pageId || !customerId) return res.status(400).json({ success: false, error: 'Thiếu pageId hoặc customerId.' });

  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const contactsMap = await getMessengerContactsMap(runtime.user);
    const key = contactKey(runtime.pageId, customerId);
    const current = normalizeMeta(contactsMap[key] || DEFAULT_META);
    const incomingMeta = req.body?.meta || {};
    const now = new Date().toISOString();
    const incomingCrm = incomingMeta?.crm && typeof incomingMeta.crm === 'object' ? incomingMeta.crm : {};
    const mergedCrm = mergeMessengerCRM(current.crm, incomingCrm, {
      now,
      oldStatus: current.status,
      newStatus: Object.prototype.hasOwnProperty.call(incomingMeta, 'status') ? String(incomingMeta.status) : undefined,
      noteChanged: Object.prototype.hasOwnProperty.call(incomingMeta, 'note') && String(incomingMeta.note || '') !== current.note,
    });

    const next = normalizeMeta({
      ...current,
      ...incomingMeta,
      crm: mergedCrm,
      replyFormula: incomingMeta?.replyFormula ? { ...(current.replyFormula || {}), ...incomingMeta.replyFormula } : current.replyFormula,
      automation: incomingMeta?.automation ? { ...(current.automation || {}), ...incomingMeta.automation } : current.automation,
      statusLocked: Object.prototype.hasOwnProperty.call(incomingMeta, 'status') ? true : current.statusLocked,
      updatedAt: now,
    });

    const nextMap = { ...contactsMap, [key]: next };
    await setDocument(runtime.user.idToken, 'users', runtime.user.id, {
      messengerContacts: nextMap,
      updatedAt: new Date().toISOString(),
    }, true);

    return res.json({ success: true, meta: next });
  } catch (err: any) {
    return sendError(res, err, 'Không thể lưu thông tin khách Messenger.');
  }
});

messengerRouter.post('/send', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || req.body?.page_id || '').trim();
  const recipientId = String(req.body?.recipientId || req.body?.recipient_id || '').trim();
  const text = String(req.body?.text || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  if (!recipientId) return res.status(400).json({ success: false, error: 'Không xác định được người nhận Messenger.' });
  if (!text) return res.status(400).json({ success: false, error: 'Hãy nhập nội dung tin nhắn.' });

  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const result = await sendMessengerText(runtime.pageId, recipientId, text, runtime.pageToken, runtime.graphApiVersion);
    return res.json({ success: true, ...result, message: 'Đã gửi tin nhắn qua Messenger.', sentAt: new Date().toISOString() });
  } catch (err: any) {
    return sendError(res, err, 'Không thể gửi tin nhắn Messenger.');
  }
});

messengerRouter.post('/send-attachment', upload.single('file'), async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  const recipientId = String(req.body?.recipientId || '').trim();
  if (!pageId || !recipientId) return res.status(400).json({ success: false, error: 'Thiếu pageId hoặc recipientId.' });
  if (!req.file?.buffer) return res.status(400).json({ success: false, error: 'Chưa chọn tệp để gửi.' });

  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const mime = String(req.file.mimetype || 'application/octet-stream');
    const attachmentType: 'image' | 'video' | 'audio' | 'file' = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
          ? 'audio'
          : 'file';
    const safeName = String(req.file.originalname || 'attachment').replace(/[\r\n]/g, '').slice(-180) || 'attachment';
    const result = await sendMessengerAttachmentBuffer(
      runtime.pageId,
      recipientId,
      attachmentType,
      req.file.buffer,
      mime,
      safeName,
      runtime.pageToken,
      runtime.graphApiVersion
    );
    return res.json({
      success: true,
      ...result,
      attachmentType,
      storage: 'none',
      delivery: 'direct-to-meta',
      sentAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return sendError(res, err, 'Không thể gửi tệp qua Messenger.');
  }
});



messengerRouter.get('/automation-config', async (req: Request, res: Response) => {
  const pageId = String(req.query.pageId || req.query.page_id || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const data = await getMessengerAutomationData(runtime.user);
    return res.json({
      success: true,
      config: data.config,
      templates: data.templates,
      policy: {
        standardWindowHours: 24,
        reengageMode: 'reminder_only',
        note: 'Tin follow-up sau nhiều ngày chỉ được tạo nhắc thủ công nếu khách chưa đồng ý nhận tin ngoài cửa sổ 24 giờ.',
      },
    });
  } catch (err: any) {
    return sendError(res, err, 'Không thể tải cấu hình tự động hóa Messenger.');
  }
});

messengerRouter.put('/automation-config', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const config = normalizeAutomationConfig(req.body?.config || {});
    const templates = normalizeTemplates(req.body?.templates || DEFAULT_TEMPLATES);
    await setDocument(runtime.user.idToken, 'users', runtime.user.id, {
      messengerAutomation: config,
      messengerTemplates: templates,
      updatedAt: new Date().toISOString(),
    }, true);
    return res.json({ success: true, config, templates, message: 'Đã lưu tự động hóa Messenger.' });
  } catch (err: any) {
    return sendError(res, err, 'Không thể lưu cấu hình tự động hóa Messenger.');
  }
});

messengerRouter.post('/automation/dismiss-reengage', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  const customerId = String(req.body?.customerId || '').trim();
  if (!pageId || !customerId) return res.status(400).json({ success: false, error: 'Thiếu pageId hoặc customerId.' });
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const contactsMap = await getMessengerContactsMap(runtime.user);
    const key = contactKey(runtime.pageId, customerId);
    const current = normalizeMeta(contactsMap[key] || DEFAULT_META);
    const targetMessageId = current.automation?.reengageDueForMessageId || null;
    const next = normalizeMeta({
      ...current,
      automation: {
        ...(current.automation || {}),
        reengageDismissedForMessageId: targetMessageId,
        reengageDueAt: null,
        lastAutomationActionAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });
    await setDocument(runtime.user.idToken, 'users', runtime.user.id, {
      messengerContacts: { ...contactsMap, [key]: next },
      updatedAt: new Date().toISOString(),
    }, true);
    return res.json({ success: true, meta: next });
  } catch (err: any) {
    return sendError(res, err, 'Không thể bỏ nhắc follow-up.');
  }
});

messengerRouter.post('/automation/preview', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  const conversationId = String(req.body?.conversationId || '').trim();
  if (!pageId || !conversationId) return res.status(400).json({ success: false, error: 'Thiếu pageId hoặc conversationId.' });
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    const { config } = await getMessengerAutomationData(runtime.user);
    const contactsMap = await getMessengerContactsMap(runtime.user);
    const detail = await getMessengerConversation(conversationId, runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
    if (!detail.customer?.id || !detail.messages?.length) return res.status(404).json({ success: false, error: 'Hội thoại chưa có đủ dữ liệu để test.' });

    const meta = normalizeMeta(contactsMap[contactKey(runtime.pageId, detail.customer.id)] || DEFAULT_META);
    const rules = resolveConversationRules(config, meta);
    const messages = detail.messages;
    const last = messages[messages.length - 1];
    const lastInbound = [...messages].reverse().find((message: any) => !message.isFromPage && message.createdTime) || null;
    const customerName = detail.customer.name || 'Khách';
    const workingClock = getWorkingHoursSnapshot(config);
    const workingNow = workingClock.workingNow;
    const globalDryRun = config.testMode || Boolean(req.body?.dryRun);
    const inside24h = Boolean(lastInbound?.createdTime && ageMs(lastInbound.createdTime) < SAFE_RESPONSE_WINDOW);
    const isClosed = meta.status === 'closed';
    const isOrdered = meta.status === 'ordered' || meta.status === 'delivered';
    const detectedStage = config.autoDetect.enabled && !meta.statusLocked ? detectCustomerStage(detail) : { status: null, score: 0, reason: '' };
    const automation = meta.automation || {};

    const noStaffOverdue = Boolean(last && !last.isFromPage && last.createdTime && ageMs(last.createdTime) >= rules.noStaffReply.delayHours * HOUR);
    const noStaffFresh = Boolean(last?.createdTime && ageMs(last.createdTime) < SAFE_RESPONSE_WINDOW);
    const noStaffUnsent = Boolean(last?.id && automation.lastNoStaffAutoReplyMessageId !== last.id);
    const noStaffAct = !isClosed && workingNow && rules.noStaffReply.enabled && noStaffOverdue && noStaffFresh && noStaffUnsent;

    const noCustomerOverdue = Boolean(last && last.isFromPage && last.createdTime && ageMs(last.createdTime) >= rules.noCustomerReply.delayHours * HOUR);
    const noCustomerUnsent = Boolean(lastInbound?.id && automation.lastNoCustomerFollowupMessageId !== lastInbound.id);
    const noCustomerAct = !isClosed && !isOrdered && workingNow && rules.noCustomerReply.enabled && noCustomerOverdue && inside24h && noCustomerUnsent;

    const currentMessageId = last?.id || '';
    const reengageDue = Boolean(last?.createdTime && ageMs(last.createdTime) >= rules.reengage.afterDays * DAY);
    const reengageAct = !isClosed && !isOrdered && rules.reengage.enabled && reengageDue && automation.reengageDismissedForMessageId !== currentMessageId && !(automation.reengageDueForMessageId === currentMessageId && automation.reengageDueAt);

    const rank: Record<string, number> = { new: 0, interested: 1, quoted: 2, waiting: 2, ordered: 3, delivered: 4, closed: 5 };
    const canDetect = Boolean(detectedStage.status && rank[String(detectedStage.status)] > rank[meta.status]);

    return res.json({
      success: true,
      customer: { id: detail.customer.id, name: customerName },
      formula: { mode: rules.formulaMode, testOnly: rules.testOnly },
      timing: workingClock,
      summary: [
        { label: 'Giờ hoạt động', value: workingNow ? 'Đang trong giờ' : 'Ngoài giờ', ok: workingNow },
        { label: 'Cửa sổ 24h', value: inside24h ? 'Còn hiệu lực' : 'Đã hết', ok: inside24h },
        { label: 'Tin gần nhất', value: last?.isFromPage ? 'Shop gửi' : 'Khách gửi', ok: true },
        { label: 'Công thức', value: rules.formulaMode, ok: rules.formulaMode !== 'manual' },
      ],
      actions: [
        { type: 'detect', label: 'Nhận diện trạng thái', wouldAct: canDetect, reason: detectedStage.reason || (meta.statusLocked ? 'Trạng thái đang bị khóa do đã chỉnh tay.' : 'Chưa có tín hiệu đủ mạnh.'), message: detectedStage.status ? `Đề xuất: ${detectedStage.status}` : '' },
        { type: 'no_staff_reply', label: `Khách chưa được rep (${rules.noStaffReply.delayHours}h)`, wouldAct: noStaffAct, reason: !rules.noStaffReply.enabled ? 'Rule đang tắt.' : !workingNow ? 'Ngoài giờ hoạt động.' : !last || last.isFromPage ? 'Tin gần nhất không phải từ khách.' : !noStaffOverdue ? 'Chưa đủ thời gian chờ.' : !noStaffFresh ? 'Đã ngoài cửa sổ phản hồi 24h.' : !noStaffUnsent ? 'Rule này đã chạy cho tin khách hiện tại.' : 'Đủ điều kiện.', message: noStaffAct ? renderTemplate(rules.noStaffReply.template, { name: customerName, page: runtime.pageName }) : '' },
        { type: 'no_customer_reply', label: `Khách chưa trả lời (${rules.noCustomerReply.delayHours}h)`, wouldAct: noCustomerAct, reason: !rules.noCustomerReply.enabled ? 'Rule đang tắt.' : !workingNow ? 'Ngoài giờ hoạt động.' : !last || !last.isFromPage ? 'Tin gần nhất chưa phải tin của shop.' : !noCustomerOverdue ? 'Chưa đủ thời gian chờ.' : !inside24h ? 'Đã ngoài cửa sổ 24h.' : !noCustomerUnsent ? 'Đã follow-up cho lượt khách này.' : isOrdered || isClosed ? 'Khách đã chốt/đóng.' : 'Đủ điều kiện.', message: noCustomerAct ? renderTemplate(rules.noCustomerReply.template, { name: customerName, page: runtime.pageName }) : '' },
        { type: 'reengage', label: `Nhắc mồi lại (${rules.reengage.afterDays} ngày)`, wouldAct: reengageAct, reason: !rules.reengage.enabled ? 'Rule đang tắt.' : !reengageDue ? 'Chưa đến hạn.' : isOrdered || isClosed ? 'Khách đã chốt/đóng.' : 'Đến hạn; hệ thống chỉ tạo nhắc, không tự gửi ngoài 24h.', message: reengageAct ? renderTemplate(rules.reengage.template, { name: customerName, page: runtime.pageName }) : '' },
      ],
    });
  } catch (err: any) {
    return sendError(res, err, 'Không thể test rule cho hội thoại này.');
  }
});

messengerRouter.post('/automation/run', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || '').trim();
  if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId.' });

  let lockKey = '';
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    lockKey = `${runtime.user.id}:${runtime.pageId}`;
    if (automationLocks.has(lockKey)) {
      return res.json({ success: true, skipped: true, reason: 'automation_cycle_already_running', sent: 0, previewed: 0, detected: 0, reminders: 0, actions: [] });
    }
    automationLocks.add(lockKey);

    const storedAutomation = await getMessengerAutomationData(runtime.user);
    // Test nhanh phải chạy đúng cấu hình đang hiển thị trong popup, kể cả khi người dùng chưa bấm Lưu.
    // Chỉ cho phép override cấu hình ở dry-run để tuyệt đối không thay đổi cấu hình đã lưu khi chạy live.
    const usePreviewConfig = Boolean(req.body?.dryRun && req.body?.config && typeof req.body.config === 'object');
    const config = usePreviewConfig
      ? normalizeAutomationConfig(req.body.config)
      : storedAutomation.config;

    if (!config.enabled) {
      const workingClock = getWorkingHoursSnapshot(config);
      return res.json({
        success: true, enabled: false, workingNow: workingClock.workingNow,
        currentLocalTime: workingClock.currentLocalTime, currentWeekday: workingClock.currentWeekday,
        dayEnabled: workingClock.dayEnabled, timezone: workingClock.timezone, workingWindow: workingClock.workingWindow,
        serverNowUtc: workingClock.serverNowUtc, previewConfigUsed: usePreviewConfig,
        sent: 0, previewed: 0, dryRun: true, detected: 0, reminders: 0, actions: []
      });
    }

    const workingClock = getWorkingHoursSnapshot(config);
    const workingNow = workingClock.workingNow;
    const globalDryRun = config.testMode || Boolean(req.body?.dryRun);
    const contactsMap = await getMessengerContactsMap(runtime.user);
    const nextContactsMap: Record<string, MessengerCustomerMeta> = { ...contactsMap };
    const summaries = await listMessengerConversations(runtime.pageId, runtime.pageToken, 25, runtime.graphApiVersion);
    const recent = summaries.filter(item => item.customer?.id && ageMs(item.updatedTime) <= 14 * DAY).slice(0, 12);
    const actions: Array<{ type: string; customerId: string; customerName: string; detail?: string }> = [];
    let sent = 0;
    let previewed = 0;
    let detected = 0;
    let reminders = 0;
    let changed = false;

    for (const summary of recent) {
      if (!summary.customer?.id) continue;
      const detail = await getMessengerConversation(summary.id, runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
      if (!detail.customer?.id || !detail.messages?.length) continue;

      const key = contactKey(runtime.pageId, detail.customer.id);
      let meta = normalizeMeta(nextContactsMap[key] || DEFAULT_META);
      const automation = { ...(meta.automation || {}) };
      const rules = resolveConversationRules(config, meta);
      const dryRun = globalDryRun || rules.testOnly;
      let conversationChanged = false;
      const messages = detail.messages;
      const last = messages[messages.length - 1];
      const lastInbound = [...messages].reverse().find(message => !message.isFromPage && message.createdTime) || null;
      const lastOutbound = [...messages].reverse().find(message => message.isFromPage && message.createdTime) || null;
      const customerName = detail.customer.name || 'Khách';

      if (config.autoDetect.enabled && !meta.statusLocked) {
        const detectedStage = detectCustomerStage(detail);
        const canApply = detectedStage.status === 'ordered'
          ? config.autoDetect.autoApplyOrdered
          : detectedStage.status === 'quoted'
            ? config.autoDetect.autoApplyQuoted
            : detectedStage.status === 'interested'
              ? config.autoDetect.autoApplyInterested
              : false;
        const rank: Record<string, number> = { new: 0, interested: 1, quoted: 2, waiting: 2, ordered: 3, delivered: 4, closed: 5 };
        if (detectedStage.status && canApply && rank[detectedStage.status] > rank[meta.status] && meta.status !== 'closed') {
          detected += 1;
          actions.push({ type: dryRun ? 'would_detect' : 'detected', customerId: detail.customer.id, customerName, detail: `${detectedStage.status}: ${detectedStage.reason}` });
          if (dryRun) {
            previewed += 1;
          } else {
            meta = normalizeMeta({
              ...meta,
              status: detectedStage.status,
              tags: detectedStage.status === 'ordered' && !meta.tags.includes('Tự động: Đã chốt')
                ? [...meta.tags, 'Tự động: Đã chốt']
                : meta.tags,
              automation: {
                ...automation,
                autoDetectedStatus: detectedStage.status,
                autoDetectedAt: new Date().toISOString(),
                autoDetectionReason: detectedStage.reason,
              },
              updatedAt: new Date().toISOString(),
            });
            Object.assign(automation, meta.automation || {});
            changed = true;
            conversationChanged = true;
          }
        }
      }

      const isClosed = meta.status === 'closed';
      const isOrdered = meta.status === 'ordered' || meta.status === 'delivered';

      if (workingNow && !isClosed && rules.noStaffReply.enabled && last && !last.isFromPage && last.createdTime) {
        const overdue = ageMs(last.createdTime) >= rules.noStaffReply.delayHours * HOUR;
        const insideWindow = ageMs(last.createdTime) < SAFE_RESPONSE_WINDOW;
        const notSentForThisMessage = automation.lastNoStaffAutoReplyMessageId !== last.id;
        if (overdue && insideWindow && notSentForThisMessage && sent < 5) {
          const text = renderTemplate(rules.noStaffReply.template, { name: customerName, page: runtime.pageName });
          if (text) {
            if (dryRun) {
              previewed += 1;
              actions.push({ type: 'would_no_staff_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 120) });
            } else {
              await sendMessengerText(runtime.pageId, detail.customer.id, text, runtime.pageToken, runtime.graphApiVersion);
              automation.lastNoStaffAutoReplyMessageId = last.id;
              automation.lastAutomationActionAt = new Date().toISOString();
              sent += 1;
              changed = true;
              conversationChanged = true;
              actions.push({ type: 'no_staff_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 120) });
            }
          }
        }
      }

      if (workingNow && !isClosed && !isOrdered && rules.noCustomerReply.enabled && last && last.isFromPage && last.createdTime && lastInbound?.createdTime) {
        const overdue = ageMs(last.createdTime) >= rules.noCustomerReply.delayHours * HOUR;
        const insideWindow = ageMs(lastInbound.createdTime) < SAFE_RESPONSE_WINDOW;
        const notSentForThisMessage = automation.lastNoCustomerFollowupMessageId !== lastInbound.id;
        if (overdue && insideWindow && notSentForThisMessage && sent < 5) {
          const text = renderTemplate(rules.noCustomerReply.template, { name: customerName, page: runtime.pageName });
          if (text) {
            if (dryRun) {
              previewed += 1;
              actions.push({ type: 'would_no_customer_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 120) });
            } else {
              await sendMessengerText(runtime.pageId, detail.customer.id, text, runtime.pageToken, runtime.graphApiVersion);
              automation.lastNoCustomerFollowupMessageId = lastInbound.id;
              automation.lastAutomationActionAt = new Date().toISOString();
              sent += 1;
              changed = true;
              conversationChanged = true;
              if (!meta.statusLocked && meta.status !== 'ordered' && meta.status !== 'delivered') meta.status = 'waiting';
              actions.push({ type: 'no_customer_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 120) });
            }
          }
        }
      }

      if (!isClosed && !isOrdered && rules.reengage.enabled && last?.createdTime) {
        const due = ageMs(last.createdTime) >= rules.reengage.afterDays * DAY;
        const currentMessageId = last.id;
        const alreadyDismissed = automation.reengageDismissedForMessageId === currentMessageId;
        const alreadyDue = automation.reengageDueForMessageId === currentMessageId && Boolean(automation.reengageDueAt);
        if (due && !alreadyDismissed && !alreadyDue) {
          reminders += 1;
          if (dryRun) {
            previewed += 1;
            actions.push({ type: 'would_reengage_reminder', customerId: detail.customer.id, customerName, detail: `Đến hạn follow-up ${rules.reengage.afterDays} ngày; chỉ preview.` });
          } else {
            automation.reengageDueForMessageId = currentMessageId;
            automation.reengageDueAt = new Date().toISOString();
            automation.lastAutomationActionAt = new Date().toISOString();
            changed = true;
            conversationChanged = true;
            actions.push({ type: 'reengage_reminder', customerId: detail.customer.id, customerName, detail: `Đến hạn follow-up ${rules.reengage.afterDays} ngày; không tự gửi ngoài cửa sổ 24 giờ.` });
          }
        }
      }

      nextContactsMap[key] = normalizeMeta({ ...meta, automation, updatedAt: conversationChanged ? new Date().toISOString() : meta.updatedAt });
    }

    if (changed) {
      await setDocument(runtime.user.idToken, 'users', runtime.user.id, {
        messengerContacts: nextContactsMap,
        messengerAutomationLastRunAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, true);
    }

    return res.json({
      success: true,
      enabled: true,
      workingNow,
      currentLocalTime: workingClock.currentLocalTime,
      currentWeekday: workingClock.currentWeekday,
      dayEnabled: workingClock.dayEnabled,
      timezone: workingClock.timezone,
      serverNowUtc: workingClock.serverNowUtc,
      previewConfigUsed: usePreviewConfig,
      workingWindow: workingClock.workingWindow,
      sent,
      previewed,
      dryRun: globalDryRun,
      detected,
      reminders,
      actions,
      ranAt: new Date().toISOString(),
      note: globalDryRun ? 'TEST MODE: không gửi tin và không đổi trạng thái khách.' : 'Tự động gửi chỉ chạy trong cửa sổ phản hồi Messenger hợp lệ; follow-up 2-14 ngày chỉ tạo nhắc thủ công.',
    });
  } catch (err: any) {
    return sendError(res, err, 'Không thể chạy tự động hóa Messenger.');
  } finally {
    if (lockKey) automationLocks.delete(lockKey);
  }
});

messengerRouter.post('/mark-seen', async (req: Request, res: Response) => {
  const pageId = String(req.body?.pageId || req.body?.page_id || '').trim();
  const recipientId = String(req.body?.recipientId || req.body?.recipient_id || '').trim();
  if (!pageId || !recipientId) return res.status(400).json({ success: false, error: 'Thiếu pageId hoặc recipientId.' });
  try {
    const runtime = await resolvePageRuntime(req, pageId);
    await markMessengerSeen(runtime.pageId, recipientId, runtime.pageToken, runtime.graphApiVersion);
    return res.json({ success: true });
  } catch (err: any) {
    return sendError(res, err, 'Không thể đánh dấu đã xem.');
  }
});
