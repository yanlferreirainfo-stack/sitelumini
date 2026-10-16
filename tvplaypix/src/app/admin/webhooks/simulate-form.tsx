'use client';

import { useActionState } from 'react';
import { simulateKirvanoSale, type ActionResult } from '../actions';
import { buttonClass, Field, inputClass } from '@/components/ui';

export function SimulateSaleForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(simulateKirvanoSale, null);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Nome do cliente" hint='Inclua "[falha-permanente]" para simular recusa do Sigma.'>
        <input name="name" required defaultValue="Cliente Teste" className={inputClass} />
      </Field>
      <Field label="E-mail">
        <input name="email" type="email" required defaultValue="cliente.teste@example.com" className={inputClass} />
      </Field>
      <Field label="WhatsApp">
        <input name="phone" defaultValue="(11) 99999-0000" className={inputClass} />
      </Field>
      <Field label="Evento">
        <select name="event" className={inputClass} defaultValue="SALE_APPROVED">
          <option value="SALE_APPROVED">Venda aprovada</option>
          <option value="PIX_GENERATED">PIX gerado</option>
          <option value="SALE_REFUNDED">Reembolso</option>
          <option value="SALE_CHARGEBACK">Chargeback</option>
        </select>
      </Field>
      <Field label="ID do produto (Kirvano)">
        <input name="product_id" required defaultValue="PROD-MENSAL" className={inputClass} />
      </Field>
      <Field label="Nome do produto">
        <input name="product_name" required defaultValue="TV PlayPix Mensal" className={inputClass} />
      </Field>
      <Field label="Valor">
        <input name="price" required defaultValue="R$ 29,90" className={inputClass} />
      </Field>
      <Field label="ID da venda" hint="Repita um ID existente para testar reembolso ou idempotência.">
        <input name="sale_id" placeholder="gerado automaticamente" className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={pending} className={buttonClass('primary')}>
          {pending ? 'Processando…' : 'Enviar evento simulado'}
        </button>
        {state && <span className={state.ok ? 'text-sm text-emerald-700' : 'text-sm text-rose-700'}>{state.message}</span>}
      </div>
    </form>
  );
}
