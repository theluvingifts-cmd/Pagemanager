import { Router, Request, Response } from 'express';
import {
  createDocument,
  deleteDocument,
  getDocument,
  isFirebaseRestConfigured,
  queryDocuments,
  updateDocument,
} from '../services/firebaseRest.js';
import {
  publishTextPost,
  publishLinkPost,
  publishPhotoPost,
  deleteFacebookPost,
  PublishResult,
} from '../services/meta/metaPostService.js';
import { decryptToken } from '../services/meta/metaTokenService.js';
import { getVaultKeyFromRequest, resolveMetaConfig } from '../services/meta/metaConfigService.js';
import { MetaApiError } from '../services/meta/metaError.js';
import { authenticateRequest } from '../middleware/authMiddleware.js';

export const contentRouter = Router();

function normalizeMedia(input: any): any[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(Boolean)
    .map(item => ({
      public_url: item.public_url || item.url || '',
      media_type: item.media_type || item.type || 'image',
      file_name: item.file_name || item.name || 'Tệp đính kèm',
      storage_path: item.storage_path || null,
    }))
    .filter(item => Boolean(item.public_url));
}

function toApiContent(id: string, data: any, pageInfo?: any) {
  return {
    id,
    user_id: data.userId,
    facebook_page_id: data.facebookPageId || null,
    title: data.title || '',
    message: data.message || '',
    link: data.link || null,
    content_type: data.contentType || 'text',
    contentType: data.contentType || 'text',
    status: data.status || 'draft',
    scheduled_at: data.scheduledAt || null,
    facebook_post_id: data.facebookPostId || null,
    facebook_permalink: data.facebookPermalink || null,
    facebook_created_time: data.facebookCreatedTime || null,
    publish_error: data.publishError || null,
    source: data.source || 'pagemanager',
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    media: normalizeMedia(data.media),
    facebook_page: pageInfo
      ? {
          id: pageInfo.id,
          page_id: pageInfo.pageId,
          page_name: pageInfo.pageName,
          page_avatar_url: pageInfo.pageAvatarUrl,
        }
      : null,
  };
}

async function getOwnedContent(user: any, contentId: string) {
  const record = await getDocument<any>(user.idToken, 'contents', contentId);
  if (!record) return null;
  if (record.data.userId !== user.id) return 'forbidden' as const;
  return record;
}

async function getOwnedPages(user: any) {
  return queryDocuments<any>(user.idToken, 'facebookPages', [
    { field: 'userId', value: user.id },
  ]);
}

/** List all contents for the authenticated user. */
contentRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!isFirebaseRestConfigured()) {
      return res.status(503).json({ contents: [], error: 'Firebase chưa được cấu hình.' });
    }

    const { page_id, status, search } = req.query;
    const [contentRecords, pageRecords] = await Promise.all([
      queryDocuments<any>(user.idToken, 'contents', [{ field: 'userId', value: user.id }]),
      getOwnedPages(user),
    ]);

    const pageMap = new Map<string, any>();
    for (const page of pageRecords) {
      pageMap.set(page.id, { ...page.data, id: page.id });
      if (page.data.pageId) pageMap.set(page.data.pageId, { ...page.data, id: page.id });
    }

    let items = contentRecords.map(record => {
      const data = record.data;
      return toApiContent(record.id, data, data.facebookPageId ? pageMap.get(data.facebookPageId) : null);
    });

    if (typeof page_id === 'string' && page_id !== 'all') {
      // Backward compatibility: older synced/published records may have stored
      // the Firestore facebookPages document id instead of the real Meta Page ID.
      // Resolve both forms so existing records remain visible immediately.
      const requestedPage = pageMap.get(page_id);
      const acceptedPageIds = new Set<string>([page_id]);
      if (requestedPage?.id) acceptedPageIds.add(String(requestedPage.id));
      if (requestedPage?.pageId) acceptedPageIds.add(String(requestedPage.pageId));
      items = items.filter(item =>
        Boolean(item.facebook_page_id) && acceptedPageIds.has(String(item.facebook_page_id))
      );
    }
    if (typeof status === 'string' && status !== 'all') {
      items = items.filter(item => item.status === status);
    }
    if (typeof search === 'string' && search.trim()) {
      const term = search.toLowerCase();
      items = items.filter(item =>
        item.title.toLowerCase().includes(term) || item.message.toLowerCase().includes(term)
      );
    }

    items.sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return res.json({ contents: items });
  } catch (err: any) {
    console.error('List content error:', err);
    return res.status(500).json({ contents: [], error: err.message || 'Lỗi khi tải danh sách bài viết' });
  }
});

