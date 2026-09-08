import React from 'react';
import { ExternalLink, FileImage, Heart, MessageCircle, Users } from 'lucide-react';
import { useInstagram } from '../InstagramContext';
import { formatCompactNumber, formatInstagramDate, getMediaPreview } from '../utils';

export const InstagramOverview: React.FC<{ onOpenMedia: () => void; onOpenInbox: () => void }> = ({ onOpenMedia, onOpenInbox }) => {
  const { account, media, conversations } = useInstagram();
  if (!account) return null;
  const totalLikes = media.reduce((sum, item) => sum + Number(item.like_count || 0), 0);
  const totalComments = media.reduce((sum, item) => sum + Number(item.comments_count || 0), 0);

  const cards = [
    { label: 'Followers', value: formatCompactNumber(account.followers_count), icon: Users },
    { label: 'Bài viết', value: formatCompactNumber(account.media_count), icon: FileImage },
    { label: `Like · ${media.length} bài gần nhất`, value: formatCompactNumber(totalLikes), icon: Heart },
    { label: 'Hội thoại đã tải', value: formatCompactNumber(conversations.length), icon: MessageCircle },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        {cards.map(({ label, value, icon: Icon }) => <div key={label} className="bg-white border border-slate-200 rounded-xl p-3"><div className="flex items-center justify-between text-[10px] font-bold text-slate-500"><span>{label}</span><Icon className="w-3.5 h-3.5 text-slate-400" /></div><div className="text-xl font-black text-slate-900 mt-2">{value}</div></div>)}
      </div>

      <div className="grid xl:grid-cols-[1fr_320px] gap-3">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="h-10 px-3 border-b border-slate-100 flex items-center justify-between"><div><div className="text-[12px] font-extrabold text-slate-900">Bài gần đây</div></div><button onClick={onOpenMedia} className="text-[10px] font-bold text-blue-600">Xem tất cả</button></div>
          {media.length === 0 ? <div className="h-40 flex items-center justify-center text-[11px] text-slate-400">Chưa tải được bài Instagram.</div> : <div className="grid grid-cols-3 md:grid-cols-6 xl:grid-cols-6 gap-px bg-slate-100">{media.slice(0, 12).map(item => <a key={item.id} href={item.permalink || '#'} target="_blank" rel="noreferrer" className="relative aspect-square bg-slate-50 overflow-hidden group">{getMediaPreview(item) ? <img src={getMediaPreview(item)} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><FileImage className="w-5 h-5" /></div>}<div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent text-white text-[8px] flex justify-between"><span>♥ {item.like_count || 0}</span><span>💬 {item.comments_count || 0}</span></div></a>)}</div>}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="flex items-center gap-3">
            {account.profile_picture_url ? <img src={account.profile_picture_url} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-200" /> : <div className="w-12 h-12 rounded-full bg-slate-100" />}
            <div className="min-w-0"><div className="text-[13px] font-extrabold text-slate-900 truncate">{account.name || account.username}</div><div className="text-[10px] text-slate-500">@{account.username}</div></div>
          </div>
          {account.biography && <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{account.biography}</p>}
          {account.website && <a href={account.website} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-blue-600 inline-flex items-center gap-1">Website <ExternalLink className="w-3 h-3" /></a>}
          <div className="grid grid-cols-2 gap-2 pt-1"><button onClick={onOpenInbox} className="h-8 rounded-lg bg-slate-900 text-white text-[10px] font-bold">Mở Inbox</button><button onClick={onOpenMedia} className="h-8 rounded-lg border border-slate-200 bg-white text-slate-700 text-[10px] font-bold">Quản lý bài</button></div>
          <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-100">Dữ liệu gần nhất: {media[0]?.timestamp ? formatInstagramDate(media[0].timestamp) : 'chưa có'} · Tổng comment gần đây: {totalComments}</div>
        </div>
      </div>
    </div>
  );
};
