import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFacebook } from '../../context/FacebookContext';
import {
  AUTO_REFRESH_MS,
  CACHE_FRESH_MS,
  DEFAULT_AUTOMATION_CONFIG,
  DEFAULT_META,
  DETAIL_CACHE_FRESH_MS,
} from './constants';
import { renderTemplate } from './utils';
import { isFollowupDue, normalizeCrmClient } from '../crm/utils';
import type { CRMContactData } from '../crm/types';
import type { BackgroundAutomationStatus } from './backgroundTypes';
import type {
  AutomationConfig,
  AutomationPreviewResult,
  ContactStatus,
  ConversationDetail,
  ConversationSummary,
  CustomerMeta,
  FilterKey,
  QuickTemplate,
  ReplyFormula,
} from './types';

type Stage = 'idle' | 'checking' | 'loading' | 'ready' | 'error';

interface DetailCacheItem {
  detail: ConversationDetail;
  fetchedAt: number;
}

interface PageCache {
  conversations: ConversationSummary[];
  selectedId: string | null;
  lastFetchedAt: string | null;
  loadedAt: number;
  detailById: Record<string, DetailCacheItem>;
  automationConfig?: AutomationConfig;
  templates?: QuickTemplate[];
  automationLoadedAt?: number;
}

interface MessengerContextValue {
  pageId: string;
  pageName: string;
  stage: Stage;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  conversations: ConversationSummary[];
  filteredConversations: ConversationSummary[];
  selectedId: string | null;
  detail: ConversationDetail | null;
  detailLoading: boolean;
  sending: boolean;
  reauthorizing: boolean;
  reply: string;
  setReply: React.Dispatch<React.SetStateAction<string>>;
  lastFetchedAt: string | null;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  filter: FilterKey;
  setFilter: React.Dispatch<React.SetStateAction<FilterKey>>;
  showInfo: boolean;
  setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
  savingMeta: boolean;
  attachmentFile: File | null;
  setAttachmentFile: React.Dispatch<React.SetStateAction<File | null>>;
  automationConfig: AutomationConfig;
  setAutomationConfig: React.Dispatch<React.SetStateAction<AutomationConfig>>;
  templates: QuickTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<QuickTemplate[]>>;
  automationLoading: boolean;
  automationSaving: boolean;
  automationRunning: boolean;
  automationNotice: string | null;
  setAutomationNotice: React.Dispatch<React.SetStateAction<string | null>>;
  backgroundAutomationStatus: BackgroundAutomationStatus | null;
  backgroundAutomationLoading: boolean;
  backgroundAutomationSaving: boolean;
  currentMeta: CustomerMeta;
  currentFormula: ReplyFormula;
  crmStats: { needsAction: number; needsReply: number; followupDue: number; hot: number; ordered: number; unassigned: number };
  ensureLoaded: (force?: boolean) => Promise<void>;
  loadMessenger: (silent?: boolean, force?: boolean) => Promise<void>;
  selectConversation: (conversationId: string, force?: boolean) => Promise<void>;
  handleReauthorize: () => Promise<void>;
  saveMeta: (patch: Partial<CustomerMeta>) => Promise<void>;
  toggleTag: (tag: string) => Promise<void>;
  addCustomTag: (tag: string) => Promise<void>;
  updateReplyFormula: (patch: Partial<ReplyFormula>) => Promise<void>;
  updateCrm: (patch: Partial<CRMContactData>) => Promise<void>;
  sendReply: () => Promise<void>;
  insertTemplate: (template: QuickTemplate | string) => void;
  dismissReengage: () => Promise<void>;
  loadAutomationConfig: (force?: boolean) => Promise<void>;
  saveAutomation: () => Promise<boolean>;
  runAutomation: (silent?: boolean, forceDryRun?: boolean) => Promise<any>;
  previewConversationAutomation: () => Promise<AutomationPreviewResult>;
  updateTemplate: (id: string, patch: Partial<QuickTemplate>) => void;
  addTemplate: () => void;
  removeTemplate: (id: string) => void;
  toggleWorkingDay: (day: number) => void;
  loadBackgroundAutomationStatus: () => Promise<BackgroundAutomationStatus | null>;
  setBackgroundAutomationEnabled: (enabled: boolean) => Promise<boolean>;
  runBackgroundAutomationNow: (dryRun?: boolean) => Promise<any>;
}

