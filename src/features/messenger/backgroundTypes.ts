export type BackgroundAutomationStatus = {
  success?: boolean;
  enabled: boolean;
  ready: boolean;
  schedulerConfigured: boolean;
  webhookVerifyConfigured: boolean;
  webhookSubscribed: boolean;
  callbackUrl: string;
  cronUrl: string;
  enabledAt?: string | null;
  lastRunAt?: string | null;
  lastWebhookAt?: string | null;
  lastWebhookEvent?: {
    object?: string;
    eventTypes?: string[];
    eventCount?: number;
    inboundCount?: number;
  } | null;
  lastResult?: {
    sent?: number;
    previewed?: number;
    detected?: number;
    reminders?: number;
    workingNow?: boolean;
    dryRun?: boolean;
  } | null;
  lastError?: string | null;
  note?: string;
};
