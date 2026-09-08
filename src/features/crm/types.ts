export type CRMActivityType =
  | 'status'
  | 'assignee'
  | 'contact'
  | 'product'
  | 'order_value'
  | 'followup'
  | 'note'
  | 'system';

export interface CRMActivity {
  id: string;
  type: CRMActivityType;
  label: string;
  at: string;
}

export interface CRMContactData {
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
  activities: CRMActivity[];
}
