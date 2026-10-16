import type { SaleIntent } from '@/lib/integrations/kirvano/parse';
import type { OrderStatus } from '@/lib/types';

const AFTER_PAYMENT: OrderStatus[] = ['paid', 'provisioning', 'provisioned', 'delivered', 'failed'];

/**
 * Próximo status do pedido dado o evento recebido. Webhooks podem chegar fora
 * de ordem (ex.: "PIX gerado" depois de "aprovado"), então só aceitamos
 * transições que fazem sentido — nunca "voltamos" um pedido pago a pendente,
 * e um pedido reembolsado não é reativado por um evento atrasado.
 */
export function nextOrderStatus(current: OrderStatus | null, intent: SaleIntent): OrderStatus | null {
  switch (intent) {
    case 'pending':
      return current === null ? 'pending_payment' : current;
    case 'approved':
      if (current === null || current === 'pending_payment' || current === 'canceled') return 'paid';
      return current;
    case 'refunded':
      if (current === 'chargeback') return current;
      return 'refunded';
    case 'chargeback':
      return 'chargeback';
    case 'canceled':
      if (current === null || current === 'pending_payment') return 'canceled';
      return current;
    case 'ignore':
      return current;
  }
}

export function isPaidStatus(s: OrderStatus): boolean {
  return AFTER_PAYMENT.includes(s);
}
