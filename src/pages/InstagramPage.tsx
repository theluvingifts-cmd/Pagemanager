import React, { useEffect, useState } from 'react';
import { Instagram, Loader2, MessageCircle, MessagesSquare, PanelsTopLeft } from 'lucide-react';
import { useFacebook } from '../context/FacebookContext';
import { useInstagram } from '../features/instagram/InstagramContext';
import { InstagramTab } from '../features/instagram/types';
import { InstagramHeader } from '../features/instagram/components/InstagramHeader';
import { InstagramOverview } from '../features/instagram/components/InstagramOverview';
import { InstagramMediaGrid } from '../features/instagram/components/InstagramMediaGrid';
import { InstagramCommentsPanel } from '../features/instagram/components/InstagramCommentsPanel';
import { InstagramInboxPanel } from '../features/instagram/components/InstagramInboxPanel';

export const InstagramPage: React.FC = () => {
  const { selectedPage, connectFacebook } = useFacebook();
  const { linked, account, loading, refreshAll } = useInstagram();
  const [tab, setTab] = useState<InstagramTab>('overview');

  useEffect(() => { refreshAll(false); }, [selectedPage?.page_id, selectedPage?.id]);

  const tabs: Array<{ id: InstagramTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'overview', label: 'Tổng quan', icon: PanelsTopLeft },
    { id: 'media', label: 'Bài viết', icon: Instagram },
    { id: 'comments', label: 'Bình luận', icon: MessageCircle },
    { id: 'inbox', label: 'Tin nhắn', icon: MessagesSquare },
  ];

  if (!selectedPage) return <div className="h-[70vh] flex items-center justify-center"><div className="text-center"><Instagram className="w-8 h-8 text-slate-300 mx-auto mb-3" /><h2 className="text-sm font-extrabold text-slate-900">Chưa chọn Facebook Page</h2><p className="text-[11px] text-slate-500 mt-1">Chọn Page đang liên kết với Instagram Professional.</p></div></div>;

  return <div className="space-y-3 min-w-0">
    <InstagramHeader />

    {loading ? <div className="h-[68vh] bg-white border border-slate-200 rounded-xl flex items-center justify-center"><div className="text-center text-[11px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-fuchsia-500" />Đang kiểm tra Instagram của {selectedPage.page_name}...</div></div> : !linked || !account ? <div className="h-[62vh] bg-white border border-slate-200 rounded-xl flex items-center justify-center"><div className="max-w-md text-center px-6"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 text-white flex items-center justify-center mx-auto mb-4"><Instagram className="w-5 h-5" /></div><h2 className="text-[15px] font-extrabold text-slate-900">Page này chưa đọc được Instagram Professional</h2><p className="text-[11px] text-slate-500 mt-2 leading-relaxed">Instagram phải là tài khoản Business/Creator và được liên kết với Facebook Page này. Sau khi bật quyền Instagram trong Meta Developer, cấp lại quyền một lần.</p><button onClick={() => connectFacebook()} className="mt-4 h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold">Cấp lại quyền Meta</button></div></div> : <>
      <div className="h-10 bg-white border border-slate-200 rounded-xl p-1 flex items-center gap-1 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`h-8 px-3 rounded-lg text-[10px] font-bold flex items-center gap-1.5 whitespace-nowrap ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon className="w-3.5 h-3.5" />{label}</button>)}
      </div>
      {tab === 'overview' && <InstagramOverview onOpenMedia={() => setTab('media')} onOpenInbox={() => setTab('inbox')} />}
      {tab === 'media' && <InstagramMediaGrid onOpenComments={() => setTab('comments')} />}
      {tab === 'comments' && <InstagramCommentsPanel />}
      {tab === 'inbox' && <InstagramInboxPanel />}
    </>}
  </div>;
};
