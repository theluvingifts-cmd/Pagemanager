import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin';
import {
  getMessengerConversation,
  listMessengerConversations,
  sendMessengerText,
} from '../meta/messengerService';
import { decryptBackgroundPageToken } from './backgroundTokenService';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SAFE_RESPONSE_WINDOW = 23.5 * HOUR;

export type AutomationRunAction = {
  type: string;
  customerId: string;
  customerName: string;
  detail?: string;
};

export type AutomationRunResult = {
  success: boolean;
  enabled: boolean;
  workingNow: boolean;
  sent: number;
  previewed: number;
  detected: number;
  reminders: number;
  actions: AutomationRunAction[];
  ranAt: string;
  dryRun: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  currentLocalTime?: string;
  currentWeekday?: number;
  timezone?: string;
  workingWindow?: string;
};

type CustomerStatus = 'new' | 'interested' | 'quoted' | 'waiting' | 'ordered' | 'delivered' | 'closed';
type FormulaMode = 'inherit' | 'hot_lead' | 'quoted' | 'nurture' | 'manual' | 'custom';

type ReplyFormula = {
  mode: FormulaMode;
  testOnly?: boolean;
  noStaffDelayHours?: number;
  noCustomerDelayHours?: number;
  reengageAfterDays?: number;
  noStaffTemplate?: string;
  noCustomerTemplate?: string;
  reengageTemplate?: string;
};

type CustomerMeta = {
  tags: string[];
  note: string;
  starred: boolean;
  status: CustomerStatus;
  statusLocked?: boolean;
  automation?: Record<string, any>;
  replyFormula?: ReplyFormula;
  crm?: Record<string, any>;
  updatedAt?: string | null;
};

type AutomationConfig = {
  enabled: boolean;
  testMode: boolean;
  timezone: string;
  workingHours: { enabled: boolean; start: string; end: string; days: number[] };
  noStaffReply: { enabled: boolean; delayHours: number; template: string };
  noCustomerReply: { enabled: boolean; delayHours: number; template: string };
  reengage: { enabled: boolean; afterDays: number; mode: 'reminder_only'; template: string };
  autoDetect: { enabled: boolean; autoApplyInterested: boolean; autoApplyQuoted: boolean; autoApplyOrdered: boolean };
};

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: false,
  testMode: false,
  timezone: 'Asia/Ho_Chi_Minh',
  workingHours: { enabled: true, start: '08:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
  noStaffReply: { enabled: false, delayHours: 3, template: 'Shop xin lỗi vì để {{name}} chờ hơi lâu ạ. Bên mình đã nhận được tin nhắn và đang kiểm tra để phản hồi bạn ngay đây.' },
  noCustomerReply: { enabled: false, delayHours: 4, template: '{{name}} ơi, mình nhắn lại để bạn khỏi bị trôi tin ạ. Nếu bạn còn cần mẫu này thì shop hỗ trợ tiếp ngay nhé.' },
  reengage: { enabled: true, afterDays: 2, mode: 'reminder_only', template: '{{name}} ơi, shop nhắn lại hỏi thăm mẫu mình xem hôm trước ạ. Nếu bạn còn cần thì mình hỗ trợ tiếp nhé.' },
  autoDetect: { enabled: true, autoApplyInterested: true, autoApplyQuoted: true, autoApplyOrdered: true },
};

const DEFAULT_META: CustomerMeta = {
  tags: [], note: '', starred: false, status: 'new', statusLocked: false,
  automation: {}, replyFormula: { mode: 'inherit', testOnly: false }, crm: {}, updatedAt: null,
};

