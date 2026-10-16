import 'server-only';
import { env } from '@/lib/env';
import { audit, systemActor, webhookActor } from '@/lib/audit';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueue } from '@/lib/queue/jobs';
import { errorMessage } from '@/lib/queue/backoff';
import { kirvanoPayloadSchema, normalizeKirvano, type NormalizedSale } from '@/lib/integrations/kirvano/parse';
import { accessProvider, PermanentProviderError } from '@/lib/integrations/sigma';
import { sendAccessWhatsApp } from '@/lib/integrations/whatsapp';
import { sendAccessEmail } from '@/lib/integrations/email';
import { nextOrderStatus } from './order-state';
import type {
  AccessCredential,
  Customer,
  DeliveryChannel,
  Delivery,
  Job,
  JobType,
  Order,
  Product,
  WebhookEvent,
} from '@/lib/types';

const db = () => supabaseAdmin();

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new PermanentProviderError(`${what}: não encontrado`);
  return res.data;
}

// -----------------------------------------------------------------------------
// process_webhook — transforma o evento da Kirvano em cliente + pedido
// -----------------------------------------------------------------------------
async function processWebhook(job: Job): Promise<void> {
  const eventId = String(job.payload.event_id);
  const event = must<WebhookEvent>(await db().from('webhook_events').select('*').eq('id', eventId).maybeSingle(), 'Evento');

  if (event.status === 'processed' || event.status === 'ignored') return; // já tratado

  await db().from('webhook_events').update({ attempts: event.attempts + 1 }).eq('id', event.id);

  const parsed = kirvanoPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    const msg = 'Payload fora do formato esperado: ' + parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ');
    await db().from('webhook_events').update({ status: 'failed', error: msg }).eq('id', event.id);
    throw new PermanentProviderError(msg);
  }

  const sale = normalizeKirvano(parsed.data);
  if (sale.intent === 'ignore') {
    await db()
      .from('webhook_events')
      .update({ status: 'ignored', processed_at: new Date().toISOString(), error: null })
      .eq('id', event.id);
    return;
  }

  try {
    const customer = await upsertCustomer(sale);
    const product = await findOrRegisterProduct(sale);
    const order = await applySaleToOrder(sale, customer, product, event.id);

    await db()
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), error: null })
      .eq('id', event.id);
    await audit(webhookActor, {
      action: 'webhook.processed',
      entityType: 'webhook_event',
      entityId: event.id,
      orderId: order.id,
      metadata: { event: sale.event, sale_id: sale.saleId, order_status: order.status },
    });
  } catch (err) {
    await db().from('webhook_events').update({ status: 'failed', error: errorMessage(err) }).eq('id', event.id);
    throw err;
  }
}

async function upsertCustomer(sale: NormalizedSale): Promise<Customer> {
  const c = sale.customer;
  let existing: Customer | null = null;

  if (c.email) {
    const { data } = await db().from('customers').select('*').ilike('email', c.email).limit(1).maybeSingle();
    existing = data as Customer | null;
  }
  if (!existing && c.document) {
    const { data } = await db().from('customers').select('*').eq('document', c.document).limit(1).maybeSingle();
    existing = data as Customer | null;
  }

  if (existing) {
    // Completa dados que faltavam, sem sobrescrever o que o operador já corrigiu.
    const patch: Partial<Customer> = {};
    if (!existing.phone && c.phone) patch.phone = c.phone;
    if (!existing.document && c.document) patch.document = c.document;
    if (!existing.email && c.email) patch.email = c.email;
    if (Object.keys(patch).length) {
      const res = await db().from('customers').update(patch).eq('id', existing.id).select('*').single();
      return must<Customer>(res, 'Atualizar cliente');
    }
    return existing;
  }

  const res = await db().from('customers').insert(c).select('*').single();
  const created = must<Customer>(res, 'Criar cliente');
  await audit(webhookActor, { action: 'customer.created', entityType: 'customer', entityId: created.id });
  return created;
}

async function findOrRegisterProduct(sale: NormalizedSale): Promise<Product | null> {
  const pid = sale.product.kirvanoProductId;
  if (!pid) return null;
  const { data } = await db().from('products').select('*').eq('kirvano_product_id', pid).maybeSingle();
  if (data) return data as Product;

  // Produto novo na Kirvano: cadastra com valores padrão para o operador revisar.
  const res = await db()
    .from('products')
    .upsert(
      { kirvano_product_id: pid, kirvano_offer_id: sale.product.kirvanoOfferId, name: sale.product.name ?? `Produto ${pid}` },
      { onConflict: 'kirvano_product_id' },
    )
    .select('*')
    .single();
  const product = must<Product>(res, 'Cadastrar produto');
  await audit(webhookActor, {
    action: 'product.auto_registered',
    entityType: 'product',
    entityId: product.id,
    metadata: { kirvano_product_id: pid, note: 'Revise duração, conexões e pacote Sigma.' },
  });
  return product;
}

