import { getAdminDb } from '../firebaseAdmin.js';
import { decryptBackgroundPageToken } from './backgroundTokenService.js';
import { getLinkedInstagramAccount } from '../meta/instagramService.js';
import { publishFacebookStory, publishInstagramStory } from '../meta/metaStoryService.js';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

async function publishStoryRecord(doc: QueryDocumentSnapshot) {
  const story: any = doc.data();
  const db = getAdminDb();
  const pageDoc = await db.collection('facebookPages').doc(String(story.facebookPageDocId || '')).get();
  if (!pageDoc.exists) throw new Error('Page dùng để đăng Story không còn tồn tại.');
  const page: any = pageDoc.data();
  const encrypted = page?.backgroundAutomation?.encryptedPageAccessToken;
  if (!page?.backgroundAutomation?.enabled || !encrypted) {
    throw new Error('Chưa bật Chạy nền cho Page. Hãy bật tại Cấu hình trước khi hẹn giờ.');
  }
  const token = decryptBackgroundPageToken(encrypted);
  const pageId = String(page.pageId);
  const version = String(page.graphApiVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');
  const results: Record<string, string> = {};
  const errors: Record<string, string> = {};
  if ((story.platforms || []).includes('facebook')) {
    try { results.facebook = (await publishFacebookStory(pageId, token, story.mediaUrl, story.mediaType, version)).id; }
    catch (err: any) { errors.facebook = err?.userFriendlyMessage || err?.message || 'Facebook lỗi'; }
  }
  if ((story.platforms || []).includes('instagram')) {
    try {
      const account = await getLinkedInstagramAccount(pageId, token, version);
      if (!account) errors.instagram = 'Page chưa liên kết Instagram Professional account.';
      else results.instagram = (await publishInstagramStory(account.id, token, story.mediaUrl, story.mediaType, version)).id;
    } catch (err: any) { errors.instagram = err?.userFriendlyMessage || err?.message || 'Instagram lỗi'; }
  }
  if (!Object.keys(results).length) throw new Error(Object.entries(errors).map(([p,m]) => `${p}: ${m}`).join(' · '));
  const warning = Object.entries(errors).map(([p,m]) => `${p}: ${m}`).join(' · ') || null;
  await doc.ref.update({ status: 'published', platformPostIds: results, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishError: warning });
  return results;
}

export async function runScheduledStoryAutomation(limit = 20) {
  const db = getAdminDb();
  const snapshot = await db.collection('stories').where('status', '==', 'scheduled').limit(Math.max(1, Math.min(limit, 50))).get();
  const due = snapshot.docs.filter(doc => new Date((doc.data() as any).scheduledAt || 0).getTime() <= Date.now());
  const results = [];
  for (const doc of due) {
    try {
      await doc.ref.update({ status: 'publishing', updatedAt: new Date().toISOString() });
      results.push({ id: doc.id, success: true, platformPostIds: await publishStoryRecord(doc) });
    } catch (err: any) {
      await doc.ref.update({ status: 'failed', publishError: err?.message || 'Đăng Story thất bại', updatedAt: new Date().toISOString() });
      results.push({ id: doc.id, success: false, error: err?.message || 'Đăng Story thất bại' });
    }
  }
  return results;
}
