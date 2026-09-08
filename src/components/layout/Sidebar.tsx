import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  CalendarDays,
  FolderKanban,
  BarChart3,
  Settings,
  ChevronDown,
  Check,
  Facebook,
  PlusCircle,
  LogOut,
  MessageCircle,
} from 'lucide-react';
import { useFacebook } from '../../context/FacebookContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { connectedPages, selectedPage, setSelectedPage, connectFacebook } = useFacebook();
  const { user, logout } = useAuth();
  const [showPageMenu, setShowPageMenu] = useState(false);

  const navItems = [
    { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/content', label: 'Bài viết', icon: FileText },
    { to: '/messages', label: 'Tin nhắn', icon: MessageCircle },
    { to: '/calendar', label: 'Lịch xuất bản', icon: CalendarDays },
    { to: '/library', label: 'Thư viện', icon: FolderKanban },
    { to: '/analytics', label: 'Hiệu quả & AI', icon: BarChart3 },
    { to: '/settings', label: 'Cấu hình', icon: Settings },
  ];

  return (
    <aside className="w-[224px] bg-slate-900 text-slate-300 flex flex-col h-full select-none shrink-0 border-r border-slate-800/80">
      <div className="h-[52px] flex items-center px-3.5 border-b border-slate-800 gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
          <Facebook className="w-4 h-4 fill-white" />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-[13px] text-white tracking-tight leading-none">PAGE MANAGER</div>
          <div className="text-[9px] text-slate-500 mt-1 font-semibold tracking-wide">META CONTROL CENTER</div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-2 border-t border-slate-800 bg-slate-950/60 space-y-1.5 shrink-0">
        <div className="relative">
          {connectedPages.length > 0 && selectedPage ? (
            <button
              type="button"
              onClick={() => setShowPageMenu(!showPageMenu)}
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors text-left group"
            >
              {selectedPage.page_avatar_url ? (
                <img
                  src={selectedPage.page_avatar_url}
                  alt={selectedPage.page_name}
                  className="w-7 h-7 rounded-md object-cover ring-1 ring-slate-700 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-md bg-blue-600/25 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                  {selectedPage.page_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate">{selectedPage.page_name}</p>
                <p className="text-[9px] text-emerald-400 truncate flex items-center gap-1 font-semibold mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Đã kết nối
                </p>
              </div>
              <ChevronDown className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${showPageMenu ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => connectFacebook()}
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/25 text-blue-300 text-left text-[11px] font-bold"
            >
              <Facebook className="w-3.5 h-3.5 fill-blue-400 text-blue-400 shrink-0" />
              <span className="flex-1 truncate">Kết nối Facebook</span>
              <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}

          {showPageMenu && connectedPages.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1.5 w-full bg-slate-800 rounded-lg shadow-2xl border border-slate-700 py-1.5 z-50">
              <div className="px-2.5 py-1.5 border-b border-slate-700/80 flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Chọn Page</p>
                <Link
                  to="/settings"
                  onClick={() => setShowPageMenu(false)}
                  className="text-[9px] text-blue-400 hover:text-blue-300"
                >
                  Quản lý
                </Link>
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {connectedPages.map(page => {
                  const isSelected = page.id === selectedPage?.id;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => {
                        setSelectedPage(page);
                        setShowPageMenu(false);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-slate-700/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {page.page_avatar_url ? (
                          <img src={page.page_avatar_url} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-slate-700 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                            {page.page_name.slice(0, 1)}
                          </div>
                        )}
                        <p className="text-[11px] font-semibold text-white truncate">{page.page_name}</p>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <div className="min-w-0 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[9px] font-bold shrink-0">
                {user.email ? user.email.slice(0, 1).toUpperCase() : 'U'}
              </div>
              <p className="text-[10px] text-slate-500 truncate max-w-[145px]" title={user.email || ''}>{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Đăng xuất Page Manager"
              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-md"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
