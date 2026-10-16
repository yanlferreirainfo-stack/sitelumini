'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthorizationError, requireRole } from '@/lib/auth';
import { audit, userActor } from '@/lib/audit';
import { decryptSecret } from '@/lib/crypto';
import { env } from '@/lib/env';
import { enqueue } from '@/lib/queue/jobs';
import { runWorker } from '@/lib/queue/worker';
import { ingestKirvanoPayload } from '@/lib/services/ingest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import type { DeliveryChannel } from '@/lib/types';

export type ActionResult = { ok: boolean; message: string };

const uuid = z.string().uuid();

/** Envolve a ação: converte erros em mensagem amigável, sem vazar detalhes internos. */
async function guarded(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthorizationError) return { ok: false, message: err.message };
    if (err instanceof z.ZodError) return { ok: false, message: 'Dados inválidos.' };
    console.error('[action]', err);
    return { ok: false, message: 'Não foi possível concluir a ação. Veja os logs do servidor.' };
  }
}

const manualKey = (base: string) => `${base}:manual:${randomUUID()}`;

export async function retryJob(jobId: string): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('operator');
    const id = uuid.parse(jobId);
    const { data, error } = await supabaseAdmin()
      .from('jobs')
      .update({ status: 'queued', run_at: new Date().toISOString(), attempts: 0, last_error: null, finished_at: null })
      .eq('id', id)
      .in('status', ['dead', 'failed', 'canceled'])
      .select('id, order_id, type')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, message: 'Só jobs esgotados ou cancelados podem ser reenfileirados.' };
    await audit(userActor(admin), { action: 'job.retry_requested', entityType: 'job', entityId: id, orderId: data.order_id, metadata: { type: data.type } });
    revalidatePath('/admin', 'layout');
    return { ok: true, message: 'Job devolvido à fila.' };
  });
}

export async function cancelJob(jobId: string): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('operator');
    const id = uuid.parse(jobId);
    const { data, error } = await supabaseAdmin()
      .from('jobs')
      .update({ status: 'canceled', finished_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'queued')
      .select('id, order_id, type')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, message: 'Só jobs na fila (não iniciados) podem ser cancelados.' };
    await audit(userActor(admin), { action: 'job.canceled', entityType: 'job', entityId: id, orderId: data.order_id, metadata: { type: data.type } });
    revalidatePath('/admin', 'layout');
    return { ok: true, message: 'Job cancelado.' };
  });
}

export async function reprocessWebhook(eventId: string): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('operator');
    const id = uuid.parse(eventId);
    await supabaseAdmin().from('webhook_events').update({ status: 'received', error: null }).eq('id', id);
    await enqueue('process_webhook', { event_id: id }, { idempotencyKey: manualKey(`process_webhook:${id}`) });
    await audit(userActor(admin), { action: 'webhook.reprocess_requested', entityType: 'webhook_event', entityId: id });
    revalidatePath('/admin', 'layout');
    return { ok: true, message: 'Reprocessamento enfileirado.' };
  });
}

export async function reprovisionOrder(orderId: string): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('operator');
    const id = uuid.parse(orderId);
    const { data: order } = await supabaseAdmin().from('orders').select('status').eq('id', id).maybeSingle();
    if (!order) return { ok: false, message: 'Pedido não encontrado.' };
    if (!['paid', 'provisioning', 'failed', 'provisioned'].includes(order.status)) {
      return { ok: false, message: `Pedido com status "${order.status}" não pode receber acesso.` };
    }
    await enqueue('provision_access', { order_id: id }, { idempotencyKey: manualKey(`provision:${id}`), orderId: id });
    await audit(userActor(admin), { action: 'access.reprovision_requested', entityType: 'order', entityId: id, orderId: id });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: 'Geração de acesso enfileirada. Se o acesso já existir, ele é mantido.' };
  });
}

export async function resendDelivery(orderId: string, channel: DeliveryChannel): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('operator');
    const id = uuid.parse(orderId);
    const ch = z.enum(['whatsapp', 'email']).parse(channel);
    const { data: cred } = await supabaseAdmin().from('access_credentials').select('status').eq('order_id', id).maybeSingle();
    if (!cred) return { ok: false, message: 'Este pedido ainda não tem acesso gerado.' };
    if (cred.status !== 'active') return { ok: false, message: 'O acesso deste pedido não está ativo.' };
    await enqueue('deliver', { order_id: id, channel: ch, force: true }, { idempotencyKey: manualKey(`deliver:${id}:${ch}`), orderId: id });
    await audit(userActor(admin), { action: 'delivery.resend_requested', entityType: 'order', entityId: id, orderId: id, metadata: { channel: ch } });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: `Reenvio por ${ch === 'whatsapp' ? 'WhatsApp' : 'e-mail'} enfileirado.` };
  });
}

export async function revokeOrderAccess(orderId: string): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('admin');
    const id = uuid.parse(orderId);
    await enqueue('revoke_access', { order_id: id, reason: `manual por ${admin.email}` }, { idempotencyKey: manualKey(`revoke:${id}`), orderId: id });
    await audit(userActor(admin), { action: 'access.revoke_requested', entityType: 'order', entityId: id, orderId: id });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: 'Revogação enfileirada.' };
  });
}

