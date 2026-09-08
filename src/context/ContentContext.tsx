import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ContentItem, ContentStatus } from '../types/content';
import { useAuth } from './AuthContext';
import { useFacebook } from './FacebookContext';

interface ContentContextType {
  contents: ContentItem[];
  loading: boolean;
  getContent: (id: string) => ContentItem | undefined;
  createContent: (data: {
    title: string;
    message: string;
    link?: string;
    content_type?: string;
    status?: 'draft' | 'ready';
    facebook_page_id?: string;
    scheduled_at?: string;
    media?: Array<{ public_url: string; media_type: 'image' | 'video'; file_name?: string; storage_path?: string }>;
  }) => Promise<{ success: boolean; content?: ContentItem; error?: string }>;
  updateContent: (id: string, updates: Partial<ContentItem>) => Promise<{ success: boolean; error?: string }>;
  deleteContent: (id: string) => Promise<{ success: boolean; error?: string; message?: string; facebookDeleted?: boolean }>;
  publishToFacebook: (id: string, facebookPageId?: string) => Promise<{
    success: boolean;
    permalink?: string;
    facebookPostId?: string;
    error?: string;
  }>;
  refreshContents: () => Promise<void>;
  stats: {
    total: number;
    draft: number;
    ready: number;
    scheduled: number;
    publishing: number;
    published: number;
    failed: number;
  };
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, apiFetch } = useAuth();
  const { selectedPage } = useFacebook();
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);

  const mapDbRecordToContent = (item: any): ContentItem => ({
    id: item.id,
    title: item.title,
    caption: item.message || '',
    message: item.message || '',
    link: item.link || null,
    format: (item.content_type || item.contentType || 'text') as any,
    content_type: item.content_type || item.contentType || 'text',
    status: item.status as ContentStatus,
    source: item.source || 'pagemanager',
    scheduledAt: item.scheduled_at,
    scheduled_at: item.scheduled_at,
    publishedAt: item.facebook_created_time || (item.status === 'published' ? item.updated_at : undefined),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    pageId: item.facebook_page_id,
    facebook_page_id: item.facebook_page_id,
    facebook_post_id: item.facebook_post_id,
    facebook_permalink: item.facebook_permalink,
    facebook_created_time: item.facebook_created_time,
    publish_error: item.publish_error,
    facebook_page: item.facebook_page,
    media: (item.media || []).map((m: any) => ({
      id: m.id,
      url: m.public_url || m.url,
      name: m.file_name || m.name || 'Tệp đính kèm',
      type: m.media_type || m.type || 'image',
      storage_path: m.storage_path,
    })),
  });

  const refreshContents = useCallback(async () => {
    if (!user) {
      setContents([]);
      return;
    }
    setLoading(true);
    try {
      let url = '/api/contents';
      if (selectedPage?.page_id) url += `?page_id=${encodeURIComponent(selectedPage.page_id)}`;
      const res = await apiFetch(url);
      const data = await res.json();
      if (res.ok) {
        setContents((data.contents || []).map(mapDbRecordToContent));
      } else {
        console.error('Content API error:', data.error);
      }
    } catch (err) {
      console.error('Error fetching contents:', err);
    } finally {
      setLoading(false);
    }
  }, [user, selectedPage?.page_id, apiFetch]);

  useEffect(() => {
    refreshContents();
  }, [refreshContents]);

  useEffect(() => {
    const handleContentsChanged = () => {
      refreshContents();
    };
    window.addEventListener('pagemanager:contents-changed', handleContentsChanged);
    return () => window.removeEventListener('pagemanager:contents-changed', handleContentsChanged);
  }, [refreshContents]);

  const getContent = (id: string) => contents.find(c => c.id === id);

  const createContent = async (payload: {
    title: string;
    message: string;
    link?: string;
    content_type?: string;
    status?: 'draft' | 'ready';
    facebook_page_id?: string;
    scheduled_at?: string;
    media?: Array<{ public_url: string; media_type: 'image' | 'video'; file_name?: string; storage_path?: string }>;
  }) => {
    try {
      const pageId = payload.facebook_page_id || selectedPage?.page_id;
      const res = await apiFetch('/api/contents', {
        method: 'POST',
        body: JSON.stringify({ ...payload, facebook_page_id: pageId }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Lỗi khi lưu bài viết' };
      await refreshContents();
      return { success: true, content: mapDbRecordToContent(data.content) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối' };
    }
  };

  const updateContent = async (id: string, updates: Partial<ContentItem>) => {
    try {
      const payload: any = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.caption !== undefined) payload.message = updates.caption;
      if (updates.message !== undefined) payload.message = updates.message;
      if (updates.link !== undefined) payload.link = updates.link;
      if (updates.format !== undefined) payload.content_type = updates.format;
      if (updates.content_type !== undefined) payload.content_type = updates.content_type;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.pageId !== undefined) payload.facebook_page_id = updates.pageId;
      if (updates.facebook_page_id !== undefined) payload.facebook_page_id = updates.facebook_page_id;
      if (updates.scheduledAt !== undefined) payload.scheduled_at = updates.scheduledAt;
      if (updates.scheduled_at !== undefined) payload.scheduled_at = updates.scheduled_at;
      if (updates.media !== undefined) {
        payload.media = updates.media.map(m => ({
          public_url: m.url,
          media_type: m.type,
          file_name: m.name,
          storage_path: m.storage_path,
        }));
      }

      const res = await apiFetch(`/api/contents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Lỗi cập nhật' };
      await refreshContents();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const deleteContent = async (id: string) => {
    try {
      const item = contents.find(c => c.id === id);
      const deleteRealFacebookPost = Boolean(
        item?.status === 'published' && item?.facebook_post_id
      );

      const query = deleteRealFacebookPost ? '?facebook=true' : '?facebook=false';
      const res = await apiFetch(`/api/contents/${id}${query}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: data.error || 'Lỗi khi xóa bài viết' };
      }

      setContents(prev => prev.filter(c => c.id !== id));
      return {
        success: true,
        message: data.message,
        facebookDeleted: Boolean(data.facebook_deleted),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const publishToFacebook = async (id: string, facebookPageId?: string) => {
    setContents(prev => prev.map(c =>
      c.id === id ? { ...c, status: 'publishing' as ContentStatus, publish_error: undefined } : c
    ));

    try {
      const pageId = facebookPageId || selectedPage?.page_id;
      const res = await apiFetch(`/api/contents/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ facebook_page_id: pageId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setContents(prev => prev.map(c =>
          c.id === id
            ? { ...c, status: 'failed' as ContentStatus, publish_error: data.error || 'Đăng bài thất bại' }
            : c
        ));
        return { success: false, error: data.error || 'Đăng bài lên Facebook thất bại' };
      }

      await refreshContents();
      return {
        success: true,
        permalink: data.permalink || data.facebook_permalink,
        facebookPostId: data.facebook_post_id || data.content?.facebook_post_id,
      };
    } catch (err: any) {
      setContents(prev => prev.map(c =>
        c.id === id
          ? { ...c, status: 'failed' as ContentStatus, publish_error: err.message || 'Lỗi mạng khi đăng bài' }
          : c
      ));
      return { success: false, error: err.message || 'Lỗi kết nối khi gửi bài lên Facebook' };
    }
  };

  const stats = useMemo(() => ({
    total: contents.length,
    draft: contents.filter(c => c.status === 'draft').length,
    ready: contents.filter(c => c.status === 'ready').length,
    scheduled: contents.filter(c => c.status === 'scheduled').length,
    publishing: contents.filter(c => c.status === 'publishing').length,
    published: contents.filter(c => c.status === 'published').length,
    failed: contents.filter(c => c.status === 'failed').length,
  }), [contents]);

  return (
    <ContentContext.Provider value={{
      contents,
      loading,
      getContent,
      createContent,
      updateContent,
      deleteContent,
      publishToFacebook,
      refreshContents,
      stats,
    }}>
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) throw new Error('useContent must be used within a ContentProvider');
  return context;
};
