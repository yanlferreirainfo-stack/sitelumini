import 'server-only';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { audit, systemActor } from '@/lib/audit';
import { backoffMs, errorMessage, isPermanentError } from './backoff';
import { claimJobs, markDead, markRetry, markSucceeded, release } from './jobs';
import { handlers, onJobDead } from '@/lib/services/handlers';
import type { Job } from '@/lib/types';

export interface WorkerResult {
  worker: string;
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
  released: number;
}

/**
 * Processa um lote da fila. Pode ser chamado em paralelo por várias instâncias:
 * a reserva usa FOR UPDATE SKIP LOCKED, então cada job vai para um só worker.
 */
export async function runWorker(opts: { budgetMs?: number; limit?: number } = {}): Promise<WorkerResult> {
  const worker = `w_${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const limit = opts.limit ?? env().WORKER_BATCH_SIZE;
  const result: WorkerResult = { worker, claimed: 0, succeeded: 0, retried: 0, dead: 0, released: 0 };

  // Continua buscando lotes enquanto houver tempo: assim a cadeia
  // webhook → acesso → entregas termina na mesma execução.
  while (Date.now() < deadline) {
    const jobs = await claimJobs(worker, limit);
    if (jobs.length === 0) break;
    result.claimed += jobs.length;

    for (const job of jobs) {
      if (Date.now() > deadline) {
        await release(job);
        result.released++;
        continue;
      }
      const outcome = await runOne(job);
      result[outcome]++;
    }
  }
  return result;
}

async function runOne(job: Job): Promise<'succeeded' | 'retried' | 'dead'> {
  const handler = handlers[job.type];
  try {
    if (!handler) throw Object.assign(new Error(`Tipo de job desconhecido: ${job.type}`), { permanent: true });
    await handler(job);
    await markSucceeded(job);
    return 'succeeded';
  } catch (err) {
    const message = errorMessage(err);
    const exhausted = job.attempts >= job.max_attempts;

    if (isPermanentError(err) || exhausted) {
      await markDead(job, message);
      await onJobDead(job, message).catch((e) => console.error('[worker] onJobDead falhou', e));
      await audit(systemActor, {
        action: 'job.dead',
        entityType: 'job',
        entityId: job.id,
        orderId: job.order_id,
        metadata: { type: job.type, attempts: job.attempts, error: message, permanent: isPermanentError(err) },
      });
      return 'dead';
    }

    const wait = backoffMs(job.attempts);
    await markRetry(job, message, new Date(Date.now() + wait));
    await audit(systemActor, {
      action: 'job.retry_scheduled',
      entityType: 'job',
      entityId: job.id,
      orderId: job.order_id,
      metadata: { type: job.type, attempt: job.attempts, next_in_seconds: Math.round(wait / 1000), error: message },
    });
    return 'retried';
  }
}
