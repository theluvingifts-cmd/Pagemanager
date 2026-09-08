import type { AutomationConfig, CustomerMeta, QuickTemplate, ReplyFormulaMode } from './types';
import { CRM_PRESET_TAGS, CRM_STATUS_OPTIONS, DEFAULT_CRM } from '../crm/constants';

export const DEFAULT_META: CustomerMeta = {
  tags: [],
  note: '',
  starred: false,
  status: 'new',
  statusLocked: false,
  automation: {},
  replyFormula: { mode: 'inherit', testOnly: false },
  crm: DEFAULT_CRM,
};

export const PRESET_TAGS = CRM_PRESET_TAGS;

export const STATUS_OPTIONS = CRM_STATUS_OPTIONS;

export const REPLY_FORMULA_OPTIONS: Array<{ value: ReplyFormulaMode; label: string; hint: string }> = [
  { value: 'inherit', label: 'Theo cài đặt shop', hint: 'Dùng rule chung của Messenger.' },
  { value: 'hot_lead', label: 'Khách nóng', hint: 'Ưu tiên phản hồi nhanh: 1h / 2h / nhắc 2 ngày.' },
  { value: 'quoted', label: 'Đã báo giá', hint: 'Theo sát vừa phải: 2h / 4h / nhắc 2 ngày.' },
  { value: 'nurture', label: 'Nuôi dưỡng', hint: 'Nhẹ hơn: 4h / 8h / nhắc 4 ngày.' },
  { value: 'manual', label: 'Chỉ thủ công', hint: 'Không gửi tự động cho cuộc chat này.' },
  { value: 'custom', label: 'Tùy chỉnh riêng', hint: 'Tự đặt thời gian và nội dung cho khách này.' },
];

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  enabled: false,
  testMode: false,
  timezone: 'Asia/Ho_Chi_Minh',
  workingHours: { enabled: true, start: '08:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
  noStaffReply: {
    enabled: false,
    delayHours: 3,
    template: 'Shop xin lỗi vì để {{name}} chờ hơi lâu ạ. Bên mình đã nhận được tin nhắn và đang kiểm tra để phản hồi bạn ngay đây.',
  },
  noCustomerReply: {
    enabled: false,
    delayHours: 4,
    template: '{{name}} ơi, mình nhắn lại để bạn khỏi bị trôi tin ạ. Nếu bạn còn cần mẫu này thì shop hỗ trợ tiếp ngay nhé.',
  },
  reengage: {
    enabled: true,
    afterDays: 2,
    mode: 'reminder_only',
    template: '{{name}} ơi, shop nhắn lại hỏi thăm mẫu mình xem hôm trước ạ. Nếu bạn còn cần thì mình hỗ trợ tiếp nhé.',
  },
  autoDetect: { enabled: true, autoApplyInterested: true, autoApplyQuoted: true, autoApplyOrdered: true },
};

export const FALLBACK_TEMPLATES: QuickTemplate[] = [];

export const WEEK_DAYS = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' },
  { value: 4, label: 'T5' }, { value: 5, label: 'T6' }, { value: 6, label: 'T7' }, { value: 0, label: 'CN' },
];

export const FILTER_OPTIONS = [
  ['all', 'Tất cả'], ['action', 'Cần xử lý'], ['starred', '★'], ['needsReply', 'Cần rep'], ['followup', 'Follow-up'],
  ['unassigned', 'Chưa phụ trách'], ['interested', 'Quan tâm'], ['waiting', 'Chờ'], ['ordered', 'Đã chốt'],
] as const;

export const CACHE_FRESH_MS = 60_000;
export const DETAIL_CACHE_FRESH_MS = 90_000;
export const AUTO_REFRESH_MS = 30_000;
