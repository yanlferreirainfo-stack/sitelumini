import { describe, expect, it } from 'vitest';
import { SigmaMockProvider } from '@/lib/integrations/sigma/mock';

const input = {
  idempotencyKey: 'order:1',
  customer: { name: 'Ana', email: 'a@x.com', phone: null },
  packageId: null,
  durationDays: 30,
  maxConnections: 1,
};

describe('SigmaMockProvider', () => {
  it('usuário determinístico pela chave de idempotência', async () => {
    const p = new SigmaMockProvider({ latencyMs: 0 });
    const a = await p.createAccess(input);
    const b = await p.createAccess(input);
    expect(a.username).toBe(b.username);
    expect(a.externalId).toBe(b.externalId);
    expect(a.username).toMatch(/^tvp\d{8}$/);
    expect(a.password).toHaveLength(10);
    expect(new Date(a.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('simula falha transitória e permanente', async () => {
    const failing = new SigmaMockProvider({ latencyMs: 0, failureRate: 1, random: () => 0 });
    await expect(failing.createAccess(input)).rejects.toMatchObject({ permanent: false });
    const p = new SigmaMockProvider({ latencyMs: 0 });
    await expect(p.createAccess({ ...input, customer: { ...input.customer, name: 'X [falha-permanente]' } })).rejects.toMatchObject({ permanent: true });
  });
});
