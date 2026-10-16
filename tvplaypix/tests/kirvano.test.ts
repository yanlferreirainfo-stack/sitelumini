import { describe, expect, it } from 'vitest';
import { eventIntent, kirvanoEventKey, kirvanoPayloadSchema, normalizeKirvano, parseMoneyToCents } from '@/lib/integrations/kirvano/parse';

const sample = {
  event: 'SALE_APPROVED',
  sale_id: 'ABC123',
  status: 'APPROVED',
  payment_method: 'PIX',
  total_price: 'R$ 1.297,90',
  customer: { name: ' Maria Silva ', email: 'Maria@Example.com', document: '123.456.789-09', phone_number: '(11) 98888-7777' },
  products: [{ id: 99, name: 'Plano Trimestral', offer_id: 'OF1' }],
  extra_field: 'mantido',
};

describe('Kirvano', () => {
  it('normaliza cliente, valor e produto', () => {
    const p = kirvanoPayloadSchema.parse(sample);
    const n = normalizeKirvano(p);
    expect(n.intent).toBe('approved');
    expect(n.amountCents).toBe(129790);
    expect(n.customer).toEqual({ name: 'Maria Silva', email: 'maria@example.com', phone: '5511988887777', document: '12345678909' });
    expect(n.product).toEqual({ kirvanoProductId: '99', kirvanoOfferId: 'OF1', name: 'Plano Trimestral' });
  });

  it('mantém campos desconhecidos (passthrough)', () => {
    expect(kirvanoPayloadSchema.parse(sample)).toHaveProperty('extra_field', 'mantido');
  });

  it('gera a mesma chave para reenvios e chaves diferentes por evento', () => {
    const a = kirvanoEventKey({ event: 'SALE_APPROVED', sale_id: 'X', status: 'APPROVED' });
    const b = kirvanoEventKey({ event: 'sale_approved', sale_id: 'X', status: 'approved' });
    const c = kirvanoEventKey({ event: 'SALE_REFUNDED', sale_id: 'X', status: 'REFUNDED' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(kirvanoEventKey({ event: 'SALE_APPROVED', sale_id: 'X', event_id: 'evt_1' })).toBe('id:evt_1');
  });

  it('classifica eventos', () => {
    expect(eventIntent('PIX_GENERATED')).toBe('pending');
    expect(eventIntent('SALE_CHARGEBACK')).toBe('chargeback');
    expect(eventIntent('ALGO_NOVO')).toBe('ignore');
  });

  it('converte valores monetários', () => {
    expect(parseMoneyToCents('R$ 29,90')).toBe(2990);
    expect(parseMoneyToCents(97)).toBe(9700);
    expect(parseMoneyToCents('97.5')).toBe(9750);
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
  });

  it('rejeita payload sem sale_id', () => {
    expect(kirvanoPayloadSchema.safeParse({ event: 'SALE_APPROVED', customer: {} }).success).toBe(false);
  });
});
