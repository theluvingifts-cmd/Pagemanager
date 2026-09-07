import { Router, Request, Response } from 'express';
import {
  getOAuthUrl,
  exchangeCodeForUserToken,
} from '../services/meta/metaOAuthService';
import { getManagedPages, testPageConnection } from '../services/meta/metaPageService';
import { getPagePosts } from '../services/meta/metaPostService';
import { encryptToken, decryptToken } from '../services/meta/metaTokenService';
import {
  getAdminDb,
  isFirebaseAdminConfigured,
} from '../services/firebaseAdmin';
import { authenticateRequest } from '../middleware/authMiddleware';
import { MetaApiError } from '../services/meta/metaError';

export const facebookRouter = Router();

function getAppRedirectUri(req: Request): string {
  if (process.env.META_REDIRECT_URI) {
    return process.env.META_REDIRECT_URI;
  }
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl.replace(/\/$/, '')}/api/facebook/callback`;
}

/**
 * Check if Facebook App and Firebase are configured
 */
facebookRouter.get('/status', async (req: Request, res: Response) => {
  const metaConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  const firebaseConfigured = isFirebaseAdminConfigured();

  const user = await authenticateRequest(req);
  let connectedPagesCount = 0;
  let hasConnection = false;

  if (user && firebaseConfigured) {
    try {
      const db = getAdminDb();
      const connSnap = await db
        .collection('facebookConnections')
        .where('userId', '==', user.id)
        .limit(1)
        .get();

      hasConnection = !connSnap.empty;

      const pagesSnap = await db
        .collection('facebookPages')
        .where('userId', '==', user.id)
        .get();

      connectedPagesCount = pagesSnap.size;
    } catch (e: any) {
      console.warn('Server Firestore notice for facebook status:', e?.message || e);
    }
  }

  res.json({
    metaConfigured,
    firebaseConfigured,
    hasConnection,
    connectedPagesCount,
    redirectUri: getAppRedirectUri(req),
  });
});

/**
 * Generate Meta OAuth authorization URL
 */
facebookRouter.get('/oauth-url', handleOAuthUrl);
facebookRouter.get('/auth-url', handleOAuthUrl);

async function handleOAuthUrl(req: Request, res: Response) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Chưa đăng nhập. Vui lòng đăng nhập trước khi kết nối Facebook.' });
    }

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return res.status(400).json({
        error: 'Biến môi trường META_APP_ID chưa được cấu hình. Vui lòng xem hướng dẫn trong phần Cài đặt.',
        code: 'META_NOT_CONFIGURED',
      });
    }

    const redirectUri = getAppRedirectUri(req);
    const statePayload = Buffer.from(JSON.stringify({
      userId: user.id,
      timestamp: Date.now(),
    })).toString('base64');

    const oauthUrl = getOAuthUrl(redirectUri, statePayload);

    res.json({ url: oauthUrl, redirectUri });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Lỗi tạo liên kết đăng nhập Facebook' });
  }
}

/**
 * Meta OAuth Callback endpoint
 */
facebookRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <html>
        <body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#e11d48;">Kết nối Facebook thất bại</h2>
          <p>${error_description || error}</p>
          <button onclick="window.close()" style="padding:10px 20px;border-radius:8px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-weight:bold;">Đóng cửa sổ</button>
        </body>
      </html>
    `);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Mã xác thực (code) không hợp lệ');
  }

  let userId: string | null = null;
  if (state && typeof state === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
      userId = decoded.userId;
    } catch (e) {
      console.error('Failed to parse OAuth state:', e);
    }
  }

  if (!userId) {
    return res.status(400).send('Không xác định được người dùng hợp lệ từ OAuth state');
  }

  try {
    const redirectUri = getAppRedirectUri(req);
    const tokenData = await exchangeCodeForUserToken(code, redirectUri);

    if (!isFirebaseAdminConfigured()) {
      throw new Error('Firebase Admin chưa được cấu hình trên máy chủ');
    }

    const db = getAdminDb();
    const encryptedUserToken = encryptToken(tokenData.accessToken);

    // 1. Save or update connection in Firestore
    const connectionRef = db.collection('facebookConnections').doc(`${userId}_${tokenData.metaUserId}`);
    await connectionRef.set({
      id: connectionRef.id,
      userId,
      metaUserId: tokenData.metaUserId,
      encryptedAccessToken: encryptedUserToken,
      tokenExpiresAt: tokenData.expiresIn
        ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
        : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // 2. Fetch all managed pages for this user
    const managedPages = await getManagedPages(tokenData.accessToken);

    // 3. Save each page with encrypted token into Firestore
    for (const page of managedPages) {
      const encryptedPageToken = encryptToken(page.page_access_token);
      const pageDocRef = db.collection('facebookPages').doc(`${userId}_${page.page_id}`);

      await pageDocRef.set({
        id: pageDocRef.id,
        userId,
        connectionId: connectionRef.id,
        pageId: page.page_id,
        pageName: page.page_name,
        pageUsername: page.page_username || null,
        pageAvatarUrl: page.page_avatar_url || null,
        encryptedPageAccessToken: encryptedPageToken,
        pageTasks: page.page_tasks || [],
        connectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Return HTML that posts message to opener window and closes
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Kết nối Facebook Thành Công</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
            .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; }
            .icon { width: 56px; height: 56px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; }
            h2 { margin: 0 0 8px; font-size: 20px; }
            p { margin: 0 0 20px; color: #64748b; font-size: 14px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h2>Kết nối Facebook thành công!</h2>
            <p>Đã đồng bộ ${managedPages.length} Facebook Page vào hệ thống của bạn. Đang tự động quay lại ứng dụng...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'META_OAUTH_SUCCESS', pageCount: ${managedPages.length} }, '*');
            }
            setTimeout(function() {
              window.close();
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('OAuth Callback Error:', err);
    return res.status(500).send(`
      <html>
        <body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#e11d48;">Lỗi khi kết nối với Meta Graph API</h2>
          <p>${err.message || 'Không thể trao đổi mã xác thực với Facebook'}</p>
          <button onclick="window.close()" style="padding:10px 20px;border-radius:8px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-weight:bold;">Đóng cửa sổ</button>
        </body>
      </html>
    `);
  }
});

/**
 * List managed pages for the authenticated user
 */
facebookRouter.get('/pages', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    if (!isFirebaseAdminConfigured()) {
      return res.json({ pages: [], message: 'Firebase chưa được cấu hình' });
    }

    const db = getAdminDb();
    const pagesSnap = await db
      .collection('facebookPages')
      .where('userId', '==', user.id)
      .get();

    const pages = pagesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        page_id: data.pageId,
        page_name: data.pageName,
        page_username: data.pageUsername,
        page_avatar_url: data.pageAvatarUrl,
        tasks: data.pageTasks || [],
        is_active: true,
        connected_at: data.connectedAt,
      };
    });

    res.json({
      pages,
      connectedPages: pages,
      connected: pages.length > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách Page' });
  }
});