const MessengerContext = createContext<MessengerContextValue | null>(null);

const emptyCache = (): PageCache => ({
  conversations: [],
  selectedId: null,
  lastFetchedAt: null,
  loadedAt: 0,
  detailById: {},
});

export const MessengerProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { apiFetch } = useAuth();
  const { selectedPage, connectFacebook, refreshPages } = useFacebook();
  const location = useLocation();

  const pageId = selectedPage?.page_id || '';
  const pageName = selectedPage?.page_name || '';
  const pageCacheRef = useRef<Record<string, PageCache>>({});
  const activePageRef = useRef(pageId);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [reply, setReply] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showInfo, setShowInfo] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>(DEFAULT_AUTOMATION_CONFIG);
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationNotice, setAutomationNotice] = useState<string | null>(null);
  const [backgroundAutomationStatus, setBackgroundAutomationStatus] = useState<BackgroundAutomationStatus | null>(null);
  const [backgroundAutomationLoading, setBackgroundAutomationLoading] = useState(false);
  const [backgroundAutomationSaving, setBackgroundAutomationSaving] = useState(false);

  const persistCache = useCallback((patch: Partial<PageCache>) => {
    if (!pageId) return;
    const current = pageCacheRef.current[pageId] || emptyCache();
    pageCacheRef.current[pageId] = { ...current, ...patch };
  }, [pageId]);

  useEffect(() => {
    activePageRef.current = pageId;
    if (!pageId) {
      setStage('idle');
      setError(null);
      setConversations([]);
      setSelectedId(null);
      setDetail(null);
      setLastFetchedAt(null);
      setAutomationConfig(DEFAULT_AUTOMATION_CONFIG);
      setTemplates([]);
      setBackgroundAutomationStatus(null);
      return;
    }

    const cached = pageCacheRef.current[pageId];
    if (!cached) {
      setStage('idle');
      setError(null);
      setConversations([]);
      setSelectedId(null);
      setDetail(null);
      setLastFetchedAt(null);
      setAutomationConfig(DEFAULT_AUTOMATION_CONFIG);
      setTemplates([]);
      setBackgroundAutomationStatus(null);
      return;
    }

    setConversations(cached.conversations || []);
    setSelectedId(cached.selectedId || cached.conversations?.[0]?.id || null);
    setLastFetchedAt(cached.lastFetchedAt || null);
    const cachedSelected = cached.selectedId || cached.conversations?.[0]?.id || null;
    setDetail(cachedSelected ? cached.detailById[cachedSelected]?.detail || null : null);
    setStage(cached.loadedAt ? 'ready' : 'idle');
    if (cached.automationConfig) setAutomationConfig(cached.automationConfig);
    if (cached.templates) setTemplates(cached.templates);
    setError(null);
  }, [pageId]);

  const patchConversationMeta = useCallback((customerId: string, meta: CustomerMeta) => {
    setConversations(prev => {
      const next = prev.map(item => item.customer?.id === customerId ? { ...item, customerMeta: meta } : item);
      persistCache({ conversations: next });
      return next;
    });
    setDetail(prev => {
      if (prev?.customer?.id !== customerId) return prev;
      const next = { ...prev, customerMeta: meta };
      const cache = pageCacheRef.current[pageId] || emptyCache();
      cache.detailById[prev.id] = { detail: next, fetchedAt: Date.now() };
      pageCacheRef.current[pageId] = cache;
      return next;
    });
  }, [pageId, persistCache]);

  const loadConversation = useCallback(async (conversationId: string, silent = false, force = false) => {
    if (!pageId || !conversationId) return;
    const cache = pageCacheRef.current[pageId] || emptyCache();
    const cached = cache.detailById[conversationId];
    const fresh = cached && Date.now() - cached.fetchedAt < DETAIL_CACHE_FRESH_MS;

    if (cached) {
      setDetail(cached.detail);
      if (!force && fresh) {
        const recipientId = cached.detail.customer?.id;
        if (recipientId) apiFetch('/api/messenger/mark-seen', { method: 'POST', body: JSON.stringify({ pageId, recipientId }) }).catch(() => undefined);
        return;
      }
    }

    if (!silent && !cached) setDetailLoading(true);
    try {
      const params = new URLSearchParams({ pageId });
      const response = await apiFetch(`/api/messenger/conversations/${encodeURIComponent(conversationId)}?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tải được nội dung hội thoại.');
      if (activePageRef.current !== pageId) return;

      const nextDetail: ConversationDetail | null = data.conversation || null;
      setDetail(nextDetail);
      if (nextDetail) {
        const latestCache = pageCacheRef.current[pageId] || emptyCache();
        latestCache.detailById[conversationId] = { detail: nextDetail, fetchedAt: Date.now() };
        latestCache.selectedId = conversationId;
        pageCacheRef.current[pageId] = latestCache;

        const recipientId = nextDetail.customer?.id;
        if (recipientId) apiFetch('/api/messenger/mark-seen', { method: 'POST', body: JSON.stringify({ pageId, recipientId }) }).catch(() => undefined);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || 'Không tải được nội dung hội thoại.');
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, [apiFetch, pageId]);

  const selectConversation = useCallback(async (conversationId: string, force = false) => {
    if (!conversationId) return;
    setSelectedId(conversationId);
    persistCache({ selectedId: conversationId });
    await loadConversation(conversationId, false, force);
  }, [loadConversation, persistCache]);

  const loadMessenger = useCallback(async (silent = false, force = false) => {
    if (!pageId) return;
    const cache = pageCacheRef.current[pageId];
    const fresh = cache?.loadedAt && Date.now() - cache.loadedAt < CACHE_FRESH_MS;
    if (!force && fresh && cache?.conversations?.length) {
      setStage('ready');
      return;
    }

    const hasCachedData = Boolean(cache?.conversations?.length || conversations.length);
    if (!silent && !hasCachedData) {
      setStage('checking');
      setError(null);
    }

    try {
      const statusParams = new URLSearchParams({ pageId });
      const statusResponse = await apiFetch(`/api/messenger/status?${statusParams.toString()}`);
      const statusData = await statusResponse.json();
      if (!statusResponse.ok || !statusData.connected) throw new Error(statusData.error || 'Messenger chưa được cấp đủ quyền.');
      if (activePageRef.current !== pageId) return;

      if (!silent && !hasCachedData) setStage('loading');
      const listParams = new URLSearchParams({ pageId, limit: '50' });
      const listResponse = await apiFetch(`/api/messenger/conversations?${listParams.toString()}`);
      const listData = await listResponse.json();
      if (!listResponse.ok) throw new Error(listData.error || 'Không tải được danh sách hội thoại.');
      if (activePageRef.current !== pageId) return;

      const nextConversations: ConversationSummary[] = listData.conversations || [];
      const fetchedAt = listData.fetchedAt || new Date().toISOString();
      const previousSelected = pageCacheRef.current[pageId]?.selectedId || selectedId;
      const nextSelected = previousSelected && nextConversations.some(item => item.id === previousSelected)
        ? previousSelected
        : nextConversations[0]?.id || null;

      setConversations(nextConversations);
      setLastFetchedAt(fetchedAt);
      setSelectedId(nextSelected);
      setStage('ready');
      setError(null);

      const nextCache = pageCacheRef.current[pageId] || emptyCache();
      nextCache.conversations = nextConversations;
      nextCache.lastFetchedAt = fetchedAt;
      nextCache.loadedAt = Date.now();
      nextCache.selectedId = nextSelected;
      pageCacheRef.current[pageId] = nextCache;

      if (!nextSelected) {
        setDetail(null);
      } else if (!detail || detail.id !== nextSelected) {
        await loadConversation(nextSelected, Boolean(nextCache.detailById[nextSelected]), false);
      } else if (force && !silent) {
        await loadConversation(nextSelected, true, true);
      }
    } catch (err: any) {
      if (activePageRef.current !== pageId) return;
      setStage('error');
      setError(err.message || 'Không thể kết nối Messenger.');
      if (!hasCachedData) {
        setConversations([]);
        setSelectedId(null);
        setDetail(null);
      }
    }
  }, [apiFetch, conversations.length, detail, loadConversation, pageId, selectedId]);

  const loadAutomationConfig = useCallback(async (force = false) => {
    if (!pageId) return;
    const cache = pageCacheRef.current[pageId];
    if (!force && cache?.automationLoadedAt && Date.now() - cache.automationLoadedAt < 5 * 60_000) {
      if (cache.automationConfig) setAutomationConfig(cache.automationConfig);
      if (cache.templates) setTemplates(cache.templates);
      return;
    }

    setAutomationLoading(true);
    try {
      const response = await apiFetch(`/api/messenger/automation-config?pageId=${encodeURIComponent(pageId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tải được cấu hình tự động hóa.');
      if (activePageRef.current !== pageId) return;
      const config = data.config || DEFAULT_AUTOMATION_CONFIG;
      const nextTemplates = Array.isArray(data.templates) ? data.templates : [];
      setAutomationConfig(config);
      setTemplates(nextTemplates);
      const nextCache = pageCacheRef.current[pageId] || emptyCache();
      nextCache.automationConfig = config;
      nextCache.templates = nextTemplates;
      nextCache.automationLoadedAt = Date.now();
      pageCacheRef.current[pageId] = nextCache;
    } catch (err: any) {
      setAutomationNotice(err.message || 'Không tải được cấu hình tự động hóa.');
    } finally {
      setAutomationLoading(false);
    }
  }, [apiFetch, pageId]);

  const ensureLoaded = useCallback(async (force = false) => {
    if (!pageId) return;
    const cache = pageCacheRef.current[pageId];
    const hasData = Boolean(cache?.conversations?.length || conversations.length);
    const fresh = Boolean(cache?.loadedAt && Date.now() - cache.loadedAt < CACHE_FRESH_MS);

    await loadAutomationConfig(false);
    if (!force && hasData && fresh) {
      setStage('ready');
      return;
    }
    await loadMessenger(hasData, force || !fresh);
  }, [conversations.length, loadAutomationConfig, loadMessenger, pageId]);

  useEffect(() => {
    if (location.pathname !== '/messages' || !pageId) return;
    ensureLoaded(false);
  }, [ensureLoaded, location.pathname, pageId]);

  useEffect(() => {
    if (location.pathname !== '/messages' || stage !== 'ready' || !pageId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadMessenger(true, true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadMessenger, location.pathname, pageId, stage]);

  // Automation runner belongs to MessengerProvider instead of AppLayout. One timer, one responsibility.
  useEffect(() => {
    if (!pageId) return;
    let disposed = false;
    const pulse = async () => {
      try {
        await apiFetch('/api/messenger/automation/run', { method: 'POST', body: JSON.stringify({ pageId }) });
      } catch {
        // Best-effort background task; never interrupt the app.
      }
    };
    const first = window.setTimeout(() => { if (!disposed) pulse(); }, 10_000);
    const timer = window.setInterval(() => { if (!disposed) pulse(); }, 120_000);
    return () => {
      disposed = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [apiFetch, pageId]);

  const handleReauthorize = useCallback(async () => {
    if (reauthorizing) return;
    setReauthorizing(true);
    setError(null);
    setStage('checking');
    const result = await connectFacebook();
    if (!result.success) {
      setStage('error');
      setError(result.error || 'Không thể cấp lại quyền Messenger.');
      setReauthorizing(false);
      return;
    }
    await refreshPages();
    setReauthorizing(false);
    pageCacheRef.current[pageId] = emptyCache();
    await loadMessenger(false, true);
  }, [connectFacebook, loadMessenger, pageId, reauthorizing, refreshPages]);

  const saveMeta = useCallback(async (patch: Partial<CustomerMeta>) => {
    const customerId = detail?.customer?.id;
    if (!pageId || !customerId || savingMeta) return;
    setSavingMeta(true);
    setError(null);
    try {
      const current = detail.customerMeta || DEFAULT_META;
      const next = { ...current, ...patch };
      const response = await apiFetch('/api/messenger/customer-meta', {
        method: 'PUT',
        body: JSON.stringify({ pageId, customerId, meta: patch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không lưu được thông tin khách.');
      patchConversationMeta(customerId, data.meta || next);
    } catch (err: any) {
      setError(err.message || 'Không lưu được thông tin khách.');
    } finally {
      setSavingMeta(false);
    }
  }, [apiFetch, detail, pageId, patchConversationMeta, savingMeta]);

  const toggleTag = useCallback(async (tag: string) => {
    const current = detail?.customerMeta || DEFAULT_META;
    const tags = current.tags.includes(tag) ? current.tags.filter(item => item !== tag) : [...current.tags, tag].slice(0, 12);
    await saveMeta({ tags });
  }, [detail?.customerMeta, saveMeta]);

  const addCustomTag = useCallback(async (tag: string) => {
    const value = tag.trim();
    if (!value) return;
    const current = detail?.customerMeta || DEFAULT_META;
    if (!current.tags.includes(value)) await saveMeta({ tags: [...current.tags, value].slice(0, 12) });
  }, [detail?.customerMeta, saveMeta]);

  const updateReplyFormula = useCallback(async (patch: Partial<ReplyFormula>) => {
    const current = detail?.customerMeta || DEFAULT_META;
    const formula: ReplyFormula = { mode: 'inherit', testOnly: false, ...(current.replyFormula || {}), ...patch };
    await saveMeta({ replyFormula: formula });
  }, [detail?.customerMeta, saveMeta]);

  const updateCrm = useCallback(async (patch: Partial<CRMContactData>) => {
    const current = detail?.customerMeta || DEFAULT_META;
    const crm = { ...normalizeCrmClient(current.crm), ...patch };
    await saveMeta({ crm });
  }, [detail?.customerMeta, saveMeta]);

  const sendReply = useCallback(async () => {
    const text = reply.trim();
    const recipientId = detail?.customer?.id;
    if ((!text && !attachmentFile) || !pageId || !recipientId || sending) return;
    setSending(true);
    setError(null);
    try {
      if (attachmentFile) {
        const form = new FormData();
        form.append('pageId', pageId);
        form.append('recipientId', recipientId);
        form.append('file', attachmentFile);
        const response = await apiFetch('/api/messenger/send-attachment', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không gửi được tệp đính kèm.');
      }
      if (text) {
        const response = await apiFetch('/api/messenger/send', { method: 'POST', body: JSON.stringify({ pageId, recipientId, text }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không gửi được tin nhắn.');
      }
      setReply('');
      setAttachmentFile(null);
      if (selectedId) await loadConversation(selectedId, true, true);
      await loadMessenger(true, true);
    } catch (err: any) {
      setError(err.message || 'Không gửi được tin nhắn Messenger.');
    } finally {
      setSending(false);
    }
  }, [apiFetch, attachmentFile, detail?.customer?.id, loadConversation, loadMessenger, pageId, reply, selectedId, sending]);

  const insertTemplate = useCallback((template: QuickTemplate | string) => {
    const raw = typeof template === 'string' ? template : template.text;
    setReply(renderTemplate(raw, detail?.customer?.name, pageName));
  }, [detail?.customer?.name, pageName]);

  const dismissReengage = useCallback(async () => {
    const customerId = detail?.customer?.id;
    if (!pageId || !customerId) return;
    try {
      const response = await apiFetch('/api/messenger/automation/dismiss-reengage', { method: 'POST', body: JSON.stringify({ pageId, customerId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không bỏ được nhắc follow-up.');
      patchConversationMeta(customerId, data.meta);
      setAutomationNotice('Đã đánh dấu follow-up này là đã xử lý.');
    } catch (err: any) {
      setAutomationNotice(err.message || 'Không bỏ được nhắc follow-up.');
    }
  }, [apiFetch, detail?.customer?.id, pageId, patchConversationMeta]);

  const runAutomation = useCallback(async (silent = false, forceDryRun = false) => {
    if (!pageId || automationRunning) return null;
    setAutomationRunning(true);
    if (!silent) setAutomationNotice('Đang kiểm tra hội thoại và các điều kiện tự động...');
    try {
      const response = await apiFetch('/api/messenger/automation/run', {
        method: 'POST',
        body: JSON.stringify({
          pageId,
          dryRun: forceDryRun,
          // Test nhanh dùng đúng cấu hình đang nhìn thấy trong popup, không bắt buộc bấm Lưu trước.
          ...(forceDryRun ? { config: automationConfig } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không chạy được tự động hóa.');
      const pieces: string[] = [];
      if (data.sent) pieces.push(`đã gửi ${data.sent} tin`);
      if (data.previewed) pieces.push(`test ${data.previewed} hành động`);
      if (data.detected) pieces.push(`${data.dryRun ? 'test nhận diện' : 'nhận diện'} ${data.detected} khách`);
      if (data.reminders) pieces.push(`${data.dryRun ? 'test nhắc' : 'tạo'} ${data.reminders} follow-up`);
      if (!silent || pieces.length) {
        const clock = data.currentLocalTime ? ` ${data.currentLocalTime}` : '';
        const windowText = data.workingWindow ? ` (${data.workingWindow})` : '';
        setAutomationNotice(
          pieces.length
            ? `Tự động hóa: ${pieces.join(' · ')}`
            : `Tự động hóa đã kiểm tra · ${data.workingNow ? 'trong giờ hoạt động' : 'ngoài giờ hoạt động'}${clock}${windowText}`
        );
      }
      if (pieces.length) await loadMessenger(true, true);
      return data;
    } catch (err: any) {
      if (!silent) setAutomationNotice(err.message || 'Không chạy được tự động hóa.');
      return null;
    } finally {
      setAutomationRunning(false);
    }
  }, [apiFetch, automationConfig, automationRunning, loadMessenger, pageId]);

  const previewConversationAutomation = useCallback(async (): Promise<AutomationPreviewResult> => {
    if (!pageId || !selectedId) return { success: false, error: 'Chưa chọn hội thoại.' };
    try {
      const response = await apiFetch('/api/messenger/automation/preview', {
        method: 'POST',
        body: JSON.stringify({ pageId, conversationId: selectedId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không test được hội thoại này.');
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Không test được hội thoại này.' };
    }
  }, [apiFetch, pageId, selectedId]);

  const saveAutomation = useCallback(async () => {
    if (!pageId || automationSaving) return false;
    setAutomationSaving(true);
    setAutomationNotice(null);
    try {
      const response = await apiFetch('/api/messenger/automation-config', {
        method: 'PUT',
        body: JSON.stringify({ pageId, config: automationConfig, templates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không lưu được tự động hóa.');
      const config = data.config || automationConfig;
      const nextTemplates = data.templates || templates;
      setAutomationConfig(config);
      setTemplates(nextTemplates);
      const cache = pageCacheRef.current[pageId] || emptyCache();
      cache.automationConfig = config;
      cache.templates = nextTemplates;
      cache.automationLoadedAt = Date.now();
      pageCacheRef.current[pageId] = cache;
      setAutomationNotice('Đã lưu tự động hóa Messenger.');
      return true;
    } catch (err: any) {
      setAutomationNotice(err.message || 'Không lưu được tự động hóa.');
      return false;
    } finally {
      setAutomationSaving(false);
    }
  }, [apiFetch, automationConfig, automationSaving, pageId, templates]);

  const updateTemplate = useCallback((id: string, patch: Partial<QuickTemplate>) => {
    setTemplates(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);
  const addTemplate = useCallback(() => {
    const id = `custom-${Date.now()}`;
    setTemplates(prev => [...prev, { id, title: 'Tin mẫu mới', text: 'Nhập nội dung tin nhắn mẫu...', category: 'general' }].slice(0, 30));
  }, []);
  const removeTemplate = useCallback((id: string) => setTemplates(prev => prev.filter(item => item.id !== id)), []);
  const toggleWorkingDay = useCallback((day: number) => {
    setAutomationConfig(prev => {
      const has = prev.workingHours.days.includes(day);
      const days = has ? prev.workingHours.days.filter(item => item !== day) : [...prev.workingHours.days, day];
      return { ...prev, workingHours: { ...prev.workingHours, days } };
    });
  }, []);

  const loadBackgroundAutomationStatus = useCallback(async (): Promise<BackgroundAutomationStatus | null> => {
    if (!pageId) return null;
    setBackgroundAutomationLoading(true);
    try {
      const response = await apiFetch(`/api/automation/background/status?pageId=${encodeURIComponent(pageId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không đọc được trạng thái chạy nền.');
      setBackgroundAutomationStatus(data);
      return data;
    } catch (err: any) {
      const fallback: BackgroundAutomationStatus = {
        enabled: false,
        ready: false,
        schedulerConfigured: false,
        webhookVerifyConfigured: false,
        webhookSubscribed: false,
        callbackUrl: '',
        cronUrl: '',
        lastError: err?.message || 'Không đọc được trạng thái chạy nền.',
      };
      setBackgroundAutomationStatus(fallback);
      return fallback;
    } finally {
      setBackgroundAutomationLoading(false);
    }
  }, [apiFetch, pageId]);

  const setBackgroundAutomationEnabled = useCallback(async (enabled: boolean) => {
    if (!pageId || backgroundAutomationSaving) return false;
    setBackgroundAutomationSaving(true);
    try {
      const response = await apiFetch(`/api/automation/background/${enabled ? 'enable' : 'disable'}`, {
        method: 'POST',
        body: JSON.stringify({ pageId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Không ${enabled ? 'bật' : 'tắt'} được chạy nền.`);
      await loadBackgroundAutomationStatus();
      setAutomationNotice(data.message || (enabled ? 'Đã bật chạy nền.' : 'Đã tắt chạy nền.'));
      return true;
    } catch (err: any) {
      setAutomationNotice(err?.message || `Không ${enabled ? 'bật' : 'tắt'} được chạy nền.`);
      return false;
    } finally {
      setBackgroundAutomationSaving(false);
    }
  }, [apiFetch, backgroundAutomationSaving, loadBackgroundAutomationStatus, pageId]);

  const runBackgroundAutomationNow = useCallback(async (dryRun = false) => {
    if (!pageId) return null;
    try {
      const response = await apiFetch('/api/automation/background/run-page', {
        method: 'POST',
        body: JSON.stringify({ pageId, dryRun }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không chạy được worker nền.');
      await loadBackgroundAutomationStatus();
      if (data.sent || data.detected || data.reminders) await loadMessenger(true, true);
      const pieces: string[] = [];
      pieces.push(`${data.workingNow ? 'đang trong giờ hoạt động' : 'ngoài giờ hoạt động'}${data.currentLocalTime ? ` ${data.currentLocalTime}` : ''}${data.workingWindow ? ` (${data.workingWindow})` : ''}`);
      if (data.previewed) pieces.push(`sẽ có ${data.previewed} hành động`);
      if (data.detected) pieces.push(`nhận diện ${data.detected} khách`);
      if (data.reminders) pieces.push(`${data.reminders} follow-up`);
      if (data.skipped) pieces.push(`bỏ qua: ${data.reason || 'không đủ điều kiện'}`);
      setAutomationNotice(`${dryRun ? 'Worker TEST' : 'Worker'}: ${pieces.join(' · ')}${!data.previewed && !data.detected && !data.reminders && !data.skipped ? ' · chưa có hội thoại đủ điều kiện' : ''}.`);
      return data;
    } catch (err: any) {
      setAutomationNotice(err?.message || 'Không chạy được worker nền.');
      return null;
    }
  }, [apiFetch, loadBackgroundAutomationStatus, loadMessenger, pageId]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter(item => {
      const meta = item.customerMeta || DEFAULT_META;
      const crm = normalizeCrmClient(meta.crm);
      const needsReply = item.lastMessage?.isFromPage === false;
      const followupDue = isFollowupDue(crm.nextFollowUpAt) || Boolean(meta.automation?.reengageDueAt && meta.automation.reengageDueForMessageId !== meta.automation.reengageDismissedForMessageId);
      if (filter === 'action' && !needsReply && !followupDue) return false;
      if (filter === 'starred' && !meta.starred) return false;
      if (filter === 'needsReply' && !needsReply) return false;
      if (filter === 'followup' && !followupDue) return false;
      if (filter === 'unassigned' && crm.assignee.trim()) return false;
      if (filter === 'interested' && meta.status !== 'interested' && meta.status !== 'quoted') return false;
      if (filter === 'waiting' && meta.status !== 'waiting') return false;
      if (filter === 'ordered' && meta.status !== 'ordered' && meta.status !== 'delivered') return false;
      if (!query) return true;
      const name = item.customer?.name?.toLowerCase() || '';
      const text = item.lastMessage?.text?.toLowerCase() || '';
      const tags = meta.tags.join(' ').toLowerCase();
      const crmText = [crm.phone, crm.email, crm.address, crm.productInterest, crm.assignee].join(' ').toLowerCase();
      return name.includes(query) || text.includes(query) || tags.includes(query) || crmText.includes(query);
    });
  }, [conversations, filter, search]);

  const crmStats = useMemo(() => {
    let needsReply = 0;
    let followupDue = 0;
    let hot = 0;
    let ordered = 0;
    let unassigned = 0;
    let needsAction = 0;
    conversations.forEach(item => {
      const meta = item.customerMeta || DEFAULT_META;
      const crm = normalizeCrmClient(meta.crm);
      const reply = item.lastMessage?.isFromPage === false;
      const due = isFollowupDue(crm.nextFollowUpAt) || Boolean(meta.automation?.reengageDueAt && meta.automation.reengageDueForMessageId !== meta.automation.reengageDismissedForMessageId);
      if (reply) needsReply += 1;
      if (due) followupDue += 1;
      if (reply || due) needsAction += 1;
      if (meta.status === 'interested' || meta.status === 'quoted') hot += 1;
      if (meta.status === 'ordered' || meta.status === 'delivered') ordered += 1;
      if (!crm.assignee.trim() && meta.status !== 'closed') unassigned += 1;
    });
    return { needsAction, needsReply, followupDue, hot, ordered, unassigned };
  }, [conversations]);

  const currentMeta = detail?.customerMeta || DEFAULT_META;
  const currentFormula: ReplyFormula = currentMeta.replyFormula || { mode: 'inherit', testOnly: false };

  const value = useMemo<MessengerContextValue>(() => ({
    pageId, pageName, stage, error, setError, conversations, filteredConversations, selectedId, detail, detailLoading,
    sending, reauthorizing, reply, setReply, lastFetchedAt, search, setSearch, filter, setFilter, showInfo, setShowInfo,
    savingMeta, attachmentFile, setAttachmentFile, automationConfig, setAutomationConfig, templates, setTemplates,
    automationLoading, automationSaving, automationRunning, automationNotice, setAutomationNotice, backgroundAutomationStatus, backgroundAutomationLoading, backgroundAutomationSaving, currentMeta, currentFormula, crmStats,
    ensureLoaded, loadMessenger, selectConversation, handleReauthorize, saveMeta, toggleTag, addCustomTag, updateReplyFormula, updateCrm,
    sendReply, insertTemplate, dismissReengage, loadAutomationConfig, saveAutomation, runAutomation,
    previewConversationAutomation, updateTemplate, addTemplate, removeTemplate, toggleWorkingDay, loadBackgroundAutomationStatus, setBackgroundAutomationEnabled, runBackgroundAutomationNow,
  }), [
    pageId, pageName, stage, error, conversations, filteredConversations, selectedId, detail, detailLoading, sending,
    reauthorizing, reply, lastFetchedAt, search, filter, showInfo, savingMeta, attachmentFile, automationConfig, templates,
    automationLoading, automationSaving, automationRunning, automationNotice, backgroundAutomationStatus, backgroundAutomationLoading, backgroundAutomationSaving, currentMeta, currentFormula, crmStats, ensureLoaded,
    loadMessenger, selectConversation, handleReauthorize, saveMeta, toggleTag, addCustomTag, updateReplyFormula, updateCrm, sendReply,
    insertTemplate, dismissReengage, loadAutomationConfig, saveAutomation, runAutomation, previewConversationAutomation,
    updateTemplate, addTemplate, removeTemplate, toggleWorkingDay, loadBackgroundAutomationStatus, setBackgroundAutomationEnabled, runBackgroundAutomationNow,
  ]);

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
};

export const useMessenger = () => {
  const value = useContext(MessengerContext);
  if (!value) throw new Error('useMessenger must be used inside MessengerProvider');
  return value;
};
