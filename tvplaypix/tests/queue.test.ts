import { describe, expect, it } from 'vitest';
import { backoffMs, isPermanentError } from '@/lib/queue/backoff';
import { PermanentProviderError, TransientProviderError } from '@/lib/integrations/sigma/types';

describe('backoff', () => {
  const noJitter = () => 0.5;
  it('cresce exponencialmente e tem teto de 1h', () => {
    expect(backoffMs(1, noJitter)).toBe(30_000);
    expect(backoffMs(2, noJitter)).toBe(60_000);
    expect(backoffMs(5, noJitter)).toBe(480_000);
    expect(backoffMs(20, noJitter)).toBe(3_600_000);
  });
  it('aplica variação de ±20%', () => {
    expect(backoffMs(1, () => 0)).toBe(24_000);
    expect(backoffMs(1, () => 1)).toBe(36_000);
  });
  it('distingue erros permanentes de transitórios', () => {
    expect(isPermanentError(new PermanentProviderError('x'))).toBe(true);
    expect(isPermanentError(new TransientProviderError('x'))).toBe(false);
    expect(isPermanentError(new Error('x'))).toBe(false);
  });
});
