import { Router, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { getDocument, queryDocuments, setDocument } from '../services/firebaseRest.js';
import { decryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest, resolveMetaConfig } from '../services/meta/metaConfigService.js';
import {
  deleteInstagramComment,
  getInstagramConversation,
  getLinkedInstagramAccount,
  InstagramGraphError,
  listInstagramComments,
  listInstagramConversations,
  listInstagramMedia,
  replyInstagramComment,
  sendInstagramText,
} from '../services/meta/instagramService.js';
import { DEFAULT_CUSTOMER_CRM, mergeCustomerCRM, normalizeCustomerCRM, type CustomerCRMContactData } from '../services/crm/customerCrmService.js';

export const instagramRouter = Router();

const REQUIRED_BASE = ['pages_show_list', 'pages_read_engagement', 'instagram_basic'];
const REQUIRED_COMMENTS = [...REQUIRED_BASE, 'instagram_manage_comments'];
const REQUIRED_MESSAGES = ['pages_manage_metadata', 'instagram_basic', 'instagram_manage_messages'];

type InstagramCustomerStatus = 'new' | 'interested' | 'quoted' | 'waiting' | 'ordered' | 'delivered' | 'closed';
interface InstagramCustomerMeta {
  tags: string[];
  note: string;
  starred: boolean;
  status: InstagramCustomerStatus;
  crm: CustomerCRMContactData;
  updatedAt?: string | null;
}
const DEFAULT_IG_META: InstagramCustomerMeta = {
  tags: [], note: '', starred: false, status: 'new', crm: DEFAULT_CUSTOMER_CRM, updatedAt: null,
};
const IG_STATUS = new Set<InstagramCustomerStatus>(['new','interested','quoted','waiting','ordered','delivered','closed']);
function normalizeInstagramMeta(raw: any): InstagramCustomerMeta {
  return {
    tags: Array.isArray(raw?.tags) ? raw.tags.map((v: any) => String(v).trim()).filter(Boolean).slice(0, 12) : [],
    note: String(raw?.note || '').slice(0, 4000),
    starred: Boolean(raw?.starred),
    status: IG_STATUS.has(String(raw?.status) as InstagramCustomerStatus) ? raw.status : 'new',
    crm: normalizeCustomerCRM(raw?.crm),
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null,
  };
}
function instagramContactKey(accountId: string, customerId: string) { return `${accountId}_${customerId}`; }
async function getInstagramContactsMap(user: any): Promise<Record<string, InstagramCustomerMeta>> {
  const userDoc = await getDocument<any>(user.idToken, 'users', user.id);
  return userDoc?.data?.instagramContacts && typeof userDoc.data.instagramContacts === 'object' ? userDoc.data.instagramContacts : {};
}
function conversationCustomerId(conversation: any, accountId: string) {
  const participants = Array.isArray(conversation?.participants?.data) ? conversation.participants.data : [];
  return String(participants.find((p: any) => String(p?.id || '') !== String(accountId))?.id || participants[0]?.id || '');
}


async function getOwnedPages(user: any) {
  return queryDocuments<any>(user.idToken, 'facebookPages', [{ field: 'userId', value: user.id }], 50);
}

async function resolvePageRuntime(req: Request, pageIdOrDocId: string) {
  const user = await authenticateRequest(req);
  if (!user) throw Object.assign(new Error('Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.'), { status: 401 });

  const pages = await getOwnedPages(user);
  const page = pages.find(item => item.id === pageIdOrDocId || item.data.id === pageIdOrDocId || item.data.pageId === pageIdOrDocId);
  if (!page) throw Object.assign(new Error('Không tìm thấy Facebook Page đã kết nối.'), { status: 404 });

  const vaultKey = getVaultKeyFromRequest(req, true);
  let pageToken = '';
  try {
    pageToken = decryptToken(String(page.data.encryptedPageAccessToken || ''), vaultKey);
  } catch {
    throw Object.assign(new Error('Không giải mã được Page Access Token. Hãy kết nối lại Meta.'), { status: 400 });
  }

  const metaConfig = await resolveMetaConfig(user, '', false);
  return {
    user,
    page,
    pageId: String(page.data.pageId || pageIdOrDocId),
    pageName: String(page.data.pageName || 'Facebook Page'),
    pageToken,
    graphApiVersion: String(page.data.graphApiVersion || metaConfig.graphApiVersion || 'v23.0'),
  };
}

function sendError(res: Response, err: any, fallback: string, requiredPermissions: string[] = REQUIRED_BASE) {
  console.error('[Instagram API]', err);
  if (err instanceof InstagramGraphError) {
    return res.status(err.status === 401 ? 401 : 400).json({
      success: false,
      error: err.message || fallback,
      code: err.code || null,
      subcode: err.subcode || null,
      requiredPermissions,
      reconnectRequired: true,
    });
  }
  return res.status(Number(err?.status) || 500).json({ success: false, error: err?.message || fallback, requiredPermissions });
}

instagramRouter.get('/:pageId/account', async (req: Request, res: Response) => {
  try {
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const account = await getLinkedInstagramAccount(runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
    res.json({ success: true, linked: Boolean(account), account, page: { pageId: runtime.pageId, pageName: runtime.pageName } });
  } catch (err: any) {
    sendError(res, err, 'Không thể kiểm tra Instagram Professional account.');
  }
});

instagramRouter.get('/:pageId/media', async (req: Request, res: Response) => {
  try {
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const account = await getLinkedInstagramAccount(runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
    if (!account) return res.status(404).json({ success: false, error: 'Facebook Page này chưa liên kết Instagram Professional account.' });
    const data = await listInstagramMedia(account.id, runtime.pageToken, runtime.graphApiVersion, Number(req.query.limit || 30));
    res.json({ success: true, account, media: data?.data || [], paging: data?.paging || null });
  } catch (err: any) {
    sendError(res, err, 'Không thể tải bài viết Instagram.');
  }
});

instagramRouter.get('/:pageId/media/:mediaId/comments', async (req: Request, res: Response) => {
  try {
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const data = await listInstagramComments(req.params.mediaId, runtime.pageToken, runtime.graphApiVersion, Number(req.query.limit || 50));
    res.json({ success: true, comments: data?.data || [], paging: data?.paging || null });
  } catch (err: any) {
    sendError(res, err, 'Không thể tải bình luận Instagram.', REQUIRED_COMMENTS);
  }
});

instagramRouter.post('/:pageId/comments/:commentId/replies', async (req: Request, res: Response) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, error: 'Vui lòng nhập nội dung trả lời.' });
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const data = await replyInstagramComment(req.params.commentId, message, runtime.pageToken, runtime.graphApiVersion);
    res.json({ success: true, id: data?.id || null });
  } catch (err: any) {
    sendError(res, err, 'Không thể trả lời bình luận Instagram.', REQUIRED_COMMENTS);
  }
});

