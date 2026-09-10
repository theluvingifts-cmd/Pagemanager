import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Facebook, Instagram, Inbox, Loader2, RefreshCw, Search, Zap } from 'lucide-react';
import { useMessenger } from '../messenger/MessengerContext';
import { useInstagram } from '../instagram/InstagramContext';
import { getConversationCustomer, getConversationPreview } from '../instagram/utils';
import { CRM_STATUS_OPTIONS } from '../crm/constants';
import type { ConversationSummary, AutomationTab } from '../messenger/types';
import type { InstagramConversation } from '../instagram/types';
import type { MetaChannel } from '../../components/common/MetaChannelTabs';
import { ChatPanel } from '../messenger/components/ChatPanel';
import { CustomerPanel } from '../messenger/components/CustomerPanel';
import { AutomationModal } from '../messenger/components/AutomationModal';
import { TemplateModal } from '../messenger/components/TemplateModal';
import { InstagramUnifiedPane } from './InstagramUnifiedPane';

export type UnifiedMessageChannel = 'facebook' | 'instagram';

interface UnifiedMessageItem {
  key: string;
  channel: UnifiedMessageChannel;
  id: string;
  name: string;
  avatarUrl?: string | null;
  preview: string;
  updatedAt: string | null;
  status: string;
  assignee?: string;
  tags: string[];
  source: ConversationSummary | InstagramConversation;
}

interface AllMessagesWorkspaceProps {
  activeFilter: MetaChannel;
}

const statusLabel = (value?: string | null) => CRM_STATUS_OPTIONS.find(item => item.value === value)?.label || 'Khách mới';

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const messengerPreview = (item: ConversationSummary) => {
  const text = item.lastMessage?.text?.trim();
  if (text) return text;
  const firstAttachment = item.lastMessage?.attachments?.[0];
  if (!firstAttachment) return 'Chưa có nội dung';
  if (firstAttachment.type === 'image') return '[Ảnh]';
  if (firstAttachment.type === 'video') return '[Video]';
  if (firstAttachment.type === 'audio') return '[Âm thanh]';
  if (firstAttachment.type === 'file') return '[Tệp]';
  return '[Tệp đính kèm]';
};

