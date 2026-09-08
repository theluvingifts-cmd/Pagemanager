import React from 'react';
import { Settings2, X } from 'lucide-react';
import { useMessenger } from '../MessengerContext';
import { renderTemplate } from '../utils';

export const TemplateModal: React.FC<{ open: boolean; onClose: () => void; onManage: () => void }> = ({ open, onClose, onManage }) => {
  const { templates, insertTemplate, detail, pageName } = useMessenger();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/35 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[78vh] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden" onClick={event => event.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-extrabold text-slate-900">Tin nhắn mẫu</h3><p className="text-[10px] text-slate-500 mt-0.5">Chọn để chèn vào ô soạn. Hỗ trợ <b>{'{{name}}'}</b> và <b>{'{{page}}'}</b>.</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 overflow-y-auto max-h-[62vh] space-y-2">
          {templates.length === 0 ? <div className="py-12 text-center text-xs text-slate-400">Chưa có tin nhắn mẫu. Mở Tự động hóa để tạo mẫu.</div> : templates.map(template => (
            <button key={template.id} type="button" onClick={() => { insertTemplate(template); onClose(); }} className="w-full text-left rounded-lg border border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 p-3 transition-colors">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-extrabold text-slate-800">{template.title}</span><span className="text-[9px] uppercase font-bold text-slate-400">{template.category || 'general'}</span></div>
              <p className="text-[10px] leading-relaxed text-slate-600 mt-1.5 line-clamp-3">{renderTemplate(template.text, detail?.customer?.name, pageName)}</p>
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between"><span className="text-[10px] text-slate-500">{templates.length} mẫu</span><button type="button" onClick={() => { onClose(); onManage(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold"><Settings2 className="w-3.5 h-3.5" />Quản lý mẫu</button></div>
      </div>
    </div>
  );
};
