import React from 'react';
import { Clock3, Flame, MessageCircleReply, ShoppingBag, UserRoundX } from 'lucide-react';
import { useMessenger } from '../../messenger/MessengerContext';

export const CRMQueueBar: React.FC = () => {
  const { crmStats, filter, setFilter } = useMessenger();
  const items = [
    { key: 'action', label: 'Cần xử lý', value: crmStats.needsAction, icon: MessageCircleReply },
    { key: 'followup', label: 'Đến hạn', value: crmStats.followupDue, icon: Clock3 },
    { key: 'interested', label: 'Khách nóng', value: crmStats.hot, icon: Flame },
    { key: 'ordered', label: 'Đã chốt', value: crmStats.ordered, icon: ShoppingBag },
    { key: 'unassigned', label: 'Chưa phụ trách', value: crmStats.unassigned, icon: UserRoundX },
  ] as const;

  return (
    <div className="shrink-0 grid grid-cols-5 gap-1">
      {items.map(item => {
        const Icon = item.icon;
        const active = filter === item.key;
        return (
          <button type="button" key={item.key} onClick={() => setFilter(active ? 'all' : item.key)} className={`h-8 min-w-0 rounded-md border px-2 flex items-center justify-center gap-1.5 transition-colors ${active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <Icon className="w-3 h-3 shrink-0" />
            <span className="text-[10px] font-black leading-none">{item.value}</span>
            <span className={`hidden md:inline text-[8px] font-bold truncate ${active ? 'text-slate-300' : 'text-slate-400'}`}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
