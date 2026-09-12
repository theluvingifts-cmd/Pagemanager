import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MetaChannel, MetaChannelTabs } from '../components/common/MetaChannelTabs';
import { ContentListPage } from './ContentListPage';
import { InstagramContentWorkspace } from '../features/instagram/components/InstagramContentWorkspace';
import { StoriesPage } from './StoriesPage';

const STORAGE_KEY = 'pagemanager_content_channel';

export const ContentHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const active = useMemo<MetaChannel>(() => {
    const fromUrl = searchParams.get('channel');
    if (fromUrl === 'instagram' || fromUrl === 'facebook' || fromUrl === 'stories') return fromUrl;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'instagram' || saved === 'stories' ? saved : 'facebook';
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  const changeChannel = (channel: MetaChannel) => {
    const next = new URLSearchParams(searchParams);
    next.set('channel', channel);
    if (channel !== 'facebook') next.delete('status');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-900">Nội dung</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Facebook và Instagram dùng chung Page đang chọn, chuyển kênh ngay trong một màn.</p>
        </div>
        <MetaChannelTabs active={active} onChange={changeChannel} facebookLabel="Facebook" instagramLabel="Instagram" showStories />
      </div>

      {active === 'facebook' ? <ContentListPage /> : active === 'instagram' ? <InstagramContentWorkspace /> : <StoriesPage embedded />}
    </div>
  );
};