/**
 * Disconnect a Facebook Page (DELETE or POST disconnect)
 */
facebookRouter.delete('/pages/:pageId', handleDisconnectPage);
facebookRouter.post('/pages/:pageId/disconnect', handleDisconnectPage);

async function handleDisconnectPage(req: Request, res: Response) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const { pageId } = req.params;
    const db = getAdminDb();

    const pageSnap = await db
      .collection('facebookPages')
      .where('userId', '==', user.id)
      .where('pageId', '==', pageId)
      .limit(1)
      .get();

    if (!pageSnap.empty) {
      await pageSnap.docs[0].ref.delete();
    }

    res.json({ success: true, message: 'Đã ngắt kết nối Page' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi ngắt kết nối Page' });
  }
}

/**
 * Connect/activate a Facebook Page
 */
facebookRouter.post('/pages/:pageId/connect', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const { pageId } = req.params;
    const db = getAdminDb();

    // Query by pageId or doc id
    const pageSnap = await db
      .collection('facebookPages')
      .where('userId', '==', user.id)
      .where('pageId', '==', pageId)
      .limit(1)
      .get();

    if (pageSnap.empty) {
      return res.status(404).json({ error: 'Không tìm thấy Page' });
    }

    const doc = pageSnap.docs[0];
    await doc.ref.update({ updatedAt: new Date().toISOString() });

    res.json({ success: true, message: 'Đã kích hoạt Page thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi kích hoạt Page' });
  }
});

/**
 * Test Page connection with Meta Graph API
 */
facebookRouter.post('/pages/:pageId/test', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const { pageId } = req.params;
    const db = getAdminDb();

    const pageSnap = await db
      .collection('facebookPages')
      .where('userId', '==', user.id)
      .where('pageId', '==', pageId)
      .limit(1)
      .get();

    if (pageSnap.empty) {
      return res.status(404).json({ error: 'Không tìm thấy Page' });
    }

    const pageData = pageSnap.docs[0].data();
    const pageToken = decryptToken(pageData.encryptedPageAccessToken);

    const testResult = await testPageConnection(pageData.pageId, pageToken);

    res.json({
      success: true,
      data: testResult,
      canPost: testResult.canPost !== false,
      message: `Page "${testResult.pageName}" kết nối tốt.`,
    });
  } catch (err: any) {
    if (err instanceof MetaApiError) {
      return res.status(400).json({
        success: false,
        error: err.userFriendlyMessage,
        code: err.code,
        subcode: err.subcode,
      });
    }
    res.status(500).json({ success: false, error: err.message || 'Lỗi kiểm tra kết nối Page' });
  }
});

