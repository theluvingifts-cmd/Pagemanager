import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { getOAuthUrl, exchangeCodeForUserToken } from '../services/meta/metaOAuthService.js';
import { getManagedPages, testPageConnection } from '../services/meta/metaPageService.js';
import { getPagePosts } from '../services/meta/metaPostService.js';
import { encryptToken, decryptToken } from '../services/meta/metaTokenService.js';
import {
  deleteDocument,
  getDocument,
  isFirebaseRestConfigured,
  queryDocuments,
  setDocument,
  updateDocument,
} from '../services/firebaseRest.js';
import { authenticateRequest } from '../middleware/authMiddleware.js';
import { MetaApiError } from '../services/meta/metaError.js';
import {
  deleteMetaConfig,
  getMetaConfigSummary,
  getVaultKeyFromRequest,
  resolveMetaConfig,
  saveMetaConfig,
} from '../services/meta/metaConfigService.js';

export const facebookRouter = Router();
const OAUTH_TTL_MS = 10 * 60 * 1000;

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`.replace(/\/$/, '');
}

function getAppRedirectUri(req: Request): string {
  if (process.env.META_REDIRECT_URI) return process.env.META_REDIRECT_URI;
  return `${getAppBaseUrl(req)}/api/facebook/callback`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function getOwnedPages(user: any) {
  return queryDocuments<any>(user.idToken, 'facebookPages', [
    { field: 'userId', value: user.id },
  ]);
}

async function findOwnedPage(user: any, pageIdOrDocId: string) {
  // Do not GET an arbitrary/non-existing document directly. With owner-based
  // Firestore rules, a missing doc can resolve as PERMISSION_DENIED instead of
  // 404 because resource.data does not exist yet. Query the user's permitted
  // page set first, then match locally by either document id or Meta Page id.
  const pages = await getOwnedPages(user);
  return pages.find(page =>
    page.id === pageIdOrDocId ||
    page.data.id === pageIdOrDocId ||
    page.data.pageId === pageIdOrDocId
  ) || null;
}

facebookRouter.get('/status', async (req: Request, res: Response) => {
  const firebaseConfigured = isFirebaseRestConfigured();
  const user = await authenticateRequest(req);
  let connectedPagesCount = 0;
  let hasConnection = false;
  let metaSummary: any = {
    configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    appId: process.env.META_APP_ID || '',
    appSecretConfigured: Boolean(process.env.META_APP_SECRET),
    graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v23.0',
    source: process.env.META_APP_ID ? 'environment' : 'none',
  };

  if (user && firebaseConfigured) {
    try {
      const [connections, pages, summary] = await Promise.all([
        queryDocuments<any>(user.idToken, 'facebookConnections', [{ field: 'userId', value: user.id }], 5),
        getOwnedPages(user),
        getMetaConfigSummary(user, getVaultKeyFromRequest(req, false)),
      ]);
      hasConnection = connections.length > 0;
      connectedPagesCount = pages.length;
      metaSummary = summary;
    } catch (error: any) {
      console.warn('Facebook status notice:', error?.message || error);
    }
  }

  return res.json({
    status: 'ok',
    appName: 'PAGE MANAGER',
    metaConfigured: Boolean(metaSummary.configured),
    firebaseConfigured,
    metaAppId: metaSummary.appId ? `${String(metaSummary.appId).slice(0, 4)}...` : null,
    graphApiVersion: metaSummary.graphApiVersion || 'v23.0',
    metaConfigSource: metaSummary.source,
    hasConnection,
    connectedPagesCount,
    redirectUri: getAppRedirectUri(req),
  });
});

facebookRouter.get('/meta-config', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    return res.json(await getMetaConfigSummary(user, getVaultKeyFromRequest(req, false)));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Không thể tải cấu hình Meta.' });
  }
});

facebookRouter.put('/meta-config', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const vaultKey = getVaultKeyFromRequest(req, true);
    const summary = await saveMetaConfig(user, {
      appId: req.body?.appId,
      appSecret: req.body?.appSecret,
      graphApiVersion: req.body?.graphApiVersion,
    }, vaultKey);
    return res.json({ success: true, config: summary, message: 'Đã lưu cấu hình Meta App an toàn.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Không thể lưu cấu hình Meta.' });
  }
});

facebookRouter.delete('/meta-config', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    await deleteMetaConfig(user);
    return res.json({ success: true, message: 'Đã xóa cấu hình Meta đã lưu.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Không thể xóa cấu hình Meta.' });
  }
});

facebookRouter.get('/oauth-url', handleOAuthUrl);
facebookRouter.get('/auth-url', handleOAuthUrl);
facebookRouter.post('/oauth-url', handleOAuthUrl);
facebookRouter.post('/auth-url', handleOAuthUrl);

async function handleOAuthUrl(req: Request, res: Response) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Chưa đăng nhập. Vui lòng đăng nhập trước khi kết nối Facebook.' });
    }

    const metaConfig = await resolveMetaConfig(user, '', false);
    const state = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const userRecord = await getDocument<any>(user.idToken, 'users', user.id);
    if (userRecord) {
      await updateDocument(user.idToken, 'users', user.id, {
        metaOauthState: state,
        metaOauthCreatedAt: new Date(now).toISOString(),
        metaOauthExpiresAt: now + OAUTH_TTL_MS,
      });
    } else {
      await setDocument(user.idToken, 'users', user.id, {
        uid: user.id,
        metaOauthState: state,
        metaOauthCreatedAt: new Date(now).toISOString(),
        metaOauthExpiresAt: now + OAUTH_TTL_MS,
      }, false);
    }

    const redirectUri = getAppRedirectUri(req);
    return res.json({
      url: getOAuthUrl(redirectUri, state, metaConfig.appId, metaConfig.graphApiVersion),
      redirectUri,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Lỗi tạo liên kết đăng nhập Facebook' });
  }
}

facebookRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;
  const appOrigin = new URL(getAppBaseUrl(req)).origin;

  if (error) {
    return res.status(400).send(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2 style="color:#e11d48">Kết nối Facebook thất bại</h2><p>${escapeHtml(error_description || error)}</p><script>if(window.opener){window.opener.postMessage({type:'META_OAUTH_ERROR',error:${JSON.stringify(String(error_description || error))}},${JSON.stringify(appOrigin)});}</script><button onclick="window.close()">Đóng cửa sổ</button></body></html>`);
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.status(400).send('Mã xác thực OAuth không hợp lệ.');
  }

  return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Đang hoàn tất kết nối Facebook</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;background:#f8fafc"><h2>Đang hoàn tất kết nối...</h2><p>Cửa sổ này sẽ tự đóng.</p><script>if(window.opener){window.opener.postMessage({type:'META_OAUTH_CODE',code:${JSON.stringify(code)},state:${JSON.stringify(state)}},${JSON.stringify(appOrigin)});}setTimeout(()=>window.close(),800);</script></body></html>`);
});

