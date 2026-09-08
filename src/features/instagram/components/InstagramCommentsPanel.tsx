import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, MessageCircle, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useInstagram } from '../InstagramContext';
import { formatInstagramDate, getMediaPreview } from '../utils';
import { InstagramComment } from '../types';

export const InstagramCommentsPanel: React.FC = () => {
  const { media, selectedMedia, setSelectedMedia, loadComments, replyComment, deleteComment } = useInstagram();
  const [comments, setComments] = useState<InstagramComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = selectedMedia || media[0] || null;

  const refresh = async (force = false) => {
    if (!active) return;
    setLoading(true); setError(null);
    try { setComments(await loadComments(active.id, force)); }
    catch (err: any) { setError(err?.message || 'Không tải được bình luận.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (active) { if (!selectedMedia) setSelectedMedia(active); refresh(false); } }, [active?.id]);

  const submitReply = async () => {
    if (!replyingId || !replyText.trim()) return;
    const result = await replyComment(replyingId, replyText.trim());
    if (!result.success) { setError(result.error || 'Không trả lời được.'); return; }
    setReplyText(''); setReplyingId(null); await refresh(true);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Xóa bình luận này khỏi Instagram?')) return;
    const result = await deleteComment(id);
    if (!result.success) { setError(result.error || 'Không xóa được.'); return; }
    await refresh(true);
  };

  return <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-3 min-h-[620px]">
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="h-10 px-3 border-b border-slate-100 flex items-center justify-between"><span className="text-[11px] font-extrabold text-slate-900">Chọn bài</span><span className="text-[9px] text-slate-400">{media.length} bài</span></div>
      <div className="max-h-[680px] overflow-y-auto divide-y divide-slate-100">{media.map(item => <button key={item.id} onClick={() => setSelectedMedia(item)} className={`w-full p-2.5 text-left flex items-start gap-2.5 hover:bg-slate-50 ${active?.id === item.id ? 'bg-blue-50/70' : ''}`}><div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0">{getMediaPreview(item) && <img src={getMediaPreview(item)} alt="" className="w-full h-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-slate-700 line-clamp-2">{item.caption || 'Không có caption'}</p><div className="text-[9px] text-slate-400 mt-1">💬 {item.comments_count || 0} · ♥ {item.like_count || 0}</div></div></button>)}</div>
    </div>

    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-w-0">
      {!active ? <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400">Chưa có bài Instagram.</div> : <>
        <div className="p-3 border-b border-slate-100 flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0">{getMediaPreview(active) && <img src={getMediaPreview(active)} alt="" className="w-full h-full object-cover" />}</div>
          <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-slate-800 line-clamp-2">{active.caption || 'Không có caption'}</p><div className="text-[9px] text-slate-400 mt-1">{formatInstagramDate(active.timestamp)} · {active.comments_count || 0} bình luận</div></div>
          <div className="flex items-center gap-1.5"><button onClick={() => refresh(true)} disabled={loading} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>{active.permalink && <a href={active.permalink} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500"><ExternalLink className="w-3.5 h-3.5" /></a>}</div>
        </div>
        {error && <div className="m-3 mb-0 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-700">{error}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {loading ? <div className="h-48 flex items-center justify-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /></div> : comments.length === 0 ? <div className="h-48 flex flex-col items-center justify-center text-slate-400"><MessageCircle className="w-5 h-5 mb-2" /><span className="text-[10px]">Bài này chưa có bình luận.</span></div> : comments.map(comment => <div key={comment.id} className="border border-slate-200 rounded-lg p-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-extrabold text-slate-800">@{comment.username || 'instagram_user'}</div><p className="text-[11px] text-slate-700 mt-1 whitespace-pre-wrap">{comment.text}</p><div className="text-[9px] text-slate-400 mt-1">{formatInstagramDate(comment.timestamp)} {comment.like_count ? `· ♥ ${comment.like_count}` : ''}</div></div><div className="flex gap-1"><button onClick={() => { setReplyingId(comment.id); setReplyText(`@${comment.username || ''} `); }} className="px-2 h-7 rounded-md bg-slate-100 text-[9px] font-bold text-slate-600">Trả lời</button><button onClick={() => remove(comment.id)} className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button></div></div>{comment.replies?.data?.length ? <div className="mt-2 pl-3 border-l-2 border-slate-100 space-y-1.5">{comment.replies.data.map(reply => <div key={reply.id} className="text-[10px]"><b>@{reply.username}</b> <span className="text-slate-600">{reply.text}</span></div>)}</div> : null}</div>)}
        </div>
        {replyingId && <div className="p-2.5 border-t border-slate-100 bg-slate-50 flex items-center gap-2"><input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitReply(); }} className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] outline-none focus:border-blue-400" placeholder="Nhập câu trả lời..." /><button onClick={submitReply} className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Send className="w-3.5 h-3.5" /></button></div>}
      </>}
    </div>
  </div>;
};
