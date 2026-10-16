import type { DeliveryStatus, JobStatus, OrderStatus, WebhookStatus } from '@/lib/types';

const TZ = 'America/Sao_Paulo';

export function brl(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }).format(new Date(iso));
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: TZ }).format(new Date(iso));
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: 'Aguardando pagamento', tone: 'neutral' },
  paid: { label: 'Pago', tone: 'info' },
  provisioning: { label: 'Gerando acesso', tone: 'info' },
  provisioned: { label: 'Acesso gerado', tone: 'brand' },
  delivered: { label: 'Entregue', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  refunded: { label: 'Reembolsado', tone: 'warning' },
  chargeback: { label: 'Chargeback', tone: 'danger' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Na fila', tone: 'neutral' },
  running: { label: 'Executando', tone: 'info' },
  succeeded: { label: 'Concluído', tone: 'success' },
  failed: { label: 'Falhou', tone: 'warning' },
  dead: { label: 'Esgotado', tone: 'danger' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
};

export const WEBHOOK_STATUS: Record<WebhookStatus, { label: string; tone: Tone }> = {
  received: { label: 'Recebido', tone: 'info' },
  processed: { label: 'Processado', tone: 'success' },
  ignored: { label: 'Ignorado', tone: 'neutral' },
  failed: { label: 'Falhou', tone: 'danger' },
};

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendente', tone: 'neutral' },
  sent: { label: 'Enviado', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  skipped: { label: 'Não enviado', tone: 'warning' },
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  process_webhook: 'Processar webhook',
  provision_access: 'Gerar acesso (Sigma)',
  deliver: 'Entregar acesso',
  revoke_access: 'Revogar acesso',
};

export const ACTION_LABEL: Record<string, string> = {
  'webhook.received': 'Webhook recebido',
  'webhook.duplicate': 'Webhook duplicado descartado',
  'webhook.processed': 'Webhook processado',
  'webhook.reprocess_requested': 'Reprocessamento de webhook solicitado',
  'webhook.simulated': 'Venda simulada criada',
  'customer.created': 'Cliente cadastrado',
  'order.created': 'Pedido criado',
  'order.status_changed': 'Status do pedido alterado',
  'product.auto_registered': 'Produto cadastrado automaticamente',
  'product.saved': 'Produto salvo',
  'access.created': 'Acesso gerado no Sigma',
  'access.provision_skipped': 'Geração de acesso ignorada',
  'access.reprovision_requested': 'Nova geração de acesso solicitada',
  'access.revoke_requested': 'Revogação de acesso solicitada',
  'access.revoked': 'Acesso revogado',
  'credential.revealed': 'Senha visualizada',
  'delivery.whatsapp.sent': 'WhatsApp enviado',
  'delivery.email.sent': 'E-mail enviado',
  'delivery.whatsapp.skipped': 'WhatsApp não enviado',
  'delivery.email.skipped': 'E-mail não enviado',
  'delivery.resend_requested': 'Reenvio solicitado',
  'job.retry_scheduled': 'Nova tentativa agendada',
  'job.dead': 'Tentativas esgotadas',
  'job.retry_requested': 'Job reenfileirado manualmente',
  'job.canceled': 'Job cancelado',
  'worker.run_manual': 'Fila executada manualmente',
  'auth.login': 'Login',
  'auth.logout': 'Logout',
};