facebookRouter.post('/complete-oauth', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Phiên đăng nhập Firebase đã hết hạn.' });

    const { code, state } = req.body || {};
    if (!code || !state) return res.status(400).json({ error: 'Thiếu code/state OAuth.' });

    const userStateRecord = await getDocument<any>(user.idToken, 'users', user.id);
    const stateData = userStateRecord?.data || {};
    if (!stateData.metaOauthState || stateData.metaOauthState !== String(state)) {
      return res.status(400).json({ error: 'OAuth state không hợp lệ hoặc đã được sử dụng.' });
    }
    if (!stateData.metaOauthExpiresAt || Date.now() > Number(stateData.metaOauthExpiresAt)) {
      await updateDocument(user.idToken, 'users', user.id, {
        metaOauthState: null,
        metaOauthExpiresAt: null,
      });
      return res.status(400).json({ error: 'Phiên OAuth đã hết hạn. Hãy bấm Kết nối Facebook lại.' });
    }

    await updateDocument(user.idToken, 'users', user.id, {
      metaOauthState: null,
      metaOauthExpiresAt: null,
    });

    const vaultKey = getVaultKeyFromRequest(req, true);
    const metaConfig = await resolveMetaConfig(user, vaultKey, true);
    const redirectUri = getAppRedirectUri(req);
    const tokenData = await exchangeCodeForUserToken(
      String(code),
      redirectUri,
      metaConfig.appId,
      String(metaConfig.appSecret),
      metaConfig.graphApiVersion
    );

    const now = new Date().toISOString();
    const connectionId = `${user.id}_${tokenData.metaUserId}`;

    // On the first connection this document does not exist yet. Reading a
    // missing document directly is denied by owner-based Firestore rules, so
    // query only documents already visible to this Firebase UID and match it
    // locally instead.
    const ownedConnections = await queryDocuments<any>(
      user.idToken,
      'facebookConnections',
      [{ field: 'userId', value: user.id }],
      20
    );
    const existingConnection = ownedConnections.find(
      record => record.id === connectionId || record.data.metaUserId === tokenData.metaUserId
    ) || null;

    await setDocument(user.idToken, 'facebookConnections', connectionId, {
      id: connectionId,
      userId: user.id,
      metaUserId: tokenData.metaUserId,
      encryptedAccessToken: encryptToken(tokenData.accessToken, vaultKey),
      tokenExpiresAt: tokenData.expiresIn
        ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
        : null,
      graphApiVersion: metaConfig.graphApiVersion,
      createdAt: existingConnection?.data?.createdAt || now,
      updatedAt: now,
    }, false);

    const managedPages = await getManagedPages(tokenData.accessToken, metaConfig.graphApiVersion);
    const ownedPagesBeforeSync = await getOwnedPages(user);
    for (const page of managedPages) {
      const pageDocId = `${user.id}_${page.page_id}`;
      const existingPage = ownedPagesBeforeSync.find(
        record => record.id === pageDocId || record.data.pageId === page.page_id
      ) || null;
      await setDocument(user.idToken, 'facebookPages', pageDocId, {
        id: pageDocId,
        userId: user.id,
        connectionId,
        pageId: page.page_id,
        pageName: page.page_name,
        pageUsername: page.page_username || null,
        pageAvatarUrl: page.page_avatar_url || null,
        encryptedPageAccessToken: encryptToken(page.page_access_token, vaultKey),
        pageTasks: page.page_tasks || [],
        graphApiVersion: metaConfig.graphApiVersion,
        connectedAt: existingPage?.data?.connectedAt || now,
        updatedAt: now,
      }, false);
    }

    return res.json({
      success: true,
      pageCount: managedPages.length,
      message: `Đã kết nối và đồng bộ ${managedPages.length} Facebook Page.`,
    });
  } catch (err: any) {
    console.error('Complete Meta OAuth error:', err);
    if (err instanceof MetaApiError) {
      return res.status(400).json({ error: err.userFriendlyMessage, code: err.code, subcode: err.subcode });
    }
    return res.status(500).json({ error: err.message || 'Không thể hoàn tất kết nối Meta.' });
  }
});

