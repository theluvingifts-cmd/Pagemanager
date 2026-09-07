import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  FileText,
  FileCheck,
  AlertCircle,
  Clock,
  Layers,
  ChevronRight,
  ExternalLink,
  Facebook,
  RefreshCw,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { useFacebook } from '../context/FacebookContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatDateTimeVi } from '../utils/constants';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { contents, loading: contentsLoading, stats, publishToFacebook } = useContent();
  const {
    connectedPages,
    selectedPage,
    connectFacebook,
    syncPagePosts,
    configStatus,
  } = useFacebook();

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePublishNow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedPage && connectedPages.length === 0) {
      alert('Vui lòng kết nối một Facebook Page trước khi đăng bài.');
      navigate('/settings');
      return;
    }

    setPublishingId(id);
    setActionMessage(null);

    const result = await publishToFacebook(id);
    setPublishingId(null);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: 'Đã xuất bản bài viết thành công lên Facebook Page!',
      });
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'Lỗi khi xuất bản bài viết lên Facebook.',
      });
    }
  };

  const handleSync = async () => {
    if (!selectedPage) return;
    setSyncing(true);
    setActionMessage(null);
    const result = await syncPagePosts(selectedPage.id);
    setSyncing(false);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: result.message || `Đã đồng bộ ${result.syncedCount || 0} bài viết từ Facebook.`,
      });
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'Đồng bộ thất bại',
      });
    }
  };

  const statCards = [
    {
      label: 'Tổng bài viết',
      value: stats.total,
      icon: Layers,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      label: 'Bản nháp',
      value: stats.draft + stats.ready,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
    {
      label: 'Đã đăng Facebook',
      value: stats.published,
      icon: FileCheck,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
    },
    {
      label: 'Đăng lỗi',
      value: stats.failed,
      icon: AlertCircle,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
    },
  ];

  const recentContents = contents.slice(0, 6);

  return (
    <div className="space-y-6 pb-12">
      {/* Independent Configuration Alerts */}
      {configStatus && !configStatus.firebaseConfigured && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Chưa cấu hình Firebase
              </h3>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Vui lòng cung cấp các biến môi trường Firebase (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, v.v.) trong phần Settings để kích hoạt đăng nhập và cơ sở dữ liệu Firestore.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-xs"
          >
            Cài đặt Firebase
          </button>
        </div>
      )}

      {configStatus && !configStatus.metaConfigured && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-blue-950">
                Chưa cấu hình Meta App
              </h3>
              <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                Vui lòng cung cấp META_APP_ID và META_APP_SECRET để có thể kết nối Facebook Page và xuất bản bài viết trực tiếp lên dòng thời gian.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-xs"
          >
            Cài đặt Meta App
          </button>
        </div>
      )}

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero / Page Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {selectedPage ? (
            selectedPage.page_avatar_url ? (
              <img
                src={selectedPage.page_avatar_url}
                alt={selectedPage.page_name}
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-blue-100 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-black text-xl flex items-center justify-center shrink-0">
                {selectedPage.page_name.slice(0, 2).toUpperCase()}
              </div>
            )
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
              <Facebook className="w-7 h-7" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {selectedPage ? selectedPage.page_name : 'Chưa chọn Facebook Page'}
              </h2>
              {selectedPage && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Đã kết nối
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {selectedPage
                ? `Facebook Page ID: ${selectedPage.page_id} • Sẵn sàng đăng bài trực tiếp qua Meta Graph API`
                : 'Kết nối Facebook Page của bạn để xuất bản bài viết trực tiếp lên dòng thời gian'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {selectedPage ? (
            <>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ bài viết'}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/content/new')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo bài mới</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={connectFacebook}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Facebook className="w-4 h-4 fill-white" />
              <span>Kết nối Facebook ngay</span>
            </button>
          )}
        </div>
      </div>

      {/* Real Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`p-5 rounded-2xl bg-white border ${card.border} shadow-xs flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">{card.label}</span>
                <div className={`p-2 rounded-xl ${card.bg} ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {contentsLoading ? '...' : card.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Section: Recent Real Contents */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Bài viết gần đây</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dữ liệu thật từ cơ sở dữ liệu và Facebook Graph API
            </p>
          </div>
          <button
            onClick={() => navigate('/content')}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
          >
            <span>Xem toàn bộ</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {contentsLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Đang tải danh sách bài viết...</span>
          </div>
        ) : recentContents.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Chưa có bài viết nào</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
              Tạo bài viết đầu tiên để xuất bản lên Facebook Page thật, hoặc nhấn "Đồng bộ bài viết" để tải các bài đã đăng từ Facebook về.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/content/new')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo bài mới</span>
              </button>
              {selectedPage && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Đồng bộ từ Facebook</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentContents.map(item => {
              const isPublishing = publishingId === item.id || item.status === 'publishing';
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(`/content/${item.id}`)}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {item.media && item.media.length > 0 ? (
                      <img
                        src={item.media[0].url}
                        alt="Asset"
                        className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={item.status} size="sm" />
                        <span className="text-[11px] font-semibold text-slate-400">
                          {item.source === 'facebook' ? 'Đồng bộ từ Facebook' : 'Tạo từ Page Manager'}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate mt-1">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                        {item.caption || item.message}
                      </p>
                      {item.publish_error && (
                        <p className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>Lỗi: {item.publish_error}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <span className="text-xs text-slate-400">
                      {formatDateTimeVi(item.createdAt)}
                    </span>

                    {item.status === 'published' && item.facebook_permalink && (
                      <a
                        href={item.facebook_permalink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Xem trực tiếp trên Facebook"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    {(item.status === 'draft' || item.status === 'ready' || item.status === 'failed') && (
                      <button
                        type="button"
                        onClick={e => handlePublishNow(item.id, e)}
                        disabled={isPublishing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        {isPublishing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang gửi...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>{item.status === 'failed' ? 'Thử lại' : 'Đăng ngay'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