/** Mostra a senha do acesso. Exige perfil operador e fica registrado no histórico. */
export async function revealCredential(orderId: string): Promise<ActionResult & { password?: string }> {
  try {
    const admin = await requireRole('operator');
    const id = uuid.parse(orderId);
    const { data } = await supabaseAdmin().from('access_credentials').select('id, password_encrypted').eq('order_id', id).maybeSingle();
    if (!data) return { ok: false, message: 'Acesso não encontrado.' };
    await audit(userActor(admin), { action: 'credential.revealed', entityType: 'access_credential', entityId: data.id, orderId: id });
    return { ok: true, message: 'ok', password: decryptSecret(data.password_encrypted, env().CREDENTIALS_ENCRYPTION_KEY) };
  } catch (err) {
    if (err instanceof AuthorizationError) return { ok: false, message: err.message };
    console.error('[revealCredential]', err);
    return { ok: false, message: 'Não foi possível exibir a senha.' };
  }
}

export async function runQueueNow(): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('operator');
    const r = await runWorker({ budgetMs: 25_000 });
    await audit(userActor(admin), { action: 'worker.run_manual', metadata: { ...r } });
    revalidatePath('/admin', 'layout');
    return { ok: true, message: `Processados ${r.claimed}: ${r.succeeded} ok, ${r.retried} reagendados, ${r.dead} esgotados.` };
  });
}

const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  name: z.string().trim().min(2).max(120),
  kirvano_product_id: z.string().trim().max(120).optional().transform((v) => v || null),
  kirvano_offer_id: z.string().trim().max(120).optional().transform((v) => v || null),
  sigma_package_id: z.string().trim().max(120).optional().transform((v) => v || null),
  duration_days: z.coerce.number().int().min(1).max(3650),
  max_connections: z.coerce.number().int().min(1).max(20),
  active: z.literal('on').optional().transform((v) => v === 'on'),
});

export async function saveProduct(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('admin');
    const parsed = productSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: 'Confira os campos: ' + parsed.error.issues.map((i) => i.path.join('.')).join(', ') };
    const { id, ...fields } = parsed.data;
    const q = id ? supabaseAdmin().from('products').update(fields).eq('id', id) : supabaseAdmin().from('products').insert(fields);
    const { data, error } = await q.select('id').single();
    if (error) return { ok: false, message: error.code === '23505' ? 'Já existe um produto com este ID da Kirvano.' : 'Erro ao salvar o produto.' };
    await audit(userActor(admin), { action: 'product.saved', entityType: 'product', entityId: data.id, metadata: fields });
    revalidatePath('/admin/produtos');
    return { ok: true, message: 'Produto salvo.' };
  });
}

const simulateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional(),
  product_id: z.string().trim().min(1).max(120),
  product_name: z.string().trim().min(1).max(120),
  price: z.string().trim().max(20),
  event: z.enum(['SALE_APPROVED', 'PIX_GENERATED', 'SALE_REFUNDED', 'SALE_CHARGEBACK']),
  sale_id: z.string().trim().max(120).optional(),
});

/**
 * Cria uma venda falsa pelo MESMO caminho do webhook real (grava evento,
 * enfileira, processa). Só existe com ALLOW_TEST_TOOLS=true.
 */
export async function simulateKirvanoSale(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const admin = await requireRole('admin');
    if (!env().ALLOW_TEST_TOOLS) return { ok: false, message: 'Ferramentas de teste desativadas (ALLOW_TEST_TOOLS).' };
    const d = simulateSchema.parse(Object.fromEntries(form));
    const saleId = d.sale_id || `SIM-${Date.now()}`;
    const payload = {
      event: d.event,
      sale_id: saleId,
      status: d.event === 'SALE_APPROVED' ? 'APPROVED' : d.event,
      payment_method: 'PIX',
      total_price: d.price,
      created_at: new Date().toISOString(),
      customer: { name: d.name, email: d.email, phone_number: d.phone || null, document: null },
      products: [{ id: d.product_id, name: d.product_name, offer_id: null, price: d.price }],
      _simulated: true,
    };
    const r = await ingestKirvanoPayload(payload, { metadata: { simulated_by: admin.email } });
    if (!r.ok) return { ok: false, message: r.error };
    await audit(userActor(admin), { action: 'webhook.simulated', entityType: 'webhook_event', entityId: r.eventId, metadata: { sale_id: saleId, event: d.event } });
    const w = await runWorker({ budgetMs: 20_000 });
    revalidatePath('/admin', 'layout');
    return {
      ok: true,
      message: r.duplicate
        ? 'Evento duplicado: nada foi reprocessado (idempotência funcionando).'
        : `Venda ${saleId} registrada. Jobs executados: ${w.claimed} (${w.succeeded} ok, ${w.retried} reagendados, ${w.dead} esgotados).`,
    };
  });
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabaseAdmin().from('audit_logs').insert({ actor_type: 'user', actor_id: user.id, actor_email: user.email, action: 'auth.logout' });
  }
  await supabase.auth.signOut();
  redirect('/login');
}
