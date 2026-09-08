import { MetaApiError } from './metaError';

export function getGraphApiVersion(version?: string): string {
  return version || process.env.META_GRAPH_API_VERSION || 'v23.0';
}

export function getGraphBaseUrl(version?: string): string {
  return `https://graph.facebook.com/${getGraphApiVersion(version)}`;
}

export interface MetaTokenExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  metaUserId: string;
}

export function getOAuthUrl(
  redirectUri: string,
  state: string,
  appId: string,
  graphApiVersion?: string
): string {
  if (!appId) throw new Error('Meta App ID chưa được cấu hình.');

  const permissions = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_messages',
  ].join(',');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: permissions,
    auth_type: 'rerequest',
    display: 'popup',
  });

  return `https://www.facebook.com/${getGraphApiVersion(graphApiVersion)}/dialog/oauth?${params.toString()}`;
}

async function postTokenRequest(params: URLSearchParams, graphApiVersion?: string): Promise<any> {
  const response = await fetch(`${getGraphBaseUrl(graphApiVersion)}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw MetaApiError.fromGraphResponse(data);
  return data;
}

export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
  graphApiVersion?: string
): Promise<MetaTokenExchangeResult> {
  if (!appId || !appSecret) {
    throw new Error('Meta App ID hoặc App Secret chưa được cấu hình.');
  }

  const shortData = await postTokenRequest(new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  }), graphApiVersion);

  const shortLivedToken = shortData.access_token;
  if (!shortLivedToken) throw new Error('Meta không trả về User Access Token.');

  let finalAccessToken = shortLivedToken;
  let expiresIn = shortData.expires_in;

  try {
    const longData = await postTokenRequest(new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    }), graphApiVersion);
    finalAccessToken = longData.access_token || shortLivedToken;
    expiresIn = longData.expires_in || expiresIn;
  } catch (error) {
    console.warn('Không thể đổi sang long-lived Meta token, dùng token hiện tại:', error);
  }

  const meRes = await fetch(`${getGraphBaseUrl(graphApiVersion)}/me?fields=id,name`, {
    headers: { Authorization: `Bearer ${finalAccessToken}` },
  });
  const meData = await meRes.json();
  if (!meRes.ok || meData.error) throw MetaApiError.fromGraphResponse(meData);

  return {
    accessToken: finalAccessToken,
    tokenType: shortData.token_type || 'bearer',
    expiresIn,
    metaUserId: meData.id,
  };
}