export const AllMessagesWorkspace: React.FC<AllMessagesWorkspaceProps> = ({ activeFilter }) => {
  const messenger = useMessenger();
  const instagram = useInstagram();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => sessionStorage.getItem('pagemanager_unified_inbox_selected'));
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automationTab, setAutomationTab] = useState<AutomationTab>('rules');

  const items = useMemo<UnifiedMessageItem[]>(() => {
    const fb: UnifiedMessageItem[] = messenger.conversations.map(item => ({
      key: `facebook:${item.id}`,
      channel: 'facebook',
      id: item.id,
      name: item.customer?.name || 'Khách Messenger',
      avatarUrl: item.customer?.avatarUrl || null,
      preview: messengerPreview(item),
      updatedAt: item.updatedTime || item.lastMessage?.createdTime || null,
      status: statusLabel(item.customerMeta?.status),
      assignee: item.customerMeta?.crm?.assignee || '',
      tags: item.customerMeta?.tags || [],
      source: item,
    }));

    const ig: UnifiedMessageItem[] = instagram.conversations.map(item => {
      const customer = getConversationCustomer(item, instagram.account);
      return {
        key: `instagram:${item.id}`,
        channel: 'instagram',
        id: item.id,
        name: customer?.name || customer?.username || 'Khách Instagram',
        avatarUrl: null,
        preview: getConversationPreview(item),
        updatedAt: item.updated_time || null,
        status: statusLabel(item.customerMeta?.status),
        assignee: item.customerMeta?.crm?.assignee || '',
        tags: item.customerMeta?.tags || [],
        source: item,
      };
    });

    return [...fb, ...ig].sort((a, b) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bt - at;
    });
  }, [messenger.conversations, instagram.conversations, instagram.account]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (activeFilter !== 'all' && item.channel !== activeFilter) return false;
      if (!q) return true;
      return `${item.name} ${item.preview} ${item.status} ${item.assignee || ''} ${item.tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [items, activeFilter, search]);

  const activateItem = useCallback(async (item: UnifiedMessageItem) => {
    setSelectedKey(item.key);
    sessionStorage.setItem('pagemanager_unified_inbox_selected', item.key);
    if (item.channel === 'facebook') {
      await messenger.selectConversation(item.id, false);
    } else {
      instagram.setSelectedConversation(item.source as InstagramConversation);
    }
  }, [messenger.selectConversation, instagram.setSelectedConversation]);

  useEffect(() => {
    if (visibleItems.length === 0) return;
    const selectedVisible = selectedKey ? visibleItems.find(item => item.key === selectedKey) : null;
    if (selectedVisible) {
      if (selectedVisible.channel === 'facebook' && messenger.selectedId !== selectedVisible.id) void messenger.selectConversation(selectedVisible.id, false);
      if (selectedVisible.channel === 'instagram' && instagram.selectedConversation?.id !== selectedVisible.id) instagram.setSelectedConversation(selectedVisible.source as InstagramConversation);
      return;
    }
    void activateItem(visibleItems[0]);
  }, [activeFilter, visibleItems, selectedKey, activateItem, messenger.selectedId, messenger.selectConversation, instagram.selectedConversation?.id, instagram.setSelectedConversation]);

  const selectedItem = useMemo(() => {
    if (selectedKey) {
      const exact = items.find(item => item.key === selectedKey);
      if (exact) return exact;
    }
    return visibleItems[0] || null;
  }, [items, visibleItems, selectedKey]);

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.allSettled([messenger.loadMessenger(true, true), instagram.refreshAll(true)]);
    } finally {
      setRefreshing(false);
    }
  };

  const openAutomation = (tab: AutomationTab = 'rules') => {
    setAutomationTab(tab);
    setShowAutomation(true);
  };

  const showMessengerError =
    Boolean(messenger.error) &&
    (activeFilter === 'facebook' || activeFilter === 'all') &&
    messenger.conversations.length === 0;

  const gridClass = selectedItem?.channel === 'facebook'
    ? (messenger.showInfo ? 'lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_300px]' : 'lg:grid-cols-[290px_minmax(0,1fr)]')
    : 'lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_300px]';

  return (
    <div className={`h-full min-h-0 grid grid-cols-1 ${gridClass} bg-white overflow-hidden`}>
      <aside className="min-h-0 border-r border-slate-200 flex flex-col bg-white">
        <div className="shrink-0 p-2 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, nội dung, tag..." className="h-8 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-[9px] outline-none focus:border-blue-400" />
            </div>
            <button type="button" onClick={() => openAutomation('rules')} title="Tự động hóa" className="w-8 h-8 rounded-lg border border-slate-200 text-violet-600 hover:bg-violet-50 flex items-center justify-center"><Zap className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => void refreshAll()} disabled={refreshing} title="Làm mới" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /></button>
          </div>
          <div className="flex items-center justify-between text-[8px] text-slate-400 px-0.5">
            <span>{visibleItems.length} hội thoại</span>
            <span>{activeFilter === 'all' ? 'Tất cả kênh' : activeFilter === 'facebook' ? 'Messenger' : 'Instagram'}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
          {showMessengerError ? (
            <div className="h-full min-h-[260px] flex items-center justify-center text-center px-5">
              <div className="max-w-[240px]">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <div className="text-[10px] font-extrabold text-slate-800">Messenger chưa tải được</div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-500">{messenger.error}</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void messenger.handleReauthorize()}
                    disabled={messenger.reauthorizing}
                    className="h-8 px-3 rounded-lg bg-blue-600 text-white text-[9px] font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {messenger.reauthorizing ? 'Đang kết nối...' : 'Kết nối lại Facebook'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void messenger.loadMessenger(false, true)}
                    className="h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-[9px] font-bold hover:bg-slate-50"
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="h-full min-h-[220px] flex items-center justify-center text-center px-5">
              <div><Inbox className="w-8 h-8 text-slate-200 mx-auto mb-2" /><div className="text-[10px] font-bold text-slate-600">Không có hội thoại phù hợp</div></div>
            </div>
          ) : visibleItems.map(item => (
            <button type="button" key={item.key} onClick={() => void activateItem(item)} className={`w-full px-2.5 py-2.5 text-left transition-colors flex items-start gap-2.5 ${selectedKey === item.key ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}>
              <div className="relative shrink-0">
                {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200" /> : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${item.channel === 'facebook' ? 'bg-blue-600' : 'bg-gradient-to-br from-fuchsia-500 to-orange-400'}`}>{item.channel === 'facebook' ? <Facebook className="w-3.5 h-3.5 fill-white" /> : <Instagram className="w-3.5 h-3.5" />}</div>}
                <span className={`absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-white ${item.channel === 'facebook' ? 'bg-blue-600' : 'bg-fuchsia-500'}`}>{item.channel === 'facebook' ? <Facebook className="w-2 h-2 fill-white" /> : <Instagram className="w-2 h-2" />}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-extrabold text-slate-900 truncate">{item.name}</span><span className="text-[8px] text-slate-400 shrink-0">{formatTime(item.updatedAt)}</span></div>
                <p className="text-[9px] text-slate-500 truncate mt-0.5">{item.preview}</p>
                <div className="mt-1 flex items-center gap-1 overflow-hidden"><span className="text-[7px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold shrink-0">{item.status}</span>{item.assignee ? <span className="text-[7px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-bold truncate">{item.assignee}</span> : null}{item.tags.slice(0, 1).map(tag => <span key={tag} className="text-[7px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-bold truncate">{tag}</span>)}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {!selectedItem ? (
        <section className="min-w-0 min-h-0 flex items-center justify-center bg-white"><div className="text-center"><Inbox className="w-9 h-9 text-slate-200 mx-auto mb-2" /><div className="text-[11px] font-bold text-slate-600">Chọn một hội thoại</div></div></section>
      ) : selectedItem.channel === 'facebook' ? (
        <>
          {messenger.detailLoading && !messenger.detail ? <section className="min-h-0 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></section> : <ChatPanel onOpenTemplates={() => setShowTemplates(true)} />}
          {messenger.showInfo ? <CustomerPanel onOpenAutomationTest={() => openAutomation('test')} /> : null}
        </>
      ) : (
        <InstagramUnifiedPane />
      )}

      <TemplateModal open={showTemplates} onClose={() => setShowTemplates(false)} onManage={() => openAutomation('templates')} />
      <AutomationModal open={showAutomation} tab={automationTab} onTabChange={setAutomationTab} onClose={() => setShowAutomation(false)} />
    </div>
  );
};
