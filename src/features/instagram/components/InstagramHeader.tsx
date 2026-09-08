import React from 'react';
import { Instagram, RefreshCw, ShieldAlert } from 'lucide-react';
import { useFacebook } from '../../../context/FacebookContext';
import { useInstagram } from '../InstagramContext';
import { formatCompactNumber } from '../utils';

export const InstagramHeader: React.FC = () => {
  const { connectFacebook } = useFacebook();
  const { account, linked, refreshing, error, requiredPermissions, refreshAll } = useInstagram();

  return (
    <div className="space-y-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 text-white flex items-center justify-center shrink-0">
            <Instagram className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[15px] font-extrabold text-slate-900 truncate">Instagram</h2>
              {linked && account ? <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">@{account.username || 'professional'} · Đã kết nối</span> : null}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Bài viết · bình luận · inbox Instagram Professional trong cùng Page Manager.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {account && <div className="hidden lg:flex items-center gap-3 text-[10px] text-slate-500 mr-1"><span><b className="text-slate-800">{formatCompactNumber(account.followers_count)}</b> followers</span><span><b className="text-slate-800">{formatCompactNumber(account.media_count)}</b> bài</span></div>}
          <button type="button" onClick={() => refreshAll(true)} disabled={refreshing} className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />Làm mới</button>
          {(!linked || requiredPermissions.length > 0) && <button type="button" onClick={() => connectFacebook()} className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold inline-flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />Cấp lại quyền</button>}
        </div>
      </div>
      {error && <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-800 flex items-start gap-2"><ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /><div><span className="font-bold">Instagram:</span> {error}{requiredPermissions.length > 0 && <div className="mt-1 text-[10px]">Quyền cần kiểm tra: {requiredPermissions.join(', ')}</div>}</div></div>}
    </div>
  );
};
