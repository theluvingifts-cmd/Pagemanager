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
  Layers,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useFacebook } from '../../context/FacebookContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { connectedPages, selectedPage, setSelectedPage, connectFacebook, loading: fbLoading } = useFacebook();
  const { user, logout } = useAuth();
  const [showPageMenu, setShowPageMenu] = useState(false);

  const navItems = [
    { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/content', label: 'Quản lý bài viết', icon: FileText },
    { to: '/calendar', label: 'Lịch xuất bản', icon: CalendarDays },
    { to: '/library', label: 'Thư viện tệp', icon: FolderKanban },
    { to: '/analytics', label: 'Hiệu quả', icon: BarChart3 },
    { to: '/settings', label: 'Cấu hình & Facebook', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full select-none shrink-0 border-r border-slate-800">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm shadow-blue-500/20">
          <Facebook className="w-5 h-5 fill-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-extrabold text-base text-white tracking-tight leading-none">
            PAGE MANAGER
          </span>
          <span className="text-[11px] text-slate-400 mt-1 font-medium tracking-wide">
            Meta Graph API Publisher
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Page Selector & Account */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70 space-y-2">
        {/* Real Facebook Page Switcher */}
        <div className="relative">
          {connectedPages.length > 0 && selectedPage ? (
            <button
              type="button"
              onClick={() => setShowPageMenu(!showPageMenu)}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors text-left group cursor-pointer"
            >
              {selectedPage.page_avatar_url ? (
                <img
                  src={selectedPage.page_avatar_url}
                  alt={selectedPage.page_name}
                  className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-700 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedPage.page_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                  {selectedPage.page_name}
                </p>
                <p className="text-[10px] text-emerald-400 truncate flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                  ID: {selectedPage.page_id}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={connectFacebook}
              className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition-colors text-left text-xs font-semibold cursor-pointer"
            >
              <Facebook className="w-4 h-4 fill-blue-400 text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block truncate">Chưa kết nối Page</span>
                <span className="text-[10px] text-blue-400/80 block">Nhấn để kết nối Meta</span>
              </div>
              <PlusCircle className="w-4 h-4 text-blue-400 shrink-0" />
            </button>
          )}

          {/* Switch Page Dropdown */}
          {showPageMenu && connectedPages.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-full bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 border-b border-slate-700/80 flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Facebook Page đã kết nối
                </p>
                <Link
                  to="/settings"
                  onClick={() => setShowPageMenu(false)}
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Quản lý
                </Link>
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
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
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700/60 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {page.page_avatar_url ? (
                          <img
                            src={page.page_avatar_url}
                            alt={page.page_name}
                            className="w-6 h-6 rounded-md object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {page.page_name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">
                            {page.page_name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            ID: {page.page_id}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User Account Bar */}
        {user && (
          <div className="flex items-center justify-between pt-1 px-1">
            <div className="min-w-0 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-[11px] font-bold">
                {user.email ? user.email.slice(0, 1).toUpperCase() : 'U'}
              </div>
              <p className="text-xs text-slate-300 truncate max-w-[120px]" title={user.email}>
                {user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Đăng xuất"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