async function applySaleToOrder(sale: NormalizedSale, customer: Customer, product: Product | null, eventId: string): Promise<Order> {
  const { data: current } = await db().from('orders').select('*').eq('kirvano_sale_id', sale.saleId).maybeSingle();
  const prev = current as Order | null;
  const status = nextOrderStatus(prev?.status ?? null, sale.intent)!;

  const fields = {
    kirvano_sale_id: sale.saleId,
    customer_id: prev?.customer_id ?? customer.id,
    product_id: prev?.product_id ?? product?.id ?? null,
    product_name: prev?.product_name ?? product?.name ?? sale.product.name,
    amount_cents: sale.amountCents ?? prev?.amount_cents ?? null,
    payment_method: sale.paymentMethod ?? prev?.payment_method ?? null,
    status,
    paid_at: status === 'paid' && !prev?.paid_at ? (sale.occurredAt ?? new Date().toISOString()) : (prev?.paid_at ?? null),
  };

  // Insert falha por unicidade se outro worker criou o pedido ao mesmo tempo:
  // o erro é transitório e a retentativa cai no ramo de update.
  const res = prev
    ? await db().from('orders').update(fields).eq('id', prev.id).select('*').single()
    : await db().from('orders').insert(fields).select('*').single();
  const order = must<Order>(res, 'Salvar pedido');

  if (prev?.status !== order.status) {
    await audit(webhookActor, {
      action: prev ? 'order.status_changed' : 'order.created',
      entityType: 'order',
      entityId: order.id,
      orderId: order.id,
      metadata: { from: prev?.status ?? null, to: order.status, event: sale.event, webhook_event_id: eventId },
    });
  }

  if (order.status === 'paid') {
    await enqueue('provision_access', { order_id: order.id }, { idempotencyKey: `provision:${order.id}`, orderId: order.id });
  }
  if ((order.status === 'refunded' || order.status === 'chargeback') && prev?.status !== order.status) {
    await enqueue('revoke_access', { order_id: order.id }, { idempotencyKey: `revoke:${order.id}`, orderId: order.id });
  }
  return order;
}

// -----------------------------------------------------------------------------
// provision_access — gera o acesso individual no Sigma
// -----------------------------------------------------------------------------
async function provisionAccess(job: Job): Promise<void> {
  const orderId = String(job.payload.order_id);
  const order = must<Order>(await db().from('orders').select('*').eq('id', orderId).maybeSingle(), 'Pedido');

  if (!['paid', 'provisioning', 'failed', 'provisioned'].includes(order.status)) {
    await audit(systemActor, {
      action: 'access.provision_skipped',
      entityType: 'order',
      entityId: order.id,
      orderId: order.id,
      metadata: { reason: `status ${order.status}` },
    });
    return;
  }

  const { data: existing } = await db().from('access_credentials').select('id').eq('order_id', order.id).maybeSingle();
  if (!existing) {
    const customer = must<Customer>(await db().from('customers').select('*').eq('id', order.customer_id).maybeSingle(), 'Cliente');
    const product = order.product_id
      ? ((await db().from('products').select('*').eq('id', order.product_id).maybeSingle()).data as Product | null)
      : null;

    const provider = accessProvider();
    if (provider.mode === 'live' && !product?.sigma_package_id) {
      throw new PermanentProviderError('Produto sem pacote Sigma configurado (Produtos → pacote Sigma).');
    }

    await db().from('orders').update({ status: 'provisioning', last_error: null }).eq('id', order.id);

    const access = await provider.createAccess({
      idempotencyKey: `order:${order.id}`,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      packageId: product?.sigma_package_id ?? null,
      durationDays: product?.duration_days ?? 30,
      maxConnections: product?.max_connections ?? 1,
    });

    const ins = await db()
      .from('access_credentials')
      .insert({
        order_id: order.id,
        customer_id: customer.id,
        provider: provider.name,
        provider_mode: provider.mode,
        external_id: access.externalId,
        username: access.username,
        password_encrypted: encryptSecret(access.password, env().CREDENTIALS_ENCRYPTION_KEY),
        expires_at: access.expiresAt,
      })
      .select('id')
      .single();
    // 23505 = outro worker já gravou o acesso deste pedido; seguimos com o dele.
    if (ins.error && ins.error.code !== '23505') throw new Error(`Gravar acesso: ${ins.error.message}`);

    await audit(systemActor, {
      action: 'access.created',
      entityType: 'access_credential',
      entityId: ins.data?.id,
      orderId: order.id,
      metadata: { provider: provider.name, mode: provider.mode, username: access.username, expires_at: access.expiresAt },
    });
  }

  await db().from('orders').update({ status: 'provisioned', last_error: null }).eq('id', order.id).in('status', ['paid', 'provisioning', 'failed']);

  for (const channel of ['whatsapp', 'email'] as DeliveryChannel[]) {
    await enqueue('deliver', { order_id: order.id, channel }, { idempotencyKey: `deliver:${order.id}:${channel}`, orderId: order.id });
  }
}

