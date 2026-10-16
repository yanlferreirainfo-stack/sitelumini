import { createHash } from 'node:crypto';
import { generatePassword } from '@/lib/crypto';
import {
  PermanentProviderError,
  TransientProviderError,
  type AccessProvider,
  type CreateAccessInput,
  type CreatedAccess,
} from './types';

/**
 * Simulação do Painel Sigma BizzPlay. NÃO chama nenhum serviço externo.
 *
 * - Usuário determinístico a partir da chave de idempotência (repetir = mesmo usuário).
 * - Latência artificial e taxa de falha configurável (SIGMA_MOCK_FAILURE_RATE)
 *   para exercitar retentativas, backoff e a tela de falhas.
 * - Se o nome do cliente contiver "[falha-permanente]", simula um erro definitivo.
 */
export class SigmaMockProvider implements AccessProvider {
  readonly name = 'sigma' as const;
  readonly mode = 'mock' as const;

  constructor(
    private readonly opts: { failureRate?: number; latencyMs?: number; random?: () => number } = {},
  ) {}

  private async latency() {
    const ms = this.opts.latencyMs ?? 250;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  async createAccess(input: CreateAccessInput): Promise<CreatedAccess> {
    await this.latency();

    if (input.customer.name.includes('[falha-permanente]')) {
      throw new PermanentProviderError('Sigma (simulado): pacote recusado para este cliente');
    }
    const rnd = this.opts.random ?? Math.random;
    if (rnd() < (this.opts.failureRate ?? 0)) {
      throw new TransientProviderError('Sigma (simulado): tempo de resposta esgotado');
    }

    const digest = createHash('sha256').update(input.idempotencyKey).digest('hex');
    const username = 'tvp' + (parseInt(digest.slice(0, 10), 16) % 100_000_000).toString().padStart(8, '0');
    const expires = new Date(Date.now() + input.durationDays * 86_400_000);

    return {
      externalId: 'mock_' + digest.slice(0, 16),
      username,
      password: generatePassword(10),
      expiresAt: expires.toISOString(),
    };
  }

  async revokeAccess(): Promise<void> {
    await this.latency();
  }
}
