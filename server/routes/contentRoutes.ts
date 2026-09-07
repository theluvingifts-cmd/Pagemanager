import { Router, Request, Response } from 'express';
import {
  getAdminDb,
  isFirebaseAdminConfigured,
} from '../services/firebaseAdmin';
import {
  publishTextPost,
  publishLinkPost,
  publishPhotoPost,
  PublishResult,
} from '../services/meta/metaPostService';
import { decryptToken } from '../services/meta/metaTokenService';
import { MetaApiError } from '../services/meta/metaError';
import { authenticateRequest } from '../middleware/authMiddleware';

export const contentRouter = Router();

/**
 * List all contents for the authenticated user
 */
contentRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    if (!isFirebaseAdminConfigured()) {
      return res.json({ contents: [], message: 'Firebase chưa được cấu hình' });
    }

    let items: any[] = [];
    try {
      const db = getAdminDb();
      const { page_id, status, search } = req.query;

      let query: any = db
        .collection('contents')
        .where('userId', '==', user.id);

      if (page_id && typeof page_id === 'string' && page_id !== 'all') {
        query = query.where('facebookPageId', '==', page_id);
      }

      if (status && typeof status === 'string' && status !== 'all') {
        query = query.where('status', '==', status);
      }

      const snap = await query.get();

      // Fetch user pages to populate page info
      const pagesSnap = await db
        .collection('facebookPages')
        .where('userId', '==', user.id)
        .get();

      const pageMap = new Map<string, any>();
      pagesSnap.docs.forEach(d => {
        const data = d.data();
        pageMap.set(d.id, data);
        pageMap.set(data.pageId, data);
      });

      items = snap.docs.map(doc => {
        const data = doc.data();
        const pageInfo = data.facebookPageId ? pageMap.get(data.facebookPageId) : null;
        return {
          id: doc.id,
          user_id: data.userId,
          facebook_page_id: data.facebookPageId,
          title: data.title || '',
          message: data.message || '',
          link: data.link || null,
          contentType: data.contentType || 'post',
          status: data.status || 'draft',
          scheduled_at: data.scheduledAt || null,
          facebook_post_id: data.facebookPostId || null,
          facebook_permalink: data.facebookPermalink || null,
          facebook_created_time: data.facebookCreatedTime || null,
          publish_error: data.publishError || null,
          source: data.source || 'user',
          created_at: data.createdAt,
          updated_at: data.updatedAt,
          facebook_page: pageInfo
            ? {
                id: pageInfo.id,
                page_id: pageInfo.pageId,
                page_name: pageInfo.pageName,
                page_avatar_url: pageInfo.pageAvatarUrl,
              }
            : null,
        };
      });

      // Client-side search filtering if provided
      if (search && typeof search === 'string') {
        const term = search.toLowerCase();
        items = items.filter(
          item =>
            item.title.toLowerCase().includes(term) ||
            item.message.toLowerCase().includes(term)
        );
      }

      // Sort by created_at desc
      items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } catch (dbErr: any) {
      // In web preview without server Service Account credentials, client-side Firestore SDK handles persistence
      console.warn('Server Firestore notice for content listing:', dbErr.message || dbErr);
    }

    res.json({ contents: items });
  } catch (err: any) {
    res.json({ contents: [], notice: err.message });
  }
});

/**
 * Get single content detail
 */
contentRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const db = getAdminDb();
    const docRef = db.collection('contents').doc(req.params.id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    }

    const data = docSnap.data()!;
    if (data.userId !== user.id) {
      return res.status(403).json({ error: 'Không có quyền truy cập bài viết này' });
    }

    // Get page info if exists
    let pageInfo = null;
    if (data.facebookPageId) {
      const pageDoc = await db.collection('facebookPages').doc(data.facebookPageId).get();
      if (pageDoc.exists) {
        pageInfo = pageDoc.data();
      }
    }

    res.json({
      content: {
        id: docSnap.id,
        user_id: data.userId,
        facebook_page_id: data.facebookPageId,
        title: data.title,
        message: data.message,
        link: data.link,
        contentType: data.contentType,
        status: data.status,
        scheduled_at: data.scheduledAt,
        facebook_post_id: data.facebookPostId,
        facebook_permalink: data.facebookPermalink,
        facebook_created_time: data.facebookCreatedTime,
        publish_error: data.publishError,
        source: data.source,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        facebook_page: pageInfo
          ? {
              id: pageInfo.id,
              page_id: pageInfo.pageId,
              page_name: pageInfo.pageName,
              page_avatar_url: pageInfo.pageAvatarUrl,
            }
          : null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi tải chi tiết bài viết' });
  }
});

