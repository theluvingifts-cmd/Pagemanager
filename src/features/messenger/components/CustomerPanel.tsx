import React, { useEffect, useState } from 'react';
import { BellRing, Bot, Copy, FileText, Settings2, Star, Tag, UserRound } from 'lucide-react';
import { useMessenger } from '../MessengerContext';
import { PRESET_TAGS, REPLY_FORMULA_OPTIONS, STATUS_OPTIONS } from '../constants';
import type { ContactStatus, ReplyFormulaMode } from '../types';
import { formatTime, statusLabel } from '../utils';
import { Avatar } from './Avatar';
import { CRMContactPanel } from '../../crm/components/CRMContactPanel';

type PanelTab = 'crm' | 'care' | 'notes';

export const CustomerPanel: React.FC<{ onOpenAutomationTest: () => void }> = ({ onOpenAutomationTest }) => {
  const {
    detail, currentMeta, currentFormula, savingMeta, saveMeta, toggleTag, addCustomTag, updateReplyFormula, updateCrm,
    dismissReengage, insertTemplate, automationConfig,
  } = useMessenger();
  const [noteDraft, setNoteDraft] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [tab, setTab] = useState<PanelTab>('crm');

  useEffect(() => {
    setNoteDraft(detail?.customerMeta?.note || '');
    setCustomTag('');
    setTab('crm');
  }, [detail?.customer?.id, detail?.customerMeta?.note]);

  if (!detail) return <aside className="hidden xl:flex flex-col min-w-0 min-h-0 border-l border-slate-200 bg-white"><div className="flex-1 flex items-center justify-center text-center p-4 text-[10px] text-slate-400">Chọn hội thoại để xem thông tin khách.</div></aside>;

  const addTag = async () => {
    const value = customTag.trim();
    if (!value) return;
    await addCustomTag(value);
    setCustomTag('');
  };

  const reengageDue = Boolean(currentMeta.automation?.reengageDueAt && currentMeta.automation.reengageDueForMessageId !== currentMeta.automation.reengageDismissedForMessageId);

  return (
    <aside className="hidden xl:flex flex-col min-w-0 min-h-0 border-l border-slate-200 bg-white overflow-hidden">
      <div className="h-[58px] shrink-0 px-2.5 border-b border-slate-100 flex items-center gap-2">
        <Avatar customer={detail.customer} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><p className="text-[11px] font-extrabold text-slate-900 truncate">{detail.customer?.name || 'Khách Messenger'}</p>{currentMeta.starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}</div>
          <p className="text-[8px] text-slate-400 truncate">{currentMeta.crm?.assignee ? `Phụ trách: ${currentMeta.crm.assignee}` : 'Chưa có người phụ trách'}</p>
        </div>
        <select value={currentMeta.status} onChange={event => saveMeta({ status: event.target.value as ContactStatus })} disabled={savingMeta} className="w-[106px] h-7 px-1.5 rounded-md border border-slate-200 bg-white text-[8px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-blue-400">{STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </div>

      <div className="h-8 shrink-0 grid grid-cols-3 border-b border-slate-100 bg-slate-50/70 p-1 gap-1">
        <button type="button" onClick={() => setTab('crm')} className={`rounded-md text-[8px] font-extrabold flex items-center justify-center gap-1 ${tab === 'crm' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/70'}`}><UserRound className="w-3 h-3" />CRM</button>
        <button type="button" onClick={() => setTab('care')} className={`relative rounded-md text-[8px] font-extrabold flex items-center justify-center gap-1 ${tab === 'care' ? 'bg-white text-cyan-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/70'}`}><Settings2 className="w-3 h-3" />Chăm sóc{reengageDue && <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-amber-500" />}</button>
        <button type="button" onClick={() => setTab('notes')} className={`rounded-md text-[8px] font-extrabold flex items-center justify-center gap-1 ${tab === 'notes' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/70'}`}><FileText className="w-3 h-3" />Ghi chú</button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-2.5">
        {tab === 'crm' && <CRMContactPanel customerId={detail.customer?.id} crm={currentMeta.crm} saving={savingMeta} onSave={updateCrm} />}

        {tab === 'care' && (
          <div className="h-full min-h-0 overflow-y-auto space-y-2 pr-0.5">
            {currentMeta.automation?.autoDetectedStatus && <div className="rounded-md border border-violet-200 bg-violet-50 p-2"><div className="flex items-center gap-1 text-[9px] font-extrabold text-violet-700"><Bot className="w-3 h-3" />Tự nhận diện: {statusLabel(currentMeta.automation.autoDetectedStatus)}</div>{currentMeta.automation.autoDetectionReason && <p className="mt-0.5 text-[8px] leading-snug text-violet-600 line-clamp-2">{currentMeta.automation.autoDetectionReason}</p>}</div>}

            {reengageDue && <div className="rounded-md border border-amber-200 bg-amber-50 p-2"><div className="flex items-center gap-1 text-[9px] font-extrabold text-amber-800"><BellRing className="w-3 h-3" />Đến hạn follow-up</div><div className="mt-1.5 grid grid-cols-2 gap-1"><button type="button" onClick={() => insertTemplate(automationConfig.reengage.template)} className="h-7 rounded-md bg-amber-600 text-white text-[8px] font-bold">Chèn tin mồi</button><button type="button" onClick={dismissReengage} className="h-7 rounded-md border border-amber-300 bg-white text-amber-700 text-[8px] font-bold">Đã xử lý</button></div></div>}

            <div className="rounded-md border border-cyan-200 bg-cyan-50/40 p-2">
              <div className="flex items-center justify-between gap-2"><div><div className="text-[9px] font-extrabold text-cyan-800">Công thức trả lời</div><p className="text-[8px] text-cyan-700">Riêng cho cuộc chat này</p></div><button type="button" onClick={onOpenAutomationTest} className="h-6 px-2 rounded-md border border-cyan-200 bg-white text-[8px] font-bold text-cyan-700">Test</button></div>
              <select value={currentFormula.mode} onChange={event => updateReplyFormula({ mode: event.target.value as ReplyFormulaMode })} disabled={savingMeta} className="mt-1.5 w-full h-7 px-1.5 rounded-md border border-cyan-200 bg-white text-[8px] font-bold text-slate-700">{REPLY_FORMULA_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[8px] leading-snug text-cyan-700 truncate">{REPLY_FORMULA_OPTIONS.find(item => item.value === currentFormula.mode)?.hint}</p><label className="flex items-center gap-1 text-[8px] font-bold text-slate-600 whitespace-nowrap"><input type="checkbox" checked={Boolean(currentFormula.testOnly)} onChange={e => updateReplyFormula({ testOnly: e.target.checked })} className="accent-cyan-600" />Test</label></div>
              {currentFormula.mode === 'custom' && <div className="mt-1.5 pt-1.5 border-t border-cyan-100"><div className="grid grid-cols-3 gap-1"><label className="text-[7px] font-bold text-slate-500">Chưa rep<input type="number" min={1} max={12} value={currentFormula.noStaffDelayHours || 3} onChange={e => updateReplyFormula({ noStaffDelayHours: Number(e.target.value) || 3 })} className="mt-0.5 w-full h-6 px-1 rounded border border-cyan-200 bg-white text-[8px]" /></label><label className="text-[7px] font-bold text-slate-500">Khách im<input type="number" min={1} max={12} value={currentFormula.noCustomerDelayHours || 4} onChange={e => updateReplyFormula({ noCustomerDelayHours: Number(e.target.value) || 4 })} className="mt-0.5 w-full h-6 px-1 rounded border border-cyan-200 bg-white text-[8px]" /></label><label className="text-[7px] font-bold text-slate-500">Mồi lại<input type="number" min={2} max={14} value={currentFormula.reengageAfterDays || 2} onChange={e => updateReplyFormula({ reengageAfterDays: Number(e.target.value) || 2 })} className="mt-0.5 w-full h-6 px-1 rounded border border-cyan-200 bg-white text-[8px]" /></label></div></div>}
            </div>

            <div className="rounded-md border border-slate-200 p-2">
              <div className="flex items-center gap-1 text-[9px] font-extrabold text-slate-600"><Tag className="w-3 h-3" />Tag</div>
              <div className="mt-1.5 flex flex-wrap gap-1">{PRESET_TAGS.map(tag => { const active = currentMeta.tags.includes(tag); return <button key={tag} type="button" onClick={() => toggleTag(tag)} disabled={savingMeta} className={`h-6 px-1.5 rounded-md border text-[7px] font-bold ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{tag}</button>; })}</div>
              <div className="mt-1.5 flex gap-1"><input value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Tag riêng..." className="h-7 min-w-0 flex-1 px-2 rounded-md border border-slate-200 text-[8px] outline-none focus:ring-1 focus:ring-blue-400" /><button onClick={addTag} className="h-7 px-2 rounded-md bg-slate-900 text-white text-[8px] font-bold">Thêm</button></div>
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="h-full flex flex-col min-h-0 gap-2">
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Ghi chú nội bộ: sở thích, giá đã báo, yêu cầu riêng..." className="flex-1 min-h-[120px] w-full resize-none px-2.5 py-2 rounded-md border border-slate-200 bg-slate-50 text-[9px] outline-none focus:bg-white focus:ring-1 focus:ring-blue-400" />
            <button onClick={() => saveMeta({ note: noteDraft })} disabled={savingMeta || noteDraft === currentMeta.note} className="h-7 w-full rounded-md bg-slate-900 text-white text-[8px] font-bold disabled:opacity-40">{savingMeta ? 'Đang lưu...' : 'Lưu ghi chú'}</button>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[8px] text-slate-400">Messenger ID</span><button type="button" onClick={() => navigator.clipboard.writeText(detail.customer?.id || '')} className="flex items-center gap-1 text-[8px] font-bold text-slate-600 hover:text-blue-600"><span className="font-mono max-w-[150px] truncate">{detail.customer?.id || '--'}</span><Copy className="w-3 h-3" /></button></div>
              <div className="flex items-center justify-between gap-2"><span className="text-[8px] text-slate-400">Tin khách gần nhất</span><span className="text-[8px] font-semibold text-slate-600">{formatTime(detail.lastInboundAt) || '--'}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-[8px] text-slate-400">Số tin đang tải</span><span className="text-[8px] font-semibold text-slate-600">{detail.messages.length}</span></div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
