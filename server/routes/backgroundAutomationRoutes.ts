import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { getDocument, queryDocuments, setDocument } from '../services/firebaseRest.js';
import { decryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest } from '../services/meta/metaConfigService.js';
import { decryptBackgroundPageToken, encryptBackgroundPageToken, getBackgroundEncryptionKey } from '../services/automation/backgroundTokenService.js';
import { runAllBackgroundMessengerAutomations, runBackgroundMessengerAutomationForPage } from '../services/automation/messengerAutomationWorker.js';
import { runScheduledStoryAutomation } from '../services/automation/storyAutomationWorker.js';
import { getAdminDb } from '../services/firebaseAdmin.js';
import { publishTextPost, publishLinkPost, publishPhotoPost, getPagePosts } from '../services/meta/metaPostService.js';
import { publishFacebookStory, publishInstagramStory } from '../services/meta/metaStoryService.js';
import { getLinkedInstagramAccount, listInstagramMedia } from '../services/meta/instagramService.js';
import { getGraphBaseUrl } from '../services/meta/metaOAuthService.js';
import { createGeminiJsonResponse, isGeminiConfigured } from '../services/ai/geminiService.js';

export const backgroundAutomationRouter = Router();

// ---- AI publishing policy / Meta insights (kept in this existing route file by design) ----
type AiPublishingPillar =
  | 'sales'
  | 'branding'
  | 'feedback'
  | 'value'
  | 'engagement'
  | 'campaign'
  | 'behind_the_scenes'
  | 'advertising'
  | 'unclassified';

interface AiPublishingActions {
  facebookPost: boolean;
  instagramPost: boolean;
  facebookStory: boolean;
  instagramStory: boolean;
  repostExisting: boolean;
  createNew: boolean;
}

interface AiTimeWindow {
  start: string;
  end: string;
}

interface AiPublishingPolicy {
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  weekdays: number[];
  timeWindows: AiTimeWindow[];
  dailyPostLimit: number;
  dailyStoryLimit: number;
  cooldownDays: number;
  minIntervalMinutes: number;
  actions: AiPublishingActions;
  pillars: AiPublishingPillar[];
  timezoneOffsetHours: number;
  pageId: string | null;
  updatedAt: string | null;
}

const ALL_PILLARS: AiPublishingPillar[] = [
  'sales', 'branding', 'feedback', 'value', 'engagement', 'campaign',
  'behind_the_scenes', 'advertising', 'unclassified',
];