/**
 * Sync published posts from Facebook Page into Firestore
 */
facebookRouter.post('/pages/:pageId/sync', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const { pageId } = req.params;
    const db = getAdminDb();

    // Find the page in Firestore
    const pageSnap = await db
      .collection('facebookPages')
      .where('userId', '==', user.id)
      .where('pageId', '==', pageId)
      .limit(1)
      .get();

    if (pageSnap.empty) {
      return res.status(404).json({ error: 'Không tìm thấy Page' });
    }

    const pageDoc = pageSnap.docs[0];
    const pageData = pageDoc.data();
    const pageToken = decryptToken(pageData.encryptedPageAccessToken);

    // Call Meta Graph API to get latest posts
    const posts = await getPagePosts(pageData.pageId, pageToken, 25);
    let syncedCount = 0;

    for (const post of posts) {
      const postTitle = post.message
        ? (post.message.split('\n')[0] || post.message).slice(0, 60)
        : (post.story || 'Bài viết Facebook');

      const contentDocId = `${user.id}_${post.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const contentRef = db.collection('contents').doc(contentDocId);

      await contentRef.set({
        id: contentDocId,
        userId: user.id,
        facebookPageId: pageDoc.id,
        title: postTitle,
        message: post.message || post.story || '',
        link: post.permalink_url || null,
        contentType: post.full_picture ? 'photo' : 'text',
        status: 'published',
        facebookPostId: post.id,
        facebookPermalink: post.permalink_url || `https://facebook.com/${post.id}`,
        facebookCreatedTime: post.created_time || null,
        publishError: null,
        source: 'facebook',
        createdAt: post.created_time || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      syncedCount++;
    }

    res.json({
      success: true,
      syncedCount,
      message: `Đã đồng bộ thành công ${syncedCount} bài viết từ Facebook.`,
    });
  } catch (err: any) {
    if (err instanceof MetaApiError) {
      return res.status(400).json({ error: err.userFriendlyMessage });
    }
    res.status(500).json({ error: err.message || 'Lỗi khi đồng bộ bài viết từ Facebook' });
  }
});

facebookRouter.post('/sync', async (req: Request, res: Response) => {
  const pageId = req.body.pageId || req.body.page_id;
  if (!pageId) {
    return res.status(400).json({ error: 'Thiếu pageId để đồng bộ' });
  }
  req.params.pageId = pageId;
  // Delegate to sync handler logic by forwarding or redirecting
  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

  const db = getAdminDb();
  const pageSnap = await db
    .collection('facebookPages')
    .where('userId', '==', user.id)
    .where('pageId', '==', pageId)
    .limit(1)
    .get();

  if (pageSnap.empty) {
    return res.status(404).json({ error: 'Không tìm thấy Page' });
  }

  const pageDoc = pageSnap.docs[0];
  const pageData = pageDoc.data();
  const pageToken = decryptToken(pageData.encryptedPageAccessToken);

  try {
    const posts = await getPagePosts(pageData.pageId, pageToken, 25);
    let syncedCount = 0;

    for (const post of posts) {
      const postTitle = post.message
        ? (post.message.split('\n')[0] || post.message).slice(0, 60)
        : (post.story || 'Bài viết Facebook');

      const contentDocId = `${user.id}_${post.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const contentRef = db.collection('contents').doc(contentDocId);

      await contentRef.set({
        id: contentDocId,
        userId: user.id,
        facebookPageId: pageDoc.id,
        title: postTitle,
        message: post.message || post.story || '',
        link: post.permalink_url || null,
        contentType: post.full_picture ? 'photo' : 'text',
        status: 'published',
        facebookPostId: post.id,
        facebookPermalink: post.permalink_url || `https://facebook.com/${post.id}`,
        facebookCreatedTime: post.created_time || null,
        publishError: null,
        source: 'facebook',
        createdAt: post.created_time || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      syncedCount++;
    }

    res.json({
      success: true,
      syncedCount,
      message: `Đã đồng bộ thành công ${syncedCount} bài viết từ Facebook.`,
    });
  } catch (err: any) {
    if (err instanceof MetaApiError) {
      return res.status(400).json({ error: err.userFriendlyMessage });
    }
    res.status(500).json({ error: err.message || 'Lỗi khi đồng bộ bài viết' });
  }
});
