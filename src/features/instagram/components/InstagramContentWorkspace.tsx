import React, { useState } from 'react';
import { MessageCircle, PanelsTopLeft } from 'lucide-react';
import { InstagramWorkspaceShell } from './InstagramWorkspaceShell';
import { InstagramMediaGrid } from './InstagramMediaGrid';
import { InstagramCommentsPanel } from './InstagramCommentsPanel';

type ContentTab = 'posts' | 'comments';

export const InstagramContentWorkspace: React.FC = () => {
  const [tab, setTab] = useState<ContentTab>('posts');

  return (
    <InstagramWorkspaceShell>
      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('posts')}
          className={`h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-bold ${
            tab === 'posts' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <PanelsTopLeft className="w-3.5 h-3.5" />
          Bài Instagram
        </button>
        <button
          type="button"
          onClick={() => setTab('comments')}
          className={`h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-[10px] font-bold ${
            tab === 'comments' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Bình luận
        </button>
      </div>

      {tab === 'posts' ? (
        <InstagramMediaGrid onOpenComments={() => setTab('comments')} />
      ) : (
        <InstagramCommentsPanel />
      )}
    </InstagramWorkspaceShell>
  );
};
