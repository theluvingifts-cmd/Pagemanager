export type CustomerCRMActivityType = 'status' | 'assignee' | 'contact' | 'product' | 'order_value' | 'followup' | 'note' | 'system';

export interface CustomerCRMActivity {
  id: string;
  type: CustomerCRMActivityType;
  label: string;
  at: string;
}

export interface CustomerCRMContactData {
  phone: string;
  email: string;
  address: string;
  productInterest: string;
  orderValue: number | null;
  currency: 'VND';
  assignee: string;
  nextFollowUpAt: string | null;
  createdAt: string | null;
  stageUpdatedAt: string | null;
  lastActivityAt: string | null;
  activities: CustomerCRMActivity[];
}

export const DEFAULT_CUSTOMER_CRM: CustomerCRMContactData = {
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

const cleanText = (value: any, max = 500) => String(value || '').trim().slice(0, max);
const normalizeDate = (value: any) => {
  if (!value) return null;
  const text = String(value);
  return Number.isNaN(new Date(text).getTime()) ? null : text;
};

function normalizeActivity(raw: any): CustomerCRMActivity | null {
  const allowed = new Set<CustomerCRMActivityType>(['status', 'assignee', 'contact', 'product', 'order_value', 'followup', 'note', 'system']);
  const label = cleanText(raw?.label, 240);
  const at = normalizeDate(raw?.at);
  if (!label || !at) return null;
  return {
    id: cleanText(raw?.id, 80) || `crm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: allowed.has(String(raw?.type) as CustomerCRMActivityType) ? raw.type : 'system',
    label,
    at,
  };
}

export function normalizeCustomerCRM(raw: any): CustomerCRMContactData {
  const orderNumber = raw?.orderValue === '' || raw?.orderValue === null || raw?.orderValue === undefined ? NaN : Number(raw.orderValue);
  const activities = Array.isArray(raw?.activities)
    ? raw.activities.map(normalizeActivity).filter(Boolean).slice(-20) as CustomerCRMActivity[]
    : [];
  return {
    phone: cleanText(raw?.phone, 80),
    email: cleanText(raw?.email, 160),
    address: cleanText(raw?.address, 800),
    productInterest: cleanText(raw?.productInterest, 500),
    orderValue: Number.isFinite(orderNumber) && orderNumber >= 0 ? Math.round(orderNumber) : null,
    currency: 'VND',
    assignee: cleanText(raw?.assignee, 120),
    nextFollowUpAt: normalizeDate(raw?.nextFollowUpAt),
    createdAt: normalizeDate(raw?.createdAt),
    stageUpdatedAt: normalizeDate(raw?.stageUpdatedAt),
    lastActivityAt: normalizeDate(raw?.lastActivityAt),
    activities,
  };
}

function activity(type: CustomerCRMActivityType, label: string, at: string): CustomerCRMActivity {
  return { id: `crm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, label: cleanText(label, 240), at };
}
function append(items: CustomerCRMActivity[], item: CustomerCRMActivity) { return [...items, item].slice(-20); }

export interface MergeCustomerCRMContext {
  now: string;
  oldStatus: string;
  newStatus?: string;
  noteChanged?: boolean;
}

export function mergeCustomerCRM(currentRaw: any, incomingRaw: any, context: MergeCustomerCRMContext): CustomerCRMContactData {
  const current = normalizeCustomerCRM(currentRaw);
  const incoming = incomingRaw && typeof incomingRaw === 'object' ? incomingRaw : {};
  const next = normalizeCustomerCRM({ ...current, ...incoming });
  let activities = [...current.activities];
  const { now } = context;

  if (context.newStatus && context.newStatus !== context.oldStatus) {
    activities = append(activities, activity('status', `Đổi trạng thái: ${context.oldStatus} → ${context.newStatus}`, now));
    next.stageUpdatedAt = now;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'assignee') && next.assignee !== current.assignee) {
    activities = append(activities, activity('assignee', next.assignee ? `Giao phụ trách: ${next.assignee}` : 'Bỏ người phụ trách', now));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'productInterest') && next.productInterest !== current.productInterest) {
    activities = append(activities, activity('product', next.productInterest ? `Nhu cầu: ${next.productInterest}` : 'Xóa nhu cầu/sản phẩm quan tâm', now));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'orderValue') && next.orderValue !== current.orderValue) {
    activities = append(activities, activity('order_value', next.orderValue === null ? 'Xóa giá trị đơn dự kiến' : `Giá trị dự kiến: ${next.orderValue.toLocaleString('vi-VN')}đ`, now));
  }
  if ((Object.prototype.hasOwnProperty.call(incoming, 'phone') && next.phone !== current.phone)
    || (Object.prototype.hasOwnProperty.call(incoming, 'email') && next.email !== current.email)
    || (Object.prototype.hasOwnProperty.call(incoming, 'address') && next.address !== current.address)) {
    activities = append(activities, activity('contact', 'Cập nhật thông tin liên hệ', now));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'nextFollowUpAt') && next.nextFollowUpAt !== current.nextFollowUpAt) {
    activities = append(activities, activity('followup', next.nextFollowUpAt ? `Hẹn follow-up: ${new Date(next.nextFollowUpAt).toLocaleString('vi-VN')}` : 'Xóa lịch follow-up', now));
  }
  if (context.noteChanged) activities = append(activities, activity('note', 'Cập nhật ghi chú nội bộ', now));

  next.activities = activities.slice(-20);
  next.createdAt = current.createdAt || now;
  next.lastActivityAt = activities.length > current.activities.length ? now : (current.lastActivityAt || now);
  return normalizeCustomerCRM(next);
}
