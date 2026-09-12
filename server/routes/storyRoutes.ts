import { Router, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { createDocument, deleteDocument, getDocument, queryDocuments, updateDocument } from '../services/firebaseRest.js';
import { decryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest } from '../services/meta/metaConfigService.js';
import { getLinkedInstagramAccount } from '../services/meta/instagramService.js';
import { publishFacebookStory, publishInstagramStory } from '../services/meta/metaStoryService.js';
import { MetaApiError } from '../services/meta/metaError.js';
import { createGeminiJsonResponse, isGeminiConfigured } from '../services/ai/geminiService.js';

export const storyRouter = Router();
const allowedPlatforms = new Set(['facebook', 'instagram']);

async function ownedPage(user: any, id: string) {
  const pages = await queryDocuments<any>(user.idToken, 'facebookPages', [{ field: 'userId', value: user.id }], 50);
  return pages.find(p => p.id === id || p.data.pageId === id) || null;
}
async function ownedStory(user: any, id: string) {
  const item = await getDocument<any>(user.idToken, 'stories', id);
  return item && item.data.userId === user.id ? item : null;
}
function normalizePlatforms(value: any) {
  return Array.isArray(value) ? Array.from(new Set(value.map(String).filter(v => allowedPlatforms.has(v)))) : [];
}

storyRouter.get('/', async (req, res) => {
  try {
    const user = await authenticateRequest(req); if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const items = await queryDocuments<any>(user.idToken, 'stories', [{ field: 'userId', value: user.id }], 200);
    const stories = items.map(i => ({ id: i.id, ...i.data })).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json({ stories });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Không tải được Story' }); }
});

storyRouter.post('/', async (req, res) => {
  try {
    const user = await authenticateRequest(req); if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const mediaUrl = String(req.body?.mediaUrl || '').trim();
    const platforms = normalizePlatforms(req.body?.platforms);
    const page = await ownedPage(user, String(req.body?.facebookPageId || ''));
    if (!mediaUrl) return res.status(400).json({ error: 'Story bắt buộc có ảnh hoặc video.' });
    if (!page) return res.status(400).json({ error: 'Hãy chọn Facebook Page hợp lệ.' });
    if (!platforms.length) return res.status(400).json({ error: 'Hãy chọn Facebook hoặc Instagram.' });
    const scheduledAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt).toISOString() : null;
    const now = new Date().toISOString();
    const record = {
      userId: user.id, facebookPageDocId: page.id, facebookPageId: page.data.pageId,
      pageName: page.data.pageName || 'Facebook Page', title: String(req.body?.title || 'Story mới').slice(0, 100),
      caption: String(req.body?.caption || '').slice(0, 2200), mediaUrl,
      mediaType: req.body?.mediaType === 'video' ? 'video' : 'image', platforms,
      status: scheduledAt ? 'scheduled' : 'draft', scheduledAt, platformPostIds: {}, publishError: null,
      createdAt: now, updatedAt: now,
    };
    const created = await createDocument(user.idToken, 'stories', record);
    res.json({ success: true, story: { id: created.id, ...record } });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Không lưu được Story' }); }
});

storyRouter.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req); if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const story = await ownedStory(user, req.params.id); if (!story) return res.status(404).json({ error: 'Không tìm thấy Story' });
    const page = await ownedPage(user, story.data.facebookPageDocId || story.data.facebookPageId);
    if (!page) return res.status(400).json({ error: 'Page không còn kết nối.' });
    const token = decryptToken(String(page.data.encryptedPageAccessToken || ''), getVaultKeyFromRequest(req, true));
    const version = String(page.data.graphApiVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');
    const ids: Record<string, string> = {};
    const platformErrors: Record<string, string> = {};
    await updateDocument(user.idToken, 'stories', story.id, { status: 'publishing', updatedAt: new Date().toISOString() });
    if ((story.data.platforms || []).includes('facebook')) {
      try { ids.facebook = (await publishFacebookStory(String(page.data.pageId), token, story.data.mediaUrl, story.data.mediaType, version)).id; }
      catch (err: any) { platformErrors.facebook = err instanceof MetaApiError ? err.userFriendlyMessage : (err.message || 'Facebook lỗi'); }
    }
    if ((story.data.platforms || []).includes('instagram')) {
      try {
        const account = await getLinkedInstagramAccount(String(page.data.pageId), token, version);
        if (!account) platformErrors.instagram = 'Page chưa liên kết Instagram Professional account.';
        else ids.instagram = (await publishInstagramStory(account.id, token, story.data.mediaUrl, story.data.mediaType, version)).id;
      } catch (err: any) { platformErrors.instagram = err instanceof MetaApiError ? err.userFriendlyMessage : (err.message || 'Instagram lỗi'); }
    }
    if (!Object.keys(ids).length) throw new Error(Object.entries(platformErrors).map(([p, message]) => `${p === 'facebook' ? 'Facebook' : 'Instagram'}: ${message}`).join(' · '));
    const warning = Object.entries(platformErrors).map(([p, message]) => `${p === 'facebook' ? 'Facebook' : 'Instagram'}: ${message}`).join(' · ') || null;
    await updateDocument(user.idToken, 'stories', story.id, { status: 'published', platformPostIds: ids, publishedAt: new Date().toISOString(), publishError: warning, updatedAt: new Date().toISOString() });
    res.json({ success: true, platformPostIds: ids, warning });
  } catch (err: any) {
    const user = await authenticateRequest(req).catch(() => null); if (user) await updateDocument(user.idToken, 'stories', req.params.id, { status: 'failed', publishError: err.message, updatedAt: new Date().toISOString() }).catch(() => {});
    const message = err instanceof MetaApiError ? err.userFriendlyMessage : (err.message || 'Đăng Story thất bại');
    res.status(400).json({ error: message, code: err?.code || null, subcode: err?.subcode || null });
  }
});