// -----------------------------------------------------------------------------
// deliver — envia os dados de acesso por WhatsApp ou e-mail
// -----------------------------------------------------------------------------
async function deliver(job: Job): Promise<void> {
  const orderId = String(job.payload.order_id);
  const channel = job.payload.channel as DeliveryChannel;
  const force = job.payload.force === true;

  const order = must<Order>(await db().from('orders').select('*').eq('id', orderId).maybeSingle(), 'Pedido');
  if (['refunded', 'chargeback', 'canceled'].includes(order.status)) return;

  const customer = must<Customer>(await db().from('customers').select('*').eq('id', order.customer_id).maybeSingle(), 'Cliente');
  const cred = must<AccessCredential>(
    await db().from('access_credentials').select('*').eq('order_id', order.id).maybeSingle(),
    'Acesso do pedido',
  );
  if (cred.status !== 'active') throw new PermanentProviderError(`Acesso está ${cred.status}; entrega cancelada.`);

  const recipient = channel === 'whatsapp' ? customer.phone : customer.email;
  const up = await db()
    .from('deliveries')
    .upsert({ order_id: order.id, channel, recipient }, { onConflict: 'order_id,channel', ignoreDuplicates: false })
    .select('*')
    .single();
  const delivery = must<Delivery>(up, 'Registro de entrega');

  if (delivery.status === 'sent' && !force) return; // já entregue: não reenvia

  if (!recipient) {
    await db().from('deliveries').update({ status: 'skipped', error: `Cliente sem ${channel === 'whatsapp' ? 'telefone' : 'e-mail'}` }).eq('id', delivery.id);
    await audit(systemActor, { action: `delivery.${channel}.skipped`, entityType: 'delivery', entityId: delivery.id, orderId: order.id, metadata: { reason: 'sem destinatário' } });
    return;
  }

  const data = {
    customerName: customer.name,
    username: cred.username,
    password: decryptSecret(cred.password_encrypted, env().CREDENTIALS_ENCRYPTION_KEY),
    expiresAt: cred.expires_at,
    productName: order.product_name,
    serverUrl: env().ACCESS_SERVER_URL ?? null,
  };

  try {
    const result =
      channel === 'whatsapp' ? await sendAccessWhatsApp(recipient, data) : await sendAccessEmail(recipient, data, `${job.idempotency_key ?? job.id}`);

    await db()
      .from('deliveries')
      .update({
        status: result.skipped ? 'skipped' : 'sent',
        provider_mode: result.mode,
        provider_message_id: result.messageId,
        error: result.skipped ? 'Canal desativado' : null,
        attempts: delivery.attempts + 1,
        sent_at: result.skipped ? null : new Date().toISOString(),
      })
      .eq('id', delivery.id);

    await audit(systemActor, {
      action: result.skipped ? `delivery.${channel}.skipped` : `delivery.${channel}.sent`,
      entityType: 'delivery',
      entityId: delivery.id,
      orderId: order.id,
      metadata: { mode: result.mode, recipient, message_id: result.messageId, resend: force },
    });

    if (!result.skipped) {
      await db().from('orders').update({ status: 'delivered' }).eq('id', order.id).eq('status', 'provisioned');
    }
  } catch (err) {
    await db()
      .from('deliveries')
      .update({ status: 'failed', error: errorMessage(err), attempts: delivery.attempts + 1 })
      .eq('id', delivery.id);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// revoke_access — reembolso / chargeback / ação manual
// -----------------------------------------------------------------------------
async function revokeAccess(job: Job): Promise<void> {
  const orderId = String(job.payload.order_id);
  const { data } = await db().from('access_credentials').select('*').eq('order_id', orderId).maybeSingle();
  const cred = data as AccessCredential | null;
  if (!cred || cred.status === 'revoked') return;

  await accessProvider().revokeAccess({ externalId: cred.external_id ?? '', username: cred.username });
  await db().from('access_credentials').update({ status: 'revoked' }).eq('id', cred.id);
  await audit(systemActor, {
    action: 'access.revoked',
    entityType: 'access_credential',
    entityId: cred.id,
    orderId,
    metadata: { username: cred.username, reason: job.payload.reason ?? 'pedido estornado' },
  });
}

export const handlers: Record<JobType, (job: Job) => Promise<void>> = {
  process_webhook: processWebhook,
  provision_access: provisionAccess,
  deliver,
  revoke_access: revokeAccess,
};

/** Chamado quando um job esgota as tentativas: marca o pedido para ação manual. */
export async function onJobDead(job: Job, message: string): Promise<void> {
  if (job.type === 'provision_access' && job.order_id) {
    await db().from('orders').update({ status: 'failed', last_error: message }).eq('id', job.order_id);
  }
  if (job.type === 'deliver' && job.order_id) {
    await db().from('orders').update({ last_error: message }).eq('id', job.order_id);
  }
}
