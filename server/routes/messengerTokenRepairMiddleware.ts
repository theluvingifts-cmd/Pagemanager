import type { NextFunction, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { queryDocuments, updateDocument } from '../services/firebaseRest.js';
import { decryptToken, encryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest } from '../services/meta/metaConfigService.js';
import { getGraphBaseUrl } from '../services/meta/metaOAuthService.js';

function requestPageId(req: Request): string {
  const queryValue = req.query?.pageId || req.query?.page_id;
  const bodyValue = req.body?.pageId || req.body?.page_id;
  return String(queryValue || bodyValue || '').trim();
}

async function tryRepairPageToken(req: Request): Promise<boolean> {
  const requestedPageId = requestPageId(req);
  if (!requestedPageId) return false;

  const user = await authenticateRequest(req);
  if (!user) return false;

  const pages = await queryDocuments<any>(
    user.idToken,
    'facebookPages',
    [{ field: 'userId', value: user.id }],
    50
  );

  const page = pages.find(item =>
    item.id === requestedPageId ||
    item.data?.id === requestedPageId ||
    item.data?.pageId === requestedPageId
  );
  if (!page) return false;

  const vaultKey = getVaultKeyFromRequest(req, false);

  // Nothing to repair if the current Page token already works with either
  // the stable server key or this browser's legacy vault key.
  try {
    const existing = decryptToken(
      String(page.data?.encryptedPageAccessToken || ''),
      vaultKey
    );
    if (existing) return false;
  } catch {
    // Continue with server-side recovery below.
  }

  const connections = await queryDocuments<any>(
    user.idToken,
    'facebookConnections',
    [{ field: 'userId', value: user.id }],
    50
  );

  const connection =
    connections.find(item => item.id === page.data?.connectionId) ||
    connections.find(item => item.data?.id === page.data?.connectionId) ||
    connections
      .slice()
      .sort((a, b) =>
        new Date(b.data?.updatedAt || 0).getTime() -
        new Date(a.data?.updatedAt || 0).getTime()
      )[0];

  if (!connection?.data?.encryptedAccessToken) return false;

  let userAccessToken = '';
  try {
    userAccessToken = decryptToken(
      String(connection.data.encryptedAccessToken),
      vaultKey
    );
  } catch {
    // The user token is also legacy-encrypted. A successful reconnect is still
    // required once before automatic recovery is possible.
    return false;
  }

  if (!userAccessToken) return false;

  const realPageId = String(page.data?.pageId || requestedPageId);
  const graphVersion = String(
    page.data?.graphApiVersion ||
    connection.data?.graphApiVersion ||
    process.env.META_GRAPH_API_VERSION ||
    'v23.0'
  );

  const params = new URLSearchParams({
    fields: 'id,name,access_token,tasks,picture.width(150).height(150){url}',
  });

  const response = await fetch(
    `${getGraphBaseUrl(graphVersion)}/${encodeURIComponent(realPageId)}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        Accept: 'application/json',
      },
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error || !data?.access_token) {
    console.warn('[Messenger token repair] Meta could not refresh Page token:', {
      pageId: realPageId,
      status: response.status,
      error: data?.error?.message || null,
    });
    return false;
  }

  const encryptedPageAccessToken = encryptToken(
    String(data.access_token),
    vaultKey
  );

  // Verify before persisting so we never replace the old value with a broken
  // cipher text.
  const verified = decryptToken(encryptedPageAccessToken, vaultKey);
  if (!verified) return false;

  await updateDocument(user.idToken, 'facebookPages', page.id, {
    encryptedPageAccessToken,
    pageName: data?.name || page.data?.pageName || 'Facebook Page',
    pageTasks: Array.isArray(data?.tasks) ? data.tasks : (page.data?.pageTasks || []),
    pageAvatarUrl: data?.picture?.data?.url || page.data?.pageAvatarUrl || null,
    tokenRepairedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log('[Messenger token repair] Page token repaired', {
    pageId: realPageId,
    pageDocumentId: page.id,
  });

  return true;
}

/**
 * Production compatibility middleware.
 *
 * Old Page Manager builds encrypted Meta Page tokens with an origin-scoped
 * browser vault key. That means a token created inside AI Studio cannot be
 * decrypted from pagemanager.vercel.app.
 *
 * After OAuth reconnects the Meta account, facebookConnections contains a
 * fresh User token encrypted with the stable server key. This middleware uses
 * that User token to obtain a fresh Page access token from Meta and migrates
 * the Page document automatically. Existing Messenger routes then run
 * unchanged.
 */
export async function messengerTokenRepairMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    await tryRepairPageToken(req);
  } catch (error) {
    // Never make token migration itself take Messenger down. The existing
    // Messenger route will return its normal, user-friendly error if the
    // original token is still unusable.
    console.warn('[Messenger token repair] skipped:', error);
  }
  next();
}
