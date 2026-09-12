import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, Clock3, Facebook, Instagram, Loader2, Plus, RefreshCw, Send, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFacebook } from '../context/FacebookContext';
import type { StoryItem, StoryRecommendation } from '../types/story';

const labels: Record<string, string> = { draft: 'Nháp', scheduled: 'Chờ đăng', publishing: 'Đang đăng', published: 'Đã đăng', failed: 'Lỗi' };
const tones: Record<string, string> = { published: 'bg-emerald-50 text-emerald-700', failed: 'bg-rose-50 text-rose-700', scheduled: 'bg-amber-50 text-amber-700' };

export const StoriesPage: React.FC<{ embedded?: boolean }> = () => {
  const { apiFetch } = useAuth();
  const { selectedPage } = useFacebook();
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(false);
  const [media, setMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [title, setTitle] = useState('');
  const [platforms, setPlatforms] = useState<Array<'facebook' | 'instagram'>>(['facebook', 'instagram']);
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ideas, setIdeas] = useState<StoryRecommendation[]>([]);
  const [summary, setSummary] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [repostId, setRepostId] = useState<string | null>(null);
  const [repostAt, setRepostAt] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch('/api/stories'); const data = await res.json(); if (!res.ok) throw new Error(data.error); setStories(data.stories || []); }
    catch (e: any) { setError(e.message || 'Không tải được tin'); } finally { setLoading(false); }
  }, [apiFetch]);

  const analyze = useCallback(async () => {
    if (!selectedPage) return;
    setAnalyzing(true);
    try {
      const res = await apiFetch('/api/stories/recommendations', { method: 'POST', body: JSON.stringify({ pageId: selectedPage.id }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSummary(data.plan.summary || ''); setIdeas((data.plan.recommendations || []).slice(0, 4));
    } catch (e: any) { setSummary(`Chưa phân tích được: ${e.message || 'lỗi AI'}`); } finally { setAnalyzing(false); }
  }, [apiFetch, selectedPage]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void analyze(); }, [analyze]);

  const upload = async (file?: File) => {
    if (!file) return; setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const res = await apiFetch('/api/media/upload', { method: 'POST', body: form }); const data = await res.json();
      if (!res.ok) throw new Error(data.error); const type = data.media.media_type === 'video' ? 'video' : 'image';
      setMedia({ url: data.media.public_url, type }); if (type === 'video') setPlatforms(['instagram']);
    } catch (e: any) { setError(e.message || 'Không tải được ảnh'); } finally { setBusy(false); }
  };

  const createStory = async (input: { mediaUrl: string; mediaType: string; title: string; platforms: string[]; scheduledAt?: string | null }, publishNow: boolean) => {
    const res = await apiFetch('/api/stories', { method: 'POST', body: JSON.stringify({ ...input, facebookPageId: selectedPage?.id }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    if (publishNow) { const pub = await apiFetch(`/api/stories/${data.story.id}/publish`, { method: 'POST' }); const result = await pub.json(); if (!pub.ok) throw new Error(result.error); }
  };

  const save = async (publishNow: boolean) => {
    if (!media) return setError('Chọn một ảnh hoặc video trước.'); if (!selectedPage) return setError('Chưa chọn Page.'); if (!platforms.length) return setError('Chọn ít nhất một kênh đăng.');
    setBusy(true); setError('');
    try { await createStory({ mediaUrl: media.url, mediaType: media.type, title: title || 'Tin mới', platforms, scheduledAt: publishNow ? null : scheduledAt }, publishNow); setComposer(false); setMedia(null); setTitle(''); setScheduledAt(''); await load(); void analyze(); }
    catch (e: any) { setError(e.message || 'Không đăng được tin'); } finally { setBusy(false); }
  };

  const repost = async (story: StoryItem, publishNow: boolean) => {
    setBusy(true); setError('');
    try { await createStory({ mediaUrl: story.mediaUrl, mediaType: story.mediaType, title: `Đăng lại · ${story.title}`, platforms: story.platforms, scheduledAt: publishNow ? null : repostAt }, publishNow); setRepostId(null); setRepostAt(''); await load(); }
    catch (e: any) { setError(e.message || 'Không đăng lại được'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => { if (!confirm('Xóa tin này khỏi thư viện?')) return; await apiFetch(`/api/stories/${id}`, { method: 'DELETE' }); await load(); };
  const applyIdea = (idea: StoryRecommendation) => { setTitle(`${idea.title} · ${idea.overlayText}`); setComposer(true); };

  const rows: React.ReactNode[] = [];
  stories.forEach(story => {
    rows.push(<div key={story.id} className="px-3 py-2.5 flex items-center gap-3">
      <div className="w-9 h-12 rounded bg-slate-100 overflow-hidden shrink-0">{story.mediaType === 'video' ? <video src={story.mediaUrl} className="w-full h-full object-cover"/> : <img src={story.mediaUrl} className="w-full h-full object-cover"/>}</div>
      <div className="flex-1 min-w-0"><b className="block text-[11px] text-slate-900 truncate">{story.title}</b><div className="flex gap-1 mt-1 items-center"><span className={`text-[9px] px-1.5 py-0.5 rounded ${tones[story.status] || 'bg-slate-100 text-slate-600'}`}>{labels[story.status]}</span>{story.platforms.map(p => <span key={p} className="text-[9px] text-slate-400">{p === 'facebook' ? 'FB' : 'IG'}</span>)}{story.scheduledAt && <span className="text-[9px] text-slate-400 flex items-center gap-0.5"><Clock3 className="w-2.5 h-2.5"/>{new Date(story.scheduledAt).toLocaleString('vi-VN')}</span>}</div>{story.publishError && <p className="text-[9px] text-rose-600 truncate mt-0.5" title={story.publishError}>{story.publishError}</p>}</div>
      <div className="flex items-center gap-1">{story.status === 'published' && <button onClick={() => setRepostId(repostId === story.id ? null : story.id)} className="h-7 px-2 rounded border border-slate-200 text-[9px] font-bold text-slate-600 flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Đăng lại</button>}<button onClick={() => void remove(story.id)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5"/></button></div>
    </div>);
    if (repostId === story.id) rows.push(<div key={`${story.id}-repost`} className="px-3 py-2 bg-slate-50 flex justify-end items-center gap-1.5"><input type="datetime-local" value={repostAt} min={new Date().toISOString().slice(0, 16)} onChange={e => setRepostAt(e.target.value)} className="h-7 px-2 rounded border border-slate-300 bg-white text-[9px]"/><button disabled={busy || !repostAt} onClick={() => void repost(story, false)} className="h-7 px-2 rounded bg-slate-800 text-white text-[9px] font-bold disabled:opacity-40">Hẹn đăng lại</button><button disabled={busy} onClick={() => void repost(story, true)} className="h-7 px-2 rounded bg-blue-600 text-white text-[9px] font-bold">Đăng lại ngay</button></div>);
  });

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-extrabold text-slate-900">Tin Facebook & Instagram</h3><p className="text-[10px] text-slate-500">Tin đã đăng được giữ lại để dùng lại sau.</p></div><button onClick={() => setComposer(v => !v)} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5"/>Tạo tin</button></div>
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</div>}

    <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><div className="flex items-start gap-2"><Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0"/><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><b className="text-[11px] text-indigo-950">AI đề xuất hôm nay</b>{analyzing && <Loader2 className="w-3 h-3 animate-spin text-indigo-500"/>}</div><p className="text-[10px] text-indigo-800 mt-0.5">{summary || 'Đang tự đọc nội dung gần đây để xác định nhóm tin còn thiếu…'}</p></div><button onClick={() => void analyze()} title="Phân tích lại" className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded"><RefreshCw className="w-3.5 h-3.5"/></button></div>
      {ideas.length > 0 && <div className="flex gap-2 overflow-x-auto mt-2 pb-0.5">{ideas.map((idea, i) => <button key={i} onClick={() => applyIdea(idea)} className="min-w-[190px] max-w-[240px] text-left rounded-lg bg-white border border-indigo-100 px-2.5 py-2 hover:border-indigo-300"><div className="flex justify-between gap-2"><b className="text-[10px] text-slate-900 truncate">{idea.objective}</b><span className="text-[9px] text-indigo-600 shrink-0">{idea.bestTime}</span></div><p className="text-[10px] text-slate-600 mt-1 line-clamp-2">{idea.title}: {idea.visual}</p></button>)}</div>}
    </section>

    {composer && <section className="bg-white border border-slate-200 rounded-xl p-3"><div className="grid sm:grid-cols-[108px_1fr] gap-3"><input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => void upload(e.target.files?.[0])}/>{media ? <div className="relative w-[108px] aspect-[9/16] rounded-lg overflow-hidden bg-slate-950">{media.type === 'video' ? <video src={media.url} className="w-full h-full object-contain"/> : <img src={media.url} className="w-full h-full object-contain"/>}<button onClick={() => setMedia(null)} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full"><X className="w-3 h-3"/></button></div> : <button onClick={() => fileRef.current?.click()} className="w-[108px] aspect-[9/16] rounded-lg border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-1"><Upload className="w-5 h-5"/><span className="text-[9px] font-bold">Ảnh/video 9:16</span></button>}
      <div className="space-y-2"><input value={title} onChange={e => setTitle(e.target.value)} className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-900" placeholder="Tên để quản lý tin"/><div className="flex gap-1.5">{(['facebook', 'instagram'] as const).map(p => { const disabled = p === 'facebook' && media?.type === 'video'; return <button key={p} disabled={disabled} onClick={() => setPlatforms(v => v.includes(p) ? v.filter(x => x !== p) : [...v, p])} className={`h-8 px-2.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${disabled ? 'opacity-35' : platforms.includes(p) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>{p === 'facebook' ? <Facebook className="w-3.5 h-3.5"/> : <Instagram className="w-3.5 h-3.5"/>}{p === 'facebook' ? 'Facebook' : 'Instagram'}{platforms.includes(p) && !disabled && <Check className="w-3 h-3"/>}</button>; })}</div><input type="datetime-local" value={scheduledAt} min={new Date().toISOString().slice(0, 16)} onChange={e => setScheduledAt(e.target.value)} className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-900"/><div className="flex justify-end gap-1.5"><button onClick={() => setComposer(false)} className="h-8 px-3 rounded-lg border border-slate-200 text-[10px] font-bold">Hủy</button>{scheduledAt && <button disabled={busy} onClick={() => void save(false)} className="h-8 px-3 rounded-lg bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5"/>Hẹn đăng</button>}<button disabled={busy} onClick={() => void save(true)} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-[10px] font-bold flex items-center gap-1">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5"/>}Đăng ngay</button></div></div></div></section>}

    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">{loading ? <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600"/></div> : stories.length === 0 ? <div className="p-8 text-center text-[11px] text-slate-500">Chưa có tin nào.</div> : <div className="divide-y divide-slate-100">{rows}</div>}</section>
  </div>;
};
