#!/usr/bin/env node
/**
 * Envia um webhook falso no formato da Kirvano para o ambiente local.
 *
 *   npm run webhook:test                     # venda aprovada nova
 *   npm run webhook:test -- --sale=SIM-123   # mesmo ID: testa idempotência
 *   npm run webhook:test -- --event=SALE_REFUNDED --sale=SIM-123
 */
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const event = args.event ?? 'SALE_APPROVED';
const saleId = args.sale ?? `SIM-${Date.now()}`;
const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/api/webhooks/kirvano`;

const payload = {
  event,
  sale_id: saleId,
  checkout_id: `CHK-${saleId}`,
  status: event === 'SALE_APPROVED' ? 'APPROVED' : event,
  payment_method: 'PIX',
  total_price: 'R$ 29,90',
  created_at: new Date().toISOString(),
  customer: {
    name: args.name ?? 'Cliente de Teste',
    email: args.email ?? 'teste@example.com',
    document: args.doc ?? null,
    phone_number: args.phone ?? '5511999990000',
  },
  products: [{ id: 'PROD-MENSAL', name: 'TV PlayPix Mensal', offer_id: 'OF-1', price: 'R$ 29,90' }],
};

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    [process.env.KIRVANO_TOKEN_HEADER ?? 'x-kirvano-token']: process.env.KIRVANO_WEBHOOK_TOKEN ?? '',
  },
  body: JSON.stringify(payload),
});
console.log(res.status, await res.text());
