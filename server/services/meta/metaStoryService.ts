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

async function graphGet(path: string, token: string, params: URLSearchParams, version: string) {
  const url = new URL(`${getGraphBaseUrl(version)}/${path}`);
  params.forEach((value, key) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function inspectRemoteMedia(mediaUrl: string, mediaType: 'image' | 'video') {
  let response = await fetch(mediaUrl, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) {
    response = await fetch(mediaUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    });
  }

  if (!response.ok && response.status !== 206) {
    throw new Error(`Meta không thể truy cập media URL (HTTP ${response.status}). Hãy tải media lại.`);
  }

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (mediaType === 'image' && contentType !== 'image/jpeg') {
    throw new Error(`Ảnh Story phải là JPEG thật, nhưng URL đang trả về ${contentType || 'không rõ định dạng'}. Hãy tải ảnh lại.`);
  }
  if (mediaType === 'video' && !contentType.startsWith('video/')) {
    throw new Error(`Video Story không hợp lệ (${contentType || 'không rõ định dạng'}). Hãy tải video lại.`);
  }

  try { await response.body?.cancel(); } catch {}
}

async function uploadFacebookStoryPhoto(pageId: string, token: string, mediaUrl: string, version: string) {
  const mediaResponse = await fetch(mediaUrl, { redirect: 'follow' });
  if (!mediaResponse.ok) throw new Error(`Meta không thể đọc ảnh đã tải lên (HTTP ${mediaResponse.status}).`);
  const contentType = String(mediaResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (contentType !== 'image/jpeg') throw new Error(`Tệp Story không phải JPEG hợp lệ (${contentType || 'không rõ định dạng'}).`);
  const bytes = await mediaResponse.arrayBuffer();
  const form = new FormData();
  form.append('published', 'false');
  form.append('source', new Blob([bytes], { type: 'image/jpeg' }), 'story.jpg');
  const response = await fetch(`${getGraphBaseUrl(version)}/${encodeURIComponent(pageId)}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

async function waitForInstagramContainer(containerId: string, token: string, version: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const data = await graphGet(
      encodeURIComponent(containerId),
      token,
      new URLSearchParams({ fields: 'status_code' }),
      version
    );
    const statusCode = String(data.status_code || '').toUpperCase();
    if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') return;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram xử lý Story thất bại (${statusCode}).`);
    }
    await sleep(800);
  }

  throw new Error('Instagram vẫn đang xử lý ảnh Story. Hãy thử đăng lại sau vài giây.');
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

  await inspectRemoteMedia(mediaUrl, mediaType);

  // Upload the actual JPEG bytes to Facebook first. Facebook no longer has to
  // download a long Firebase URL itself for the photo_stories request.
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
  await inspectRemoteMedia(mediaUrl, mediaType);

  const params = new URLSearchParams({ media_type: 'STORIES' });
  params.set(mediaType === 'video' ? 'video_url' : 'image_url', mediaUrl);
  const container = await graphPost(`${encodeURIComponent(instagramAccountId)}/media`, token, params, version);

  await waitForInstagramContainer(String(container.id), token, version);

  const result = await graphPost(
    `${encodeURIComponent(instagramAccountId)}/media_publish`,
    token,
    new URLSearchParams({ creation_id: String(container.id) }),
    version
  );
  return { id: String(result.id) };
}
