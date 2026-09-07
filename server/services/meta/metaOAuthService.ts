import { MetaApiError } from './metaError';

export function getGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || 'v19.0';
}

export function getGraphBaseUrl(): string {
  return `https://graph.facebook.com/${getGraphApiVersion()}`;
}

export interface MetaTokenExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  metaUserId: string;
}

/**
 * Builds the Meta OAuth 2.0 authorization dialog URL
 */
export function getOAuthUrl(redirectUri: string, state: string = ''): string {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    throw new Error('Biến môi trường META_APP_ID chưa được cấu hình.');
  }

  const version = getGraphApiVersion();
  const permissions = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_engagement',
  ].join(',');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: permissions,
  });

  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchanges authorization code for a User Access Token,
 * and upgrades to a 60-day Long-Lived User Access Token.
 */
export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string
): Promise<MetaTokenExchangeResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('Biến môi trường META_APP_ID hoặc META_APP_SECRET chưa được cấu hình.');
  }

  const tokenUrl = `${getGraphBaseUrl()}/oauth/access_token?` + new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  }).toString();

  const response = await fetch(tokenUrl);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw MetaApiError.fromGraphResponse(data);
  }

  const shortLivedToken = data.access_token;

  // Upgrade to long-lived user access token (valid ~60 days)
  const longLivedUrl = `${getGraphBaseUrl()}/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  }).toString();

  const longLivedRes = await fetch(longLivedUrl);
  const longLivedData = await longLivedRes.json();

  const finalAccessToken = longLivedData.access_token || shortLivedToken;
  const expiresIn = longLivedData.expires_in || data.expires_in;

  // Retrieve user's Facebook Meta ID
  const meRes = await fetch(`${getGraphBaseUrl()}/me?fields=id,name&access_token=${finalAccessToken}`);
  const meData = await meRes.json();

  if (!meRes.ok || meData.error) {
    throw MetaApiError.fromGraphResponse(meData);
  }

  return {
    accessToken: finalAccessToken,
    tokenType: data.token_type || 'bearer',
    expiresIn,
    metaUserId: meData.id,
  };
}
