import 'server-only';
import { env } from '@/lib/env';
import { SigmaMockProvider } from './mock';
import { PermanentProviderError, type AccessProvider } from './types';

/**
 * Ponto único de escolha do provedor. Com SIGMA_MODE=live o sistema recusa
 * provisionar (erro definitivo, visível no painel) até a integração real ser
 * implementada a partir da documentação oficial — nada é enviado ao Sigma.
 */
class SigmaLiveProvider implements AccessProvider {
  readonly name = 'sigma' as const;
  readonly mode = 'live' as const;

  async createAccess(): Promise<never> {
    throw new PermanentProviderError(
      'Integração real com o Sigma ainda não implementada: aguardando documentação oficial. Use SIGMA_MODE=mock.',
    );
  }
  async revokeAccess(): Promise<never> {
    throw new PermanentProviderError('Integração real com o Sigma ainda não implementada.');
  }
}

let provider: AccessProvider | null = null;

export function accessProvider(): AccessProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.SIGMA_MODE === 'live' ? new SigmaLiveProvider() : new SigmaMockProvider({ failureRate: e.SIGMA_MOCK_FAILURE_RATE });
  return provider;
}

export * from './types';
