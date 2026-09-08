import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock3, ExternalLink, Info, Loader2, MessageCircle, MessageSquareText, Paperclip, Send, Star, X } from 'lucide-react';
import { useMessenger } from '../MessengerContext';
import { formatSize, formatTime } from '../utils';
import { AttachmentView } from './AttachmentView';
import { Avatar } from './Avatar';

export const ChatPanel: React.FC<{ onOpenTemplates: () => void }> = ({ onOpenTemplates }) => {
  const {
    selectedId, detail, detailLoading, currentMeta, showInfo, setShowInfo, saveMeta, reply, setReply,
    attachmentFile, setAttachmentFile, sending, sendReply,
  } = useMessenger();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages?.length, selectedId]);

  if (!selectedId) return <section className="flex flex-col min-w-0 min-h-0 bg-white"><div className="flex-1 flex items-center justify-center text-center p-8"><div><MessageCircle className="w-9 h-9 text-slate-200 mx-auto mb-2" /><h3 className="text-xs font-bold text-slate-700">Chọn một hội thoại</h3><p className="text-[10px] text-slate-400 mt-1">Nội dung chat sẽ hiển thị ở đây.</p></div></div></section>;
  if (detailLoading && !detail) return <section className="flex items-center justify-center min-h-0"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></section>;
  if (!detail) return <section className="flex items-center justify-center text-[11px] text-slate-400">Không tải được hội thoại.</section>;

  return (
    <section className="flex flex-col min-w-0 min-h-0 bg-white">
      <div className="h-11 px-2.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar customer={detail.customer} size="md" />
          <div className="min-w-0"><div className="flex items-center gap-1.5"><p className="text-[11px] font-extrabold text-slate-900 truncate">{detail.customer?.name || 'Khách Messenger'}</p>{currentMeta.tags.slice(0, 1).map(tag => <span key={tag} className="hidden xl:inline px-1.5 py-0.5 rounded bg-blue-50 text-[7px] font-bold text-blue-600">{tag}</span>)}</div><div className="flex items-center gap-1 mt-0.5 text-[8px]">{detail.within24h === true ? <span className="text-emerald-600 font-semibold flex items-center gap-1"><Clock3 className="w-2.5 h-2.5" />Trong 24h</span> : detail.within24h === false ? <span className="text-amber-600 font-semibold flex items-center gap-1"><Clock3 className="w-2.5 h-2.5" />Ngoài 24h</span> : <span className="text-slate-400">Chưa xác định</span>}</div></div>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => saveMeta({ starred: !currentMeta.starred })} title="Gắn sao" className={`w-7 h-7 rounded-md flex items-center justify-center hover:bg-slate-100 ${currentMeta.starred ? 'text-amber-500' : 'text-slate-400'}`}><Star className={`w-3.5 h-3.5 ${currentMeta.starred ? 'fill-amber-400' : ''}`} /></button>
          <button type="button" onClick={() => setShowInfo(v => !v)} title="Thông tin khách" className={`w-7 h-7 rounded-md flex items-center justify-center hover:bg-slate-100 ${showInfo ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><Info className="w-3.5 h-3.5" /></button>
          {detail.link && <a href={detail.link.startsWith('http') ? detail.link : `https://www.facebook.com${detail.link}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-md flex items-center justify-center text-blue-600 hover:bg-blue-50" title="Mở trên Facebook"><ExternalLink className="w-3.5 h-3.5" /></a>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/70 px-3 sm:px-4 py-2.5 space-y-1.5">
        {detail.messages.length === 0 ? <div className="text-center text-[10px] text-slate-400 py-12">Không đọc được nội dung tin nhắn trong hội thoại này.</div> : detail.messages.map(message => (
          <div key={message.id} className={`flex ${message.isFromPage ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[84%] sm:max-w-[72%] rounded-xl px-2.5 py-1.5 ${message.isFromPage ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
              {message.text && <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>}
              {message.attachments?.map((attachment, index) => <AttachmentView key={`${message.id}-${index}`} attachment={attachment} onImage={setLightboxUrl} />)}
              {!message.text && (!message.attachments || message.attachments.length === 0) && <p className="text-[10px] opacity-70">[Tin nhắn không có nội dung hiển thị]</p>}
              <p className={`text-[8px] mt-0.5 ${message.isFromPage ? 'text-blue-100 text-right' : 'text-slate-400'}`}>{formatTime(message.createdTime)}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-1.5 border-t border-slate-200 bg-white shrink-0">
        {detail.within24h === false && <div className="mb-1.5 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-[8px] text-amber-800 font-semibold"><AlertTriangle className="w-3 h-3 shrink-0" />Ngoài cửa sổ 24 giờ; Meta có thể từ chối RESPONSE.</div>}
        {attachmentFile && <div className="mb-1.5 flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-[9px]"><Paperclip className="w-3 h-3 text-blue-600" /><span className="truncate flex-1 font-semibold text-slate-700">{attachmentFile.name}</span><span className="text-slate-400">{formatSize(attachmentFile.size)}</span><button onClick={() => setAttachmentFile(null)} className="text-slate-400 hover:text-rose-600"><X className="w-3 h-3" /></button></div>}
        <div className="flex items-end gap-1.5">
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={event => setAttachmentFile(event.target.files?.[0] || null)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} className="w-8 h-8 rounded-md border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center disabled:opacity-40" title="Gửi ảnh hoặc tệp"><Paperclip className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={onOpenTemplates} disabled={sending} className="w-8 h-8 rounded-md border border-slate-200 text-slate-500 hover:text-violet-600 hover:bg-violet-50 flex items-center justify-center disabled:opacity-40" title="Tin nhắn mẫu"><MessageSquareText className="w-3.5 h-3.5" /></button>
          <textarea value={reply} onChange={event => setReply(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendReply(); } }} rows={1} maxLength={1900} placeholder="Nhập tin nhắn... Enter để gửi" className="min-h-8 max-h-20 flex-1 resize-none px-2.5 py-2 rounded-md border border-slate-200 bg-slate-50 text-[10px] outline-none focus:bg-white focus:ring-1 focus:ring-blue-400" />
          <button type="button" onClick={sendReply} disabled={sending || (!reply.trim() && !attachmentFile)} className="w-8 h-8 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shrink-0" title="Gửi qua Messenger">{sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}</button>
        </div>
      </div>

      {lightboxUrl && <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setLightboxUrl(null)}><button type="button" onClick={() => setLightboxUrl(null)} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"><X className="w-5 h-5" /></button><img src={lightboxUrl} alt="Ảnh Messenger" className="max-h-[90vh] max-w-[92vw] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} /></div>}
    </section>
  );
};