/**
 * Disconnect the whole Meta/Facebook account from Page Manager.
 * This removes locally stored user/page tokens so the next OAuth flow must
 * fetch a fresh token with the latest requested permissions. It does NOT log
 * the user out of facebook.com and does not revoke the Meta app globally.
 */
facebookRouter.delete('/account', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const [pages, connections] = await Promise.all([
      getOwnedPages(user),
      queryDocuments<any>(user.idToken, 'facebookConnections', [
        { field: 'userId', value: user.id },
      ], 50),
    ]);

    for (const page of pages) {
      await deleteDocument(user.idToken, 'facebookPages', page.id);
    }
    for (const connection of connections) {
      await deleteDocument(user.idToken, 'facebookConnections', connection.id);
    }

    const userRecord = await getDocument<any>(user.idToken, 'users', user.id);
    if (userRecord) {
      await updateDocument(user.idToken, 'users', user.id, {
        metaOauthState: null,
        metaOauthCreatedAt: null,
        metaOauthExpiresAt: null,
      });
    }

    return res.json({
      success: true,
      removedPages: pages.length,
      removedConnections: connections.length,
      message: 'Đã đăng xuất Facebook khỏi Page Manager. Hãy kết nối lại để lấy token và quyền mới.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Không thể đăng xuất tài khoản Facebook khỏi Page Manager.',
    });
  }
});

facebookRouter.get('/pages', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const pageRecords = await getOwnedPages(user);
    const pages = pageRecords.map(record => {
      const data = record.data;
      return {
        id: record.id,
        page_id: data.pageId,
        page_name: data.pageName,
        page_username: data.pageUsername,
        page_avatar_url: data.pageAvatarUrl,
        tasks: data.pageTasks || [],
        page_tasks: data.pageTasks || [],
        is_active: true,
        isConnected: true,
        connected_at: data.connectedAt,
      };
    });

    return res.json({ pages, connectedPages: pages, connected: pages.length > 0 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách Page' });
  }
});

facebookRouter.delete('/pages/:pageId', handleDisconnectPage);
facebookRouter.post('/pages/:pageId/disconnect', handleDisconnectPage);

async function handleDisconnectPage(req: Request, res: Response) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const page = await findOwnedPage(user, req.params.pageId);
    if (page) await deleteDocument(user.idToken, 'facebookPages', page.id);
    return res.json({ success: true, message: 'Đã ngắt kết nối Page' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi ngắt kết nối Page' });
  }
}

