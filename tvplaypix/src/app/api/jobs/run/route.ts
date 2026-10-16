import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { runWorker } from '@/lib/queue/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Processa a fila. Chamado pelo Vercel Cron (GET, a cada minuto — ver vercel.json),
 * por um agendador externo ou por `npm run worker` em desenvolvimento.
 * Protegido por "Authorization: Bearer <CRON_SECRET>".
 */
async function handle(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  if (!token || !safeEqual(token, env().CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runWorker({ budgetMs: 45_000 });
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
