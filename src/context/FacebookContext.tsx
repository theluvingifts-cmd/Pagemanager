import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { FacebookPage, SystemConfigStatus } from '../types';

interface FacebookContextType {
  connectedPages: FacebookPage[];
  availablePages: FacebookPage[];
  selectedPage: FacebookPage | null;
  setSelectedPage: (page: FacebookPage | null) => void;
  hasConnection: boolean;
  loading: boolean;
  configStatus: SystemConfigStatus | null;
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

  // Load configuration status from backend
  const fetchConfigStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/config-status');
      if (res.ok) {
        const data = await res.json();
        setConfigStatus(data);
      }
    } catch (e) {
      console.error('Failed to load system config status:', e);
    }
  }, []);

  // Fetch real managed and connected pages
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
      if (res.ok) {
        const data = await res.json();
        setHasConnection(Boolean(data.connected));
        setAvailablePages(data.pages || []);
        const activePages: FacebookPage[] = data.connectedPages || [];
        setConnectedPages(activePages);

        // Maintain or set selected page
        const savedPageId = localStorage.getItem('pagemanager_selected_page_id');
        if (savedPageId) {
          const match = activePages.find(p => p.id === savedPageId || p.page_id === savedPageId);
          if (match) {
            setSelectedPageState(match);
          } else if (activePages.length > 0) {
            setSelectedPageState(activePages[0]);
          } else {
            setSelectedPageState(null);
          }
        } else if (activePages.length > 0) {
          setSelectedPageState(activePages[0]);
        } else {
          setSelectedPageState(null);
        }
      }
    } catch (err) {
      console.error('Error fetching Facebook pages:', err);
    } finally {
      setLoading(false);
    }
  }, [user, apiFetch]);

  useEffect(() => {
    fetchConfigStatus();
    refreshPages();
  }, [fetchConfigStatus, refreshPages]);

  const setSelectedPage = (page: FacebookPage | null) => {
    setSelectedPageState(page);
    if (page) {
      localStorage.setItem('pagemanager_selected_page_id', page.id);
    } else {
      localStorage.removeItem('pagemanager_selected_page_id');
    }
  };

  // Launch real Meta OAuth Popup
  const connectFacebook = async () => {
    try {
      const res = await apiFetch('/api/facebook/auth-url');
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Không thể tạo URL đăng nhập Facebook');
      }

      const authUrl = data.url;

      // Open OAuth provider directly in a popup (matching system guidelines)
      const popup = window.open(
        authUrl,
        'meta_oauth_dialog',
        'width=650,height=750,menubar=no,toolbar=no,location=no,status=no'
      );

      if (!popup) {
        alert('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép Pop-up để tiếp tục kết nối Facebook.');
        return;
      }

      // Listen for postMessage from popup callback
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'META_OAUTH_SUCCESS') {
          window.removeEventListener('message', handleMessage);
          refreshPages();
        } else if (event.data?.type === 'META_OAUTH_ERROR') {
          window.removeEventListener('message', handleMessage);
          alert(`Kết nối Meta thất bại: ${event.data.error || 'Đã hủy quyền'}`);
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (err: any) {
      console.error('connectFacebook error:', err);
      alert(err.message || 'Lỗi khi khởi tạo Facebook Login');
    }
  };

  // Connect a selected Page
  const connectPage = async (pageId: string) => {
    try {
      const res = await apiFetch(`/api/facebook/pages/${pageId}/connect`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      await refreshPages();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Disconnect a Page
  const disconnectPage = async (pageId: string) => {
    try {
      const res = await apiFetch(`/api/facebook/pages/${pageId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      await refreshPages();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Test Page Connection
  const testPage = async (pageId: string) => {
    try {
      const res = await apiFetch(`/api/facebook/pages/${pageId}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      return { success: true, message: data.message, canPost: data.canPost };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Sync published posts from Facebook Page
  const syncPagePosts = async (pageId: string) => {
    try {
      const res = await apiFetch('/api/facebook/sync', {
        method: 'POST',
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      return { success: true, syncedCount: data.syncedCount, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return (
    <FacebookContext.Provider
      value={{
        connectedPages,
        availablePages,
        selectedPage,
        setSelectedPage,
        hasConnection,
        loading,
        configStatus,
        connectFacebook,
        connectPage,
        disconnectPage,
        testPage,
        syncPagePosts,
        refreshPages,
      }}
    >
      {children}
    </FacebookContext.Provider>
  );
};

export const useFacebook = () => {
  const context = useContext(FacebookContext);
  if (!context) {
    throw new Error('useFacebook must be used within a FacebookProvider');
  }
  return context;
};