/** Get single content detail. */
contentRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const owned = await getOwnedContent(user, req.params.id);
    if (!owned) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    if (owned === 'forbidden') return res.status(403).json({ error: 'Không có quyền truy cập bài viết này' });

    let pageInfo: any = null;
    if (owned.data.facebookPageId) {
      const page = await getDocument<any>(user.idToken, 'facebookPages', owned.data.facebookPageId);
      if (page && page.data.userId === user.id) pageInfo = { ...page.data, id: page.id };
    }

    return res.json({ content: toApiContent(owned.id, owned.data, pageInfo) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi tải chi tiết bài viết' });
  }
});

/** Create new content. */
contentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const {
      title,
      message,
      link,
      content_type = 'text',
      facebook_page_id,
      scheduled_at,
      status = 'draft',
      media,
    } = req.body || {};

    if (!title && !message) {
      return res.status(400).json({ error: 'Vui lòng nhập tiêu đề hoặc nội dung bài viết' });
    }

    const now = new Date().toISOString();
    const newContent = {
      userId: user.id,
      facebookPageId: facebook_page_id || null,
      title: title || (message ? String(message).slice(0, 60) : 'Bài viết mới'),
      message: message || '',
      link: link || null,
      contentType: content_type,
      status,
      scheduledAt: scheduled_at || null,
      media: normalizeMedia(media),
      facebookPostId: null,
      facebookPermalink: null,
      facebookCreatedTime: null,
      publishError: null,
      source: 'pagemanager',
      createdAt: now,
      updatedAt: now,
    };

    const created = await createDocument(user.idToken, 'contents', newContent);
    return res.json({
      content: toApiContent(created.id, { ...newContent, id: created.id }),
      message: 'Tạo bài viết thành công',
    });
  } catch (err: any) {
    console.error('Create content error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi khi tạo bài viết' });
  }
});

contentRouter.put('/:id', handleUpdateContent);
contentRouter.patch('/:id', handleUpdateContent);

async function handleUpdateContent(req: Request, res: Response) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const owned = await getOwnedContent(user, req.params.id);
    if (!owned) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    if (owned === 'forbidden') return res.status(403).json({ error: 'Không có quyền sửa bài viết này' });

    const {
      title,
      message,
      link,
      content_type,
      facebook_page_id,
      scheduled_at,
      status,
      media,
    } = req.body || {};

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (message !== undefined) updates.message = message;
    if (link !== undefined) updates.link = link;
    if (content_type !== undefined) updates.contentType = content_type;
    if (facebook_page_id !== undefined) updates.facebookPageId = facebook_page_id;
    if (scheduled_at !== undefined) updates.scheduledAt = scheduled_at;
    if (status !== undefined) updates.status = status;
    if (media !== undefined) updates.media = normalizeMedia(media);

    await updateDocument(user.idToken, 'contents', req.params.id, updates);
    return res.json({ success: true, message: 'Cập nhật bài viết thành công' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật bài viết' });
  }
}

/**
 * Delete content.
 * - Draft/ready/failed: delete Firestore record only.
 * - Published post with facebookPostId: delete the real Facebook post first, then Firestore.
 * - Query ?facebook=false can be used later for a local-only cleanup.
 */
contentRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const owned = await getOwnedContent(user, req.params.id);
    if (!owned) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    if (owned === 'forbidden') return res.status(403).json({ error: 'Không có quyền xóa bài viết này' });

    const content = owned.data;
    const explicitFacebookFlag = String(req.query.facebook || '').toLowerCase();
    const hasRealFacebookPost = Boolean(content.facebookPostId);
    const shouldDeleteFromFacebook = explicitFacebookFlag === 'true' || (
      explicitFacebookFlag !== 'false' &&
      content.status === 'published' &&
      hasRealFacebookPost
    );

    let facebookDeleted = false;

    if (shouldDeleteFromFacebook) {
      if (!content.facebookPostId) {
        return res.status(400).json({
          error: 'Bài viết không có Facebook Post ID nên không thể xóa trực tiếp trên Facebook.',
        });
      }

      const pages = await getOwnedPages(user);
      const pageRecord = pages.find(page =>
        page.id === content.facebookPageId ||
        page.data.pageId === content.facebookPageId ||
        String(content.facebookPostId).startsWith(`${page.data.pageId}_`)
      );

      if (!pageRecord) {
        return res.status(400).json({
          error: 'Không tìm thấy Facebook Page/token tương ứng để xóa bài trên Facebook.',
        });
      }

      const page = pageRecord.data;
      if (!page.encryptedPageAccessToken) {
        return res.status(400).json({
          error: 'Page chưa có Access Token hợp lệ. Hãy kết nối lại Facebook trước khi xóa bài.',
        });
      }

      const vaultKey = getVaultKeyFromRequest(req, true);
      let pageToken: string;
      try {
        pageToken = decryptToken(page.encryptedPageAccessToken, vaultKey);
      } catch {
        return res.status(400).json({
          error: 'Không giải mã được Page Access Token trên trình duyệt này. Hãy kết nối lại Facebook.',
        });
      }

      const graphApiVersion = page.graphApiVersion ||
        (await resolveMetaConfig(user, '', false)).graphApiVersion;

      try {
        facebookDeleted = await deleteFacebookPost(
          content.facebookPostId,
          pageToken,
          graphApiVersion
        );
      } catch (deleteErr: any) {
        const userMessage = deleteErr instanceof MetaApiError
          ? deleteErr.userFriendlyMessage
          : deleteErr.message || 'Facebook từ chối xóa bài viết';

        // IMPORTANT: keep the Firestore record if Meta deletion failed.
        return res.status(400).json({
          success: false,
          error: `Không xóa record Page Manager vì bài trên Facebook chưa xóa được: ${userMessage}`,
          code: deleteErr.code,
          subcode: deleteErr.subcode,
        });
      }

      if (!facebookDeleted) {
        return res.status(400).json({
          success: false,
          error: 'Meta không xác nhận đã xóa bài. Record trong Page Manager được giữ nguyên để tránh mất dấu.',
        });
      }
    }

    await deleteDocument(user.idToken, 'contents', req.params.id);

    return res.json({
      success: true,
      facebook_deleted: facebookDeleted,
      message: facebookDeleted
        ? 'Đã xóa bài trên Facebook và xóa khỏi Page Manager.'
        : 'Đã xóa bài khỏi Page Manager.',
    });
  } catch (err: any) {
    console.error('Delete content error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi khi xóa bài viết' });
  }
});

