#!/usr/bin/env node
/**
 * Worker local: chama /api/jobs/run em loop (a cada 5s). Em produção use o
 * Vercel Cron (vercel.json) ou outro agendador apontando para a mesma rota.
 *
 *   APP_URL=http://localhost:3000 CRON_SECRET=... npm run worker
 */
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/api/jobs/run`;
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('Defina CRON_SECRET (ou crie .env.local).');
  process.exit(1);
}

const interval = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
console.log(`[worker] ${url} a cada ${interval / 1000}s — Ctrl+C para sair`);

for (;;) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.error('[worker]', res.status, body);
    else if (body.claimed) console.log('[worker]', new Date().toLocaleTimeString('pt-BR'), body);
  } catch (err) {
    console.error('[worker] falha ao chamar a API:', err.message);
  }
  await new Promise((r) => setTimeout(r, interval));
}
