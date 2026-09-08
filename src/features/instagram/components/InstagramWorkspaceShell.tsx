import React from 'react';
import { Instagram, Loader2 } from 'lucide-react';
import { useFacebook } from '../../../context/FacebookContext';
import { useInstagram } from '../InstagramContext';
import { InstagramHeader } from './InstagramHeader';

export const InstagramWorkspaceShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedPage, connectFacebook } = useFacebook();
  const { linked, account, loading } = useInstagram();

  if (!selectedPage) {
    return <div className="h-full bg-white border border-slate-200 rounded-lg flex items-center justify-center"><div className="text-center px-6"><Instagram className="w-8 h-8 text-slate-300 mx-auto mb-3" /><h3 className="text-sm font-extrabold text-slate-900">Chưa chọn Facebook Page</h3><p className="text-[11px] text-slate-500 mt-1">Instagram được ghép theo Facebook Page đang chọn.</p></div></div>;
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-1.5 overflow-hidden">
      <InstagramHeader />
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading && !account ? (
          <div className="h-full bg-white border border-slate-200 rounded-lg flex items-center justify-center"><div className="text-center text-[11px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-fuchsia-500" />Đang tải Instagram lần đầu...</div></div>
        ) : !linked || !account ? (
          <div className="h-full bg-white border border-slate-200 rounded-lg flex items-center justify-center"><div className="max-w-md text-center px-6"><div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 text-white flex items-center justify-center mx-auto mb-3"><Instagram className="w-5 h-5" /></div><h3 className="text-sm font-extrabold text-slate-900">Chưa đọc được Instagram Professional</h3><p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">Nếu Instagram đã liên kết với Page này, cấp lại quyền Meta một lần.</p><button type="button" onClick={() => connectFacebook()} className="mt-3 h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold">Cấp lại quyền Meta</button></div></div>
        ) : children}
      </div>
    </div>
  );
};
