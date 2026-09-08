import React, { useState } from 'react';
import { AlertTriangle, Loader2, MessageCircle, X, Zap } from 'lucide-react';
import { useFacebook } from '../context/FacebookContext';
import { useMessenger } from '../features/messenger/MessengerContext';
import type { AutomationTab } from '../features/messenger/types';
import { AutomationModal } from '../features/messenger/components/AutomationModal';
import { ChatPanel } from '../features/messenger/components/ChatPanel';
import { ConversationList } from '../features/messenger/components/ConversationList';
import { CustomerPanel } from '../features/messenger/components/CustomerPanel';
import { MessengerHeader } from '../features/messenger/components/MessengerHeader';
import { TemplateModal } from '../features/messenger/components/TemplateModal';
import { CRMQueueBar } from '../features/crm/components/CRMQueueBar';

const stageMeta = {
  idle: { step: 0, label: 'Chờ kết nối' },
  checking: { step: 1, label: 'Đang kiểm tra quyền Messenger' },
  loading: { step: 2, label: 'Đang tải hội thoại từ Meta' },
  ready: { step: 3, label: 'Messenger đã sẵn sàng' },
  error: { step: 1, label: 'Cần xử lý kết nối Messenger' },
} as const;

export const MessagesPage: React.FC = () => {
  const { selectedPage } = useFacebook();
  const { stage, error, conversations, showInfo, automationNotice, setAutomationNotice } = useMessenger();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automationTab, setAutomationTab] = useState<AutomationTab>('rules');

  if (!selectedPage) {
    return <div className="h-full bg-white border border-slate-200 rounded-xl flex items-center justify-center text-center"><div><MessageCircle className="w-9 h-9 text-slate-300 mx-auto mb-2" /><h2 className="text-sm font-bold text-slate-900">Chưa chọn Facebook Page</h2><p className="text-xs text-slate-500 mt-1">Chọn một Page ở góc trái để kết nối Messenger.</p></div></div>;
  }

  const currentStage = stageMeta[stage];
  const progressWidth = stage === 'error' ? 33 : Math.max(0, Math.min(100, (currentStage.step / 3) * 100));

  const openAutomation = (tab: AutomationTab = 'rules') => {
    setAutomationTab(tab);
    setShowAutomation(true);
  };

  return (
    <div className="pm-messages h-full min-h-0 flex flex-col gap-1.5 overflow-hidden">
      <MessengerHeader onOpenAutomation={() => openAutomation('rules')} />
      {stage === 'ready' && conversations.length > 0 && <CRMQueueBar />}

      {(stage === 'checking' || stage === 'loading') && conversations.length === 0 && (
        <div className="shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
          <div className="flex items-center justify-between gap-3 text-[10px]"><div className="flex items-center gap-2 min-w-0"><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" /><span className="font-bold text-slate-700 truncate">Bước {Math.max(1, currentStage.step)}/3 · {currentStage.label}</span></div><span className="text-slate-400 shrink-0">Đang xử lý...</span></div>
          <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${progressWidth}%` }} /></div>
        </div>
      )}

      {stage === 'error' && <div className="shrink-0 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5"><div className="flex items-start gap-2 min-w-0"><AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" /><div className="min-w-0"><p className="text-[10px] font-extrabold text-rose-800">Messenger chưa sẵn sàng</p><p className="text-[10px] text-rose-700 break-words">{error || 'Hãy cấp lại quyền Facebook rồi thử lại.'}</p></div></div></div>}
      {error && stage !== 'error' && <div className="shrink-0 flex items-start gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] font-semibold text-rose-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{error}</span></div>}
      {automationNotice && <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-700"><div className="flex items-center gap-1.5 min-w-0"><Zap className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{automationNotice}</span></div><button type="button" onClick={() => setAutomationNotice(null)} className="text-violet-400 hover:text-violet-700"><X className="w-3.5 h-3.5" /></button></div>}

      <div className={`messenger-workspace flex-1 min-h-0 grid grid-cols-1 bg-white border border-slate-200 rounded-lg overflow-hidden ${showInfo ? 'lg:grid-cols-[278px_minmax(0,1fr)] xl:grid-cols-[278px_minmax(0,1fr)_300px]' : 'lg:grid-cols-[278px_minmax(0,1fr)]'}`}>
        <ConversationList />
        <ChatPanel onOpenTemplates={() => setShowTemplates(true)} />
        {showInfo && <CustomerPanel onOpenAutomationTest={() => openAutomation('test')} />}
      </div>

      <TemplateModal open={showTemplates} onClose={() => setShowTemplates(false)} onManage={() => openAutomation('templates')} />
      <AutomationModal open={showAutomation} tab={automationTab} onTabChange={setAutomationTab} onClose={() => setShowAutomation(false)} />
    </div>
  );
};