storyRouter.delete('/:id', async (req, res) => {
  try { const user = await authenticateRequest(req); if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' }); const story = await ownedStory(user, req.params.id); if (!story) return res.status(404).json({ error: 'Không tìm thấy Story' }); await deleteDocument(user.idToken, 'stories', req.params.id); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message || 'Không xóa được Story' }); }
});

storyRouter.post('/recommendations', async (req, res) => {
  try {
    const user = await authenticateRequest(req); if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!isGeminiConfigured()) return res.status(503).json({ error: 'Chưa cấu hình GEMINI_API_KEY.' });
    const [contents, storyRecords] = await Promise.all([
      queryDocuments<any>(user.idToken, 'contents', [{ field: 'userId', value: user.id }], 100),
      queryDocuments<any>(user.idToken, 'stories', [{ field: 'userId', value: user.id }], 100),
    ]);
    const recent = contents.map(x => x.data).sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 30).map(x => ({ title: x.title, message: x.message, status: x.status, createdAt: x.createdAt, hasMedia: Boolean(x.media?.length) }));
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' }, objective: { type: 'string', enum: ['Feedback', 'Bán hàng', 'Hậu trường', 'Tương tác', 'Giá trị', 'Thương hiệu'] }, visual: { type: 'string' },
              overlayText: { type: 'string' }, cta: { type: 'string' }, bestTime: { type: 'string' }, reason: { type: 'string' },
            },
            required: ['title', 'objective', 'visual', 'overlayText', 'cta', 'bestTime', 'reason'],
          },
        },
      },
      required: ['summary', 'recommendations'],
    };
    const plan = await createGeminiJsonResponse<any>(
      'Bạn là content strategist thực chiến cho The Luvin, thương hiệu quà tặng cá nhân hóa tại Việt Nam. Tự xác định hôm nay đang thiếu nhóm nào trong: Feedback, Bán hàng, Hậu trường, Tương tác, Giá trị, Thương hiệu. summary phải mở đầu bằng "Nên ưu tiên: [nhóm]" và giải thích trong một câu dựa trên lịch sử thật. Không bịa hiệu quả. Mỗi đề xuất phải có objective là đúng một trong sáu nhóm trên. Ý tưởng phải dễ quay/chụp và bán hàng tự nhiên. Viết tiếng Việt cực ngắn.',
      `Thời điểm hiện tại: ${new Date().toISOString()}\n30 bài gần nhất:\n${JSON.stringify(recent)}\n30 Story gần nhất:\n${JSON.stringify(storyRecords.map(x => x.data).sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0,30).map(x => ({ title: x.title, status: x.status, platforms: x.platforms, createdAt: x.createdAt, publishedAt: x.publishedAt })))} `,
      { maxOutputTokens: 2200, repairAttempts: 1, jsonSchema: { name: 'story_plan', schema } }
    );
    res.json({ success: true, plan, basedOn: recent.length });
  } catch (err: any) { res.status(500).json({ error: err.message || 'AI chưa phân tích được Story' }); }
});
