import { getGraphBaseUrl } from './metaOAuthService';
import { MetaApiError } from './metaError';

export interface MetaPageItem {
  page_id: string;
  page_name: string;
  page_username?: string;
  page_avatar_url?: string;
  page_access_token: string;
  page_tasks: string[];
}

/**
 * Fetches real Facebook Pages managed by the authenticated user
 */
export async function getManagedPages(userAccessToken: string): Promise<MetaPageItem[]> {
  const url = `${getGraphBaseUrl()}/me/accounts?fields=id,name,username,access_token,tasks,picture.width(150).height(150){url}&access_token=${userAccessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  const pages: MetaPageItem[] = (data.data || []).map((p: any) => ({
    page_id: p.id,
    page_name: p.name,
    page_username: p.username || '',
    page_avatar_url: p.picture?.data?.url || '',
    page_access_token: p.access_token,
    page_tasks: Array.isArray(p.tasks) ? p.tasks : [],
  }));

  return pages;
}

/**
 * Validates connection and permissions for a specific Facebook Page
 */
export async function testPageConnection(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean; pageName: string; canPost: boolean }> {
  const url = `${getGraphBaseUrl()}/${pageId}?fields=id,name,can_post&access_token=${pageAccessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  return {
    success: true,
    pageName: data.name,
    canPost: data.can_post ?? true,
  };
}
