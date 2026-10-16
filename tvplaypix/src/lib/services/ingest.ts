import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { audit, webhookActor, type AuditEntry } from '@/lib/audit';
import { kirvanoEventKey, kirvanoPayloadSchema } from '@/lib/integrations/kirvano/parse';

export type IngestResult =
  | { ok: true; eventId: string; duplicate: boolean }
  | { ok: false; error: string };

/**
 * Grava o evento bruto e enfileira o processamento (public.ingest_webhook_event).
 * Usado pelo webhook e pelo simulador do painel — o caminho é o mesmo.
 */
export async function ingestKirvanoPayload(payload: unknown, extraAudit?: Partial<AuditEntry>): Promise<IngestResult> {
  const minimal = kirvanoPayloadSchema.pick({ event: true, sale_id: true, event_id: true, status: true }).safeParse(payload);
  if (!minimal.success) return { ok: false, error: 'payload sem event/sale_id' };

  const { data, error } = await supabaseAdmin().rpc('ingest_webhook_event', {
    p_provider: 'kirvano',
    p_event_key: kirvanoEventKey(minimal.data),
    p_event_type: minimal.data.event.toUpperCase(),
    p_external_id: minimal.data.sale_id,
    p_payload: payload,
  });
  if (error) {
    // Erro de banco: devolvemos 5xx para a Kirvano tentar de novo.
    throw new Error(`Falha ao registrar webhook: ${error.message}`);
  }

  const row = (data as { event_id: string; duplicate: boolean }[])[0]!;
  await audit(webhookActor, {
    action: row.duplicate ? 'webhook.duplicate' : 'webhook.received',
    entityType: 'webhook_event',
    entityId: row.event_id,
    metadata: { event: minimal.data.event, sale_id: minimal.data.sale_id, ...(extraAudit?.metadata ?? {}) },
  });
  return { ok: true, eventId: row.event_id, duplicate: row.duplicate };
}
