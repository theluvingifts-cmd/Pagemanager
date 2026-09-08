import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFacebook } from '../../context/FacebookContext';
import {
  InstagramAccount,
  InstagramCacheEntry,
  InstagramComment,
  InstagramConversation,
  InstagramCustomerMeta,
  InstagramMediaItem,
} from './types';

interface InstagramContextValue {
  account: InstagramAccount | null;
  linked: boolean;
  media: InstagramMediaItem[];
  conversations: InstagramConversation[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  requiredPermissions: string[];
  selectedMedia: InstagramMediaItem | null;
  setSelectedMedia: (media: InstagramMediaItem | null) => void;
  selectedConversation: InstagramConversation | null;
  setSelectedConversation: (conversation: InstagramConversation | null) => void;
  refreshAll: (force?: boolean) => Promise<void>;
  loadComments: (mediaId: string, force?: boolean) => Promise<InstagramComment[]>;
  replyComment: (commentId: string, message: string) => Promise<{ success: boolean; error?: string }>;
  deleteComment: (commentId: string) => Promise<{ success: boolean; error?: string }>;
  loadConversation: (conversationId: string, force?: boolean) => Promise<InstagramConversation | null>;
  peekConversation: (conversationId: string) => InstagramConversation | null;
  sendMessage: (recipientId: string, message: string) => Promise<{ success: boolean; error?: string }>;
  updateCustomerMeta: (customerId: string, patch: Partial<InstagramCustomerMeta>) => Promise<{ success: boolean; meta?: InstagramCustomerMeta; error?: string }>;
}

const InstagramContext = createContext<InstagramContextValue | undefined>(undefined);
const CACHE_TTL = 60_000;
const DETAIL_TTL = 90_000;
const STORAGE_PREFIX = 'pagemanager_instagram_cache_v3';
const SELECTED_PREFIX = 'pagemanager_instagram_selected_conversation';

function cacheStorageKey(pageId: string) { return `${STORAGE_PREFIX}:${pageId}`; }
function selectedStorageKey(pageId: string) { return `${SELECTED_PREFIX}:${pageId}`; }
function detailStorageKey(pageId: string, conversationId: string) { return `${STORAGE_PREFIX}:detail:${pageId}:${conversationId}`; }

function safeRead<T>(key: string): T | null {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
function safeWrite(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/private mode */ }
}

function customerIdOf(conversation: InstagramConversation | null | undefined, account: InstagramAccount | null) {
  const participants = conversation?.participants?.data || [];
  return String(participants.find(p => String(p.id) !== String(account?.id || ''))?.id || participants[0]?.id || '');
}

export const InstagramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { apiFetch } = useAuth();
  const { selectedPage } = useFacebook();
  const cacheRef = useRef<Record<string, InstagramCacheEntry>>({});
  const commentsCacheRef = useRef<Record<string, { data: InstagramComment[]; loadedAt: number }>>({});
  const conversationCacheRef = useRef<Record<string, { data: InstagramConversation; loadedAt: number }>>({});

  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [linked, setLinked] = useState(false);
  const [media, setMedia] = useState<InstagramMediaItem[]>([]);
  const [conversations, setConversations] = useState<InstagramConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiredPermissions, setRequiredPermissions] = useState<string[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<InstagramMediaItem | null>(null);
  const [selectedConversation, setSelectedConversationState] = useState<InstagramConversation | null>(null);

  const pageId = selectedPage?.page_id || selectedPage?.id || '';

  const applyEntry = useCallback((entry: InstagramCacheEntry) => {
    setAccount(entry.account);
    setLinked(entry.linked);
    setMedia(entry.media || []);
    setConversations(entry.conversations || []);
  }, []);

  const persistEntry = useCallback((id: string, entry: InstagramCacheEntry) => {
    cacheRef.current[id] = entry;
    safeWrite(cacheStorageKey(id), entry);
  }, []);

  const readJson = async (res: Response) => { try { return await res.json(); } catch { return {}; } };

  const setSelectedConversation = useCallback((conversation: InstagramConversation | null) => {
    setSelectedConversationState(conversation);
    if (pageId) {
      if (conversation?.id) sessionStorage.setItem(selectedStorageKey(pageId), conversation.id);
      else sessionStorage.removeItem(selectedStorageKey(pageId));
    }
  }, [pageId]);

  const refreshAll = useCallback(async (force = false) => {
    if (!pageId) {
      setAccount(null); setLinked(false); setMedia([]); setConversations([]); setError(null); setLoading(false); setRefreshing(false); return;
    }

    let cached = cacheRef.current[pageId];
    if (!cached) {
      const stored = safeRead<InstagramCacheEntry>(cacheStorageKey(pageId));
      if (stored) { cacheRef.current[pageId] = stored; cached = stored; }
    }
    if (cached) applyEntry(cached);
    if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL) return;

    if (!cached) setLoading(true); else setRefreshing(true);
    setError(null);
    setRequiredPermissions([]);

    try {
      const accountRes = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/account`);
      const accountData = await readJson(accountRes);
      if (!accountRes.ok) {
        setRequiredPermissions(accountData.requiredPermissions || []);
        throw new Error(accountData.error || 'Không thể kiểm tra Instagram.');
      }
      if (!accountData.linked || !accountData.account) {
        const entry: InstagramCacheEntry = { account: null, linked: false, media: [], conversations: [], loadedAt: Date.now() };
        persistEntry(pageId, entry); applyEntry(entry); return;
      }

      const [mediaResult, conversationsResult] = await Promise.allSettled([
        apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/media?limit=30`),
        apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/conversations?limit=30`),
      ]);
      let nextMedia: InstagramMediaItem[] = cached?.media || [];
      let nextConversations: InstagramConversation[] = cached?.conversations || [];
      const errors: string[] = [];

      if (mediaResult.status === 'fulfilled') {
        const data = await readJson(mediaResult.value);
        if (mediaResult.value.ok) nextMedia = data.media || [];
        else { errors.push(data.error || 'Không tải được bài Instagram'); if (data.requiredPermissions?.length) setRequiredPermissions(prev => Array.from(new Set([...prev, ...data.requiredPermissions]))); }
      } else errors.push('Không tải được bài Instagram');

      if (conversationsResult.status === 'fulfilled') {
        const data = await readJson(conversationsResult.value);
        if (conversationsResult.value.ok) nextConversations = data.conversations || [];
        else { errors.push(data.error || 'Không tải được Instagram Inbox'); if (data.requiredPermissions?.length) setRequiredPermissions(prev => Array.from(new Set([...prev, ...data.requiredPermissions]))); }
      }

      const entry: InstagramCacheEntry = { account: accountData.account, linked: true, media: nextMedia, conversations: nextConversations, loadedAt: Date.now() };
      persistEntry(pageId, entry); applyEntry(entry);
      if (errors.length) setError(errors.join(' · '));
    } catch (err: any) {
      if (!cached) setError(err?.message || 'Không thể tải dữ liệu Instagram.');
      else console.warn('[Instagram background refresh]', err?.message || err);
    } finally { setLoading(false); setRefreshing(false); }
  }, [pageId, apiFetch, applyEntry, persistEntry]);

  useEffect(() => {
    if (!pageId) return;
    const memory = cacheRef.current[pageId];
    const stored = memory || safeRead<InstagramCacheEntry>(cacheStorageKey(pageId));
    if (stored) { cacheRef.current[pageId] = stored; applyEntry(stored); }
    const selectedId = sessionStorage.getItem(selectedStorageKey(pageId));
    if (selectedId && stored?.conversations?.length) {
      setSelectedConversationState(stored.conversations.find(c => c.id === selectedId) || null);
    } else setSelectedConversationState(null);
    void refreshAll(false);
  }, [pageId, applyEntry, refreshAll]);

  const loadComments = useCallback(async (mediaId: string, force = false) => {
    if (!pageId || !mediaId) return [];
    const key = `${pageId}:${mediaId}`;
    const cached = commentsCacheRef.current[key];
    if (!force && cached && Date.now() - cached.loadedAt < DETAIL_TTL) return cached.data;
    const res = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/media/${encodeURIComponent(mediaId)}/comments?limit=50`);
    const data = await readJson(res);
    if (!res.ok) { setRequiredPermissions(data.requiredPermissions || []); throw new Error(data.error || 'Không tải được bình luận.'); }
    const comments = data.comments || [];
    commentsCacheRef.current[key] = { data: comments, loadedAt: Date.now() };
    return comments;
  }, [pageId, apiFetch]);

  const replyComment = useCallback(async (commentId: string, message: string) => {
    if (!pageId) return { success: false, error: 'Chưa chọn Page.' };
    const res = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}/replies`, { method: 'POST', body: JSON.stringify({ message }) });
    const data = await readJson(res);
    if (!res.ok) return { success: false, error: data.error || 'Không thể trả lời bình luận.' };
    commentsCacheRef.current = {}; return { success: true };
  }, [pageId, apiFetch]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!pageId) return { success: false, error: 'Chưa chọn Page.' };
    const res = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) return { success: false, error: data.error || 'Không thể xóa bình luận.' };
    commentsCacheRef.current = {}; return { success: true };
  }, [pageId, apiFetch]);

  const peekConversation = useCallback((conversationId: string) => {
    if (!pageId || !conversationId) return null;
    const key = `${pageId}:${conversationId}`;
    const memory = conversationCacheRef.current[key];
    if (memory) return memory.data;
    const stored = safeRead<{ data: InstagramConversation; loadedAt: number }>(detailStorageKey(pageId, conversationId));
    if (stored) { conversationCacheRef.current[key] = stored; return stored.data; }
    return null;
  }, [pageId]);

  const loadConversation = useCallback(async (conversationId: string, force = false) => {
    if (!pageId || !conversationId) return null;
    const key = `${pageId}:${conversationId}`;
    let cached = conversationCacheRef.current[key];
    if (!cached) {
      const stored = safeRead<{ data: InstagramConversation; loadedAt: number }>(detailStorageKey(pageId, conversationId));
      if (stored) { conversationCacheRef.current[key] = stored; cached = stored; }
    }
    if (!force && cached && Date.now() - cached.loadedAt < DETAIL_TTL) return cached.data;
    const res = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conversationId)}`);
    const data = await readJson(res);
    if (!res.ok) { setRequiredPermissions(data.requiredPermissions || []); throw new Error(data.error || 'Không tải được cuộc trò chuyện Instagram.'); }
    const entry = { data: data.conversation as InstagramConversation, loadedAt: Date.now() };
    conversationCacheRef.current[key] = entry; safeWrite(detailStorageKey(pageId, conversationId), entry);
    return entry.data;
  }, [pageId, apiFetch]);

  const updateCustomerMeta = useCallback(async (customerId: string, patch: Partial<InstagramCustomerMeta>) => {
    if (!pageId || !customerId) return { success: false, error: 'Chưa xác định khách Instagram.' };
    const res = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/customer-meta`, {
      method: 'PUT', body: JSON.stringify({ customerId, meta: patch }),
    });
    const data = await readJson(res);
    if (!res.ok) return { success: false, error: data.error || 'Không lưu được CRM Instagram.' };
    const meta = data.meta as InstagramCustomerMeta;
    setConversations(prev => {
      const next = prev.map(item => customerIdOf(item, account) === customerId ? { ...item, customerMeta: meta } : item);
      const base = cacheRef.current[pageId];
      if (base) persistEntry(pageId, { ...base, conversations: next });
      return next;
    });
    Object.entries(conversationCacheRef.current as Record<string, { data: InstagramConversation; loadedAt: number }>).forEach(([key, value]) => {
      if (!key.startsWith(`${pageId}:`)) return;
      if (customerIdOf(value.data, account) !== customerId) return;
      const next = { ...value.data, customerMeta: meta };
      const entry = { data: next, loadedAt: value.loadedAt };
      conversationCacheRef.current[key] = entry;
      safeWrite(detailStorageKey(pageId, next.id), entry);
    });
    return { success: true, meta };
  }, [pageId, apiFetch, account, persistEntry]);

  const sendMessage = useCallback(async (recipientId: string, message: string) => {
    if (!pageId) return { success: false, error: 'Chưa chọn Page.' };
    const res = await apiFetch(`/api/instagram/${encodeURIComponent(pageId)}/messages`, { method: 'POST', body: JSON.stringify({ recipientId, message }) });
    const data = await readJson(res);
    if (!res.ok) return { success: false, error: data.error || 'Không gửi được tin nhắn Instagram.' };
    Object.keys(conversationCacheRef.current).filter(k => k.startsWith(`${pageId}:`)).forEach(k => delete conversationCacheRef.current[k]);
    const base = cacheRef.current[pageId]; if (base) persistEntry(pageId, { ...base, loadedAt: 0 });
    return { success: true };
  }, [pageId, apiFetch, persistEntry]);

  const value = useMemo<InstagramContextValue>(() => ({
    account, linked, media, conversations, loading, refreshing, error, requiredPermissions,
    selectedMedia, setSelectedMedia, selectedConversation, setSelectedConversation,
    refreshAll, loadComments, replyComment, deleteComment, loadConversation, peekConversation, sendMessage, updateCustomerMeta,
  }), [account, linked, media, conversations, loading, refreshing, error, requiredPermissions, selectedMedia, selectedConversation, setSelectedConversation, refreshAll, loadComments, replyComment, deleteComment, loadConversation, peekConversation, sendMessage, updateCustomerMeta]);

  return <InstagramContext.Provider value={value}>{children}</InstagramContext.Provider>;
};

export const useInstagram = () => {
  const value = useContext(InstagramContext);
  if (!value) throw new Error('useInstagram must be used within InstagramProvider');
  return value;
};
