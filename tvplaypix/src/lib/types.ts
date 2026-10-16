// Tipos de domínio espelhando supabase/migrations. Quando o projeto Supabase existir,
// dá para gerar tipos completos com `supabase gen types typescript`.

export type AdminRole = 'admin' | 'operator' | 'viewer';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'provisioning'
  | 'provisioned'
  | 'delivered'
  | 'failed'
  | 'refunded'
  | 'chargeback'
  | 'canceled';

export type WebhookStatus = 'received' | 'processed' | 'ignored' | 'failed';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'canceled';
export type DeliveryChannel = 'whatsapp' | 'email';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export type CredentialStatus = 'active' | 'suspended' | 'revoked';
export type IntegrationMode = 'disabled' | 'mock' | 'live';

export type JobType = 'process_webhook' | 'provision_access' | 'deliver' | 'revoke_access';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  kirvano_product_id: string | null;
  kirvano_offer_id: string | null;
  sigma_package_id: string | null;
  duration_days: number;
  max_connections: number;
  active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  kirvano_sale_id: string;
  customer_id: string;
  product_id: string | null;
  product_name: string | null;
  status: OrderStatus;
  amount_cents: number | null;
  currency: string;
  payment_method: string | null;
  paid_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  event_key: string;
  event_type: string | null;
  external_id: string | null;
  payload: unknown;
  status: WebhookStatus;
  error: string | null;
  attempts: number;
  received_at: string;
  processed_at: string | null;
}

export interface AccessCredential {
  id: string;
  order_id: string;
  customer_id: string;
  provider: string;
  provider_mode: string;
  external_id: string | null;
  username: string;
  password_encrypted: string;
  expires_at: string | null;
  status: CredentialStatus;
  created_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  channel: DeliveryChannel;
  recipient: string | null;
  status: DeliveryStatus;
  provider_mode: string | null;
  provider_message_id: string | null;
  error: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  idempotency_key: string | null;
  order_id: string | null;
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface AuditLog {
  id: number;
  actor_type: 'user' | 'system' | 'webhook';
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  order_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}