const DEFAULT_ACTIONS: AiPublishingActions = {
  facebookPost: false,
  instagramPost: false,
  facebookStory: false,
  instagramStory: false,
  repostExisting: true,
  createNew: false,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeTime(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeAiPublishingPolicy(input: any): AiPublishingPolicy {
  const weekdays: number[] = Array.isArray(input?.weekdays)
    ? Array.from(new Set<number>(input.weekdays.map((value: any) => Number(value)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)))
    : [0, 1, 2, 3, 4, 5, 6];

  const timeWindows = Array.isArray(input?.timeWindows)
    ? input.timeWindows.slice(0, 4).map((item: any) => ({
        start: normalizeTime(item?.start, '08:00'),
        end: normalizeTime(item?.end, '22:00'),
      }))
    : [{ start: '08:00', end: '22:00' }];

  const requestedPillars = Array.isArray(input?.pillars)
    ? input.pillars.map(String).filter((value: string): value is AiPublishingPillar => ALL_PILLARS.includes(value as AiPublishingPillar))
    : ALL_PILLARS;

  return {
    enabled: Boolean(input?.enabled),
    startAt: normalizeIso(input?.startAt),
    endAt: normalizeIso(input?.endAt),
    weekdays: weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6],
    timeWindows: timeWindows.length ? timeWindows : [{ start: '08:00', end: '22:00' }],
    dailyPostLimit: clampInt(input?.dailyPostLimit, 1, 0, 10),
    dailyStoryLimit: clampInt(input?.dailyStoryLimit, 2, 0, 20),
    cooldownDays: clampInt(input?.cooldownDays, 10, 0, 90),
    minIntervalMinutes: clampInt(input?.minIntervalMinutes, 120, 15, 720),
    actions: {
      ...DEFAULT_ACTIONS,
      ...(input?.actions && typeof input.actions === 'object'
        ? Object.fromEntries(Object.keys(DEFAULT_ACTIONS).map(key => [key, input.actions[key] === undefined ? DEFAULT_ACTIONS[key as keyof AiPublishingActions] : Boolean(input.actions[key])]))
        : {}),
    } as AiPublishingActions,
    pillars: requestedPillars.length ? Array.from(new Set(requestedPillars)) : ['unclassified'],
    timezoneOffsetHours: clampInt(input?.timezoneOffsetHours, 7, -12, 14),
    pageId: input?.pageId ? String(input.pageId) : null,
    updatedAt: input?.updatedAt ? String(input.updatedAt) : null,
  };
}

function localParts(now: Date, timezoneOffsetHours: number) {
  const shifted = new Date(now.getTime() + timezoneOffsetHours * 60 * 60 * 1000);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function isWithinAllowedTime(
  policyInput: AiPublishingPolicy | any,
  now = new Date(),
  timezoneOffsetHours?: number,
): boolean {
  const policy = normalizeAiPublishingPolicy(policyInput);
  const offset = timezoneOffsetHours ?? policy.timezoneOffsetHours;
  const { weekday, minutes } = localParts(now, offset);
  if (!policy.weekdays.includes(weekday)) return false;

  return policy.timeWindows.some(window => {
    const start = timeToMinutes(window.start);
    const end = timeToMinutes(window.end);
    if (start === end) return true;
    if (start < end) return minutes >= start && minutes <= end;
    return minutes >= start || minutes <= end;
  });
}

function isPolicyActiveNow(
  policyInput: AiPublishingPolicy | any,
  now = new Date(),
  timezoneOffsetHours?: number,
): boolean {
  const policy = normalizeAiPublishingPolicy(policyInput);
  if (!policy.enabled) return false;
  const nowMs = now.getTime();
  if (policy.startAt && nowMs < new Date(policy.startAt).getTime()) return false;
  if (policy.endAt && nowMs > new Date(policy.endAt).getTime()) return false;
  return isWithinAllowedTime(policy, now, timezoneOffsetHours);
}

function contentPillarOf(item: any): AiPublishingPillar {
  const raw = String(item?.pillar || item?.contentPillar || item?.objective || '').toLowerCase().trim();
  const map: Record<string, AiPublishingPillar> = {
    'bán hàng': 'sales', sales: 'sales',
    'thương hiệu': 'branding', branding: 'branding',
    feedback: 'feedback',
    'giá trị': 'value', value: 'value',
    'tương tác': 'engagement', engagement: 'engagement',
    'chiến dịch': 'campaign', campaign: 'campaign',
    'hậu trường': 'behind_the_scenes', behind_the_scenes: 'behind_the_scenes',
    'quảng cáo': 'advertising', advertising: 'advertising', ads: 'advertising',
  };
  return map[raw] || 'unclassified';
}

function isContentEligibleByCooldown(item: any, policyInput: AiPublishingPolicy | any, now = new Date()): boolean {
  const policy = normalizeAiPublishingPolicy(policyInput);
  if (!policy.pillars.includes(contentPillarOf(item))) return false;
  const last = new Date(item?.aiLastRepostedAt || item?.lastRepostedAt || item?.facebookCreatedTime || item?.publishedAt || item?.createdAt || 0).getTime();
  if (!Number.isFinite(last) || last <= 0) return true;
  return now.getTime() - last >= policy.cooldownDays * 24 * 60 * 60 * 1000;
}

interface NormalizedContentMetrics {
  reach: number | null;
  impressions: number | null;
  views: number | null;
  engagement: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  saves: number | null;
  replies: number | null;
}

const EMPTY_METRICS: NormalizedContentMetrics = {
  reach: null,
  impressions: null,
  views: null,
  engagement: null,
  reactions: null,
  comments: null,
  shares: null,
  clicks: null,
  saves: null,
  replies: null,
};

async function readJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function graphGet(
  path: string,
  token: string,
  version?: string,
  params: Record<string, string | number | undefined> = {},
): Promise<any> {
  const url = new URL(`${getGraphBaseUrl(version)}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await readJsonSafe(response);
  if (!response.ok || data?.error) {
    const error: any = new Error(data?.error?.message || `Meta insights HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.error?.code;
    error.subcode = data?.error?.error_subcode;
    throw error;
  }
  return data;
}

function numericValue(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === 'object') {
    if (typeof value.value === 'number') return value.value;
    const numbers = Object.values(value).filter(item => typeof item === 'number') as number[];
    if (numbers.length) return numbers.reduce((sum, item) => sum + item, 0);
  }
  return null;
}

async function fetchInsightMetric(objectId: string, metric: string, token: string, version?: string): Promise<number | null> {
  try {
    const data = await graphGet(`${encodeURIComponent(objectId)}/insights`, token, version, { metric });
    const item = Array.isArray(data?.data) ? data.data[0] : null;
    if (!item) return null;
    if (Array.isArray(item.values) && item.values.length) {
      return numericValue(item.values[item.values.length - 1]?.value);
    }
    return numericValue(item.value);
  } catch {
    return null;
  }
}

async function getFacebookPostMetrics(
  postId: string,
  pageAccessToken: string,
  graphApiVersion?: string,
): Promise<NormalizedContentMetrics> {
  const metrics: NormalizedContentMetrics = { ...EMPTY_METRICS };

  try {
    const detail = await graphGet(encodeURIComponent(postId), pageAccessToken, graphApiVersion, {
      fields: 'shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)',
    });
    metrics.comments = numericValue(detail?.comments?.summary?.total_count);
    metrics.reactions = numericValue(detail?.reactions?.summary?.total_count);
    metrics.shares = numericValue(detail?.shares?.count);
  } catch {
    // Basic summary may be unavailable for older/deleted posts. Insights below
    // are intentionally independent so partial data is still useful.
  }

  const candidates: Array<[keyof NormalizedContentMetrics, string[]]> = [
    ['reach', ['post_impressions_unique', 'post_reach']],
    ['impressions', ['post_impressions']],
    ['engagement', ['post_engaged_users', 'post_activity_by_action_type']],
    ['clicks', ['post_clicks']],
    ['views', ['post_video_views', 'post_video_views_organic']],
  ];

  for (const [key, names] of candidates) {
    for (const metricName of names) {
      const value = await fetchInsightMetric(postId, metricName, pageAccessToken, graphApiVersion);
      if (value !== null) { metrics[key] = value; break; }
    }
  }

  if (metrics.engagement === null) {
    const parts = [metrics.reactions, metrics.comments, metrics.shares, metrics.clicks].filter((v): v is number => v !== null);
    if (parts.length) metrics.engagement = parts.reduce((sum, value) => sum + value, 0);
  }
  return metrics;
}

async function getInstagramMediaMetrics(
  mediaId: string,
  pageAccessToken: string,
  graphApiVersion?: string,
): Promise<NormalizedContentMetrics> {
  const metrics: NormalizedContentMetrics = { ...EMPTY_METRICS };

  try {
    const detail = await graphGet(encodeURIComponent(mediaId), pageAccessToken, graphApiVersion, {
      fields: 'like_count,comments_count,media_type,media_product_type',
    });
    metrics.reactions = numericValue(detail?.like_count);
    metrics.comments = numericValue(detail?.comments_count);
  } catch {}

  const candidates: Array<[keyof NormalizedContentMetrics, string[]]> = [
    ['reach', ['reach']],
    ['impressions', ['impressions']],
    ['views', ['views', 'video_views', 'plays']],
    ['shares', ['shares']],
    ['saves', ['saved', 'saves']],
    ['replies', ['replies']],
    ['engagement', ['total_interactions', 'engagement']],
  ];

  for (const [key, names] of candidates) {
    for (const metricName of names) {
      const value = await fetchInsightMetric(mediaId, metricName, pageAccessToken, graphApiVersion);
      if (value !== null) { metrics[key] = value; break; }
    }
  }

  if (metrics.engagement === null) {
    const parts = [metrics.reactions, metrics.comments, metrics.shares, metrics.saves, metrics.replies].filter((v): v is number => v !== null);
    if (parts.length) metrics.engagement = parts.reduce((sum, value) => sum + value, 0);
  }
  return metrics;
}

function sumMetrics(items: NormalizedContentMetrics[]): NormalizedContentMetrics {
  const result: NormalizedContentMetrics = { ...EMPTY_METRICS };
  for (const key of Object.keys(result) as Array<keyof NormalizedContentMetrics>) {
    const values = items.map(item => item[key]).filter((value): value is number => value !== null);
    result[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return result;
}

interface AiPublishingRunResult {
  userId: string;
  success: boolean;
  skipped?: string;
  selectedContentId?: string | null;
  feed?: Record<string, string>;
  story?: Record<string, string>;
  generated?: boolean;
  errors?: string[];
}

function localDateKey(now: Date, offsetHours: number) {
  const shifted = new Date(now.getTime() + offsetHours * 3600_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function asPublicMedia(item: any): Array<{ public_url: string; media_type: string }> {
  if (!Array.isArray(item?.media)) return [];
  return item.media
    .map((media: any) => ({
      public_url: String(media?.public_url || media?.url || media?.downloadUrl || ''),
      media_type: String(media?.media_type || media?.type || 'image'),
    }))
    .filter((media: any) => Boolean(media.public_url));
}

async function postForm(path: string, token: string, version: string, values: Record<string, string>) {
  const response = await fetch(`${getGraphBaseUrl(version)}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(values).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Meta HTTP ${response.status}`);
  return data;
}

async function getJson(path: string, token: string, version: string, params: Record<string, string> = {}) {
  const url = new URL(`${getGraphBaseUrl(version)}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Meta HTTP ${response.status}`);
  return data;
}

async function publishInstagramImagePost(
  instagramId: string,
  token: string,
  imageUrl: string,
  caption: string,
  version: string,
): Promise<string> {
  const container = await postForm(
    `${encodeURIComponent(instagramId)}/media`, token, version,
    { image_url: imageUrl, caption: caption || '' }
  );
  const containerId = String(container.id || '');
  if (!containerId) throw new Error('Instagram không trả về media container ID.');

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await getJson(encodeURIComponent(containerId), token, version, { fields: 'status_code,status' }).catch(() => null);
    if (!status || status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') break;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram xử lý ảnh thất bại: ${status.status || status.status_code}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000 + attempt * 500));
  }

  const published = await postForm(
    `${encodeURIComponent(instagramId)}/media_publish`, token, version,
    { creation_id: containerId }
  );
  if (!published?.id) throw new Error('Instagram không trả về media ID sau publish.');
  return String(published.id);
}

async function chooseCandidateWithAi(candidates: any[], policy: AiPublishingPolicy): Promise<any | null> {
  if (!candidates.length) return null;
  if (!isGeminiConfigured() || candidates.length === 1) return candidates[0];
  try {
    const payload = candidates.slice(0, 20).map(item => ({
      id: item.id,
      title: item.title,
      message: String(item.message || item.caption || '').slice(0, 500),
      pillar: contentPillarOf(item),
      publishedAt: item.publishedAt || item.facebookCreatedTime || item.createdAt,
      aiLastRepostedAt: item.aiLastRepostedAt || null,
      repostCount: Number(item.aiRepostCount || 0),
      hasImage: asPublicMedia(item).some(media => media.media_type === 'image'),
    }));
    const picked = await createGeminiJsonResponse<{ contentId: string; reason: string }>(
      [
        'Bạn là AI content operator cho The Luvin.',
        'Chọn DUY NHẤT một bài trong danh sách đủ điều kiện để đăng lại hôm nay.',
        'Ưu tiên cân bằng nội dung, bài lâu chưa dùng, có hình ảnh tốt và không lặp thông điệp gần đây.',
        'Không được trả contentId ngoài danh sách.',
      ].join('\n'),
      `POLICY=${JSON.stringify({ pillars: policy.pillars, cooldownDays: policy.cooldownDays })}\nCANDIDATES=${JSON.stringify(payload)}`,
      {
        maxOutputTokens: 500,
        repairAttempts: 1,
        jsonSchema: {
          name: 'ai_repost_selection',
          schema: {
            type: 'object',
            properties: { contentId: { type: 'string' }, reason: { type: 'string' } },
            required: ['contentId', 'reason'],
          },
        },
      }
    );
    return candidates.find(item => item.id === picked.contentId) || candidates[0];
  } catch (err) {
    console.warn('[AI Publishing] Gemini selection failed, deterministic fallback:', err);
    return candidates[0];
  }
}

async function generateNewContent(userId: string, policy: AiPublishingPolicy): Promise<any | null> {
  if (!policy.actions.createNew || !isGeminiConfigured()) return null;
  const db = getAdminDb();
  const mediaSnapshot = await db.collection('media').where('userId', '==', userId).limit(60).get();
  const images = mediaSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() as any }))
    .filter((item: any) => item.mediaType === 'image' && (item.downloadUrl || item.publicUrl));
  if (!images.length) return null;
  images.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const chosenMedia: any = images[0];
  const pillar = policy.pillars.find(value => value !== 'unclassified') || 'sales';
  try {
    const generated = await createGeminiJsonResponse<{ title: string; caption: string }>(
      [
        'Bạn viết content ngắn cho The Luvin, thương hiệu quà tặng cá nhân hóa tại Việt Nam.',
        `Nhóm nội dung: ${pillar}.`,
        'Viết tự nhiên, không phô như quảng cáo máy móc. Không bịa ưu đãi, giá, review hoặc thông tin sản phẩm không được cung cấp.',
        'Caption tối đa khoảng 500 ký tự.',
      ].join('\n'),
      `Hãy tạo 1 bài mới để dùng với một ảnh có sẵn trong thư viện. Không biết nội dung cụ thể của ảnh, vì vậy caption phải đủ linh hoạt và không mô tả chi tiết hình ảnh chưa được cung cấp.`,
      {
        maxOutputTokens: 700,
        repairAttempts: 1,
        jsonSchema: {
          name: 'new_social_content',
          schema: {
            type: 'object',
            properties: { title: { type: 'string' }, caption: { type: 'string' } },
            required: ['title', 'caption'],
          },
        },
      }
    );
    return {
      id: `ai-generated-${Date.now()}`,
      title: generated.title,
      message: generated.caption,
      pillar,
      generated: true,
      media: [{
        public_url: chosenMedia.downloadUrl || chosenMedia.publicUrl,
        media_type: 'image',
        file_name: chosenMedia.fileName || 'AI selected image',
        storage_path: chosenMedia.storagePath || null,
      }],
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[AI Publishing] Cannot generate new content:', err);
    return null;
  }
}

async function appendActivity(userRef: any, activity: any) {
  const snapshot = await userRef.get();
  const existing = Array.isArray(snapshot.data()?.aiPublishingActivity) ? snapshot.data()!.aiPublishingActivity : [];
  await userRef.set({
    aiPublishingActivity: [activity, ...existing].slice(0, 100),
    aiPublishingLastRunAt: new Date().toISOString(),
  }, { merge: true });
}

async function runAiPublishingAutomationForUser(
  userId: string,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<AiPublishingRunResult> {
  const db = getAdminDb();
  const now = options.now || new Date();
  const userRef = db.collection('users').doc(userId);
  const userSnapshot = await userRef.get();
  const policy = normalizeAiPublishingPolicy(userSnapshot.data()?.aiPublishingPolicy || {});
  if (!isPolicyActiveNow(policy, now)) {
    return { userId, success: true, skipped: 'AI publishing policy chưa hoạt động ở thời điểm hiện tại.' };
  }

  const pageSnapshot = await db.collection('facebookPages').where('userId', '==', userId).limit(50).get();
  const pageDocs = pageSnapshot.docs.filter(doc => {
    const data: any = doc.data();
    return data?.backgroundAutomation?.enabled && data?.backgroundAutomation?.encryptedPageAccessToken && (!policy.pageId || data.pageId === policy.pageId || doc.id === policy.pageId);
  });
  const pageDoc = pageDocs[0];
  if (!pageDoc) return { userId, success: false, skipped: 'Không có Page đã bật chạy nền để AI đăng bài.' };
  const page: any = pageDoc.data();
  const pageId = String(page.pageId || '');
  const token = decryptBackgroundPageToken(String(page.backgroundAutomation.encryptedPageAccessToken));
  const version = String(page.graphApiVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');

  const localDay = localDateKey(now, policy.timezoneOffsetHours);
  const classifications = userSnapshot.data()?.aiContentClassifications && typeof userSnapshot.data()?.aiContentClassifications === 'object' ? userSnapshot.data()!.aiContentClassifications : {};
  const activity = Array.isArray(userSnapshot.data()?.aiPublishingActivity) ? userSnapshot.data()!.aiPublishingActivity : [];
  const today = activity.filter((item: any) => item?.localDay === localDay && item?.success === true);
  const feedCount = today.filter((item: any) => item?.kind === 'feed').length;
  const storyCount = today.filter((item: any) => item?.kind === 'story').length;
  const lastSuccessful = activity.find((item: any) => item?.success === true && item?.createdAt);
  if (lastSuccessful) {
    const lastMs = new Date(lastSuccessful.createdAt).getTime();
    if (Number.isFinite(lastMs) && now.getTime() - lastMs < policy.minIntervalMinutes * 60_000) {
      return { userId, success: true, skipped: `Chưa đủ khoảng nghỉ ${policy.minIntervalMinutes} phút giữa hai lần AI tự đăng.` };
    }
  }

  const contentSnapshot = await db.collection('contents').where('userId', '==', userId).limit(300).get();
  let candidates = contentSnapshot.docs
    .map(doc => {
      const data: any = doc.data();
      const override = classifications[doc.id] || (data.facebookPostId ? classifications[String(data.facebookPostId)] : null) || (data.instagramPostId ? classifications[String(data.instagramPostId)] : null);
      return { id: doc.id, ...data, pillar: override || data.pillar || data.contentPillar || 'unclassified' };
    })
    .filter((item: any) => item.status === 'published' && isContentEligibleByCooldown(item, policy, now));
  candidates.sort((a: any, b: any) => {
    const aTime = new Date(a.aiLastRepostedAt || a.facebookCreatedTime || a.publishedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.aiLastRepostedAt || b.facebookCreatedTime || b.publishedAt || b.createdAt || 0).getTime();
    return aTime - bTime;
  });

  let selected = policy.actions.repostExisting ? await chooseCandidateWithAi(candidates, policy) : null;
  let generated = false;
  if (!selected && policy.actions.createNew) {
    selected = await generateNewContent(userId, policy);
    generated = Boolean(selected);
  }
  if (!selected) return { userId, success: true, skipped: 'Không có nội dung đủ điều kiện theo policy/cooldown.' };

  const media = asPublicMedia(selected);
  const image = media.find(item => item.media_type === 'image');
  const feed: Record<string, string> = {};
  const story: Record<string, string> = {};
  const errors: string[] = [];
  let igAccount: any = null;

  const wantsInstagram = policy.actions.instagramPost || policy.actions.instagramStory;
  if (wantsInstagram) {
    try { igAccount = await getLinkedInstagramAccount(pageId, token, version); }
    catch (err: any) { errors.push(`Instagram account: ${err?.message || err}`); }
  }

  const canFeed = feedCount < policy.dailyPostLimit && (policy.actions.facebookPost || policy.actions.instagramPost);
  const canStory = storyCount < policy.dailyStoryLimit && image && (policy.actions.facebookStory || policy.actions.instagramStory);

  if (options.dryRun) {
    return {
      userId,
      success: true,
      selectedContentId: selected.id,
      generated,
      feed: canFeed ? { planned: 'true' } : {},
      story: canStory ? { planned: 'true' } : {},
      errors,
    };
  }

  if (canFeed) {
    if (policy.actions.facebookPost) {
      try {
        const result = image
          ? await publishPhotoPost(pageId, token, String(selected.message || ''), image.public_url, version)
          : selected.link
            ? await publishLinkPost(pageId, token, String(selected.message || ''), String(selected.link), version)
            : await publishTextPost(pageId, token, String(selected.message || selected.title || ''), version);
        feed.facebook = result.facebookPostId;
      } catch (err: any) { errors.push(`Facebook feed: ${err?.message || err}`); }
    }
    if (policy.actions.instagramPost) {
      if (!image) errors.push('Instagram feed: bài được chọn không có ảnh.');
      else if (!igAccount?.id) errors.push('Instagram feed: Page chưa liên kết Instagram Professional account.');
      else {
        try { feed.instagram = await publishInstagramImagePost(igAccount.id, token, image.public_url, String(selected.message || ''), version); }
        catch (err: any) { errors.push(`Instagram feed: ${err?.message || err}`); }
      }
    }
    if (Object.keys(feed).length) {
      await appendActivity(userRef, {
        id: crypto.randomBytes(8).toString('hex'),
        kind: 'feed',
        localDay,
        contentId: selected.id,
        generated,
        channels: Object.keys(feed),
        platformIds: feed,
        success: true,
        createdAt: now.toISOString(),
      });
    }
  }

  if (canStory && image) {
    if (policy.actions.facebookStory) {
      try { story.facebook = (await publishFacebookStory(pageId, token, image.public_url, 'image', version)).id; }
      catch (err: any) { errors.push(`Facebook Story: ${err?.message || err}`); }
    }
    if (policy.actions.instagramStory) {
      if (!igAccount?.id) errors.push('Instagram Story: Page chưa liên kết Instagram Professional account.');
      else {
        try { story.instagram = (await publishInstagramStory(igAccount.id, token, image.public_url, 'image', version)).id; }
        catch (err: any) { errors.push(`Instagram Story: ${err?.message || err}`); }
      }
    }
    if (Object.keys(story).length) {
      await appendActivity(userRef, {
        id: crypto.randomBytes(8).toString('hex'),
        kind: 'story',
        localDay,
        contentId: selected.id,
        generated,
        channels: Object.keys(story),
        platformIds: story,
        success: true,
        createdAt: now.toISOString(),
      });
    }
  }

  if (!generated && (Object.keys(feed).length || Object.keys(story).length)) {
    await db.collection('contents').doc(String(selected.id)).set({
      aiLastRepostedAt: now.toISOString(),
      aiRepostCount: Number(selected.aiRepostCount || 0) + 1,
      updatedAt: now.toISOString(),
    }, { merge: true });
  }

  if (generated && (Object.keys(feed).length || Object.keys(story).length)) {
    const newId = crypto.randomBytes(12).toString('hex');
    await db.collection('contents').doc(newId).set({
      userId,
      facebookPageId: pageId,
      title: selected.title || 'AI content',
      message: selected.message || '',
      link: null,
      pillar: selected.pillar || 'unclassified',
      contentType: image ? 'photo' : 'text',
      status: 'published',
      media: selected.media || [],
      facebookPostId: feed.facebook || null,
      instagramPostId: feed.instagram || null,
      facebookCreatedTime: now.toISOString(),
      publishedAt: now.toISOString(),
      source: 'ai',
      aiGenerated: true,
      aiLastRepostedAt: now.toISOString(),
      aiRepostCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  if (!Object.keys(feed).length && !Object.keys(story).length) {
    await appendActivity(userRef, {
      id: crypto.randomBytes(8).toString('hex'),
      kind: 'error', localDay, contentId: selected.id, generated,
      success: false, errors, createdAt: now.toISOString(),
    });
    return { userId, success: false, selectedContentId: selected.id, generated, feed, story, errors };
  }

  return { userId, success: true, selectedContentId: selected.id, generated, feed, story, errors };
}

async function runAllAiPublishingAutomations(limit = 20): Promise<AiPublishingRunResult[]> {
  const db = getAdminDb();
  const users = await db.collection('users').limit(Math.max(1, Math.min(limit, 100))).get();
  const results: AiPublishingRunResult[] = [];
  for (const doc of users.docs) {
    const policy = normalizeAiPublishingPolicy(doc.data()?.aiPublishingPolicy || {});
    if (!policy.enabled) continue;
    try { results.push(await runAiPublishingAutomationForUser(doc.id)); }
    catch (err: any) {
      results.push({ userId: doc.id, success: false, errors: [err?.message || 'AI publishing failed'] });
    }
  }
  return results;
}

// ---- AI control endpoints ----
async function ownedPages(user: any) {
  return queryDocuments<any>(user.idToken, 'facebookPages', [{ field: 'userId', value: user.id }], 50);
}

function pageTokenForRequest(req: Request, page: any): string {
  const background = page?.backgroundAutomation;
  if (background?.enabled && background?.encryptedPageAccessToken) {
    try { return decryptBackgroundPageToken(String(background.encryptedPageAccessToken)); } catch {}
  }
  const encrypted = String(page?.encryptedPageAccessToken || '');
  if (!encrypted) throw new Error('Page chưa có Access Token. Hãy kết nối lại Facebook.');
  return decryptToken(encrypted, getVaultKeyFromRequest(req, true));
}

function inPeriod(value: any, since: number) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time >= since;
}

backgroundAutomationRouter.get('/ai/policy', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const doc = await getDocument<any>(user.idToken, 'users', user.id);
    return res.json({ policy: normalizeAiPublishingPolicy(doc?.data?.aiPublishingPolicy || {}) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Không đọc được quyền AI.' });
  }
});

backgroundAutomationRouter.put('/ai/policy', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const now = new Date().toISOString();
    const policy = normalizeAiPublishingPolicy({ ...(req.body || {}), updatedAt: now });
    await setDocument(user.idToken, 'users', user.id, {
      uid: user.id,
      email: user.email || null,
      aiPublishingPolicy: policy,
      updatedAt: now,
    }, true);
    return res.json({ success: true, policy });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Không lưu được quyền AI.' });
  }
});

backgroundAutomationRouter.get('/ai/activity', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const doc = await getDocument<any>(user.idToken, 'users', user.id);
    const activity = Array.isArray(doc?.data?.aiPublishingActivity) ? doc!.data.aiPublishingActivity.slice(0, 50) : [];
    return res.json({ activity, lastRunAt: doc?.data?.aiPublishingLastRunAt || null });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Không đọc được lịch sử AI.' });
  }
});

backgroundAutomationRouter.post('/ai/run-now', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const result = await runAiPublishingAutomationForUser(user.id, { dryRun: Boolean(req.body?.dryRun) });
    return res.status(result.success ? 200 : 400).json({ success: result.success, result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Không chạy được AI publishing.' });
  }
});


backgroundAutomationRouter.put('/ai/classification', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const contentKey = String(req.body?.contentKey || '').trim();
    const pillar = String(req.body?.pillar || '').trim();
    const allowed = new Set(['sales','branding','feedback','value','engagement','campaign','behind_the_scenes','advertising','unclassified']);
    if (!contentKey) return res.status(400).json({ error: 'Thiếu contentKey.' });
    if (!allowed.has(pillar)) return res.status(400).json({ error: 'Nhóm nội dung không hợp lệ.' });
    const doc = await getDocument<any>(user.idToken, 'users', user.id);
    const current = doc?.data?.aiContentClassifications && typeof doc.data.aiContentClassifications === 'object'
      ? doc.data.aiContentClassifications
      : {};
    const next = { ...current, [contentKey]: pillar };
    await setDocument(user.idToken, 'users', user.id, {
      uid: user.id,
      aiContentClassifications: next,
      updatedAt: new Date().toISOString(),
    }, true);
    return res.json({ success: true, contentKey, pillar });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Không lưu được phân loại nội dung.' });
  }
});

backgroundAutomationRouter.get('/ai/analytics', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const days = Number(req.query.days) === 30 ? 30 : 7;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const pages = await ownedPages(user);
    const requestedPageId = String(req.query.page_id || '').trim();
    const pageRecord = pages.find(page => page.id === requestedPageId || page.data.pageId === requestedPageId) || pages[0];
    if (!pageRecord) return res.json({ page: null, totals: {}, facebookPosts: [], instagramPosts: [], stories: [], warnings: ['Chưa kết nối Facebook Page.'] });

    const page: any = pageRecord.data;
    const token = pageTokenForRequest(req, page);
    const version = String(page.graphApiVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');
    const pageId = String(page.pageId || '');
    const userDoc = await getDocument<any>(user.idToken, 'users', user.id);
    const classifications = userDoc?.data?.aiContentClassifications && typeof userDoc.data.aiContentClassifications === 'object' ? userDoc.data.aiContentClassifications : {};
    const warnings: string[] = [];
    const facebookPosts: any[] = [];
    const instagramPosts: any[] = [];
    const stories: any[] = [];

    try {
      const livePosts = (await getPagePosts(pageId, token, 25, version)).filter(post => inPeriod(post.created_time, since)).slice(0, 15);
      for (const post of livePosts) {
        const metrics = await getFacebookPostMetrics(post.id, token, version);
        facebookPosts.push({
          id: post.id,
          contentKey: post.id,
          platform: 'facebook',
          title: String(post.message || post.story || 'Bài Facebook').slice(0, 100),
          message: post.message || post.story || '',
          thumbnail: post.full_picture || post.attachments?.data?.[0]?.media?.image?.src || null,
          permalink: post.permalink_url || null,
          createdAt: post.created_time,
          metrics,
          classification: classifications[post.id] || 'unclassified',
        });
      }
    } catch (err: any) {
      warnings.push(`Facebook posts: ${err?.message || 'không tải được insights'}`);
    }

    try {
      const ig = await getLinkedInstagramAccount(pageId, token, version);
      if (ig?.id) {
        const data = await listInstagramMedia(ig.id, token, version, 25);
        const recent = (data?.data || []).filter((item: any) => inPeriod(item.timestamp, since)).slice(0, 15);
        for (const item of recent) {
          const metrics = await getInstagramMediaMetrics(String(item.id), token, version);
          instagramPosts.push({
            id: String(item.id),
            contentKey: String(item.id),
            platform: 'instagram',
            title: String(item.caption || 'Instagram').slice(0, 100),
            message: item.caption || '',
            thumbnail: item.thumbnail_url || item.media_url || null,
            permalink: item.permalink || null,
            createdAt: item.timestamp,
            mediaType: item.media_type,
            productType: item.media_product_type,
            metrics,
            classification: classifications[String(item.id)] || 'unclassified',
          });
        }
      }
    } catch (err: any) {
      warnings.push(`Instagram posts: ${err?.message || 'không tải được insights'}`);
    }

    try {
      const storyRecords = await queryDocuments<any>(user.idToken, 'stories', [{ field: 'userId', value: user.id }], 200);
      const recentStories = storyRecords
        .map(record => ({ id: record.id, ...record.data }))
        .filter((item: any) => item.facebookPageId === pageId && inPeriod(item.publishedAt || item.createdAt, since) && item.status === 'published')
        .sort((a: any, b: any) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime())
        .slice(0, 30);
      for (const item of recentStories) {
        const platformIds = item.platformPostIds || {};
        if (platformIds.facebook) {
          const metrics = await getFacebookPostMetrics(String(platformIds.facebook), token, version);
          stories.push({ id: `${item.id}-facebook`, contentKey: String(platformIds.facebook), recordId: item.id, platform: 'facebook', title: item.title || 'Facebook Story', createdAt: item.publishedAt || item.createdAt, mediaUrl: item.mediaUrl, metrics, classification: classifications[String(platformIds.facebook)] || classifications[item.id] || 'unclassified' });
        }
        if (platformIds.instagram) {
          const metrics = await getInstagramMediaMetrics(String(platformIds.instagram), token, version);
          stories.push({ id: `${item.id}-instagram`, contentKey: String(platformIds.instagram), recordId: item.id, platform: 'instagram', title: item.title || 'Instagram Story', createdAt: item.publishedAt || item.createdAt, mediaUrl: item.mediaUrl, metrics, classification: classifications[String(platformIds.instagram)] || classifications[item.id] || 'unclassified' });
        }
      }
    } catch (err: any) {
      warnings.push(`Stories: ${err?.message || 'không tải được insights'}`);
    }

    const feedMetrics = [...facebookPosts, ...instagramPosts].map(item => item.metrics as NormalizedContentMetrics);
    const storyMetrics = stories.map(item => item.metrics as NormalizedContentMetrics);
    return res.json({
      page: { id: pageRecord.id, pageId, pageName: page.pageName || 'Facebook Page' },
      periodDays: days,
      totals: {
        feed: sumMetrics(feedMetrics),
        story: sumMetrics(storyMetrics),
        all: sumMetrics([...feedMetrics, ...storyMetrics]),
      },
      facebookPosts,
      instagramPosts,
      stories,
      warnings,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(Number(err?.status) || 500).json({ error: err?.message || 'Không tải được analytics Meta.' });
  }
});


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
      note: 'Cron nền xử lý Messenger, Story hẹn giờ và AI Publishing. AI Publishing vẫn bị chặn bởi policy người dùng.',
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
    const limit = Number(req.body?.limit) || 20;
    const dryRun = Boolean(req.body?.dryRun);
    const [messengerResults, storyResults, aiPublishingResults] = await Promise.all([
      runAllBackgroundMessengerAutomations({ dryRun, limit }),
      dryRun ? Promise.resolve([]) : runScheduledStoryAutomation(limit),
      dryRun ? Promise.resolve([]) : runAllAiPublishingAutomations(limit),
    ]);
    return res.json({
      success: true,
      pages: messengerResults.length,
      sent: messengerResults.reduce((sum, item) => sum + (item.result.sent || 0), 0),
      detected: messengerResults.reduce((sum, item) => sum + (item.result.detected || 0), 0),
      reminders: messengerResults.reduce((sum, item) => sum + (item.result.reminders || 0), 0),
      failed: messengerResults.filter(item => !item.result.success).length,
      results: messengerResults,
      stories: {
        processed: storyResults.length,
        published: storyResults.filter((item: any) => item.success).length,
        failed: storyResults.filter((item: any) => !item.success).length,
        results: storyResults,
      },
      aiPublishing: {
        processed: aiPublishingResults.length,
        successful: aiPublishingResults.filter((item: any) => item.success && !item.skipped).length,
        skipped: aiPublishingResults.filter((item: any) => Boolean(item.skipped)).length,
        failed: aiPublishingResults.filter((item: any) => !item.success).length,
        results: aiPublishingResults,
      },
      ranAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Cron automation thất bại.' });
  }
});

let loopStarted = false;
export function startBackgroundAutomationLoop() {
  if (loopStarted || String(process.env.AUTOMATION_INTERNAL_LOOP || '').toLowerCase() !== 'true') return;
  loopStarted = true;
  const intervalMs = Math.max(60_000, Number(process.env.AUTOMATION_INTERNAL_LOOP_MS) || 120_000);
  const tick = async () => {
    try {
      await Promise.all([
        runAllBackgroundMessengerAutomations({ limit: 20 }),
        runScheduledStoryAutomation(20),
        runAllAiPublishingAutomations(20),
      ]);
    } catch (err) {
      console.error('[Background Automation Loop]', err);
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, intervalMs).unref?.();
}
