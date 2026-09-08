import type { CRMContactData } from '../crm/types';

export type ContactStatus = 'new' | 'interested' | 'quoted' | 'waiting' | 'ordered' | 'delivered' | 'closed';
export type ReplyFormulaMode = 'inherit' | 'hot_lead' | 'quoted' | 'nurture' | 'manual' | 'custom';
export type LoadStage = 'idle' | 'checking' | 'loading' | 'ready' | 'error';
export type FilterKey = 'all' | 'action' | 'starred' | 'needsReply' | 'followup' | 'unassigned' | 'interested' | 'waiting' | 'ordered';
export type AutomationTab = 'rules' | 'templates' | 'test';

export interface AutomationState {
  lastNoStaffAutoReplyMessageId?: string | null;
  lastNoCustomerFollowupMessageId?: string | null;
  reengageDueForMessageId?: string | null;
  reengageDueAt?: string | null;
  reengageDismissedForMessageId?: string | null;
  autoDetectedStatus?: ContactStatus | null;
  autoDetectedAt?: string | null;
  autoDetectionReason?: string | null;
  lastAutomationActionAt?: string | null;
}

export interface ReplyFormula {
  mode: ReplyFormulaMode;
  testOnly?: boolean;
  noStaffDelayHours?: number;
  noCustomerDelayHours?: number;
  reengageAfterDays?: number;
  noStaffTemplate?: string;
  noCustomerTemplate?: string;
  reengageTemplate?: string;
}

export interface CustomerMeta {
  tags: string[];
  note: string;
  starred: boolean;
  status: ContactStatus;
  statusLocked?: boolean;
  automation?: AutomationState;
  replyFormula?: ReplyFormula;
  crm?: CRMContactData;
  updatedAt?: string | null;
}

export interface QuickTemplate {
  id: string;
  title: string;
  text: string;
  category?: 'general' | 'price' | 'followup' | 'order' | 'support';
}

export interface AutomationConfig {
  enabled: boolean;
  testMode: boolean;
  timezone: string;
  workingHours: { enabled: boolean; start: string; end: string; days: number[] };
  noStaffReply: { enabled: boolean; delayHours: number; template: string };
  noCustomerReply: { enabled: boolean; delayHours: number; template: string };
  reengage: { enabled: boolean; afterDays: number; mode: 'reminder_only'; template: string };
  autoDetect: { enabled: boolean; autoApplyInterested: boolean; autoApplyQuoted: boolean; autoApplyOrdered: boolean };
}

export interface Participant {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface Attachment {
  id?: string | null;
  type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'unknown';
  url: string | null;
  previewUrl: string | null;
  name: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface MessageItem {
  id: string;
  text: string;
  createdTime: string | null;
  fromId: string | null;
  fromName: string | null;
  isFromPage: boolean;
  attachments: Attachment[];
}

export interface ConversationSummary {
  id: string;
  link: string | null;
  updatedTime: string | null;
  customer: Participant | null;
  lastMessage: MessageItem | null;
  customerMeta?: CustomerMeta;
}

export interface ConversationDetail extends ConversationSummary {
  participants: Participant[];
  messages: MessageItem[];
  lastInboundAt: string | null;
  within24h: boolean | null;
  customerMeta?: CustomerMeta;
}

export interface AutomationPreviewAction {
  label: string;
  wouldAct: boolean;
  reason: string;
  message?: string | null;
}

export interface AutomationPreviewResult {
  success?: boolean;
  error?: string;
  summary?: Array<{ label: string; value: string; ok?: boolean }>;
  actions?: AutomationPreviewAction[];
}
