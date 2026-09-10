import type { NextFunction, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { queryDocuments, updateDocument } from '../services/firebaseRest.js';
import {
  decryptTokenDetailed,
  encryptToken,
  getPrimaryServerTokenKey,
} from '../services/meta/metaTokenService.js';
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
  const currentPageCipher = String(page.data?.encryptedPageAccessToken || '');

  /**
   * First try the Page token itself.
   *
   * If it decrypts with META_APP_SECRET or a browser vault, immediately re-key
   * it to the current TOKEN_ENCRYPTION_KEY. The old middleware returned early
   * here, leaving the legacy cipher in Firestore forever.
   */
  if (currentPageCipher) {
    try {
      const pageTokenResult = decryptTokenDetailed(currentPageCipher, vaultKey);

      if (
        pageTokenResult.plainText &&
        pageTokenResult.source !== 'primary-server' &&
        getPrimaryServerTokenKey()
      ) {
        await updateDocument(user.idToken, 'facebookPages', page.id, {
          encryptedPageAccessToken: encryptToken(pageTokenResult.plainText),
          tokenRepairedAt: new Date().toISOString(),
          tokenRepairSource: pageTokenResult.source,
          updatedAt: new Date().toISOString(),
        });

        console.log('[Messenger token repair] re-keyed existing Page token', {
          pageId: page.data?.pageId || requestedPageId,
          source: pageTokenResult.source,
        });

        return true;
      }

      // Already readable with the production key; nothing else is required.
      if (pageTokenResult.plainText) return false;
    } catch {
      // Fall through and try to regenerate Page token from User token.
    }
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

  if (!connection?.data?.encryptedAccessToken) {
    console.warn('[Messenger token repair] no User token connection found');
    return false;
  }

  let userAccessToken = '';

  try {
    const userTokenResult = decryptTokenDetailed(
      String(connection.data.encryptedAccessToken),
      vaultKey
    );

    userAccessToken = userTokenResult.plainText;

    // Migrate the User token as well, otherwise the next browser/runtime can
    // fall back into the exact same problem again.
    if (
      userAccessToken &&
      userTokenResult.source !== 'primary-server' &&
      getPrimaryServerTokenKey()
    ) {
      await updateDocument(user.idToken, 'facebookConnections', connection.id, {
        encryptedAccessToken: encryptToken(userAccessToken),
        tokenRepairedAt: new Date().toISOString(),
        tokenRepairSource: userTokenResult.source,
        updatedAt: new Date().toISOString(),
      });

      console.log('[Messenger token repair] re-keyed User token', {
        connectionId: connection.id,
        source: userTokenResult.source,
      });
    }
  } catch (error) {
    // If we reach here, both Page token and User token are genuinely tied to
    // another browser vault that this origin cannot know. OAuth reconnect is
    // then the only cryptographically valid recovery path.
    console.warn('[Messenger token repair] User token unreadable by all known keys', error);
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

  // New cipher is always written with the current server key.
  const encryptedPageAccessToken = encryptToken(String(data.access_token));

  // Verify with server keys only before persisting.
  const verified = decryptTokenDetailed(encryptedPageAccessToken).plainText;
  if (!verified) return false;

  await updateDocument(user.idToken, 'facebookPages', page.id, {
    encryptedPageAccessToken,
    pageName: data?.name || page.data?.pageName || 'Facebook Page',
    pageTasks: Array.isArray(data?.tasks)
      ? data.tasks
      : (page.data?.pageTasks || []),
    pageAvatarUrl:
      data?.picture?.data?.url ||
      page.data?.pageAvatarUrl ||
      null,
    tokenRepairedAt: new Date().toISOString(),
    tokenRepairSource: 'user-token-refresh',
    updatedAt: new Date().toISOString(),
  });

  console.log('[Messenger token repair] regenerated Page token', {
    pageId: realPageId,
    pageDocumentId: page.id,
  });

  return true;
}

export async function messengerTokenRepairMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    await tryRepairPageToken(req);
  } catch (error) {
    // Migration is best-effort; the existing Messenger handler remains the
    // final authority and will return its normal structured error.
    console.warn('[Messenger token repair] skipped:', error);
  }

  next();
}
