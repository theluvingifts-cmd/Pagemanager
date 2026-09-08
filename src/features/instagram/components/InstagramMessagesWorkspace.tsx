import React from 'react';
import { InstagramWorkspaceShell } from './InstagramWorkspaceShell';
import { InstagramInboxPanel } from './InstagramInboxPanel';

export const InstagramMessagesWorkspace: React.FC = () => (
  <InstagramWorkspaceShell>
    <InstagramInboxPanel />
  </InstagramWorkspaceShell>
);