const locks = new Set<string>();

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeConfig(raw: any): AutomationConfig {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: Boolean(source.enabled),
    testMode: Boolean(source.testMode),
    timezone: String(source.timezone || DEFAULT_CONFIG.timezone),
    workingHours: {
      enabled: source.workingHours?.enabled !== false,
      start: /^\d{2}:\d{2}$/.test(String(source.workingHours?.start || '')) ? source.workingHours.start : DEFAULT_CONFIG.workingHours.start,
      end: /^\d{2}:\d{2}$/.test(String(source.workingHours?.end || '')) ? source.workingHours.end : DEFAULT_CONFIG.workingHours.end,
      days: Array.isArray(source.workingHours?.days) ? source.workingHours.days.map(Number).filter((v: number) => v >= 0 && v <= 6) : DEFAULT_CONFIG.workingHours.days,
    },
    noStaffReply: {
      enabled: Boolean(source.noStaffReply?.enabled),
      delayHours: clampNumber(source.noStaffReply?.delayHours, 1, 12, DEFAULT_CONFIG.noStaffReply.delayHours),
      template: String(source.noStaffReply?.template || DEFAULT_CONFIG.noStaffReply.template).slice(0, 1800),
    },
    noCustomerReply: {
      enabled: Boolean(source.noCustomerReply?.enabled),
      delayHours: clampNumber(source.noCustomerReply?.delayHours, 1, 12, DEFAULT_CONFIG.noCustomerReply.delayHours),
      template: String(source.noCustomerReply?.template || DEFAULT_CONFIG.noCustomerReply.template).slice(0, 1800),
    },
    reengage: {
      enabled: source.reengage?.enabled !== false,
      afterDays: clampNumber(source.reengage?.afterDays, 2, 14, DEFAULT_CONFIG.reengage.afterDays),
      mode: 'reminder_only',
      template: String(source.reengage?.template || DEFAULT_CONFIG.reengage.template).slice(0, 1800),
    },
    autoDetect: {
      enabled: source.autoDetect?.enabled !== false,
      autoApplyInterested: source.autoDetect?.autoApplyInterested !== false,
      autoApplyQuoted: source.autoDetect?.autoApplyQuoted !== false,
      autoApplyOrdered: source.autoDetect?.autoApplyOrdered !== false,
    },
  };
}

