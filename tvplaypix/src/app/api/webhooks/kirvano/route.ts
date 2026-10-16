import { after, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyKirvanoRequest } from '@/lib/integrations/kirvano/verify';
import { ingestKirvanoPayload } from '@/lib/services/ingest';
import { runWorker } from '@/lib/queue/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Recebe vendas da Kirvano.
 *
 * Fluxo: autentica → valida o mínimo → grava o evento e enfileira o processamento
 * numa única transação (idempotente) → responde 200 rápido → processa a fila em
 * segundo plano (after). O cron de /api/jobs/run cobre o que ficar pendente.
 */
export async function POST(req: Request) {
  const e = env();

  if (!verifyKirvanoRequest(req, e.KIRVANO_WEBHOOK_TOKEN, e.KIRVANO_TOKEN_HEADER)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload too large' }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const result = await ingestKirvanoPayload(payload);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  if (!result.duplicate) {
    after(() => runWorker({ budgetMs: 20_000 }).catch((err) => console.error('[webhook] worker em segundo plano', err)));
  }

  // 200 também para duplicatas: a Kirvano não deve continuar reenviando.
  return NextResponse.json({ received: true, duplicate: result.duplicate, event_id: result.eventId });
}
