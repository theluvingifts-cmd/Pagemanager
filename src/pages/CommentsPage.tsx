import React from 'react';
import { MessageSquare, AlertCircle, ExternalLink, RefreshCw, Facebook } from 'lucide-react';
import { useFacebook } from '../context/FacebookContext';
import { useContent } from '../context/ContentContext';

export const CommentsPage: React.FC = () => {
  const { selectedPage, syncPagePosts } = useFacebook();
  const { contents } = useContent();

  const publishedPosts = contents.filter(c => c.status === 'published');

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Bình luận & Tương tác
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi bình luận trực tiếp từ các bài viết trên Facebook Page
          </p>
        </div>

        {selectedPage && (
          <button
            onClick={() => syncPagePosts(selectedPage.id)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            <span>Đồng bộ tương tác</span>
          </button>
        )}
      </div>

      {publishedPosts.length === 0 ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">
            Chưa có bài viết xuất bản nào
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
            Khi bạn xuất bản bài viết lên Facebook Page thật, các bình luận của người xem sẽ được đồng bộ và quản lý tại đây.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Bài viết Facebook đang theo dõi ({publishedPosts.length})
            </span>
            <span className="text-[11px] text-slate-400">Meta Graph Webhook Ready</span>
          </div>

          {publishedPosts.map(post => (
            <div key={post.id} className="p-5 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {post.title}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {post.caption || post.message}
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  ID: {post.facebook_post_id}
                </p>
              </div>

              {post.facebook_permalink && (
                <a
                  href={post.facebook_permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <span>Xem bình luận</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
