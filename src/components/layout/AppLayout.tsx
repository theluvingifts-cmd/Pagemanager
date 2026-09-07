import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, X, Plus, RefreshCw, Facebook } from 'lucide-react';
import { useFacebook } from '../../context/FacebookContext';

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedPage, syncPagePosts } = useFacebook();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return 'Tổng quan';
      case '/content':
        return 'Quản lý bài viết';
      case '/content/new':
        return 'Tạo nội dung mới';
      case '/calendar':
        return 'Lịch xuất bản';
      case '/library':
        return 'Thư viện tệp';
      case '/analytics':
        return 'Hiệu quả bài đăng';
      case '/settings':
        return 'Cấu hình & Facebook Page';
      default:
        if (location.pathname.startsWith('/content/edit/')) return 'Chỉnh sửa nội dung';
        if (location.pathname.startsWith('/content/')) return 'Chi tiết bài viết';
        return 'PAGE MANAGER';
    }
  };

  const handleSync = async () => {
    if (!selectedPage) {
      alert('Vui lòng chọn một Facebook Page để đồng bộ.');
      return;
    }

    setSyncing(true);
    const result = await syncPagePosts(selectedPage.id);
    setSyncing(false);

    if (result.success) {
      alert(result.message || `Đã đồng bộ thành công ${result.syncedCount || 0} bài viết từ Facebook Page.`);
      window.location.reload();
    } else {
      alert(result.error || 'Lỗi khi đồng bộ bài viết từ Facebook');
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-64 h-full bg-slate-900 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setMobileOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar onCloseMobile={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:text-slate-900 md:hidden rounded-lg hover:bg-slate-100"
              aria-label="Mở menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {getPageTitle()}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Page đang chọn:</span>
                {selectedPage ? (
                  <>
                    <span className="font-semibold text-slate-800">{selectedPage.page_name}</span>
                    <span className="inline-block w-1 h-1 rounded-full bg-slate-300" />
                    <span className="text-emerald-600 font-medium">ID: {selectedPage.page_id}</span>
                  </>
                ) : (
                  <span className="text-amber-600 font-medium">Chưa chọn Page</span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5">
            {selectedPage && (
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                title="Đồng bộ các bài viết đã xuất bản từ Facebook về hệ thống"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ Facebook'}</span>
              </button>
            )}

            {location.pathname !== '/content/new' && (
              <button
                type="button"
                onClick={() => navigate('/content/new')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo bài mới</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Main Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