/**
 * Create new content
 */
contentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const {
      title,
      message,
      link,
      content_type = 'post',
      facebook_page_id,
      scheduled_at,
      status = 'draft',
      media_ids,
    } = req.body;

    if (!title && !message) {
      return res.status(400).json({ error: 'Vui lòng nhập tiêu đề hoặc nội dung bài viết' });
    }

    const db = getAdminDb();
    const docRef = db.collection('contents').doc();
    const now = new Date().toISOString();

    const newContent = {
      id: docRef.id,
      userId: user.id,
      facebookPageId: facebook_page_id || null,
      title: title || (message ? message.slice(0, 60) : 'Bài viết mới'),
      message: message || '',
      link: link || null,
      contentType: content_type,
      status: status,
      scheduledAt: scheduled_at || null,
      facebookPostId: null,
      facebookPermalink: null,
      facebookCreatedTime: null,
      publishError: null,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(newContent);

    res.json({
      content: {
        ...newContent,
        user_id: user.id,
        facebook_page_id: newContent.facebookPageId,
        scheduled_at: newContent.scheduledAt,
        created_at: now,
        updated_at: now,
      },
      message: 'Tạo bài viết thành công',
    });
  } catch (err: any) {
    console.error('Create content error:', err);
    res.status(500).json({ error: err.message || 'Lỗi khi tạo bài viết' });
  }
});

/**
 * Update existing content (PUT or PATCH)
 */
contentRouter.put('/:id', handleUpdateContent);
contentRouter.patch('/:id', handleUpdateContent);

async function handleUpdateContent(req: Request, res: Response) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const db = getAdminDb();
    const docRef = db.collection('contents').doc(req.params.id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    }

    if (docSnap.data()?.userId !== user.id) {
      return res.status(403).json({ error: 'Không có quyền sửa bài viết này' });
    }

    const {
      title,
      message,
      link,
      content_type,
      facebook_page_id,
      scheduled_at,
      status,
    } = req.body;

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (title !== undefined) updates.title = title;
    if (message !== undefined) updates.message = message;
    if (link !== undefined) updates.link = link;
    if (content_type !== undefined) updates.contentType = content_type;
    if (facebook_page_id !== undefined) updates.facebookPageId = facebook_page_id;
    if (scheduled_at !== undefined) updates.scheduledAt = scheduled_at;
    if (status !== undefined) updates.status = status;

    await docRef.update(updates);

    res.json({ success: true, message: 'Cập nhật bài viết thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi cập nhật bài viết' });
  }
}

/**
 * Delete content
 */
contentRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const db = getAdminDb();
    const docRef = db.collection('contents').doc(req.params.id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    }

    if (docSnap.data()?.userId !== user.id) {
      return res.status(403).json({ error: 'Không có quyền xóa bài viết này' });
    }

    await docRef.delete();

    res.json({ success: true, message: 'Đã xóa bài viết' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khi xóa bài viết' });
  }
});

/**
 * PUBLISH CONTENT TO FACEBOOK PAGE (Strict Real Meta Graph API Integration)
 * Requirement 14:
 * 1. verify Firebase ID Token
 * 2. get UID
 * 3. read content from Firestore
 * 4. verify content belongs to UID
 * 5. read Facebook Page
 * 6. decrypt Page Access Token
 * 7. call Meta Graph API
 * 8. receive real Facebook Post ID
 * 9. update Firestore (only set 'published' on true Meta success; 'failed' on error)
 */
