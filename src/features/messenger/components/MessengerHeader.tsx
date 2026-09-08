import React from 'react';
import { Bot, Loader2, MessageCircle, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { useMessenger } from '../MessengerContext';
import { formatTime } from '../utils';

export const MessengerHeader: React.FC<{ onOpenAutomation: () => void }> = ({ onOpenAutomation }) => {
  const {
    stage, conversations, lastFetchedAt, pageName, automationConfig, automationRunning, runAutomation,
    loadMessenger, handleReauthorize, reauthorizing,
  } = useMessenger();

  return (
    <div className="h-9 shrink-0 flex items-center justify-between gap-2 px-0.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0"><MessageCircle className="w-3.5 h-3.5" /></div>
        <div className="min-w-0 flex items-center gap-2">
          <h2 className="text-[13px] font-extrabold text-slate-900 truncate">Messenger Inbox</h2>
          {stage === 'ready' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[8px] font-bold text-emerald-700 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Đã kết nối</span>}
          <span className="hidden xl:inline text-[9px] text-slate-400 truncate">{conversations.length} hội thoại · {lastFetchedAt ? `CN ${formatTime(lastFetchedAt)}` : pageName}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onOpenAutomation} className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[9px] font-bold ${automationConfig.enabled ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Zap className={`w-3 h-3 ${automationConfig.enabled ? 'fill-violet-500' : ''}`} /><span>{automationConfig.enabled ? 'Tự động: Bật' : 'Tự động hóa'}</span></button>
        {automationConfig.enabled && <button type="button" onClick={() => runAutomation(false, true)} disabled={automationRunning} title="Test rule hiện tại" className="w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-violet-600 hover:bg-violet-50 flex items-center justify-center disabled:opacity-50">{automationRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}</button>}
        <button type="button" onClick={() => loadMessenger(false, true)} disabled={stage === 'checking' || stage === 'loading'} className="w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center disabled:opacity-50" title="Làm mới"><RefreshCw className={`w-3 h-3 ${(stage === 'checking' || stage === 'loading') ? 'animate-spin text-blue-600' : ''}`} /></button>
        {(stage === 'error' || stage === 'idle') && <button type="button" onClick={handleReauthorize} disabled={reauthorizing} className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold disabled:opacity-50">{reauthorizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}{reauthorizing ? 'Đang cấp' : 'Cấp quyền'}</button>}
      </div>
    </div>
  );
};
