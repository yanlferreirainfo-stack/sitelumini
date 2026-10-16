import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizePhone, onlyDigits } from '@/lib/phone';

/**
 * Formato do webhook da Kirvano.
 *
 * ATENÇÃO: os nomes dos campos abaixo seguem o formato público mais comum dos
 * webhooks da Kirvano, mas DEVEM ser conferidos com um payload real da conta
 * (Kirvano → Integrações → Webhooks → "Testar"). O schema é tolerante
 * (passthrough + campos opcionais) e o payload bruto fica salvo em
 * webhook_events, então ajustar o mapeamento não perde nenhuma venda.
 */
const money = z.union([z.number(), z.string()]).optional().nullable();

export const kirvanoPayloadSchema = z
  .object({
    event: z.string().min(1),
    event_id: z.string().optional(),
    sale_id: z.union([z.string(), z.number()]).transform(String),
    checkout_id: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    payment_method: z.string().optional().nullable(),
    total_price: money,
    created_at: z.string().optional().nullable(),
    customer: z
      .object({
        name: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        document: z.string().optional().nullable(),
        phone_number: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
      })
      .passthrough(),
    products: z
      .array(
        z
          .object({
            id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
            name: z.string().optional().nullable(),
            offer_id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
            offer_name: z.string().optional().nullable(),
            price: money,
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export type KirvanoPayload = z.infer<typeof kirvanoPayloadSchema>;

/** O que cada evento da Kirvano significa para o pedido. */
export type SaleIntent = 'pending' | 'approved' | 'refunded' | 'chargeback' | 'canceled' | 'ignore';

const EVENT_INTENT: Record<string, SaleIntent> = {
  SALE_APPROVED: 'approved',
  SUBSCRIPTION_RENEWED: 'approved',
  PIX_GENERATED: 'pending',
  BANK_SLIP_GENERATED: 'pending',
  PICPAY_GENERATED: 'pending',
  SALE_REFUNDED: 'refunded',
  SALE_CHARGEBACK: 'chargeback',
  SALE_REFUSED: 'canceled',
  PIX_EXPIRED: 'canceled',
  BANK_SLIP_EXPIRED: 'canceled',
  SUBSCRIPTION_CANCELED: 'ignore', // assinatura cancelada: acesso expira no vencimento
  ABANDONED_CART: 'ignore',
};

export function eventIntent(event: string): SaleIntent {
  return EVENT_INTENT[event.toUpperCase()] ?? 'ignore';
}

/** "R$ 1.297,90" → 129790 · 97 → 9700 · "97.5" → 9750 */
export function parseMoneyToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  let s = String(value).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // formato BR
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Chave de idempotência do evento. Reenvios da mesma notificação geram a
 * mesma chave; eventos diferentes da mesma venda (PIX gerado → aprovado →
 * reembolsado) geram chaves diferentes.
 */
export function kirvanoEventKey(p: Pick<KirvanoPayload, 'event' | 'sale_id' | 'event_id' | 'status'>): string {
  if (p.event_id) return `id:${p.event_id}`;
  const base = [p.event.toUpperCase(), p.sale_id, (p.status ?? '').toUpperCase()].join('|');
  return 'h:' + createHash('sha256').update(base).digest('hex').slice(0, 40);
}

export interface NormalizedSale {
  event: string;
  intent: SaleIntent;
  saleId: string;
  amountCents: number | null;
  paymentMethod: string | null;
  occurredAt: string | null;
  customer: { name: string; email: string | null; phone: string | null; document: string | null };
  product: { kirvanoProductId: string | null; kirvanoOfferId: string | null; name: string | null };
}

export function normalizeKirvano(p: KirvanoPayload): NormalizedSale {
  const first = p.products[0];
  const email = p.customer.email?.trim().toLowerCase() || null;
  return {
    event: p.event.toUpperCase(),
    intent: eventIntent(p.event),
    saleId: p.sale_id,
    amountCents: parseMoneyToCents(p.total_price ?? first?.price),
    paymentMethod: p.payment_method ?? null,
    occurredAt: p.created_at ?? null,
    customer: {
      name: p.customer.name?.trim() || email || 'Cliente sem nome',
      email,
      phone: normalizePhone(p.customer.phone_number ?? p.customer.phone ?? null),
      document: onlyDigits(p.customer.document) || null,
    },
    product: {
      kirvanoProductId: first?.id ?? null,
      kirvanoOfferId: first?.offer_id ?? null,
      name: first?.name ?? first?.offer_name ?? null,
    },
  };
}
