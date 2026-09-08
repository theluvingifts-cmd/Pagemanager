import React, { useEffect, useMemo, useState } from 'react';
import { Instagram, Save, Star, UserRound } from 'lucide-react';
import { CRMContactPanel } from '../../crm/components/CRMContactPanel';
import { CRM_PRESET_TAGS, CRM_STATUS_OPTIONS, DEFAULT_CRM } from '../../crm/constants';
import type { InstagramAccount, InstagramConversation, InstagramCustomerMeta, InstagramParticipant } from '../types';

interface Props {
  account: InstagramAccount | null;
  conversation: InstagramConversation;
  customer: InstagramParticipant | null;
  onSave: (customerId: string, patch: Partial<InstagramCustomerMeta>) => Promise<{ success: boolean; error?: string }>;
}

const defaultMeta: InstagramCustomerMeta = { tags: [], note: '', starred: false, status: 'new', crm: DEFAULT_CRM, updatedAt: null };

export const InstagramCustomerPanel: React.FC<Props> = ({ conversation, customer, onSave }) => {
  const meta = conversation.customerMeta || defaultMeta;
  const [status, setStatus] = useState(meta.status);
  const [tags, setTags] = useState<string[]>(meta.tags || []);
  const [note, setNote] = useState(meta.note || '');
  const [starred, setStarred] = useState(Boolean(meta.starred));
  const [tab, setTab] = useState<'crm' | 'note'>('crm');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(meta.status); setTags(meta.tags || []); setNote(meta.note || ''); setStarred(Boolean(meta.starred)); setError(null);
  }, [conversation.id, meta.updatedAt]);

  const dirty = status !== meta.status || note !== meta.note || starred !== Boolean(meta.starred) || JSON.stringify(tags) !== JSON.stringify(meta.tags || []);
  const customerId = customer?.id || '';
  const saveMeta = async () => {
    if (!customerId || !dirty) return;
    setSaving(true); setError(null);
    const result = await onSave(customerId, { status, tags, note, starred });
    if (!result.success) setError(result.error || 'Không lưu được CRM Instagram.');
    setSaving(false);
  };
  const toggleTag = (tag: string) => setTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag].slice(0, 12));

  return (
    <aside className="min-h-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="shrink-0 p-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white flex items-center justify-center shrink-0"><Instagram className="w-4 h-4" /></div>
          <div className="min-w-0 flex-1"><div className="text-[11px] font-extrabold text-slate-900 truncate">{customer?.name || customer?.username || 'Instagram user'}</div>{customer?.username && <div className="text-[9px] text-slate-400 truncate">@{customer.username}</div>}</div>
          <button type="button" onClick={() => setStarred(v => !v)} className={`w-7 h-7 rounded-md border flex items-center justify-center ${starred ? 'bg-amber-50 border-amber-200 text-amber-500' : 'border-slate-200 text-slate-400'}`}><Star className={`w-3.5 h-3.5 ${starred ? 'fill-current' : ''}`} /></button>
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as InstagramCustomerMeta['status'])} className="mt-2 w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-300">
          {CRM_STATUS_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <div className="mt-1.5 flex flex-wrap gap-1">{CRM_PRESET_TAGS.map(tag => <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`h-6 px-1.5 rounded-md border text-[8px] font-bold ${tags.includes(tag) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>{tag}</button>)}</div>
      </div>

      <div className="shrink-0 grid grid-cols-2 border-b border-slate-100">
        <button type="button" onClick={() => setTab('crm')} className={`h-8 text-[9px] font-extrabold ${tab === 'crm' ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-400'}`}>CRM</button>
        <button type="button" onClick={() => setTab('note')} className={`h-8 text-[9px] font-extrabold ${tab === 'note' ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Ghi chú</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {tab === 'crm' ? (
          <CRMContactPanel customerId={customerId} crm={meta.crm} onSave={async crmPatch => {
            if (!customerId) return;
            setSaving(true); setError(null);
            const result = await onSave(customerId, { crm: crmPatch as any });
            if (!result.success) setError(result.error || 'Không lưu được CRM Instagram.');
            setSaving(false);
          }} saving={saving} />
        ) : (
          <div className="space-y-2">
            <label className="block text-[8px] font-extrabold text-slate-500">Ghi chú nội bộ
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={6} placeholder="Ví dụ: thích tone hồng, đã báo giá 398k..." className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-[9px] outline-none focus:ring-1 focus:ring-indigo-300" />
            </label>
            <div className="rounded-md bg-slate-50 border border-slate-200 p-2 text-[8px] text-slate-500 space-y-1">
              <div className="flex items-center gap-1"><UserRound className="w-3 h-3" />Instagram ID: <span className="font-mono text-slate-700">{customerId || '-'}</span></div>
              <div>CRM được lưu riêng cho khách Instagram này.</div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 p-2 border-t border-slate-100">
        {error && <div className="mb-1.5 text-[8px] text-rose-600">{error}</div>}
        <button type="button" onClick={saveMeta} disabled={!dirty || saving} className="w-full h-8 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-extrabold disabled:opacity-35 flex items-center justify-center gap-1.5"><Save className="w-3 h-3" />{saving ? 'Đang lưu...' : 'Lưu trạng thái / tag'}</button>
      </div>
    </aside>
  );
};
