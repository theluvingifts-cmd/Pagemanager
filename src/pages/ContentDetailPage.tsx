import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Edit2,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Facebook,
  FileText,
  Clock,
  Layers,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { useFacebook } from '../context/FacebookContext';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatDateTimeVi } from '../utils/constants';

export const ContentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getContent, deleteContent, publishToFacebook } = useContent();
  const { selectedPage } = useFacebook();

  const item = id ? getContent(id) : undefined;

  const [publishing, setPublishing] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <FileText className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Không tìm thấy bài viết</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Bài viết có thể đã bị xóa hoặc không tồn tại trong tài khoản của bạn.
        </p>
        <button
          onClick={() => navigate('/content')}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const handlePublish = async () => {
    setPublishing(true);
    setActionAlert(null);

    const result = await publishToFacebook(item.id);
    setPublishing(false);

    if (result.success) {
      setActionAlert({
        type: 'success',
        message: 'Đã xuất bản bài viết thành công lên Facebook Page!',
      });
    } else {
      setActionAlert({
        type: 'error',
        message: result.error || 'Xuất bản thất bại',
      });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa bài viết này khỏi hệ thống?')) return;
    const res = await deleteContent(item.id);
    if (res.success) {
      navigate('/content');
    } else {
      alert(res.error || 'Lỗi khi xóa bài viết');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/content')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Danh sách bài viết</span>
        </button>

        <div className="flex items-center gap-2">
          {item.status !== 'published' && (
            <button
              onClick={() => navigate(`/content/edit/${item.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Chỉnh sửa</span>
            </button>
          )}

          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa</span>
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

      {/* Publish Error Warning */}
      {item.publish_error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Lỗi xuất bản từ Facebook Graph API</p>
            <p className="mt-0.5 leading-relaxed">{item.publish_error}</p>
          </div>
        </div>
      )}

      {/* Main Detail Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        {/* Header Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <StatusBadge status={item.status} size="md" />
              <span className="text-xs font-semibold text-slate-400">
                {item.source === 'facebook' ? 'Đồng bộ từ Facebook' : 'Soạn từ Page Manager'}
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mt-2">
              {item.title}
            </h1>
          </div>

          {/* Action buttons */}
          <div className="shrink-0 flex items-center gap-2">
            {item.status === 'published' && item.facebook_permalink && (
              <a
                href={item.facebook_permalink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                <Facebook className="w-4 h-4 fill-white" />
                <span>Xem trên Facebook</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {(item.status === 'draft' || item.status === 'ready' || item.status === 'failed') && (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang gửi lên Facebook...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{item.status === 'failed' ? 'Thử đăng lại' : 'Đăng lên Facebook ngay'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Message Content */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Nội dung bài viết
          </h3>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
            {item.caption || item.message}
          </div>
        </div>

        {/* Media Attachments */}
        {item.media && item.media.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Hình ảnh đính kèm
            </h3>
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 p-2 max-w-lg">
              <img
                src={item.media[0].url}
                alt="Post Media"
                className="w-full max-h-96 object-contain rounded-xl"
              />
            </div>
          </div>
        )}

        {/* Link Attachment */}
        {item.link && (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Liên kết
            </h3>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>{item.link}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Meta / Graph API Technical Info */}
        <div className="border-t border-slate-100 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="font-bold text-slate-400 block mb-1">Page đăng</span>
            <span className="font-semibold text-slate-800">
              {item.facebook_page?.page_name || selectedPage?.page_name || 'Mặc định'}
            </span>
          </div>

          <div>
            <span className="font-bold text-slate-400 block mb-1">Facebook Post ID</span>
            <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
              {item.facebook_post_id || 'Chưa xuất bản'}
            </span>
          </div>

          <div>
            <span className="font-bold text-slate-400 block mb-1">Thời gian tạo</span>
            <span className="text-slate-700 font-medium">
              {formatDateTimeVi(item.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
