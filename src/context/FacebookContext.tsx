import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { FacebookPage, SystemConfigStatus, MetaConfigSummary } from '../types';

interface FacebookContextType {
  connectedPages: FacebookPage[];
  availablePages: FacebookPage[];
  selectedPage: FacebookPage | null;
  setSelectedPage: (page: FacebookPage | null) => void;
  hasConnection: boolean;
  loading: boolean;
  configStatus: SystemConfigStatus | null;
  metaConfig: MetaConfigSummary | null;
  refreshMetaConfig: () => Promise<void>;
  saveMetaConfig: (input: { appId: string; appSecret?: string; graphApiVersion?: string }) => Promise<{ success: boolean; error?: string }>;
  connectFacebook: () => Promise<void>;
  connectPage: (pageId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  disconnectPage: (pageId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  testPage: (pageId: string) => Promise<{ success: boolean; message?: string; error?: string; canPost?: boolean }>;
  syncPagePosts: (pageId: string) => Promise<{ success: boolean; syncedCount?: number; message?: string; error?: string }>;
  refreshPages: () => Promise<void>;
}

const FacebookContext = createContext<FacebookContextType | undefined>(undefined);

export const FacebookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, apiFetch } = useAuth();
  const [connectedPages, setConnectedPages] = useState<FacebookPage[]>([]);
  const [availablePages, setAvailablePages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPageState] = useState<FacebookPage | null>(null);
  const [hasConnection, setHasConnection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configStatus, setConfigStatus] = useState<SystemConfigStatus | null>(null);
  const [metaConfig, setMetaConfig] = useState<MetaConfigSummary | null>(null);

  const fetchConfigStatus = useCallback(async () => {
    if (!user) {
      setConfigStatus(null);
      return;
    }
    try {
      const res = await apiFetch('/api/facebook/status');
      if (res.ok) setConfigStatus(await res.json());
    } catch (e) {
      console.error('Failed to load system config status:', e);
    }
  }, [user, apiFetch]);

  const refreshMetaConfig = useCallback(async () => {
    if (!user) {
      setMetaConfig(null);
      return;
    }
    try {
      const res = await apiFetch('/api/facebook/meta-config');
      const data = await res.json();
      if (res.ok) setMetaConfig(data);
      else console.error('Meta config API error:', data.error);
    } catch (e) {
      console.error('Failed to load Meta config:', e);
    }
  }, [user, apiFetch]);

  const saveMetaConfig = useCallback(async (input: {
    appId: string;
    appSecret?: string;
    graphApiVersion?: string;
  }) => {
    try {
      const res = await apiFetch('/api/facebook/meta-config', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Không thể lưu cấu hình Meta' };
      setMetaConfig(data.config || null);
      await fetchConfigStatus();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Không thể lưu cấu hình Meta' };
    }
  }, [apiFetch, fetchConfigStatus]);

  const refreshPages = useCallback(async () => {
    if (!user) {
      setConnectedPages([]);
      setAvailablePages([]);
      setSelectedPageState(null);
      setHasConnection(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/facebook/pages');
      const data = await res.json();
      if (res.ok) {
        setHasConnection(Boolean(data.connected));
        setAvailablePages(data.pages || []);
        const activePages: FacebookPage[] = data.connectedPages || [];
        setConnectedPages(activePages);

        const savedPageId = localStorage.getItem('pagemanager_selected_page_id');
        if (savedPageId) {
          const match = activePages.find(p => p.id === savedPageId || p.page_id === savedPageId);
          setSelectedPageState(match || activePages[0] || null);
        } else {
          setSelectedPageState(activePages[0] || null);
        }
      } else {
        console.error('Facebook pages API error:', data.error);
      }
    } catch (err) {
      console.error('Error fetching Facebook pages:', err);
    } finally {
      setLoading(false);
    }
  }, [user, apiFetch]);

  useEffect(() => {
    if (!user) return;
    fetchConfigStatus();
    refreshMetaConfig();
    refreshPages();
  }, [user, fetchConfigStatus, refreshMetaConfig, refreshPages]);

  const setSelectedPage = (page: FacebookPage | null) => {
    setSelectedPageState(page);
    if (page) localStorage.setItem('pagemanager_selected_page_id', page.id);
    else localStorage.removeItem('pagemanager_selected_page_id');
  };

  const connectFacebook = async () => {
    try {
      const res = await apiFetch('/api/facebook/auth-url', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Không thể tạo URL đăng nhập Facebook');

      const popup = window.open(
        data.url,
        'meta_oauth_dialog',
        'width=650,height=750,menubar=no,toolbar=no,location=no,status=no'
      );
      if (!popup) {
        alert('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép Pop-up để tiếp tục kết nối Facebook.');
        return;
      }

      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('message', handleMessage);
      };

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'META_OAUTH_CODE') {
          cleanup();
          try {
            const completeRes = await apiFetch('/api/facebook/complete-oauth', {
              method: 'POST',
              body: JSON.stringify({ code: event.data.code, state: event.data.state }),
            });
            const completeData = await completeRes.json();
            if (!completeRes.ok) throw new Error(completeData.error || 'Không thể hoàn tất OAuth Meta');
            await refreshPages();
            await fetchConfigStatus();
            await refreshMetaConfig();
          } catch (err: any) {
            alert(`Kết nối Meta thất bại: ${err.message || 'Không thể lưu kết nối'}`);
          }
        } else if (event.data?.type === 'META_OAUTH_ERROR') {
          cleanup();
          alert(`Kết nối Meta thất bại: ${event.data.error || 'Đã hủy quyền'}`);
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (err: any) {
      console.error('connectFacebook error:', err);
      alert(err.message || 'Lỗi khi khởi tạo Facebook Login');
    }
  };

  const connectPage = async (pageId: string) => {
    try {
      const res = await apiFetch(`/api/facebook/pages/${pageId}/connect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await refreshPages();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const disconnectPage = async (pageId: string) => {
    try {
      const res = await apiFetch(`/api/facebook/pages/${pageId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await refreshPages();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const testPage = async (pageId: string) => {
    try {
      const res = await apiFetch(`/api/facebook/pages/${pageId}/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return { success: true, message: data.message, canPost: data.canPost };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const syncPagePosts = async (pageId: string) => {
    try {
      const res = await apiFetch('/api/facebook/sync', {
        method: 'POST',
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      window.dispatchEvent(new CustomEvent('pagemanager:contents-changed'));
      return { success: true, syncedCount: data.syncedCount, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return (
    <FacebookContext.Provider value={{
      connectedPages,
      availablePages,
      selectedPage,
      setSelectedPage,
      hasConnection,
      loading,
      configStatus,
      metaConfig,
      refreshMetaConfig,
      saveMetaConfig,
      connectFacebook,
      connectPage,
      disconnectPage,
      testPage,
      syncPagePosts,
      refreshPages,
    }}>
      {children}
    </FacebookContext.Provider>
  );
};

export const useFacebook = () => {
  const context = useContext(FacebookContext);
  if (!context) throw new Error('useFacebook must be used within a FacebookProvider');
  return context;
};
