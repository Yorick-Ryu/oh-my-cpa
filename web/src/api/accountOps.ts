import { requestResponse } from './client';

export interface OpsCapabilities {
  protocol_version: number; instance: string; worker_available: boolean; history: boolean;
  imports: boolean; record_only: boolean; browser: boolean; proxy: boolean; human_takeover: boolean;
  schedule_owner: string; synthetic: boolean;
}
export interface OpsPreferences {
  instance: string; websockets: boolean; priority: number; model: string; effort: string;
  proxy_policy: string; auto_enroll: boolean;
}
export interface OpsJob {
  id: string; account_id?: string; kind: string; source: string; state: string; phase: string;
  reason: string; created: number; updated: number; cancel_requested: boolean; allowed_actions: string[];
  snapshot?: { preference_version: number; preferences: OpsPreferences; order?: { order_id?: string; amount_cents?: number; expires_at?: string } };
  children?: Array<{ row_index: number; job: OpsJob }>;
}
export interface OpsEvent {
  cursor: number; job_id?: string; account_id?: string; kind: string; phase: string; reason: string;
  source: string; time: number; evidence_id?: string;
}
export interface OpsAccount { id: string; email: string; workspace: string; has_credentials: boolean; credential_version?: number }
export interface OpsPreview {
  draft_id: string; instance: string; expires_at: number;
  rows: Array<{index: number; email: string; order_id: string | null; amount_cents: number | null; expires_at: string | null; issues: string[]; has_credentials: boolean}>;
}
export interface OpsMonitor {
  history_complete: boolean; observed_at: number;
  notifications?: { pending: number; next_retry?: number };
  sources: Array<{kind: string; available: boolean; reason?: string; last_run?: number; accounts?: number; retained_results?: number; pending_notifications: number; waiting_human?: number; time_precision?: string}>;
  schedules: Array<{kind: string; enabled: boolean; running: boolean | null; owner: string; interval_seconds: number; next_run?: number}>;
}
export interface OpsPage<T> { items?: T[]; next_cursor?: number | string | null; has_more?: boolean }

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  return (await requestResponse(`/management/account-ops${path}`, options)).json() as Promise<T>;
}
export const accountOps = {
  capabilities: () => call<OpsCapabilities>('/capabilities'),
  jobs: (cursor?: string) => call<OpsPage<OpsJob>>(`/jobs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  job: (id: string) => call<OpsJob>(`/jobs/${encodeURIComponent(id)}`),
  events: (id: string, after = 0) => call<OpsPage<OpsEvent>>(`/jobs/${encodeURIComponent(id)}/events?after=${after}`),
  records: (after = 0, accountId?: string) => call<OpsPage<OpsEvent>>(`/records?after=${after}${accountId ? `&account_id=${encodeURIComponent(accountId)}` : ''}`),
  monitor: () => call<OpsMonitor>('/monitor'),
  accounts: () => call<OpsPage<OpsAccount>>('/accounts'),
  preview: (text: string, instance = 'clouvider') => call<OpsPreview>('/imports/preview', { method: 'POST', body: JSON.stringify({ text, instance }) }),
  submit: (body: Record<string, unknown>, key: string) => call<OpsJob>('/jobs', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ ...body, instance: body.instance || 'clouvider' }) }),
  action: (id: string, action: 'cancel' | 'resume') => call<OpsJob>(`/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' }),
  credentials: (id: string, password: string, totp: string) => call<{ has_credentials: boolean; version: number }>(`/accounts/${encodeURIComponent(id)}/credentials`, { method: 'POST', body: JSON.stringify({ password, totp }) }),
  preferences: () => call<{ version: number; value: OpsPreferences }>('/preferences/default'),
  savePreferences: (version: number, value: OpsPreferences) => call<{ version: number; value: OpsPreferences }>('/preferences/default', { method: 'PUT', body: JSON.stringify({ version, value }) }),
};
