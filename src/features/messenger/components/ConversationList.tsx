import React from 'react';
import { CheckCircle2, Loader2, MessageCircle, Search, Star } from 'lucide-react';
import { useMessenger } from '../MessengerContext';
import { DEFAULT_META, FILTER_OPTIONS } from '../constants';
import type { FilterKey } from '../types';
import { formatTime, previewLastMessage, statusLabel } from '../utils';
import { Avatar } from './Avatar';

export const ConversationList: React.FC = () => {
  const {
    stage, conversations, filteredConversations, selectedId, search, setSearch, filter, setFilter, selectConversation,
  } = useMessenger();

  return (
    <section className="flex flex-col min-w-0 min-h-0 border-r border-slate-200 bg-white">
      <div className="px-2 py-1.5 border-b border-slate-100 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5"><h3 className="font-extrabold text-[11px] text-slate-900">Hội thoại</h3><span className="text-[8px] text-slate-400">{filteredConversations.length}/{conversations.length}</span></div>
          {stage === 'ready' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
        </div>
        <div className="relative">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, tin nhắn, tag..." className="w-full h-7 pl-7 pr-2 text-[10px] rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <Search className="absolute left-2 top-2 w-3 h-3 text-slate-400" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_OPTIONS.map(([key, label]) => <button key={key} onClick={() => setFilter(key as FilterKey)} className={`h-6 px-1.5 rounded-md text-[8px] font-bold whitespace-nowrap border ${filter === key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{label}</button>)}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {(stage === 'checking' || stage === 'loading') && conversations.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-slate-400"><div><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" /><p className="text-[10px] font-semibold">Đang tải hội thoại...</p></div></div>
        ) : filteredConversations.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-5"><div><MessageCircle className="w-7 h-7 mx-auto mb-2 text-slate-200" /><p className="text-[10px] font-bold text-slate-600">Không có hội thoại phù hợp</p></div></div>
        ) : filteredConversations.map(item => {
          const active = item.id === selectedId;
          const name = item.customer?.name || 'Khách Messenger';
          const meta = item.customerMeta || DEFAULT_META;
          const preview = previewLastMessage(item.lastMessage?.text, item.lastMessage?.attachments?.[0]?.type);
          return (
            <button type="button" key={item.id} onClick={() => selectConversation(item.id)} className={`w-full text-left px-2 py-2 border-b border-slate-100 transition-colors ${active ? 'bg-blue-50/80' : 'hover:bg-slate-50'}`}>
              <div className="flex gap-2">
                <Avatar customer={item.customer} active={active} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><div className="min-w-0 flex items-center gap-1"><p className={`text-[10px] truncate ${active ? 'font-extrabold text-blue-700' : 'font-bold text-slate-800'}`}>{name}</p>{meta.starred && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0" />}</div><span className="text-[8px] text-slate-400 shrink-0">{formatTime(item.updatedTime)}</span></div>
                  <p className="text-[9px] text-slate-500 truncate mt-0.5">{item.lastMessage?.isFromPage ? 'Bạn: ' : ''}{preview}</p>
                  <div className="flex items-center gap-1 mt-1 min-w-0 overflow-hidden">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[7px] font-bold text-slate-500 shrink-0">{statusLabel(meta.status)}</span>
                    {item.lastMessage?.isFromPage === false && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-[7px] font-bold text-rose-600 shrink-0">Cần rep</span>}
                    {meta.automation?.reengageDueAt && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-[7px] font-bold text-amber-700 shrink-0">Follow-up</span>}
                    {meta.replyFormula?.testOnly && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[7px] font-bold text-slate-600 shrink-0">TEST</span>}
                    {meta.tags.slice(0, 1).map(tag => <span key={tag} className="px-1.5 py-0.5 rounded bg-blue-50 text-[7px] font-bold text-blue-600 truncate">{tag}</span>)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
