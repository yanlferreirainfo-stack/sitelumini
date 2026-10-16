import { describe, expect, it } from 'vitest';
import { nextOrderStatus } from '@/lib/services/order-state';

describe('nextOrderStatus', () => {
  it('fluxo normal', () => {
    expect(nextOrderStatus(null, 'pending')).toBe('pending_payment');
    expect(nextOrderStatus('pending_payment', 'approved')).toBe('paid');
    expect(nextOrderStatus('delivered', 'refunded')).toBe('refunded');
  });

  it('ignora eventos atrasados que fariam o pedido regredir', () => {
    expect(nextOrderStatus('paid', 'pending')).toBe('paid');
    expect(nextOrderStatus('delivered', 'approved')).toBe('delivered');
    expect(nextOrderStatus('delivered', 'canceled')).toBe('delivered');
  });

  it('não reativa pedido reembolsado nem rebaixa chargeback', () => {
    expect(nextOrderStatus('refunded', 'approved')).toBe('refunded');
    expect(nextOrderStatus('chargeback', 'refunded')).toBe('chargeback');
  });
});
