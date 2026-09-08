import type { CRMContactData } from './types';

export const normalizeCrmClient = (crm?: Partial<CRMContactData> | null): CRMContactData => ({
  phone: String(crm?.phone || ''),
  email: String(crm?.email || ''),
  address: String(crm?.address || ''),
  productInterest: String(crm?.productInterest || ''),
  orderValue: typeof crm?.orderValue === 'number' && Number.isFinite(crm.orderValue) ? crm.orderValue : null,
  currency: 'VND',
  assignee: String(crm?.assignee || ''),
  nextFollowUpAt: crm?.nextFollowUpAt ? String(crm.nextFollowUpAt) : null,
  createdAt: crm?.createdAt ? String(crm.createdAt) : null,
  stageUpdatedAt: crm?.stageUpdatedAt ? String(crm.stageUpdatedAt) : null,
  lastActivityAt: crm?.lastActivityAt ? String(crm.lastActivityAt) : null,
  activities: Array.isArray(crm?.activities) ? crm!.activities!.slice(-20) : [],
});

export const isFollowupDue = (value?: string | null) => {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
};

export const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const fromDateTimeLocalValue = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const followupAfterHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

export const formatMoneyVnd = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
};
