import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Job, JobType } from '@/lib/types';

export interface EnqueueOptions {
  idempotencyKey?: string;
  orderId?: string | null;
  runAt?: Date;
  maxAttempts?: number;
}

/**
 * Enfileira um job. Com idempotencyKey, chamar duas vezes devolve o mesmo job
 * (a deduplicação acontece no banco, dentro de public.enqueue_job).
 */
export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<string> {
  const { data, error } = await supabaseAdmin().rpc('enqueue_job', {
    p_type: type,
    p_payload: payload,
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_order_id: opts.orderId ?? null,
    p_run_at: (opts.runAt ?? new Date()).toISOString(),
    p_max_attempts: opts.maxAttempts ?? 5,
  });
  if (error) throw new Error(`Falha ao enfileirar ${type}: ${error.message}`);
  return data as string;
}

export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  const { data, error } = await supabaseAdmin().rpc('claim_jobs', { p_worker: workerId, p_limit: limit });
  if (error) throw new Error(`Falha ao reservar jobs: ${error.message}`);
  return (data ?? []) as Job[];
}

export async function markSucceeded(job: Job): Promise<void> {
  await supabaseAdmin()
    .from('jobs')
    .update({ status: 'succeeded', finished_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null })
    .eq('id', job.id)
    .eq('locked_by', job.locked_by);
}

export async function markRetry(job: Job, error: string, runAt: Date): Promise<void> {
  await supabaseAdmin()
    .from('jobs')
    .update({ status: 'queued', run_at: runAt.toISOString(), locked_at: null, locked_by: null, last_error: error })
    .eq('id', job.id)
    .eq('locked_by', job.locked_by);
}

export async function markDead(job: Job, error: string): Promise<void> {
  await supabaseAdmin()
    .from('jobs')
    .update({ status: 'dead', finished_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: error })
    .eq('id', job.id)
    .eq('locked_by', job.locked_by);
}

/** Devolve à fila, sem consumir tentativa, um job reservado que não deu tempo de rodar. */
export async function release(job: Job): Promise<void> {
  await supabaseAdmin()
    .from('jobs')
    .update({ status: 'queued', attempts: Math.max(0, job.attempts - 1), locked_at: null, locked_by: null })
    .eq('id', job.id)
    .eq('locked_by', job.locked_by);
}
