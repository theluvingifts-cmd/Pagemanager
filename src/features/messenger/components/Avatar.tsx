import React, { useState } from 'react';
import { UserRound } from 'lucide-react';
import type { Participant } from '../types';

export const Avatar: React.FC<{ customer?: Participant | null; active?: boolean; size?: 'sm' | 'md' | 'lg' }> = ({ customer, active, size = 'sm' }) => {
  const [failed, setFailed] = useState(false);
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-9 h-9' : 'w-8 h-8';
  const icon = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  if (customer?.avatarUrl && !failed) {
    return <img src={customer.avatarUrl} onError={() => setFailed(true)} alt={customer.name} className={`${dim} rounded-full object-cover ring-1 ring-slate-200 shrink-0`} />;
  }
  return (
    <div className={`${dim} rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
      <UserRound className={icon} />
    </div>
  );
};
