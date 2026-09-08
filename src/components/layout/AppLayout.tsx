import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, X, Plus, RefreshCw } from 'lucide-react';
import { useFacebook } from '../../context/FacebookContext';

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedPage, syncPagePosts } = useFacebook();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Tổng quan';
      case '/content': return 'Bài viết';
      case '/content/new': return 'Tạo nội dung mới';
      case '/messages': return 'Tin nhắn';
      case '/calendar': return 'Lịch xuất bản';
      case '/library': return 'Thư viện tệp';
      case '/analytics': return 'Hiệu quả & AI';
      case '/settings': return 'Cấu hình & Facebook';
      default:
        if (location.pathname.startsWith('/content/edit/')) return 'Chỉnh sửa nội dung';
        if (location.pathname.startsWith('/content/')) return 'Chi tiết bài viết';
        return 'PAGE MANAGER';
    }
  };

  const handleSync = async () => {
    if (!selectedPage || syncing) return;
    setSyncing(true);
    const result = await syncPagePosts(selectedPage.id);
    setSyncing(false);
    if (!result.success) window.alert(result.error || 'Không thể đồng bộ Facebook.');
  };

  const showSync = Boolean(selectedPage && ['/dashboard', '/calendar', '/analytics'].includes(location.pathname));
  const showCreate = ['/dashboard', '/calendar', '/library', '/analytics'].includes(location.pathname);
  const isMessages = location.pathname === '/messages';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      <div className="hidden md:flex h-full shrink-0"><Sidebar /></div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="w-[224px] h-full bg-slate-900 shadow-2xl relative" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 z-50 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800" aria-label="Đóng menu"><X className="w-4 h-4" /></button>
            <Sidebar onCloseMobile={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <header className="h-[52px] bg-white border-b border-slate-200 px-3 md:px-4 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button type="button" onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 md:hidden rounded-lg hover:bg-slate-100" aria-label="Mở menu"><Menu className="w-4 h-4" /></button>
            <h1 className="text-sm md:text-[15px] font-extrabold text-slate-900 tracking-tight whitespace-nowrap">{getPageTitle()}</h1>
            <span className="hidden sm:block h-4 w-px bg-slate-200" />
            {selectedPage ? (
              <div className="hidden sm:flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-semibold text-slate-700 truncate max-w-[190px]">{selectedPage.page_name}</span>
                <span className="hidden lg:inline font-mono text-slate-400">{selectedPage.page_id}</span>
              </div>
            ) : <span className="hidden sm:inline text-[11px] font-semibold text-amber-600">Chưa chọn Page</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showSync && <button type="button" onClick={handleSync} disabled={syncing} title="Đồng bộ bài viết từ Facebook" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} /><span className="hidden lg:inline">{syncing ? 'Đang đồng bộ' : 'Đồng bộ'}</span></button>}
            {showCreate && <button type="button" onClick={() => navigate('/content/new')} className="inline-flex items-center gap-1.5 h-8 px-2.5 md:px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-sm active:scale-[0.98]"><Plus className="w-3.5 h-3.5" /><span>Tạo bài</span></button>}
          </div>
        </header>

        <main className={`pm-content flex-1 min-h-0 bg-slate-50 ${isMessages ? 'overflow-hidden p-2 md:p-2.5' : 'overflow-y-auto p-3 md:p-4'}`}>
          <div className={`w-full min-w-0 ${isMessages ? 'h-full min-h-0' : ''}`}><Outlet /></div>
        </main>
      </div>
    </div>
  );
};
