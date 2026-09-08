import type { CRMContactData } from './types';

export const DEFAULT_CRM: CRMContactData = {
  phone: '',
  email: '',
  address: '',
  productInterest: '',
  orderValue: null,
  currency: 'VND',
  assignee: '',
  nextFollowUpAt: null,
  createdAt: null,
  stageUpdatedAt: null,
  lastActivityAt: null,
  activities: [],
};

export const FOLLOWUP_SHORTCUTS = [
  { key: '2h', label: '+2h', hours: 2 },
  { key: '4h', label: '+4h', hours: 4 },
  { key: 'tomorrow', label: 'Ngày mai', hours: 24 },
  { key: '2d', label: '+2 ngày', hours: 48 },
] as const;

export const CRM_PRESET_TAGS = ['Khách mới', 'Khách nóng', 'Đã báo giá', 'Chờ phản hồi', 'Đã chốt', 'VIP'];

export const CRM_STATUS_OPTIONS = [
  { value: 'new', label: 'Khách mới' },
  { value: 'interested', label: 'Đang quan tâm' },
  { value: 'quoted', label: 'Đã báo giá' },
  { value: 'waiting', label: 'Chờ phản hồi' },
  { value: 'ordered', label: 'Đã chốt' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'closed', label: 'Đã đóng' },
] as const;
