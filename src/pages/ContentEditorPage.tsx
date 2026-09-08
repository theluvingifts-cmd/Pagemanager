import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Trash2,
  AlertCircle,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Facebook,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { useFacebook } from '../context/FacebookContext';
import { useAuth } from '../context/AuthContext';
import { MediaItem } from '../types/content';

export const ContentEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { getContent, createContent, updateContent, publishToFacebook } = useContent();
  const { connectedPages, selectedPage } = useFacebook();
  const { apiFetch } = useAuth();

  const isEditMode = Boolean(id);
  const existingItem = id ? getContent(id) : undefined;

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [contentType, setContentType] = useState<'text' | 'photo' | 'link'>('text');
  const [targetPageId, setTargetPageId] = useState<string>('');
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState<{ permalink?: string; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedPage?.id) setTargetPageId(selectedPage.id);
    else if (connectedPages.length > 0) setTargetPageId(connectedPages[0].id);
  }, [selectedPage, connectedPages]);

  useEffect(() => {
    if (existingItem) {
      setTitle(existingItem.title);
      setMessage(existingItem.caption || existingItem.message || '');
      setLink(existingItem.link || '');
      setContentType((existingItem.format as any) || 'text');
      if (existingItem.facebook_page_id) setTargetPageId(existingItem.facebook_page_id);
      setMediaList(existingItem.media || []);
    }
  }, [existingItem]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: FileList | null = null;
    if ('dataTransfer' in e) {
      e.preventDefault();
      files = e.dataTransfer.files;
    } else if (e.target.files) {
      files = e.target.files;
    }

    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('Kích thước tệp không được vượt quá 25MB.');
      return;
    }

    setUploading(true);
    setErrorMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/media/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tải ảnh lên máy chủ');

      const uploadedMedia: MediaItem = {
        id: data.media.id,
        name: data.media.file_name,
        url: data.media.public_url,
        type: data.media.media_type,
        storage_path: data.media.storage_path,
        size: `${(data.media.file_size / (1024 * 1024)).toFixed(1)} MB`,
      };
      setMediaList([uploadedMedia]);
      setContentType('photo');
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi tải tệp lên');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMedia = () => {
    setMediaList([]);
    setContentType(link.trim() ? 'link' : 'text');
  };

  const handleSaveDraft = async () => {
    if (!message.trim()) {
      setErrorMessage('Vui lòng nhập nội dung bài viết.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    const payload = {
      title: title.trim() || message.trim().slice(0, 50),
      message: message.trim(),
      link: link.trim() || undefined,
      content_type: contentType,
      status: 'draft' as const,
      facebook_page_id: targetPageId || undefined,
      media: mediaList.map(m => ({
        public_url: m.url,
        media_type: m.type,
        file_name: m.name,
        storage_path: m.storage_path,
      })),
    };

    if (isEditMode && id) {
      const res = await updateContent(id, {
        title: payload.title,
        message: payload.message,
        caption: payload.message,
        link: payload.link,
        format: payload.content_type as any,
        status: 'draft',
        pageId: targetPageId || undefined,
        media: mediaList,
      });
      setSaving(false);
      if (res.success) navigate('/content');
      else setErrorMessage(res.error || 'Không thể lưu bản nháp');
    } else {
      const res = await createContent(payload);
      setSaving(false);
      if (res.success) navigate('/content');
      else setErrorMessage(res.error || 'Không thể lưu bản nháp');
    }
  };

  const handlePublishNow = async () => {
    if (!message.trim()) {
      setErrorMessage('Vui lòng nhập nội dung bài viết trước khi đăng.');
      return;
    }
    if (!targetPageId && connectedPages.length === 0) {
      setErrorMessage('Chưa có Facebook Page nào được kết nối. Vui lòng kết nối Page trong phần Cài đặt.');
      return;
    }

    setPublishing(true);
    setErrorMessage('');
    setSuccessResult(null);

    try {
      let contentId = id;
      const payload = {
        title: title.trim() || message.trim().slice(0, 50),
        message: message.trim(),
        link: link.trim() || undefined,
        content_type: contentType,
        status: 'ready' as const,
        facebook_page_id: targetPageId || selectedPage?.id,
        media: mediaList.map(m => ({
          public_url: m.url,
          media_type: m.type,
          file_name: m.name,
          storage_path: m.storage_path,
        })),
      };

      if (!contentId) {
        const createRes = await createContent(payload);
        if (!createRes.success || !createRes.content) {
          throw new Error(createRes.error || 'Lỗi khi lưu bài viết vào database');
        }
        contentId = createRes.content.id;
      } else {
        const updateRes = await updateContent(contentId, {
          title: payload.title,
          message: payload.message,
          caption: payload.message,
          link: payload.link,
          format: payload.content_type as any,
          status: 'ready',
          pageId: targetPageId,
          media: mediaList,
        });
        if (!updateRes.success) throw new Error(updateRes.error || 'Không thể cập nhật bài viết trước khi đăng');
      }

      const publishRes = await publishToFacebook(contentId, targetPageId);
      if (!publishRes.success) throw new Error(publishRes.error || 'Không thể đăng bài lên Facebook');

      setSuccessResult({
        permalink: publishRes.permalink,
        message: 'Bài viết đã được đăng trực tiếp lên Facebook Page thành công!',
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xuất bản bài viết');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>
        <span className="text-xs font-bold text-slate-400">
          {isEditMode ? 'Chỉnh sửa bài viết' : 'Soạn bài viết mới'}
        </span>
      </div>

      {successResult && (
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-950">Xuất bản thành công!</h3>
              <p className="text-xs text-emerald-800 mt-0.5">{successResult.message}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {successResult.permalink && (
              <a
                href={successResult.permalink}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <span>Xem trên Facebook</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={() => navigate('/content')}
              className="px-3.5 py-2 bg-white border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold transition-colors"
            >
              Về danh sách
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs flex items-start gap-3 text-rose-900">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Không thể thực hiện hành động</p>
            <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-rose-700 font-bold px-1">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tên bài viết (Quản lý nội bộ)</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ví dụ: Giới thiệu ưu đãi hè 2026..."
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Đăng lên Facebook Page</label>
              {connectedPages.length > 0 ? (
                <select
                  value={targetPageId}
                  onChange={e => setTargetPageId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                >
                  {connectedPages.map(page => (
                    <option key={page.id} value={page.id}>{page.page_name} (ID: {page.page_id})</option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                  <span>Chưa có Facebook Page nào được kết nối.</span>
                  <button type="button" onClick={() => navigate('/settings')} className="font-bold text-blue-600 hover:underline cursor-pointer">Kết nối ngay</button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Nội dung bài viết trên Facebook <span className="text-rose-500">*</span></label>
                <span className="text-[11px] text-slate-400 font-medium">{message.length} ký tự</span>
              </div>
              <textarea
                rows={8}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Nhập toàn bộ nội dung, câu chữ, hashtag bạn muốn xuất bản trực tiếp lên Facebook Page..."
                className="w-full px-3.5 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 placeholder:text-slate-400 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Liên kết đính kèm (Tùy chọn)</span>
              </label>
              <input
                type="url"
                value={link}
                onChange={e => {
                  setLink(e.target.value);
                  if (e.target.value && mediaList.length === 0) setContentType('link');
                  else if (!e.target.value && mediaList.length === 0) setContentType('text');
                }}
                placeholder="https://example.com/san-pham"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Hình ảnh đính kèm (Lưu vào Firebase Storage)</span>
              </label>

              {mediaList.length > 0 ? (
                <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 p-2 flex items-center justify-center">
                  <img src={mediaList[0].url} alt="Uploaded" className="max-h-72 object-contain rounded-xl" />
                  <button type="button" onClick={removeMedia} className="absolute top-4 right-4 p-2 bg-rose-600/90 hover:bg-rose-700 text-white rounded-xl shadow-md transition-colors cursor-pointer" title="Xóa ảnh này">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleFileUpload}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/30 rounded-2xl p-8 text-center cursor-pointer transition-colors"
                >
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  <div className="w-10 h-10 rounded-xl bg-white shadow-xs border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    {uploading ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin" /> : <Upload className="w-5 h-5 text-slate-500" />}
                  </div>
                  <p className="text-xs font-bold text-slate-800">{uploading ? 'Đang tải tệp lên Storage...' : 'Kéo thả ảnh vào đây hoặc nhấp để chọn tệp'}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Hỗ trợ JPG, PNG, WebP (Tối đa 25MB)</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Thao tác xuất bản</h3>
            <button
              type="button"
              onClick={handlePublishNow}
              disabled={publishing || saving || uploading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {publishing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Đang đăng lên Facebook...</span></>
              ) : (
                <><Facebook className="w-4 h-4 fill-white" /><span>Đăng ngay lên Facebook</span></>
              )}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || publishing || uploading}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>{saving ? 'Đang lưu...' : 'Lưu bản nháp vào Database'}</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Xem trước giao diện Facebook</span>
              <Facebook className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedPage?.page_name ? selectedPage.page_name.slice(0, 1) : 'P'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{selectedPage?.page_name || 'Facebook Page'}</p>
                  <p className="text-[10px] text-slate-400">Vừa xong • 🌐</p>
                </div>
              </div>
              <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{message || 'Nội dung bài viết của bạn sẽ hiển thị tại đây...'}</p>
              {mediaList.length > 0 && (
                <div className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  <img src={mediaList[0].url} alt="" className="w-full max-h-48 object-cover" />
                </div>
              )}
              {link && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-blue-600 truncate flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{link}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
