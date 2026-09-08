// Compatibility layer: Messenger keeps its existing imports while CRM logic lives in one generic module.
export {
  DEFAULT_CUSTOMER_CRM as DEFAULT_MESSENGER_CRM,
  mergeCustomerCRM as mergeMessengerCRM,
  normalizeCustomerCRM as normalizeMessengerCRM,
} from './customerCrmService';
export type {
  CustomerCRMActivityType as MessengerCRMActivityType,
  CustomerCRMActivity as MessengerCRMActivity,
  CustomerCRMContactData as MessengerCRMContactData,
  MergeCustomerCRMContext as MergeMessengerCRMContext,
} from './customerCrmService';