contentRouter.post('/:id/publish', async (req: Request, res: Response) => {
  const contentId = req.params.id;

  try {
    // 1 & 2: Verify Firebase ID Token & get UID
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' });

    if (!isFirebaseAdminConfigured()) {
      return res.status(400).json({ error: 'Firebase Admin chưa được cấu hình.' });
    }

    const db = getAdminDb();

    // 3 & 4: Read content from Firestore & verify ownership
    const contentRef = db.collection('contents').doc(contentId);
    const contentSnap = await contentRef.get();

    if (!contentSnap.exists) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết cần xuất bản.' });
    }

    const content = contentSnap.data()!;
    if (content.userId !== user.id) {
      return res.status(403).json({ error: 'Bạn không sở hữu bài viết này.' });
    }

    // Determine target Facebook Page
    const targetPageId = req.body.facebook_page_id || content.facebookPageId;
    if (!targetPageId) {
      return res.status(400).json({ error: 'Bài viết chưa được gán Facebook Page đích để xuất bản.' });
    }

    // 5: Read Facebook Page from Firestore
    let pageDocSnap = await db.collection('facebookPages').doc(targetPageId).get();
    if (!pageDocSnap.exists) {
      // Search by pageId or doc id for this user
      const altSnap = await db
        .collection('facebookPages')
        .where('userId', '==', user.id)
        .where('pageId', '==', targetPageId)
        .limit(1)
        .get();

      if (!altSnap.empty) {
        pageDocSnap = altSnap.docs[0];
      }
    }

    if (!pageDocSnap.exists) {
      return res.status(400).json({ error: 'Không tìm thấy Facebook Page đã kết nối trong tài khoản của bạn.' });
    }

    const page = pageDocSnap.data()!;
    if (page.userId !== user.id) {
      return res.status(403).json({ error: 'Bạn không có quyền đăng lên Facebook Page này.' });
    }

    // 6: Decrypt Page Access Token
    if (!page.encryptedPageAccessToken) {
      return res.status(400).json({ error: 'Page chưa có Access Token hợp lệ. Vui lòng kết nối lại Page.' });
    }

    const pageToken = decryptToken(page.encryptedPageAccessToken);
    const realFacebookPageId = page.pageId;

    // Update status to 'publishing'
    await contentRef.update({
      status: 'publishing',
      publishError: null,
      updatedAt: new Date().toISOString(),
    });

    let fbResult: PublishResult;

    // 7: Call Meta Graph API
    try {
      const messageText = content.message || content.title;
      const photoUrl = req.body.photo_url || null;

      if (photoUrl) {
        fbResult = await publishPhotoPost(realFacebookPageId, pageToken, photoUrl, messageText);
      } else if (content.link) {
        fbResult = await publishLinkPost(realFacebookPageId, pageToken, content.link, messageText);
      } else {
        fbResult = await publishTextPost(realFacebookPageId, pageToken, messageText);
      }
    } catch (publishErr: any) {
      console.error('Meta Graph API Publish Failure:', publishErr);
      const userMessage = publishErr instanceof MetaApiError
        ? publishErr.userFriendlyMessage
        : (publishErr.message || 'Lỗi không xác định từ Meta Graph API khi xuất bản bài viết');

      // 9: If error, set 'failed' and save publishError
      await contentRef.update({
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

    // 8 & 9: On true Meta success, receive real Post ID and set status = 'published'
    const postId = fbResult.facebookPostId;
    let permalink = fbResult.permalink;
    if (!permalink && postId) {
      const idParts = postId.split('_');
      permalink = idParts.length === 2
        ? `https://facebook.com/${idParts[0]}/posts/${idParts[1]}`
        : `https://facebook.com/${postId}`;
    }

    await contentRef.update({
      status: 'published',
      facebookPostId: postId,
      facebookPermalink: permalink || null,
      facebookCreatedTime: new Date().toISOString(),
      publishError: null,
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'Đã đăng bài viết trực tiếp lên Facebook Page thành công!',
      facebook_post_id: postId,
      facebook_permalink: permalink,
    });
  } catch (err: any) {
    console.error('Publish Route General Error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi xử lý yêu cầu đăng bài lên Facebook' });
  }
});