instagramRouter.delete('/:pageId/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const data = await deleteInstagramComment(req.params.commentId, runtime.pageToken, runtime.graphApiVersion);
    res.json({ success: data?.success !== false });
  } catch (err: any) {
    sendError(res, err, 'Không thể xóa bình luận Instagram.', REQUIRED_COMMENTS);
  }
});

instagramRouter.get('/:pageId/conversations', async (req: Request, res: Response) => {
  try {
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const account = await getLinkedInstagramAccount(runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
    if (!account) return res.status(404).json({ success: false, error: 'Page này chưa liên kết Instagram Professional account.' });
    const [data, contactsMap] = await Promise.all([
      listInstagramConversations(runtime.pageId, runtime.pageToken, runtime.graphApiVersion, Number(req.query.limit || 30)),
      getInstagramContactsMap(runtime.user),
    ]);
    const conversations = (data?.data || []).map((item: any) => {
      const customerId = conversationCustomerId(item, account.id);
      const customerMeta = customerId ? normalizeInstagramMeta(contactsMap[instagramContactKey(account.id, customerId)] || DEFAULT_IG_META) : DEFAULT_IG_META;
      return { ...item, customerMeta };
    });
    res.json({ success: true, account, conversations, paging: data?.paging || null });
  } catch (err: any) {
    sendError(res, err, 'Không thể tải Instagram Inbox.', REQUIRED_MESSAGES);
  }
});

instagramRouter.get('/:pageId/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const [data, account, contactsMap] = await Promise.all([
      getInstagramConversation(req.params.conversationId, runtime.pageToken, runtime.graphApiVersion),
      getLinkedInstagramAccount(runtime.pageId, runtime.pageToken, runtime.graphApiVersion),
      getInstagramContactsMap(runtime.user),
    ]);
    const customerId = account ? conversationCustomerId(data, account.id) : '';
    const customerMeta = account && customerId ? normalizeInstagramMeta(contactsMap[instagramContactKey(account.id, customerId)] || DEFAULT_IG_META) : DEFAULT_IG_META;
    res.json({ success: true, conversation: { ...data, customerMeta } });
  } catch (err: any) {
    sendError(res, err, 'Không thể tải nội dung cuộc trò chuyện Instagram.', REQUIRED_MESSAGES);
  }
});


