import React, { useEffect, useMemo, useState } from 'react';
import { Instagram, Loader2, RefreshCw, Send } from 'lucide-react';
import { useInstagram } from '../instagram/InstagramContext';
import { formatInstagramDate, getConversationCustomer } from '../instagram/utils';
import type { InstagramConversation, InstagramMessage } from '../instagram/types';
import { InstagramCustomerPanel } from '../instagram/components/InstagramCustomerPanel';

const attachmentUrl = (message: InstagramMessage) => {
  const attachment = message.attachments?.data?.[0];
  return attachment?.image_data?.url || attachment?.video_data?.url || attachment?.file_url || attachment?.url || null;
};

export const InstagramUnifiedPane: React.FC = () => {
  const {
    account,
    selectedConversation,
    loadConversation,
    peekConversation,
    sendMessage,
    refreshAll,
    updateCustomerMeta,
  } = useInstagram();
  const [detail, setDetail] = useState<InstagramConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedConversation) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const cached = peekConversation(selectedConversation.id);
    setDetail(cached || (selectedConversation.messages?.data?.length ? selectedConversation : null));
    setLoading(!cached);
    setError(null);

    void loadConversation(selectedConversation.id, false)
      .then(next => { if (!cancelled && next) setDetail(next); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Không tải được cuộc trò chuyện Instagram.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedConversation?.id, loadConversation, peekConversation]);

  const working = detail || selectedConversation;
  const customer = working ? getConversationCustomer(working, account) : null;
  const messages = useMemo(() => [...(detail?.messages?.data || [])].reverse(), [detail?.messages?.data]);

  const reload = async () => {
    if (!selectedConversation) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadConversation(selectedConversation.id, true);
      if (next) setDetail(next);
    } catch (err: any) {
      setError(err?.message || 'Không tải được cuộc trò chuyện Instagram.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!customer?.id || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    const result = await sendMessage(customer.id, text.trim());
    if (!result.success) {
      setError(result.error || 'Không gửi được tin nhắn Instagram.');
      setSending(false);
      return;
    }
    setText('');
    await reload();
    void refreshAll(true);
    setSending(false);
  };

  if (!selectedConversation || !working || !customer) {
    return (
      <section className="min-w-0 min-h-0 flex items-center justify-center bg-white text-center">
        <div>
          <Instagram className="w-9 h-9 text-slate-200 mx-auto mb-2" />
          <div className="text-[11px] font-bold text-slate-600">Chọn một hội thoại Instagram</div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="min-w-0 min-h-0 flex flex-col bg-white">
        <div className="h-11 px-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white flex items-center justify-center shrink-0"><Instagram className="w-3.5 h-3.5" /></div>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold text-slate-900 truncate">{customer.name || customer.username || 'Instagram user'}</div>
              {customer.username ? <div className="text-[8px] text-slate-400 truncate">@{customer.username}</div> : null}
            </div>
          </div>
          <button type="button" onClick={reload} disabled={loading} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error ? <div className="shrink-0 mx-2 mt-2 p-1.5 rounded-md bg-rose-50 border border-rose-200 text-[9px] text-rose-700">{error}</div> : null}

        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/60 px-3 sm:px-4 py-2.5 space-y-1.5">
          {loading && !detail ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[10px] text-slate-400">Chưa đọc được nội dung hội thoại.</div>
          ) : messages.map(message => {
            const mine = message.from?.id === account?.id || message.from?.username === account?.username;
            const url = attachmentUrl(message);
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-xl px-2.5 py-1.5 text-[10px] ${mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md'}`}>
                  {url && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) ? <img src={url} alt="" className="max-w-[260px] rounded-lg mb-1 object-cover" /> : null}
                  {message.message || (!url ? '[Tệp đính kèm]' : '')}
                  <div className={`text-[7px] mt-0.5 ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatInstagramDate(message.created_time)}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 p-2 border-t border-slate-200 bg-white flex items-center gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            disabled={sending}
            className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-[10px] outline-none focus:border-blue-400 disabled:bg-slate-50"
            placeholder="Nhập tin nhắn Instagram..."
          />
          <button type="button" onClick={() => void submit()} disabled={!text.trim() || sending} className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </section>

      <div className="hidden xl:block min-h-0">
        <InstagramCustomerPanel
          account={account}
          conversation={working}
          customer={customer}
          onSave={async (customerId, patch) => {
            const result = await updateCustomerMeta(customerId, patch);
            if (result.success && result.meta) setDetail(prev => prev ? { ...prev, customerMeta: result.meta } : prev);
            return result;
          }}
        />
      </div>
    </>
  );
};
