import { getGraphBaseUrl } from './metaOAuthService.js';
import { MetaApiError } from './metaError.js';

export interface PublishResult {
  facebookPostId: string;
  permalink?: string;
  publishedAt: string;
}

export interface FacebookPostDetail {
  id: string;
  message?: string;
  story?: string;
  full_picture?: string;
  created_time: string;
  permalink_url?: string;
  attachments?: {
    data?: Array<{
      type?: string;
      url?: string;
      media?: { image?: { src?: string } };
    }>;
  };
}

async function graphPost(
  path: string,
  pageAccessToken: string,
  params: URLSearchParams,
  graphApiVersion?: string
): Promise<any> {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

async function graphDelete(
  path: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<any> {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}/${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
    },
  });

  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

export async function publishTextPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  graphApiVersion?: string
): Promise<PublishResult> {
  const data = await graphPost(
    `${encodeURIComponent(pageId)}/feed`,
    pageAccessToken,
    new URLSearchParams({ message }),
    graphApiVersion
  );
  const postId = data.id;
  const permalink = await fetchPostPermalink(postId, pageAccessToken, graphApiVersion);
  return {
    facebookPostId: postId,
    permalink: permalink || `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}

export async function publishLinkPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  link: string,
  graphApiVersion?: string
): Promise<PublishResult> {
  const data = await graphPost(
    `${encodeURIComponent(pageId)}/feed`,
    pageAccessToken,
    new URLSearchParams({ message, link }),
    graphApiVersion
  );
  const postId = data.id;
  const permalink = await fetchPostPermalink(postId, pageAccessToken, graphApiVersion);
  return {
    facebookPostId: postId,
    permalink: permalink || `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}

export async function publishPhotoPost(
  pageId: string,
  pageAccessToken: string,
  caption: string,
  photoUrl: string,
  graphApiVersion?: string
): Promise<PublishResult> {
  const data = await graphPost(
    `${encodeURIComponent(pageId)}/photos`,
    pageAccessToken,
    new URLSearchParams({ caption, url: photoUrl }),
    graphApiVersion
  );
  const postId = data.post_id || data.id;
  const permalink = await fetchPostPermalink(postId, pageAccessToken, graphApiVersion);
  return {
    facebookPostId: postId,
    permalink: permalink || `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}

async function fetchPostPermalink(
  postId: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<string | null> {
  if (!postId) return null;
  try {
    const response = await fetch(
      `${getGraphBaseUrl(graphApiVersion)}/${encodeURIComponent(postId)}?fields=permalink_url`,
      { headers: { Authorization: `Bearer ${pageAccessToken}` } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.permalink_url || null;
  } catch {
    return null;
  }
}

export async function deleteFacebookPost(
  facebookPostId: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<boolean> {
  if (!facebookPostId) {
    throw new Error('Thiếu Facebook Post ID để xóa bài viết.');
  }

  const data = await graphDelete(
    encodeURIComponent(facebookPostId),
    pageAccessToken,
    graphApiVersion
  );

  // Meta normally returns { success: true }. Some versions may return an empty 2xx body.
  return data?.success !== false;
}

export async function getPagePosts(
  pageId: string,
  pageAccessToken: string,
  limit = 25,
  graphApiVersion?: string
): Promise<FacebookPostDetail[]> {
  const fields = 'id,message,story,full_picture,created_time,permalink_url,attachments{media,type,url}';
  const response = await fetch(
    `${getGraphBaseUrl(graphApiVersion)}/${encodeURIComponent(pageId)}/published_posts?fields=${encodeURIComponent(fields)}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${pageAccessToken}` } }
  );
  const data = await response.json();
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return (data.data || []) as FacebookPostDetail[];
}
