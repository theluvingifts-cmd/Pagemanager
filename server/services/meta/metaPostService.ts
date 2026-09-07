import { getGraphBaseUrl } from './metaOAuthService';
import { MetaApiError } from './metaError';

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
      media?: {
        image?: {
          src?: string;
        };
      };
    }>;
  };
}

/**
 * Publishes a text-only post to Facebook Page Feed
 */
export async function publishTextPost(
  pageId: string,
  pageAccessToken: string,
  message: string
): Promise<PublishResult> {
  const url = `${getGraphBaseUrl()}/${pageId}/feed`;

  const params = new URLSearchParams({
    access_token: pageAccessToken,
    message,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  const postId = data.id; // Usually "PAGEID_POSTID"
  const permalink = await fetchPostPermalink(postId, pageAccessToken);

  return {
    facebookPostId: postId,
    permalink: permalink || `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Publishes a post with a link to Facebook Page Feed
 */
export async function publishLinkPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  link: string
): Promise<PublishResult> {
  const url = `${getGraphBaseUrl()}/${pageId}/feed`;

  const params = new URLSearchParams({
    access_token: pageAccessToken,
    message,
    link,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  const postId = data.id;
  const permalink = await fetchPostPermalink(postId, pageAccessToken);

  return {
    facebookPostId: postId,
    permalink: permalink || `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Publishes a single photo post to Facebook Page Photos endpoint
 */
export async function publishPhotoPost(
  pageId: string,
  pageAccessToken: string,
  caption: string,
  photoUrl: string
): Promise<PublishResult> {
  const url = `${getGraphBaseUrl()}/${pageId}/photos`;

  const params = new URLSearchParams({
    access_token: pageAccessToken,
    url: photoUrl,
    caption,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  const postId = data.post_id || data.id;
  const permalink = await fetchPostPermalink(postId, pageAccessToken);

  return {
    facebookPostId: postId,
    permalink: permalink || `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Helper to fetch the permanent canonical link of a Facebook post
 */
async function fetchPostPermalink(postId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const url = `${getGraphBaseUrl()}/${postId}?fields=permalink_url&access_token=${pageAccessToken}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.permalink_url || null;
  } catch {
    return null;
  }
}

/**
 * Fetches published posts from the Facebook Page Feed to synchronize
 */
export async function getPagePosts(
  pageId: string,
  pageAccessToken: string,
  limit: number = 25
): Promise<FacebookPostDetail[]> {
  const url = `${getGraphBaseUrl()}/${pageId}/published_posts?fields=id,message,created_time,permalink_url,attachments{media,type,url}&limit=${limit}&access_token=${pageAccessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  return (data.data || []) as FacebookPostDetail[];
}
