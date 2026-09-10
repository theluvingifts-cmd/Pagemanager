import { getGraphBaseUrl } from './metaOAuthService.js';

export type MessengerAttachmentType = 'image' | 'video' | 'audio' | 'file' | 'share' | 'unknown';

export interface MessengerAttachment {
  id?: string | null;
  type: MessengerAttachmentType;
  url: string | null;
  previewUrl: string | null;
  name: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface MessengerParticipant {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface MessengerMessage {
  id: string;
  text: string;
  createdTime: string | null;
  fromId: string | null;
  fromName: string | null;
  toIds: string[];
  isFromPage: boolean;
  attachments: MessengerAttachment[];
}

export interface MessengerConversationSummary {
  id: string;
  link: string | null;
  updatedTime: string | null;
  customer: MessengerParticipant | null;
  lastMessage: MessengerMessage | null;
}

export interface MessengerConversationDetail extends MessengerConversationSummary {
  participants: MessengerParticipant[];
  messages: MessengerMessage[];
  lastInboundAt: string | null;
  within24h: boolean | null;
}

export class MessengerGraphError extends Error {
  code?: number;
  subcode?: number;
  type?: string;
  status?: number;
  raw?: any;

  constructor(message: string, options: { code?: number; subcode?: number; type?: string; status?: number; raw?: any } = {}) {
    super(message);
    this.name = 'MessengerGraphError';
    this.code = options.code;
    this.subcode = options.subcode;
    this.type = options.type;
    this.status = options.status;
    this.raw = options.raw;
  }
}

function getFriendlyGraphMessage(error: any, fallback = 'Meta Messenger API trả về lỗi.') {
  const message = String(error?.message || fallback);
  const code = Number(error?.code || 0);

  if (code === 10 || code === 200 || /permission|permissions|pages_messaging|pages_manage_metadata/i.test(message)) {
    return 'Thiếu quyền Messenger. Cần pages_messaging, pages_manage_metadata và pages_read_engagement. Hãy thêm quyền trong Meta Developer rồi kết nối lại Facebook.';
  }

  if (/24 hour|24-hour|outside.*window|messaging window/i.test(message)) {
    return 'Không thể gửi tin nhắn vì hội thoại đang ngoài cửa sổ nhắn tin 24 giờ của Messenger.';
  }

  if (/invalid oauth|access token|expired|session/i.test(message)) {
    return 'Page Access Token không còn hợp lệ. Hãy kết nối lại Facebook Page.';
  }

  return message;
}

async function parseGraphResponse(response: Response): Promise<any> {
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    const text = await response.text().catch(() => '');
    throw new MessengerGraphError(text || `Meta API lỗi HTTP ${response.status}`, { status: response.status });
  }

  if (!response.ok || data?.error) {
    const graphError = data?.error || data || {};
    throw new MessengerGraphError(getFriendlyGraphMessage(graphError), {
      code: graphError.code,
      subcode: graphError.error_subcode,
      type: graphError.type,
      status: response.status,
      raw: data,
    });
  }

  return data;
}

async function graphGet(path: string, pageAccessToken: string, graphApiVersion?: string): Promise<any> {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}${path}`, {
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      Accept: 'application/json',
    },
  });
  return parseGraphResponse(response);
}

async function graphGetAbsolute(url: string, pageAccessToken: string): Promise<any> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'graph.facebook.com') {
    throw new MessengerGraphError('Meta trả về URL phân trang không hợp lệ.');
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      Accept: 'application/json',
    },
  });
  return parseGraphResponse(response);
}

async function graphPost(path: string, pageAccessToken: string, body: any, graphApiVersion?: string): Promise<any> {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  return parseGraphResponse(response);
}

function normalizeParticipant(value: any): MessengerParticipant | null {
  if (!value?.id) return null;
  return {
    id: String(value.id),
    name: String(value.name || 'Khách Messenger'),
    avatarUrl: value?.avatarUrl || value?.profile_pic || value?.picture?.data?.url || null,
  };
}

function inferAttachmentType(raw: any): MessengerAttachmentType {
  const explicit = String(raw?.type || raw?.mime_type || raw?.mimeType || '').toLowerCase();
  const mime = String(raw?.mime_type || raw?.mimeType || '').toLowerCase();
  if (explicit.includes('image') || mime.startsWith('image/')) return 'image';
  if (explicit.includes('video') || mime.startsWith('video/')) return 'video';
  if (explicit.includes('audio') || mime.startsWith('audio/')) return 'audio';
  if (explicit.includes('share')) return 'share';
  if (explicit.includes('file') || raw?.file_url || raw?.fileUrl) return 'file';
  if (raw?.image_data || raw?.imageData) return 'image';
  if (raw?.video_data || raw?.videoData) return 'video';
  return 'unknown';
}

function normalizeAttachment(raw: any): MessengerAttachment | null {
  if (!raw) return null;
  const imageData = raw.image_data || raw.imageData || {};
  const videoData = raw.video_data || raw.videoData || {};
  const audioData = raw.audio_data || raw.audioData || {};
  const fileUrl = raw.file_url || raw.fileUrl || null;
  const genericUrl = raw.url || raw.href || raw.target?.url || null;
  const url = imageData.url || videoData.url || audioData.url || fileUrl || genericUrl || null;
  const previewUrl = imageData.preview_url || imageData.previewUrl || imageData.url || videoData.preview_url || videoData.previewUrl || null;
  const type = inferAttachmentType(raw);

  if (!url && !previewUrl && type === 'unknown') return null;

  return {
    id: raw.id ? String(raw.id) : null,
    type,
    url: url ? String(url) : null,
    previewUrl: previewUrl ? String(previewUrl) : (type === 'image' && url ? String(url) : null),
    name: raw.name ? String(raw.name) : raw.filename ? String(raw.filename) : null,
    mimeType: raw.mime_type ? String(raw.mime_type) : raw.mimeType ? String(raw.mimeType) : null,
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
  };
}

function getAttachmentData(value: any): any[] {
  if (Array.isArray(value?.attachments?.data)) return value.attachments.data;
  if (Array.isArray(value?.attachments)) return value.attachments;
  if (value?.attachment) return [value.attachment];
  return [];
}

function normalizeMessage(value: any, pageId: string): MessengerMessage {
  const fromId = value?.from?.id ? String(value.from.id) : null;
  const toIds = Array.isArray(value?.to?.data)
    ? value.to.data.map((item: any) => String(item?.id || '')).filter(Boolean)
    : [];
  const attachments = getAttachmentData(value)
    .map(normalizeAttachment)
    .filter(Boolean) as MessengerAttachment[];

  return {
    id: String(value?.id || ''),
    text: String(value?.message || ''),
    createdTime: value?.created_time ? String(value.created_time) : null,
    fromId,
    fromName: value?.from?.name ? String(value.from.name) : null,
    toIds,
    isFromPage: fromId === String(pageId),
    attachments,
  };
}

function getParticipants(raw: any): MessengerParticipant[] {
  const data = Array.isArray(raw?.participants?.data) ? raw.participants.data : [];
  return data.map(normalizeParticipant).filter(Boolean) as MessengerParticipant[];
}

function deriveCustomer(pageId: string, participants: MessengerParticipant[], messages: MessengerMessage[]): MessengerParticipant | null {
  const explicit = participants.find(participant => participant.id !== String(pageId));
  if (explicit) return explicit;

  for (const message of messages) {
    if (message.fromId && message.fromId !== String(pageId)) {
      return {
        id: message.fromId,
        name: message.fromName || 'Khách Messenger',
        avatarUrl: null,
      };
    }
    const recipient = message.toIds.find(id => id !== String(pageId));
    if (recipient) return { id: recipient, name: 'Khách Messenger', avatarUrl: null };
  }

  return null;
}

const profileCache = new Map<string, { expiresAt: number; profile: MessengerParticipant }>();

async function getMessengerProfile(
  participant: MessengerParticipant,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<MessengerParticipant> {
  if (!participant?.id) return participant;
  const cacheKey = `${participant.id}`;
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...participant, ...cached.profile };

  try {
    const params = new URLSearchParams({ fields: 'id,name,picture.type(large)' });
    const data = await graphGet(`/${encodeURIComponent(participant.id)}?${params.toString()}`, pageAccessToken, graphApiVersion);
    const profile: MessengerParticipant = {
      id: String(data?.id || participant.id),
      name: String(data?.name || participant.name || 'Khách Messenger'),
      avatarUrl: data?.picture?.data?.url ? String(data.picture.data.url) : participant.avatarUrl || null,
    };
    profileCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, profile });
    return profile;
  } catch {
    try {
      const params = new URLSearchParams({ type: 'large', redirect: 'false' });
      const picture = await graphGet(`/${encodeURIComponent(participant.id)}/picture?${params.toString()}`, pageAccessToken, graphApiVersion);
      const avatarUrl = picture?.data?.url ? String(picture.data.url) : null;
      if (avatarUrl) {
        const profile = { ...participant, avatarUrl };
        profileCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, profile });
        return profile;
      }
    } catch {}

    return participant;
  }
}

async function hydrateProfiles<T extends MessengerConversationSummary>(
  conversations: T[],
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<T[]> {
  const out = [...conversations];
  const concurrency = 5;
  let cursor = 0;

  const worker = async () => {
    while (cursor < out.length) {
      const index = cursor++;
      const item = out[index];
      if (!item.customer?.id) continue;
      const customer = await getMessengerProfile(item.customer, pageAccessToken, graphApiVersion);
      out[index] = { ...item, customer } as T;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, out.length) }, () => worker()));
  return out;
}

function buildConversationSummary(raw: any, pageId: string): MessengerConversationSummary {
  const participants = getParticipants(raw);
  const rawMessages = Array.isArray(raw?.messages?.data) ? raw.messages.data : [];
  const messages = rawMessages.map((item: any) => normalizeMessage(item, pageId));
  const customer = deriveCustomer(pageId, participants, messages);
  const lastMessage = messages
    .slice()
    .sort((a, b) => new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime())[0] || null;

  return {
    id: String(raw?.id || ''),
    link: raw?.link ? String(raw.link) : null,
    updatedTime: raw?.updated_time ? String(raw.updated_time) : null,
    customer,
    lastMessage,
  };
}

const messageFields = 'id,message,from,to,created_time,attachments';

export async function listMessengerConversations(
  pageId: string,
  pageAccessToken: string,
  limit = 50,
  graphApiVersion?: string
): Promise<MessengerConversationSummary[]> {
  // The inbox historically requested limit=50. Meta caps one page around this
  // size, so when the normal inbox asks for 50 we continue paging to recover
  // older conversations. Small calls (status=1, automation=25) stay small.
  const requested = Math.max(1, Math.min(250, Number(limit) || 50));
  const targetLimit = requested === 50 ? 250 : requested;
  const pageSize = Math.min(50, targetLimit);
  const fields = `id,link,updated_time,participants,messages.limit(1){${messageFields}}`;
  const params = new URLSearchParams({ platform: 'MESSENGER', fields, limit: String(pageSize) });

  let data = await graphGet(
    `/${encodeURIComponent(pageId)}/conversations?${params.toString()}`,
    pageAccessToken,
    graphApiVersion
  );

  const rawItems: any[] = [];
  const seen = new Set<string>();

  while (data) {
    const pageItems = Array.isArray(data?.data) ? data.data : [];
    for (const item of pageItems) {
      const id = String(item?.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rawItems.push(item);
      if (rawItems.length >= targetLimit) break;
    }

    if (rawItems.length >= targetLimit) break;
    const next = String(data?.paging?.next || '').trim();
    if (!next) break;
    data = await graphGetAbsolute(next, pageAccessToken);
  }

  const conversations = rawItems
    .map((item: any) => buildConversationSummary(item, pageId))
    .filter((item: MessengerConversationSummary) => item.id)
    .sort((a: MessengerConversationSummary, b: MessengerConversationSummary) =>
      new Date(b.updatedTime || 0).getTime() - new Date(a.updatedTime || 0).getTime()
    );

  return hydrateProfiles(conversations, pageAccessToken, graphApiVersion);
}

export async function getMessengerConversation(
  conversationId: string,
  pageId: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<MessengerConversationDetail> {
  const fields = `id,link,updated_time,participants,messages.limit(100){${messageFields}}`;
  const params = new URLSearchParams({ fields });
  const raw = await graphGet(`/${encodeURIComponent(conversationId)}?${params.toString()}`, pageAccessToken, graphApiVersion);

  const participants = getParticipants(raw);
  const rawMessages: any[] = Array.isArray(raw?.messages?.data) ? [...raw.messages.data] : [];
  const seenMessageIds = new Set(rawMessages.map((item: any) => String(item?.id || '')).filter(Boolean));

  // Pull older message pages too. This removes the old hard stop at 100
  // messages while keeping a practical upper bound for one browser request.
  let nextMessagesUrl = String(raw?.messages?.paging?.next || '').trim();
  while (nextMessagesUrl && rawMessages.length < 500) {
    const page = await graphGetAbsolute(nextMessagesUrl, pageAccessToken);
    const pageItems = Array.isArray(page?.data) ? page.data : [];
    for (const item of pageItems) {
      const id = String(item?.id || '');
      if (id && seenMessageIds.has(id)) continue;
      if (id) seenMessageIds.add(id);
      rawMessages.push(item);
      if (rawMessages.length >= 500) break;
    }
    nextMessagesUrl = rawMessages.length >= 500 ? '' : String(page?.paging?.next || '').trim();
  }

  const messages = rawMessages
    .map((item: any) => normalizeMessage(item, pageId))
    .filter((item: MessengerMessage) => item.id)
    .sort((a: MessengerMessage, b: MessengerMessage) =>
      new Date(a.createdTime || 0).getTime() - new Date(b.createdTime || 0).getTime()
    );

  let customer = deriveCustomer(pageId, participants, messages);
  if (customer) customer = await getMessengerProfile(customer, pageAccessToken, graphApiVersion);
  const hydratedParticipants = participants.map(item => item.id === customer?.id ? customer : item);
  const latest = messages[messages.length - 1] || null;
  const inbound = messages.filter(message => !message.isFromPage && message.createdTime);
  const lastInboundAt = inbound.length ? inbound[inbound.length - 1].createdTime : null;
  const within24h = lastInboundAt
    ? Date.now() - new Date(lastInboundAt).getTime() <= 24 * 60 * 60 * 1000
    : null;

  return {
    id: String(raw?.id || conversationId),
    link: raw?.link ? String(raw.link) : null,
    updatedTime: raw?.updated_time ? String(raw.updated_time) : latest?.createdTime || null,
    customer,
    lastMessage: latest,
    participants: hydratedParticipants,
    messages,
    lastInboundAt,
    within24h,
  };
}

export async function sendMessengerText(
  pageId: string,
  recipientId: string,
  text: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<{ recipientId: string; messageId: string | null }> {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('Nội dung tin nhắn đang trống.');
  if (cleanText.length > 2000) throw new Error('Tin nhắn quá dài. Hãy giữ nội dung dưới 2.000 ký tự.');

  const data = await graphPost(
    `/${encodeURIComponent(pageId)}/messages`,
    pageAccessToken,
    { recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: cleanText } },
    graphApiVersion
  );

  return {
    recipientId: String(data?.recipient_id || recipientId),
    messageId: data?.message_id ? String(data.message_id) : null,
  };
}

export async function sendMessengerAttachment(
  pageId: string,
  recipientId: string,
  attachmentType: 'image' | 'video' | 'audio' | 'file',
  url: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<{ recipientId: string; messageId: string | null }> {
  if (!url) throw new Error('Thiếu URL tệp đính kèm.');
  const data = await graphPost(
    `/${encodeURIComponent(pageId)}/messages`,
    pageAccessToken,
    {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: attachmentType,
          payload: { url },
        },
      },
    },
    graphApiVersion
  );

  return {
    recipientId: String(data?.recipient_id || recipientId),
    messageId: data?.message_id ? String(data.message_id) : null,
  };
}


/**
 * Forward a local file straight to Meta Messenger without persisting it in
 * Firebase Storage (or any other application storage). The browser uploads
 * the file to our Express route, and the server immediately streams the
 * bytes onward to the Messenger Send API as multipart/form-data.
 */
export async function sendMessengerAttachmentBuffer(
  pageId: string,
  recipientId: string,
  attachmentType: 'image' | 'video' | 'audio' | 'file',
  buffer: Uint8Array,
  mimeType: string,
  filename: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<{ recipientId: string; messageId: string | null }> {
  if (!buffer || buffer.byteLength === 0) throw new Error('Tệp đính kèm đang trống.');
  if (!recipientId) throw new Error('Thiếu người nhận Messenger.');

  const form = new FormData();
  form.append('recipient', JSON.stringify({ id: recipientId }));
  form.append('messaging_type', 'RESPONSE');
  form.append(
    'message',
    JSON.stringify({
      attachment: {
        type: attachmentType,
        payload: { is_reusable: false },
      },
    })
  );

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  form.append('filedata', blob, filename || 'attachment');

  const response = await fetch(
    `${getGraphBaseUrl(graphApiVersion)}/${encodeURIComponent(pageId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        Accept: 'application/json',
      },
      body: form,
    }
  );

  const data = await parseGraphResponse(response);
  return {
    recipientId: String(data?.recipient_id || recipientId),
    messageId: data?.message_id ? String(data.message_id) : null,
  };
}

export async function markMessengerSeen(
  pageId: string,
  recipientId: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<boolean> {
  await graphPost(
    `/${encodeURIComponent(pageId)}/messages`,
    pageAccessToken,
    { recipient: { id: recipientId }, sender_action: 'mark_seen' },
    graphApiVersion
  );
  return true;
}
