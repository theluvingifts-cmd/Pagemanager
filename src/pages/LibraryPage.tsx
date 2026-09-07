import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Upload,
  Image as ImageIcon,
  Film,
  FolderKanban,
  Trash2,
  Loader2,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useContent } from '../context/ContentContext';

interface MediaRecord {
  id: string;
  file_name: string;
  file_size: number;
  media_type: 'image' | 'video' | 'other';
  storage_path: string;
  public_url: string;
  created_at: string;
}

export const LibraryPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const { contents } = useContent();

  const [mediaList, setMediaList] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'image' | 'video'>('all');
  const [selectedMedia, setSelectedMedia] = useState<MediaRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/media');
      if (res.ok) {
        const data = await res.json();
        setMediaList(data.media || []);
      }
    } catch (err) {
      console.error('Failed to fetch media:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: FileList | null = null;
    if ('dataTransfer' in e) {
      e.preventDefault();
      files = e.dataTransfer.files;
    } else if (e.target.files) {
      files = e.target.files;
    }

    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await apiFetch('/api/media/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setMediaList(prev => [data.media, ...prev]);
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Lỗi khi tải tệp lên Firebase Storage');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredMedia = useMemo(() => {
    return mediaList.filter(item => {
      if (activeFilter !== 'all' && item.media_type !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return item.file_name.toLowerCase().includes(query);
      }
      return true;
    });
  }, [mediaList, searchQuery, activeFilter]);

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Thư viện tệp phương tiện
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Hình ảnh & video lưu trữ trên Firebase Storage sẵn sàng để xuất bản lên Facebook Page
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tải tệp lên...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Tải tệp mới</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(['all', 'image', 'video'] as const).map(type => (
            <button
              key={type}
              onClick={() => setActiveFilter(type)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                activeFilter === type
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {type === 'all' ? 'Tất cả' : type === 'image' ? 'Hình ảnh' : 'Video'}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên tệp..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
          />
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-xs">Đang tải danh sách tệp...</span>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <FolderKanban className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">
            {searchQuery ? 'Không tìm thấy tệp phù hợp' : 'Thư viện chưa có tệp nào'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
            Tải lên hình ảnh hoặc video để đính kèm khi đăng bài lên Facebook Page.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Tải tệp lên</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredMedia.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedMedia(item)}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:border-blue-400 transition-colors cursor-pointer group flex flex-col"
            >
              <div className="aspect-square bg-slate-100 relative overflow-hidden flex items-center justify-center">
                {item.media_type === 'image' ? (
                  <img
                    src={item.public_url}
                    alt={item.file_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <Film className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-bold text-slate-800 truncate" title={item.file_name}>
                  {item.file_name}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {(item.file_size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Detail Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {selectedMedia.file_name}
              </h3>
              <button
                onClick={() => setSelectedMedia(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center max-h-80">
              <img
                src={selectedMedia.public_url}
                alt=""
                className="max-h-80 object-contain"
              />
            </div>

            <div className="text-xs space-y-1.5 text-slate-600">
              <p>
                <strong>Dung lượng:</strong> {(selectedMedia.file_size / (1024 * 1024)).toFixed(2)} MB
              </p>
              <p>
                <strong>URL công khai:</strong>
              </p>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] truncate select-all">
                {selectedMedia.public_url}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <a
                href={selectedMedia.public_url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <span>Xem ảnh gốc</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
