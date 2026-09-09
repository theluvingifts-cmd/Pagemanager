import { getGraphBaseUrl } from './metaOAuthService.js';

export class InstagramGraphError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  type?: string;

  constructor(message: string, status = 400, code?: number, subcode?: number, type?: string) {
    super(message);
    this.name = 'InstagramGraphError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.type = type;
  }
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function graphError(data: any, status: number, fallback: string): InstagramGraphError {
  const err = data?.error || data;
  const message = String(err?.message || fallback);
  return new InstagramGraphError(message, status, Number(err?.code) || undefined, Number(err?.error_subcode) || undefined, err?.type);
}

async function graphGet(path: string, accessToken: string, graphApiVersion?: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${getGraphBaseUrl(graphApiVersion)}/${path.replace(/^\//, '')}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await readJsonSafe(response);
  if (!response.ok || data?.error) throw graphError(data, response.status, 'Instagram API trả về lỗi.');
  return data;
}

async function graphPost(path: string, accessToken: string, graphApiVersion?: string, body?: Record<string, any>) {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  const data = await readJsonSafe(response);
  if (!response.ok || data?.error) throw graphError(data, response.status, 'Instagram API trả về lỗi.');
  return data;
}

async function graphDelete(path: string, accessToken: string, graphApiVersion?: string) {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}/${path.replace(/^\//, '')}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await readJsonSafe(response);
  if (!response.ok || data?.error) throw graphError(data, response.status, 'Instagram API trả về lỗi.');
  return data;
}

export interface InstagramAccountInfo {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
}

export async function getLinkedInstagramAccount(pageId: string, pageAccessToken: string, graphApiVersion?: string): Promise<InstagramAccountInfo | null> {
  const page = await graphGet(pageId, pageAccessToken, graphApiVersion, { fields: 'instagram_business_account' });
  const igId = page?.instagram_business_account?.id;
  if (!igId) return null;

  return graphGet(String(igId), pageAccessToken, graphApiVersion, {
    fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website',
  });
}

export async function listInstagramMedia(igUserId: string, pageAccessToken: string, graphApiVersion?: string, limit = 30) {
  return graphGet(`${igUserId}/media`, pageAccessToken, graphApiVersion, {
    fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count,children{media_type,media_url,thumbnail_url,id}',
    limit: Math.min(Math.max(limit, 1), 50),
  });
}

export async function listInstagramComments(mediaId: string, pageAccessToken: string, graphApiVersion?: string, limit = 50) {
  return graphGet(`${mediaId}/comments`, pageAccessToken, graphApiVersion, {
    fields: 'id,text,timestamp,username,like_count,replies{id,text,timestamp,username,like_count}',
    limit: Math.min(Math.max(limit, 1), 100),
  });
}

export async function replyInstagramComment(commentId: string, message: string, pageAccessToken: string, graphApiVersion?: string) {
  return graphPost(`${commentId}/replies`, pageAccessToken, graphApiVersion, { message });
}

export async function deleteInstagramComment(commentId: string, pageAccessToken: string, graphApiVersion?: string) {
  return graphDelete(commentId, pageAccessToken, graphApiVersion);
}

export async function listInstagramConversations(pageId: string, pageAccessToken: string, graphApiVersion?: string, limit = 30) {
  return graphGet(`${pageId}/conversations`, pageAccessToken, graphApiVersion, {
    platform: 'instagram',
    fields: 'id,updated_time,participants,messages.limit(1){id,from,to,message,created_time,attachments}',
    limit: Math.min(Math.max(limit, 1), 50),
  });
}

export async function getInstagramConversation(conversationId: string, pageAccessToken: string, graphApiVersion?: string) {
  return graphGet(conversationId, pageAccessToken, graphApiVersion, {
    fields: 'id,updated_time,participants,messages.limit(20){id,from,to,message,created_time,attachments}',
  });
}

export async function sendInstagramText(pageId: string, recipientId: string, message: string, pageAccessToken: string, graphApiVersion?: string) {
  return graphPost(`${pageId}/messages`, pageAccessToken, graphApiVersion, {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE',
    message: { text: message },
  });
}
