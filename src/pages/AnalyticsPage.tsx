import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Users,
  Share2,
  Heart,
  MessageCircle,
  ExternalLink,
  Plus,
  RefreshCw,
  Facebook,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { useFacebook } from '../context/FacebookContext';
import { formatDateTimeVi } from '../utils/constants';

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { contents } = useContent();
  const { selectedPage, syncPagePosts } = useFacebook();

  // Real published posts from database
  const publishedPosts = contents.filter(c => c.status === 'published');

  // Real metrics calculated from actual database items
  const totalReach = publishedPosts.reduce((acc, curr) => acc + (curr.metrics?.reach || 0), 0);
  const totalEngagement = publishedPosts.reduce((acc, curr) => acc + (curr.metrics?.engagement || 0), 0);
  const totalClicks = publishedPosts.reduce((acc, curr) => acc + (curr.metrics?.clicks || 0), 0);
  const totalShares = publishedPosts.reduce((acc, curr) => acc + (curr.metrics?.shares || 0), 0);

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Hiệu quả bài đăng Facebook
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {selectedPage
              ? `Thống kê bài viết đã xuất bản của ${selectedPage.page_name}`
              : 'Thống kê bài viết đã xuất bản từ các Facebook Page đã kết nối'}
          </p>
        </div>

        {selectedPage && (
          <button
            onClick={() => syncPagePosts(selectedPage.id)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            <span>Cập nhật số liệu từ Facebook</span>
          </button>
        )}
      </div>

      {/* 4 Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Bài viết đã đăng
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Facebook className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {publishedPosts.length}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Lượt tiếp cận (Reach)
            </span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {totalReach > 0 ? totalReach.toLocaleString('vi-VN') : '--'}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Lượt tương tác
            </span>
            <div className="p-2 rounded-xl bg-pink-50 text-pink-600">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {totalEngagement > 0 ? totalEngagement.toLocaleString('vi-VN') : '--'}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Lượt chia sẻ
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Share2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900">
              {totalShares > 0 ? totalShares.toLocaleString('vi-VN') : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Published Posts Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Danh sách bài viết đã xuất bản
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Theo dõi trực tiếp các bài viết hiện diện trên Facebook
            </p>
          </div>
        </div>

        {publishedPosts.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <Facebook className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              Chưa có bài viết nào được xuất bản
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
              Hãy soạn bài viết mới và nhấn "Đăng ngay lên Facebook" để bắt đầu theo dõi hiệu suất.
            </p>
            <button
              onClick={() => navigate('/content/new')}
              className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo bài viết mới</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Bài viết</th>
                  <th className="py-3 px-4">Facebook Post ID</th>
                  <th className="py-3 px-4">Thời gian xuất bản</th>
                  <th className="py-3 px-4 text-right">Liên kết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedPosts.map(post => (
                  <tr
                    key={post.id}
                    onClick={() => navigate(`/content/${post.id}`)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900 max-w-xs truncate">
                      {post.title}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {post.facebook_post_id || '--'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {formatDateTimeVi(post.publishedAt || post.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                      {post.facebook_permalink && (
                        <a
                          href={post.facebook_permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold"
                        >
                          <span>Xem trên Facebook</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
