import React, { useEffect, useMemo, useState } from 'react';
import { Instagram, Loader2, RefreshCw, Send } from 'lucide-react';
import { useInstagram } from '../InstagramContext';
import { formatInstagramDate, getConversationCustomer, getConversationPreview } from '../utils';
import { InstagramConversation, InstagramMessage } from '../types';
import { InstagramCustomerPanel } from './InstagramCustomerPanel';

const SEARCH_KEY = 'pagemanager_instagram_inbox_search';

export const InstagramInboxPanel: React.FC = () => {
  const {
    account, conversations, selectedConversation, setSelectedConversation,
    loadConversation, peekConversation, sendMessage, refreshAll, updateCustomerMeta, refreshing,
  } = useInstagram();
  const [detail, setDetail] = useState<InstagramConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [search, setSearch] = useState(() => sessionStorage.getItem(SEARCH_KEY) || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { sessionStorage.setItem(SEARCH_KEY, search); }, [search]);

  const filtered = useMemo(() => conversations.filter(item => {
    const customer = getConversationCustomer(item, account);
    const meta = item.customerMeta;
    const haystack = `${customer?.name || ''} ${customer?.username || ''} ${getConversationPreview(item)} ${(meta?.tags || []).join(' ')} ${meta?.crm?.phone || ''} ${meta?.crm?.productInterest || ''} ${meta?.crm?.assignee || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [conversations, account, search]);

  const active = selectedConversation || filtered[0] || null;

  useEffect(() => {
    let cancelled = false;
    if (!active) { setDetail(null); setLoading(false); return; }
    if (!selectedConversation) setSelectedConversation(active);

    const cached = peekConversation(active.id);
    if (cached) {
      setDetail(cached);
      setLoading(false);
    } else {
      setDetail(active.messages?.data?.length ? active : null);
      setLoading(true);
    }
    setError(null);
    void loadConversation(active.id, false)
      .then(next => { if (!cancelled && next) setDetail(next); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Không tải được cuộc trò chuyện.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active?.id, selectedConversation, setSelectedConversation, loadConversation, peekConversation]);

  const workingConversation = detail || active;
  const customer = workingConversation ? getConversationCustomer(workingConversation, account) : null;
  const messages: InstagramMessage[] = [...(detail?.messages?.data || [])].reverse();

  const reloadDetail = async () => {
    if (!active) return;
    setLoading(true); setError(null);
    try { const next = await loadConversation(active.id, true); if (next) setDetail(next); }
    catch (err: any) { setError(err?.message || 'Không tải được cuộc trò chuyện.'); }
    finally { setLoading(false); }
  };

  const submit = async () => {
    if (!customer?.id || !text.trim() || sending) return;
    setSending(true); setError(null);
    const result = await sendMessage(customer.id, text.trim());
    if (!result.success) { setError(result.error || 'Không gửi được tin nhắn.'); setSending(false); return; }
    setText('');
    await reloadDetail();
    void refreshAll(true); // refresh list silently; cached UI stays visible
    setSending(false);
  };

  return (
    <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[278px_minmax(0,1fr)] xl:grid-cols-[278px_minmax(0,1fr)_300px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="min-h-0 border-r border-slate-200 flex flex-col">
        <div className="shrink-0 p-2 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] font-extrabold text-slate-900">Instagram Inbox</span><button onClick={() => refreshAll(true)} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500" title="Làm mới"><RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /></button></div>
          <input value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-[9px] outline-none focus:border-fuchsia-400" placeholder="Tìm tên, tag, SĐT, sản phẩm..." />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? <div className="p-8 text-center text-[10px] text-slate-400">Chưa có hội thoại Instagram.</div> : filtered.map(item => {
            const person = getConversationCustomer(item, account);
            const meta = item.customerMeta;
            return <button key={item.id} onClick={() => setSelectedConversation(item)} className={`w-full p-2.5 text-left hover:bg-slate-50 ${active?.id === item.id ? 'bg-fuchsia-50/60' : ''}`}>
              <div className="flex items-start gap-2.5"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white flex items-center justify-center shrink-0"><Instagram className="w-3.5 h-3.5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-extrabold text-slate-800 truncate">{person?.name || person?.username || 'Instagram user'}</span><span className="text-[8px] text-slate-400 shrink-0">{formatInstagramDate(item.updated_time)}</span></div><p className="text-[9px] text-slate-500 truncate mt-0.5">{getConversationPreview(item)}</p><div className="mt-1 flex gap-1 overflow-hidden"><span className="px-1 py-0.5 rounded bg-slate-100 text-[7px] font-bold text-slate-500">{meta?.status || 'new'}</span>{meta?.crm?.assignee && <span className="px-1 py-0.5 rounded bg-indigo-50 text-[7px] font-bold text-indigo-600 truncate">{meta.crm.assignee}</span>}{meta?.crm?.nextFollowUpAt && <span className="px-1 py-0.5 rounded bg-amber-50 text-[7px] font-bold text-amber-600">Follow-up</span>}</div></div></div>
            </button>;
          })}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex flex-col">
        {!active ? <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400">Chọn một cuộc trò chuyện.</div> : <>
          <div className="h-11 shrink-0 px-3 border-b border-slate-100 flex items-center justify-between"><div className="flex items-center gap-2 min-w-0"><div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white flex items-center justify-center shrink-0"><Instagram className="w-3 h-3" /></div><div className="min-w-0"><div className="text-[10px] font-extrabold text-slate-900 truncate">{customer?.name || customer?.username || 'Instagram user'}</div>{customer?.username && <div className="text-[8px] text-slate-400 truncate">@{customer.username}</div>}</div></div><button onClick={reloadDetail} disabled={loading} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /></button></div>
          {error && <div className="shrink-0 m-2 mb-0 p-1.5 rounded-md bg-rose-50 border border-rose-200 text-[9px] text-rose-700">{error}</div>}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-slate-50/40">
            {loading && !detail ? <div className="h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div> : messages.map(message => {
              const mine = message.from?.id === account?.id || message.from?.username === account?.username;
              return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[72%] rounded-xl px-2.5 py-1.5 text-[10px] ${mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md'}`}>{message.message || (message.attachments?.data?.length ? '[Tệp đính kèm]' : 'Tin nhắn')}<div className={`text-[7px] mt-0.5 ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatInstagramDate(message.created_time)}</div></div></div>;
            })}
          </div>
          <div className="shrink-0 p-2 border-t border-slate-100 bg-white flex items-center gap-2"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} disabled={!customer?.id || sending} className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-[10px] outline-none focus:border-blue-400 disabled:bg-slate-50" placeholder="Nhập tin nhắn Instagram..." /><button onClick={submit} disabled={!text.trim() || sending || !customer?.id} className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center disabled:opacity-40">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button></div>
        </>}
      </div>

      {workingConversation && customer && <div className="hidden xl:block min-h-0"><InstagramCustomerPanel account={account} conversation={workingConversation} customer={customer} onSave={async (customerId, patch) => {
        const result = await updateCustomerMeta(customerId, patch);
        const nextMeta = result.meta;
        if (result.success && nextMeta) setDetail(prev => prev ? { ...prev, customerMeta: nextMeta } : prev);
        return result;
      }} /></div>}
    </div>
  );
};