facebookRouter.post('/pages/:pageId/connect', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const page = await findOwnedPage(user, req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Không tìm thấy Page' });
    await updateDocument(user.idToken, 'facebookPages', page.id, { updatedAt: new Date().toISOString() });
    return res.json({ success: true, message: 'Đã kích hoạt Page thành công' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi kích hoạt Page' });
  }
});

facebookRouter.post('/pages/:pageId/test', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const page = await findOwnedPage(user, req.params.pageId);
    if (!page) return res.status(404).json({ error: 'Không tìm thấy Page' });

    const vaultKey = getVaultKeyFromRequest(req, true);
    const pageToken = decryptToken(page.data.encryptedPageAccessToken, vaultKey);
    const graphApiVersion = page.data.graphApiVersion || (await resolveMetaConfig(user, '', false)).graphApiVersion;
    const result = await testPageConnection(page.data.pageId, pageToken, graphApiVersion);
    return res.json({ success: true, data: result, canPost: result.canPost !== false, message: `Page "${result.pageName}" kết nối tốt.` });
  } catch (err: any) {
    if (err instanceof MetaApiError) {
      return res.status(400).json({ success: false, error: err.userFriendlyMessage, code: err.code, subcode: err.subcode });
    }
    return res.status(500).json({ success: false, error: err.message || 'Lỗi kiểm tra kết nối Page' });
  }
});

async function syncPage(req: Request, res: Response, pageId: string) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const page = await findOwnedPage(user, pageId);
    if (!page) return res.status(404).json({ error: 'Không tìm thấy Page' });

    const vaultKey = getVaultKeyFromRequest(req, true);
    const pageToken = decryptToken(page.data.encryptedPageAccessToken, vaultKey);
    const graphApiVersion = page.data.graphApiVersion || (await resolveMetaConfig(user, '', false)).graphApiVersion;
    const posts = await getPagePosts(page.data.pageId, pageToken, 25, graphApiVersion);

    // IMPORTANT: never GET a deterministic content id before it exists.
    // Owner-based Firestore rules can return PERMISSION_DENIED for a missing
    // document because resource.data.userId is unavailable. Query only the
    // current user's allowed content set once, then match locally.
    const ownedContents = await queryDocuments<any>(user.idToken, 'contents', [
      { field: 'userId', value: user.id },
    ], 500);
    const existingById = new Map(ownedContents.map(record => [record.id, record]));
    const existingByFacebookPostId = new Map(
      ownedContents
        .filter(record => Boolean(record.data.facebookPostId))
        .map(record => [String(record.data.facebookPostId), record])
    );

    let syncedCount = 0;

    for (const post of posts) {
      const postTitle = post.message
        ? (post.message.split('\n')[0] || post.message).slice(0, 60)
        : post.story || 'Bài viết Facebook';
      const contentDocId = `${user.id}_${post.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const existing = existingById.get(contentDocId) || existingByFacebookPostId.get(String(post.id));
      const attachment = post.attachments?.data?.[0];
      const imageUrl = post.full_picture || attachment?.media?.image?.src || undefined;
      const media = imageUrl
        ? [{ public_url: imageUrl, media_type: 'image', file_name: 'Ảnh Facebook', storage_path: null }]
        : [];
      const now = new Date().toISOString();

      await setDocument(user.idToken, 'contents', contentDocId, {
        id: contentDocId,
        userId: user.id,
        // Canonical value: always store the real Facebook Page ID, not the Firestore document id.
        facebookPageId: page.data.pageId,
        title: postTitle,
        message: post.message || post.story || '',
        link: post.permalink_url || null,
        contentType: imageUrl ? 'photo' : 'text',
        media,
        status: 'published',
        facebookPostId: post.id,
        facebookPermalink: post.permalink_url || `https://www.facebook.com/${post.id}`,
        facebookCreatedTime: post.created_time || null,
        publishError: null,
        source: 'facebook',
        createdAt: existing?.data?.createdAt || post.created_time || now,
        updatedAt: now,
      }, false);
      syncedCount++;
    }

    return res.json({ success: true, syncedCount, message: `Đã đồng bộ thành công ${syncedCount} bài viết từ Facebook.` });
  } catch (err: any) {
    if (err instanceof MetaApiError) return res.status(400).json({ error: err.userFriendlyMessage });
    return res.status(500).json({ error: err.message || 'Lỗi khi đồng bộ bài viết từ Facebook' });
  }
}

facebookRouter.post('/pages/:pageId/sync', async (req: Request, res: Response) => {
  return syncPage(req, res, req.params.pageId);
});

facebookRouter.post('/sync', async (req: Request, res: Response) => {
  const pageId = req.body?.pageId || req.body?.page_id;
  if (!pageId) return res.status(400).json({ error: 'Thiếu pageId để đồng bộ' });
  return syncPage(req, res, pageId);
});
