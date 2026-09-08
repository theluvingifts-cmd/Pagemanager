import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MetaChannel, MetaChannelTabs } from '../components/common/MetaChannelTabs';
import { AllMessagesWorkspace } from '../features/messages-all/AllMessagesWorkspace';
import { useMessenger } from '../features/messenger/MessengerContext';
import { useInstagram } from '../features/instagram/InstagramContext';

export const MessagesHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const messenger = useMessenger();
  const instagram = useInstagram();

  const active = useMemo<MetaChannel>(() => {
    const fromUrl = searchParams.get('channel');
    if (fromUrl === 'facebook' || fromUrl === 'instagram' || fromUrl === 'all') return fromUrl;
    return 'all';
  }, [searchParams]);

  const changeChannel = (channel: MetaChannel) => {
    const next = new URLSearchParams(searchParams);
    if (channel === 'all') next.delete('channel');
    else next.set('channel', channel);
    setSearchParams(next, { replace: true });
  };

  const badges = {
    facebook: messenger.conversations.length,
    instagram: instagram.conversations.length,
    all: messenger.conversations.length + instagram.conversations.length,
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-white">
      <div className="shrink-0 h-12 px-3 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
        <div className="min-w-0">
          <h2 className="text-[14px] font-extrabold text-slate-900 leading-none">Hộp thư</h2>
          <p className="text-[9px] text-slate-400 mt-1 truncate">Một giao diện duy nhất · các nút trên chỉ dùng để lọc hội thoại</p>
        </div>
        <MetaChannelTabs
          active={active}
          onChange={changeChannel}
          showAll
          allLabel="Tất cả tin nhắn"
          facebookLabel="Messenger"
          instagramLabel="Instagram"
          badges={badges}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <AllMessagesWorkspace activeFilter={active} />
      </div>
    </div>
  );
};
