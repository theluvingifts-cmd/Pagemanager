import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  ExternalLink,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { useFacebook } from '../context/FacebookContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatDateTimeVi } from '../utils/constants';

export const ContentListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contents, loading, deleteContent, publishToFacebook, refreshContents } = useContent();
  const { selectedPage, syncPagePosts } = useFacebook();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>(() => searchParams.get('status') || 'all');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    if (status === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', status);
    }
    setSearchParams(searchParams);
  };

  const filteredContents = useMemo(() => {
    return contents.filter(item => {
      // Status filter
      if (selectedStatus === 'draft') {
        if (item.status !== 'draft' && item.status !== 'ready') return false;
      } else if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(query);
        const matchMessage = (item.caption || item.message || '').toLowerCase().includes(query);
        if (!matchTitle && !matchMessage) return false;
      }

      return true;
    });
  }, [contents, selectedStatus, searchTerm]);

  const handlePublish = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPublishingId(id);
    setActionAlert(null);

    const result = await publishToFacebook(id);
    setPublishingId(null);

    if (result.success) {
      setActionAlert({
        type: 'success',
        message: 'Đã xuất bản bài viết thành công lên Facebook Page!',
      });
    } else {
      setActionAlert({
        type: 'error',
        message: result.error || 'Xuất bản thất bại.',
      });
    }
  };

  const handleDelete = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Bạn có chắc muốn xóa bài viết "${title}" khỏi hệ thống?`)) {
      return;
    }

    setDeletingId(id);
    const res = await deleteContent(id);
    setDeletingId(null);

    if (res.success) {
      setActionAlert({ type: 'success', message: 'Đã xóa bài viết thành công.' });
    } else {
      setActionAlert({ type: 'error', message: res.error || 'Lỗi khi xóa bài viết' });
    }
  };

  const handleSync = async () => {
    if (!selectedPage) {
      alert('Vui lòng chọn Page để đồng bộ.');
      return;
    }
    setSyncing(true);
    setActionAlert(null);
    const result = await syncPagePosts(selectedPage.id);
    setSyncing(false);

    if (result.success) {
      setActionAlert({
        type: 'success',
        message: result.message || `Đã đồng bộ ${result.syncedCount || 0} bài viết từ Facebook.`,
      });
      refreshContents();
    } else {
      setActionAlert({
        type: 'error',
        message: result.error || 'Lỗi khi đồng bộ bài viết',
      });
    }
  };

  const statusTabs = [
    { key: 'all', label: 'Tất cả' },
    { key: 'draft', label: 'Bản nháp' },
    { key: 'publishing', label: 'Đang đăng' },
    { key: 'published', label: 'Đã đăng Facebook' },
    { key: 'failed', label: 'Đăng lỗi' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Quản lý bài viết Facebook
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Toàn bộ bài viết được đồng bộ và lưu trữ trực tiếp trên cơ sở dữ liệu thật
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {selectedPage && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
              <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Facebook'}</span>
            </button>
          )}
          <button
            onClick={() => navigate('/content/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo bài mới</span>
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionAlert && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            actionAlert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionAlert.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{actionAlert.message}</span>
          </div>
          <button
            onClick={() => setActionAlert(null)}
            className="text-slate-400 hover:text-slate-600 font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {statusTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleStatusChange(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                selectedStatus === tab.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Field */}
        <div className="relative w-full md:w-72 shrink-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tiêu đề hoặc nội dung..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
          />
        </div>
      </div>

      {/* Contents Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Đang tải danh sách bài viết...</span>
          </div>
        ) : filteredContents.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              {searchTerm ? 'Không tìm thấy bài viết phù hợp' : 'Chưa có bài viết nào'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
              {searchTerm
                ? 'Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bộ lọc trạng thái.'
                : 'Bắt đầu soạn thảo bài viết mới hoặc đồng bộ các bài đã xuất bản từ Facebook.'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => navigate('/content/new')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo bài viết đầu tiên</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Bài viết</th>
                  <th className="py-3 px-4">Page</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Nguồn</th>
                  <th className="py-3 px-4">Thời gian</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContents.map(item => {
                  const isPublishing = publishingId === item.id || item.status === 'publishing';
                  const isDeleting = deletingId === item.id;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => navigate(`/content/${item.id}`)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                        <div className="flex items-start gap-3">
                          {item.media && item.media.length > 0 ? (
                            <img
                              src={item.media[0].url}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover ring-1 ring-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                              {item.title}
                            </p>
                            <p className="text-slate-500 line-clamp-1 mt-0.5">
                              {item.caption || item.message}
                            </p>
                            {item.publish_error && (
                              <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span className="truncate">{item.publish_error}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {item.facebook_page?.page_name || selectedPage?.page_name || 'Mặc định'}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={item.status} size="sm" />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                        {item.source === 'facebook' ? (
                          <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            Facebook
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            Page Manager
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                        {formatDateTimeVi(item.publishedAt || item.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Publish button if not published */}
                          {(item.status === 'draft' || item.status === 'ready' || item.status === 'failed') && (
                            <button
                              type="button"
                              onClick={e => handlePublish(item.id, e)}
                              disabled={isPublishing}
                              title="Xuất bản trực tiếp lên Facebook Page"
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              {isPublishing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              <span>{item.status === 'failed' ? 'Thử lại' : 'Đăng'}</span>
                            </button>
                          )}

                          {/* View on Facebook link */}
                          {item.status === 'published' && item.facebook_permalink && (
                            <a
                              href={item.facebook_permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Xem trực tiếp trên Facebook"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => navigate(`/content/${item.id}`)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={e => handleDelete(item.id, item.title, e)}
                            disabled={isDeleting}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa bài viết"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