instagramRouter.put('/:pageId/customer-meta', async (req: Request, res: Response) => {
  try {
    const customerId = String(req.body?.customerId || '').trim();
    if (!customerId) return res.status(400).json({ success: false, error: 'Thiếu Instagram customerId.' });
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const account = await getLinkedInstagramAccount(runtime.pageId, runtime.pageToken, runtime.graphApiVersion);
    if (!account) return res.status(404).json({ success: false, error: 'Page này chưa liên kết Instagram Professional account.' });

    const contactsMap = await getInstagramContactsMap(runtime.user);
    const key = instagramContactKey(account.id, customerId);
    const current = normalizeInstagramMeta(contactsMap[key] || DEFAULT_IG_META);
    const incoming = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
    const now = new Date().toISOString();
    const nextStatus = Object.prototype.hasOwnProperty.call(incoming, 'status') && IG_STATUS.has(String(incoming.status) as InstagramCustomerStatus)
      ? String(incoming.status) as InstagramCustomerStatus
      : current.status;
    const nextCrm = mergeCustomerCRM(current.crm, incoming?.crm || {}, {
      now, oldStatus: current.status, newStatus: nextStatus,
      noteChanged: Object.prototype.hasOwnProperty.call(incoming, 'note') && String(incoming.note || '') !== current.note,
    });
    const next = normalizeInstagramMeta({ ...current, ...incoming, status: nextStatus, crm: nextCrm, updatedAt: now });
    await setDocument(runtime.user.idToken, 'users', runtime.user.id, {
      instagramContacts: { ...contactsMap, [key]: next },
      updatedAt: now,
    }, true);
    res.json({ success: true, meta: next });
  } catch (err: any) {
    sendError(res, err, 'Không thể lưu CRM khách Instagram.', REQUIRED_MESSAGES);
  }
});

instagramRouter.post('/:pageId/messages', async (req: Request, res: Response) => {
  try {
    const recipientId = String(req.body?.recipientId || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!recipientId || !message) return res.status(400).json({ success: false, error: 'Thiếu người nhận hoặc nội dung tin nhắn.' });
    const runtime = await resolvePageRuntime(req, req.params.pageId);
    const data = await sendInstagramText(runtime.pageId, recipientId, message, runtime.pageToken, runtime.graphApiVersion);
    res.json({ success: true, messageId: data?.message_id || null, recipientId: data?.recipient_id || recipientId });
  } catch (err: any) {
    sendError(res, err, 'Không thể gửi tin nhắn Instagram.', REQUIRED_MESSAGES);
  }
});