/** Publish directly to the connected Facebook Page through Meta Graph API. */
contentRouter.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' });
    }

    const owned = await getOwnedContent(user, req.params.id);
    if (!owned) return res.status(404).json({ error: 'Không tìm thấy bài viết cần xuất bản.' });
    if (owned === 'forbidden') return res.status(403).json({ error: 'Bạn không sở hữu bài viết này.' });

    const content = owned.data;
    const targetPageId = req.body?.facebook_page_id || content.facebookPageId;
    if (!targetPageId) {
      return res.status(400).json({ error: 'Bài viết chưa được gán Facebook Page đích để xuất bản.' });
    }

    const pages = await getOwnedPages(user);
    const pageRecord = pages.find(
      page => page.id === targetPageId || page.data.pageId === targetPageId
    );
    if (!pageRecord) {
      return res.status(400).json({ error: 'Không tìm thấy Facebook Page đã kết nối trong tài khoản của bạn.' });
    }

    const page = pageRecord.data;
    if (!page.encryptedPageAccessToken) {
      return res.status(400).json({ error: 'Page chưa có Access Token hợp lệ. Vui lòng kết nối lại Page.' });
    }

    const vaultKey = getVaultKeyFromRequest(req, true);
    let pageToken: string;
    try {
      pageToken = decryptToken(page.encryptedPageAccessToken, vaultKey);
    } catch {
      return res.status(400).json({ error: 'Không giải mã được Page Access Token trên trình duyệt này. Hãy kết nối lại Facebook.' });
    }
    const realFacebookPageId = page.pageId;
    const graphApiVersion = page.graphApiVersion || (await resolveMetaConfig(user, '', false)).graphApiVersion;
    const now = new Date().toISOString();

    await updateDocument(user.idToken, 'contents', owned.id, {
      status: 'publishing',
      publishError: null,
      updatedAt: now,
    });

    let fbResult: PublishResult;
    try {
      const messageText = content.message || content.title || '';
      const media = normalizeMedia(content.media);
      const firstImage = media.find(item => item.media_type === 'image' && item.public_url);
      const photoUrl = req.body?.photo_url || firstImage?.public_url || null;

      if (photoUrl) {
        // Correct signature: (pageId, token, caption, photoUrl)
        fbResult = await publishPhotoPost(realFacebookPageId, pageToken, messageText, photoUrl, graphApiVersion);
      } else if (content.link) {
        // Correct signature: (pageId, token, message, link)
        fbResult = await publishLinkPost(realFacebookPageId, pageToken, messageText, content.link, graphApiVersion);
      } else {
        fbResult = await publishTextPost(realFacebookPageId, pageToken, messageText, graphApiVersion);
      }
    } catch (publishErr: any) {
      console.error('Meta Graph API Publish Failure:', publishErr);
      const userMessage = publishErr instanceof MetaApiError
        ? publishErr.userFriendlyMessage
        : publishErr.message || 'Lỗi không xác định từ Meta Graph API khi xuất bản bài viết';

      await updateDocument(user.idToken, 'contents', owned.id, {
        status: 'failed',
        publishError: userMessage,
        updatedAt: new Date().toISOString(),
      });

      return res.status(400).json({
        success: false,
        error: userMessage,
        code: publishErr.code,
        subcode: publishErr.subcode,
      });
    }

    const postId = fbResult.facebookPostId;
    let permalink = fbResult.permalink;
    if (!permalink && postId) {
      const parts = postId.split('_');
      permalink = parts.length === 2
        ? `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`
        : `https://www.facebook.com/${postId}`;
    }

    const publishedAt = fbResult.publishedAt || new Date().toISOString();
    await updateDocument(user.idToken, 'contents', owned.id, {
      status: 'published',
      // Canonical value: store the real Meta Page ID so filtering is consistent everywhere.
      facebookPageId: realFacebookPageId,
      facebookPostId: postId,
      facebookPermalink: permalink || null,
      facebookCreatedTime: publishedAt,
      publishError: null,
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'Đã đăng bài viết trực tiếp lên Facebook Page thành công!',
      facebook_post_id: postId,
      facebook_permalink: permalink,
      permalink,
      content: {
        id: owned.id,
        facebook_post_id: postId,
        facebook_permalink: permalink,
        status: 'published',
      },
    });
  } catch (err: any) {
    console.error('Publish Route General Error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi xử lý yêu cầu đăng bài lên Facebook' });
  }
});