function normalizeFormula(raw: any): ReplyFormula {
  const modes = new Set<FormulaMode>(['inherit', 'hot_lead', 'quoted', 'nurture', 'manual', 'custom']);
  const mode = modes.has(String(raw?.mode) as FormulaMode) ? String(raw.mode) as FormulaMode : 'inherit';
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

function normalizeMeta(raw: any): CustomerMeta {
  const statuses = new Set<CustomerStatus>(['new', 'interested', 'quoted', 'waiting', 'ordered', 'delivered', 'closed']);
  const status = statuses.has(String(raw?.status) as CustomerStatus) ? String(raw.status) as CustomerStatus : 'new';
  return {
    ...DEFAULT_META,
    ...(raw && typeof raw === 'object' ? raw : {}),
    tags: Array.isArray(raw?.tags) ? raw.tags.map((v: any) => String(v).trim()).filter(Boolean).slice(0, 12) : [],
    note: String(raw?.note || '').slice(0, 4000),
    starred: Boolean(raw?.starred),
    status,
    statusLocked: Boolean(raw?.statusLocked),
    automation: raw?.automation && typeof raw.automation === 'object' ? { ...raw.automation } : {},
    replyFormula: normalizeFormula(raw?.replyFormula),
    crm: raw?.crm && typeof raw.crm === 'object' ? { ...raw.crm } : {},
  };
}

function resolveRules(config: AutomationConfig, meta: CustomerMeta) {
  const formula = normalizeFormula(meta.replyFormula);
  const base = {
    testOnly: Boolean(formula.testOnly),
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

function renderTemplate(text: string, context: { name?: string; page?: string }) {
  return String(text || '')
    .replace(/{{\s*name\s*}}/gi, context.name || 'bạn')
    .replace(/{{\s*page\s*}}/gi, context.page || 'shop')
    .trim();
}

function stripDiacritics(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function detectCustomerStage(detail: any): { status: CustomerStatus | null; reason: string } {
  const messages = Array.isArray(detail?.messages) ? detail.messages.slice(-20) : [];
  const customerBlob = messages.filter((m: any) => !m.isFromPage).map((m: any) => stripDiacritics(m.text || '')).filter(Boolean).join(' | ');
  const pageBlob = messages.filter((m: any) => m.isFromPage).map((m: any) => stripDiacritics(m.text || '')).filter(Boolean).join(' | ');
  let orderScore = 0;
  const signals: string[] = [];
  for (const word of ['chot', 'minh lay', 'em lay', 'lay mau', 'dat don', 'dat hang', 'ship cho', 'giao den', 'cod', 'chuyen khoan', 'ok lay']) {
    if (customerBlob.includes(word)) { orderScore += 2; signals.push(word); }
  }
  if (/(?:\+?84|0)[0-9]{8,10}/.test(customerBlob)) { orderScore += 2; signals.push('so dien thoai'); }
  if (/dia chi|phuong|quan |thanh pho|duong |hem |ngo /.test(customerBlob)) { orderScore += 2; signals.push('dia chi'); }
  if (orderScore >= 4) return { status: 'ordered', reason: `Có tín hiệu chốt: ${signals.slice(0, 4).join(', ')}` };
  const interestedWords = ['bao nhieu', 'gia', 'mau nao', 'con hang', 'ship', 'lam duoc', 'thoi gian', 'bao lau', 'tu van', 'size', 'kich thuoc'];
  const interestedSignals = interestedWords.filter(word => customerBlob.includes(word));
  const quoted = /(?:\b\d{2,4}\s?k\b)|bao gia|gia la|tong (?:la|het)|phi ship/.test(pageBlob);
  if (quoted && interestedSignals.length >= 1) return { status: 'quoted', reason: 'Shop đã báo giá và khách đang trao đổi về sản phẩm.' };
  if (interestedSignals.length >= 2) return { status: 'interested', reason: `Khách có tín hiệu quan tâm: ${interestedSignals.slice(0, 4).join(', ')}` };
  return { status: null, reason: '' };
}

function getZonedParts(date: Date, timeZone: string) {
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
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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

function getWorkingHoursSnapshot(config: AutomationConfig, now = new Date()) {
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
    timezone: parts.timeZone || zone,
    workingWindow: `${config.workingHours.start}–${config.workingHours.end}`,
  };
}

function clockToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isWithinWorkingHours(config: AutomationConfig, now = new Date()) {
  return getWorkingHoursSnapshot(config, now).workingNow;
}

function ageMs(value?: string | null) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

export async function runBackgroundMessengerAutomationForPage(pageDocId: string, options: { dryRun?: boolean } = {}): Promise<AutomationRunResult> {
  const db = getAdminDb();
  const pageRef = db.collection('facebookPages').doc(pageDocId);
  const lockKey = pageDocId;
  if (locks.has(lockKey)) {
    return { success: true, enabled: true, workingNow: false, sent: 0, previewed: 0, detected: 0, reminders: 0, actions: [], ranAt: new Date().toISOString(), dryRun: Boolean(options.dryRun), skipped: true, reason: 'already_running' };
  }
  locks.add(lockKey);
  try {
    const pageSnap = await pageRef.get();
    if (!pageSnap.exists) throw new Error('Không tìm thấy Page cho automation chạy nền.');
    const page = pageSnap.data() || {};
    const background = page.backgroundAutomation || {};
    if (!background.enabled) {
      return { success: true, enabled: false, workingNow: false, sent: 0, previewed: 0, detected: 0, reminders: 0, actions: [], ranAt: new Date().toISOString(), dryRun: Boolean(options.dryRun), skipped: true, reason: 'background_disabled' };
    }
    const userId = String(page.userId || background.userId || '');
    if (!userId) throw new Error('Page không có userId để chạy automation.');
    const encryptedPageToken = String(background.encryptedPageAccessToken || '');
    if (!encryptedPageToken) throw new Error('Chưa có token chạy nền. Hãy bật lại “Chạy 24/7” trong Page Manager.');
    const pageToken = decryptBackgroundPageToken(encryptedPageToken);
    const realPageId = String(page.pageId || '');
    const pageName = String(page.pageName || 'Facebook Page');
    const graphApiVersion = String(page.graphApiVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');
    if (!realPageId) throw new Error('Page không có Facebook Page ID.');

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const config = normalizeConfig(userData.messengerAutomation || DEFAULT_CONFIG);
    const ranAt = new Date().toISOString();
    if (!config.enabled) {
      return { success: true, enabled: false, workingNow: false, sent: 0, previewed: 0, detected: 0, reminders: 0, actions: [], ranAt, dryRun: Boolean(options.dryRun), skipped: true, reason: 'automation_disabled' };
    }

    const workingClock = getWorkingHoursSnapshot(config);
    const workingNow = workingClock.workingNow;
    const globalDryRun = config.testMode || Boolean(options.dryRun);
    const contactsMap: Record<string, CustomerMeta> = userData.messengerContacts && typeof userData.messengerContacts === 'object' ? { ...userData.messengerContacts } : {};
    const summaries = await listMessengerConversations(realPageId, pageToken, 25, graphApiVersion);
    const recent = summaries.filter((item: any) => item.customer?.id && ageMs(item.updatedTime) <= 14 * DAY).slice(0, 12);
    const actions: AutomationRunAction[] = [];
    let sent = 0;
    let previewed = 0;
    let detected = 0;
    let reminders = 0;
    let changed = false;

    for (const summary of recent) {
      const detail = await getMessengerConversation(summary.id, realPageId, pageToken, graphApiVersion);
      if (!detail.customer?.id || !detail.messages?.length) continue;
      const key = `${realPageId}_${detail.customer.id}`;
      let meta = normalizeMeta(contactsMap[key] || DEFAULT_META);
      const automation = { ...(meta.automation || {}) };
      const rules = resolveRules(config, meta);
      const dryRun = globalDryRun || rules.testOnly;
      const messages = detail.messages;
      const last = messages[messages.length - 1];
      const lastInbound = [...messages].reverse().find((message: any) => !message.isFromPage && message.createdTime) || null;
      const customerName = detail.customer.name || 'Khách';
      let conversationChanged = false;

      if (config.autoDetect.enabled && !meta.statusLocked) {
        const stage = detectCustomerStage(detail);
        const canApply = stage.status === 'ordered' ? config.autoDetect.autoApplyOrdered : stage.status === 'quoted' ? config.autoDetect.autoApplyQuoted : stage.status === 'interested' ? config.autoDetect.autoApplyInterested : false;
        const rank: Record<CustomerStatus, number> = { new: 0, interested: 1, quoted: 2, waiting: 2, ordered: 3, delivered: 4, closed: 5 };
        if (stage.status && canApply && rank[stage.status] > rank[meta.status] && meta.status !== 'closed') {
          detected += 1;
          if (dryRun) {
            previewed += 1;
            actions.push({ type: 'would_detect', customerId: detail.customer.id, customerName, detail: `${stage.status}: ${stage.reason}` });
          } else {
            meta.status = stage.status;
            if (stage.status === 'ordered' && !meta.tags.includes('Tự động: Đã chốt')) meta.tags = [...meta.tags, 'Tự động: Đã chốt'].slice(0, 12);
            automation.autoDetectedStatus = stage.status;
            automation.autoDetectedAt = ranAt;
            automation.autoDetectionReason = stage.reason;
            conversationChanged = true;
            changed = true;
            actions.push({ type: 'detected', customerId: detail.customer.id, customerName, detail: `${stage.status}: ${stage.reason}` });
          }
        }
      }

      const isClosed = meta.status === 'closed';
      const isOrdered = meta.status === 'ordered' || meta.status === 'delivered';

      if (workingNow && !isClosed && rules.noStaffReply.enabled && last && !last.isFromPage && last.createdTime) {
        const overdue = ageMs(last.createdTime) >= rules.noStaffReply.delayHours * HOUR;
        const insideWindow = ageMs(last.createdTime) < SAFE_RESPONSE_WINDOW;
        const notSent = automation.lastNoStaffAutoReplyMessageId !== last.id;
        if (overdue && insideWindow && notSent && sent < 5) {
          const text = renderTemplate(rules.noStaffReply.template, { name: customerName, page: pageName });
          if (text) {
            if (dryRun) {
              previewed += 1;
              actions.push({ type: 'would_no_staff_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 160) });
            } else {
              await sendMessengerText(realPageId, detail.customer.id, text, pageToken, graphApiVersion);
              automation.lastNoStaffAutoReplyMessageId = last.id;
              automation.lastAutomationActionAt = ranAt;
              sent += 1;
              changed = true;
              conversationChanged = true;
              actions.push({ type: 'no_staff_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 160) });
            }
          }
        }
      }

      if (workingNow && !isClosed && !isOrdered && rules.noCustomerReply.enabled && last && last.isFromPage && last.createdTime && lastInbound?.createdTime) {
        const overdue = ageMs(last.createdTime) >= rules.noCustomerReply.delayHours * HOUR;
        const insideWindow = ageMs(lastInbound.createdTime) < SAFE_RESPONSE_WINDOW;
        const notSent = automation.lastNoCustomerFollowupMessageId !== lastInbound.id;
        if (overdue && insideWindow && notSent && sent < 5) {
          const text = renderTemplate(rules.noCustomerReply.template, { name: customerName, page: pageName });
          if (text) {
            if (dryRun) {
              previewed += 1;
              actions.push({ type: 'would_no_customer_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 160) });
            } else {
              await sendMessengerText(realPageId, detail.customer.id, text, pageToken, graphApiVersion);
              automation.lastNoCustomerFollowupMessageId = lastInbound.id;
              automation.lastAutomationActionAt = ranAt;
              if (!meta.statusLocked && meta.status !== 'ordered' && meta.status !== 'delivered') meta.status = 'waiting';
              sent += 1;
              changed = true;
              conversationChanged = true;
              actions.push({ type: 'no_customer_reply', customerId: detail.customer.id, customerName, detail: text.slice(0, 160) });
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
            actions.push({ type: 'would_reengage_reminder', customerId: detail.customer.id, customerName, detail: `Đến hạn follow-up ${rules.reengage.afterDays} ngày.` });
          } else {
            automation.reengageDueForMessageId = currentMessageId;
            automation.reengageDueAt = ranAt;
            automation.lastAutomationActionAt = ranAt;
            changed = true;
            conversationChanged = true;
            actions.push({ type: 'reengage_reminder', customerId: detail.customer.id, customerName, detail: `Đến hạn follow-up ${rules.reengage.afterDays} ngày; không tự gửi ngoài cửa sổ 24 giờ.` });
          }
        }
      }

      if (conversationChanged) {
        meta.automation = automation;
        meta.updatedAt = ranAt;
        contactsMap[key] = normalizeMeta(meta);
      }
    }

    if (changed) {
      await userRef.set({ messengerContacts: contactsMap, messengerAutomationLastRunAt: ranAt, updatedAt: ranAt }, { merge: true });
    } else {
      await userRef.set({ messengerAutomationLastRunAt: ranAt }, { merge: true });
    }

    const result: AutomationRunResult = {
      success: true,
      enabled: true,
      workingNow,
      currentLocalTime: workingClock.currentLocalTime,
      currentWeekday: workingClock.currentWeekday,
      timezone: workingClock.timezone,
      workingWindow: workingClock.workingWindow,
      sent,
      previewed,
      detected,
      reminders,
      actions: actions.slice(0, 30),
      ranAt,
      dryRun: globalDryRun,
    };
    await pageRef.update({
      'backgroundAutomation.lastRunAt': ranAt,
      'backgroundAutomation.lastResult': {
        sent, previewed, detected, reminders, workingNow, dryRun: globalDryRun,
        actions: actions.slice(0, 8),
      },
      'backgroundAutomation.lastError': FieldValue.delete(),
    });
    return result;
  } catch (err: any) {
    const ranAt = new Date().toISOString();
    try {
      await getAdminDb().collection('facebookPages').doc(pageDocId).update({
        'backgroundAutomation.lastRunAt': ranAt,
        'backgroundAutomation.lastError': String(err?.message || err || 'Không rõ lỗi').slice(0, 500),
      });
    } catch {}
    return { success: false, enabled: true, workingNow: false, sent: 0, previewed: 0, detected: 0, reminders: 0, actions: [], ranAt, dryRun: Boolean(options.dryRun), error: err?.message || 'Không chạy được automation nền.' };
  } finally {
    locks.delete(lockKey);
  }
}

export async function runAllBackgroundMessengerAutomations(options: { dryRun?: boolean; limit?: number } = {}) {
  const db = getAdminDb();
  const snapshot = await db.collection('facebookPages').where('backgroundAutomation.enabled', '==', true).limit(Math.max(1, Math.min(50, options.limit || 20))).get();
  const results: Array<{ pageDocId: string; pageId: string; pageName: string; result: AutomationRunResult }> = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const result = await runBackgroundMessengerAutomationForPage(doc.id, { dryRun: options.dryRun });
    results.push({ pageDocId: doc.id, pageId: String(data.pageId || ''), pageName: String(data.pageName || ''), result });
  }
  return results;
}
