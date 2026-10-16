/**
 * Espera antes da próxima tentativa: 30s, 1min, 2min, 4min, 8min… até 1h,
 * com ±20% de variação para não sincronizar retentativas em massa.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = 30_000 * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(base, 3_600_000);
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(capped * jitter);
}

export function isPermanentError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { permanent?: unknown }).permanent === true;
}

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 2000);
}
