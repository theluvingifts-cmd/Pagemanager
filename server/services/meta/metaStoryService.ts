import { getGraphBaseUrl } from './metaOAuthService.js';
import { MetaApiError } from './metaError.js';

export type StoryPlatform = 'facebook' | 'instagram';

async function graphPost(path: string, token: string, params: URLSearchParams, version: string) {
  const response = await fetch(`${getGraphBaseUrl(version)}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

async function uploadFacebookStoryPhoto(pageId: string, token: string, mediaUrl: string, version: string) {
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) throw new Error(`Meta không thể đọc ảnh đã tải lên (HTTP ${mediaResponse.status}).`);
  const contentType = String(mediaResponse.headers.get('content-type') || '').split(';')[0];
  if (!contentType.startsWith('image/')) throw new Error(`Tệp Story không phải ảnh hợp lệ (${contentType || 'không rõ định dạng'}).`);
  const bytes = await mediaResponse.arrayBuffer();
  const form = new FormData();
  form.append('published', 'false');
  form.append('source', new Blob([bytes], { type: contentType }), `story.${contentType.includes('png') ? 'png' : 'jpg'}`);
  const response = await fetch(`${getGraphBaseUrl(version)}/${encodeURIComponent(pageId)}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

export async function publishFacebookStory(
  pageId: string,
  token: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  version: string
) {
  if (mediaType === 'video') {
    throw new Error('Facebook Page Story video cần upload theo phiên resumable. Bản này hỗ trợ ảnh cho Facebook và ảnh/video cho Instagram.');
  }
  // Upload the bytes instead of asking Meta to download a long Firebase URL.
  // Meta frequently returns code 100 "Invalid parameter" for signed/tokenized URLs.
  const uploaded = await uploadFacebookStoryPhoto(pageId, token, mediaUrl, version);
  const result = await graphPost(
    `${encodeURIComponent(pageId)}/photo_stories`,
    token,
    new URLSearchParams({ photo_id: String(uploaded.id) }),
    version
  );
  return { id: String(result.post_id || result.id || uploaded.id) };
}

export async function publishInstagramStory(
  instagramAccountId: string,
  token: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  version: string
) {
  const params = new URLSearchParams({ media_type: 'STORIES' });
  params.set(mediaType === 'video' ? 'video_url' : 'image_url', mediaUrl);
  const container = await graphPost(`${encodeURIComponent(instagramAccountId)}/media`, token, params, version);
  const result = await graphPost(
    `${encodeURIComponent(instagramAccountId)}/media_publish`,
    token,
    new URLSearchParams({ creation_id: String(container.id) }),
    version
  );
  return { id: String(result.id) };
}
