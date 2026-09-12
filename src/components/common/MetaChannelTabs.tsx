import React from 'react';
import { Facebook, Instagram, Inbox, CirclePlay } from 'lucide-react';
import { useInstagram } from '../../features/instagram/InstagramContext';

export type MetaChannel = 'all' | 'facebook' | 'instagram' | 'stories';

interface MetaChannelTabsProps {
  active: MetaChannel;
  onChange: (channel: MetaChannel) => void;
  facebookLabel?: string;
  instagramLabel?: string;
  showAll?: boolean;
  allLabel?: string;
  showStories?: boolean;
  badges?: Partial<Record<MetaChannel, number>>;
}

const CountBadge: React.FC<{ value?: number }> = ({ value }) => {
  if (!value) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white inline-flex items-center justify-center text-[9px] leading-none font-black">
      {value > 99 ? '99+' : value}
    </span>
  );
};

export const MetaChannelTabs: React.FC<MetaChannelTabsProps> = ({
  active,
  onChange,
  facebookLabel = 'Messenger',
  instagramLabel = 'Instagram',
  showAll = false,
  allLabel = 'Tất cả tin nhắn',
  showStories = false,
  badges = {},
}) => {
  const { linked, account } = useInstagram();

  const base = 'h-9 px-3.5 inline-flex items-center gap-2 rounded-md text-[11px] font-extrabold whitespace-nowrap transition-colors';
  const inactive = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';
  const activeClass = 'bg-sky-50 text-sky-700';

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      {showAll && (
        <button type="button" onClick={() => onChange('all')} className={`${base} ${active === 'all' ? activeClass : inactive}`}>
          <Inbox className="w-3.5 h-3.5" />
          <span>{allLabel}</span>
          <CountBadge value={badges.all} />
        </button>
      )}

      <button type="button" onClick={() => onChange('facebook')} className={`${base} ${active === 'facebook' ? activeClass : inactive}`}>
        <Facebook className="w-3.5 h-3.5 fill-current" />
        <span>{facebookLabel}</span>
        <CountBadge value={badges.facebook} />
      </button>

      <button type="button" onClick={() => onChange('instagram')} className={`${base} ${active === 'instagram' ? activeClass : inactive}`}>
        <Instagram className="w-3.5 h-3.5" />
        <span>{instagramLabel}</span>
        <CountBadge value={badges.instagram} />
        {linked && account ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title={`Đã liên kết @${account.username || 'instagram'}`} /> : null}
      </button>

      {showStories && (
        <button type="button" onClick={() => onChange('stories')} className={`${base} ${active === 'stories' ? activeClass : inactive}`}>
          <CirclePlay className="w-3.5 h-3.5" />
          <span>Tin</span>
          <CountBadge value={badges.stories} />
        </button>
      )}
    </div>
  );
};
