import { getGraphBaseUrl } from './metaOAuthService.js';
import { MetaApiError } from './metaError.js';

export interface MetaPageItem {
  page_id: string;
  page_name: string;
  page_username?: string;
  page_avatar_url?: string;
  page_access_token: string;
  page_tasks: string[];
}

export async function getManagedPages(
  userAccessToken: string,
  graphApiVersion?: string
): Promise<MetaPageItem[]> {
  const url = `${getGraphBaseUrl(graphApiVersion)}/me/accounts?fields=id,name,username,access_token,tasks,picture.width(150).height(150){url}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  const data = await response.json();
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);

  return (data.data || []).map((page: any) => ({
    page_id: page.id,
    page_name: page.name,
    page_username: page.username || '',
    page_avatar_url: page.picture?.data?.url || '',
    page_access_token: page.access_token,
    page_tasks: Array.isArray(page.tasks) ? page.tasks : [],
  }));
}

export async function testPageConnection(
  pageId: string,
  pageAccessToken: string,
  graphApiVersion?: string
): Promise<{ success: boolean; pageName: string; canPost: boolean }> {
  const response = await fetch(
    `${getGraphBaseUrl(graphApiVersion)}/${encodeURIComponent(pageId)}?fields=id,name`,
    { headers: { Authorization: `Bearer ${pageAccessToken}` } }
  );
  const data = await response.json();
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);

  return {
    success: true,
    pageName: data.name,
    canPost: true,
  };
}
