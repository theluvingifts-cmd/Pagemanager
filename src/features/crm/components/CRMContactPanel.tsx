import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, History, PackageSearch, Save, UserRound, WalletCards } from 'lucide-react';
import type { CRMContactData } from '../types';
import { DEFAULT_CRM, FOLLOWUP_SHORTCUTS } from '../constants';
import {
  followupAfterHours,
  formatMoneyVnd,
  fromDateTimeLocalValue,
  normalizeCrmClient,
  toDateTimeLocalValue,
} from '../utils';
import { formatTime } from '../../messenger/utils';

interface Props {
  customerId?: string | null;
  crm?: Partial<CRMContactData> | null;
  saving?: boolean;
  onSave: (patch: Partial<CRMContactData>) => Promise<void> | void;
}

export const CRMContactPanel: React.FC<Props> = ({ customerId, crm, saving = false, onSave }) => {
  const normalized = useMemo(() => normalizeCrmClient(crm || DEFAULT_CRM), [crm]);
  const [draft, setDraft] = useState<CRMContactData>(normalized);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setDraft(normalized);
    setSavedFlash(false);
    setShowHistory(false);
  }, [customerId, normalized]);

  const dirty = JSON.stringify({
    phone: draft.phone,
    email: draft.email,
    address: draft.address,
    productInterest: draft.productInterest,
    orderValue: draft.orderValue,
    assignee: draft.assignee,
    nextFollowUpAt: draft.nextFollowUpAt,
  }) !== JSON.stringify({
    phone: normalized.phone,
    email: normalized.email,
    address: normalized.address,
    productInterest: normalized.productInterest,
    orderValue: normalized.orderValue,
    assignee: normalized.assignee,
    nextFollowUpAt: normalized.nextFollowUpAt,
  });

  const save = async () => {
    await onSave({
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      address: draft.address.trim(),
      productInterest: draft.productInterest.trim(),
      orderValue: draft.orderValue,
      currency: 'VND',
      assignee: draft.assignee.trim(),
      nextFollowUpAt: draft.nextFollowUpAt,
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const setFollowup = (hours: number) => setDraft(prev => ({ ...prev, nextFollowUpAt: followupAfterHours(hours) }));
  const inputClass = 'w-full h-7 px-2 rounded-md border border-slate-200 bg-white text-[9px] outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300';

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[8px] font-extrabold text-slate-500">Phụ trách
          <div className="relative mt-0.5"><UserRound className="absolute left-2 top-2 w-3 h-3 text-slate-400" /><input value={draft.assignee} onChange={e => setDraft(prev => ({ ...prev, assignee: e.target.value }))} placeholder="VD: Dương" className={`${inputClass} pl-6`} /></div>
        </label>
        <label className="text-[8px] font-extrabold text-slate-500">Giá trị dự kiến
          <div className="relative mt-0.5"><WalletCards className="absolute left-2 top-2 w-3 h-3 text-slate-400" /><input inputMode="numeric" value={draft.orderValue ?? ''} onChange={e => { const digits = e.target.value.replace(/\D/g, ''); setDraft(prev => ({ ...prev, orderValue: digits ? Number(digits) : null })); }} placeholder="398000" className={`${inputClass} pl-6`} /></div>
        </label>
      </div>

      <label className="block text-[8px] font-extrabold text-slate-500">Sản phẩm / nhu cầu
        <div className="relative mt-0.5"><PackageSearch className="absolute left-2 top-2 w-3 h-3 text-slate-400" /><input value={draft.productInterest} onChange={e => setDraft(prev => ({ ...prev, productInterest: e.target.value }))} placeholder="Khung 16x21, tone hồng..." className={`${inputClass} pl-6`} /></div>
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[8px] font-extrabold text-slate-500">Điện thoại<input value={draft.phone} onChange={e => setDraft(prev => ({ ...prev, phone: e.target.value }))} placeholder="09..." className={`${inputClass} mt-0.5`} /></label>
        <label className="text-[8px] font-extrabold text-slate-500">Email<input value={draft.email} onChange={e => setDraft(prev => ({ ...prev, email: e.target.value }))} placeholder="email..." className={`${inputClass} mt-0.5`} /></label>
      </div>

      <label className="block text-[8px] font-extrabold text-slate-500">Địa chỉ
        <input value={draft.address} onChange={e => setDraft(prev => ({ ...prev, address: e.target.value }))} placeholder="Địa chỉ giao hàng / khu vực..." className={`${inputClass} mt-0.5`} />
      </label>

      <div className="rounded-md border border-slate-200 bg-slate-50/70 p-1.5">
        <div className="flex items-center gap-1.5">
          <input type="datetime-local" value={toDateTimeLocalValue(draft.nextFollowUpAt)} onChange={e => setDraft(prev => ({ ...prev, nextFollowUpAt: fromDateTimeLocalValue(e.target.value) }))} className="min-w-0 flex-1 h-7 px-1.5 rounded-md border border-slate-200 bg-white text-[8px] outline-none focus:ring-1 focus:ring-indigo-300" />
          {draft.nextFollowUpAt && <button type="button" onClick={() => setDraft(prev => ({ ...prev, nextFollowUpAt: null }))} className="h-7 px-1.5 rounded-md border border-rose-100 bg-white text-[8px] font-bold text-rose-500">Xóa</button>}
        </div>
        <div className="mt-1 flex gap-1 overflow-x-auto">
          {FOLLOWUP_SHORTCUTS.map(item => <button type="button" key={item.key} onClick={() => setFollowup(item.hours)} className="h-6 px-1.5 rounded-md border border-slate-200 bg-white text-[8px] font-bold text-slate-600 whitespace-nowrap hover:bg-slate-100">{item.label}</button>)}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={save} disabled={!dirty || saving} className="flex-1 h-7 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-extrabold disabled:opacity-35 flex items-center justify-center gap-1.5">
          {savedFlash ? <><Check className="w-3 h-3" />Đã lưu</> : <><Save className="w-3 h-3" />{saving ? 'Đang lưu...' : 'Lưu CRM'}</>}
        </button>
        {normalized.activities.length > 0 && <button type="button" onClick={() => setShowHistory(v => !v)} className="h-7 px-2 rounded-md border border-slate-200 bg-white text-[8px] font-bold text-slate-500 flex items-center gap-1"><History className="w-3 h-3" />{normalized.activities.length}<ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} /></button>}
      </div>

      {draft.orderValue !== null && <div className="text-[8px] text-indigo-600 font-bold text-right -mt-1">{formatMoneyVnd(draft.orderValue)}</div>}

      {showHistory && normalized.activities.length > 0 && (
        <div className="max-h-24 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 space-y-1">
          {normalized.activities.slice(-6).reverse().map(item => <div key={item.id} className="flex gap-1.5 text-[8px] leading-snug"><span className="text-slate-400 shrink-0">{formatTime(item.at)}</span><span className="text-slate-600">{item.label}</span></div>)}
        </div>
      )}
    </div>
  );
};
