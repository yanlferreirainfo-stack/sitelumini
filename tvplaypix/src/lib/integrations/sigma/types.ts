/**
 * Contrato que qualquer provedor de acessos precisa cumprir. O restante do
 * sistema (fila, painel, entregas) só conhece esta interface — quando chegar a
 * documentação oficial do Painel Sigma BizzPlay, basta implementar
 * `SigmaLiveProvider` sem mexer no resto.
 */
export interface CreateAccessInput {
  /** Repetir a chamada com a mesma chave não pode criar um segundo acesso. */
  idempotencyKey: string;
  customer: { name: string; email: string | null; phone: string | null };
  packageId: string | null;
  durationDays: number;
  maxConnections: number;
}

export interface CreatedAccess {
  externalId: string;
  username: string;
  password: string;
  expiresAt: string; // ISO
}

export interface AccessProvider {
  readonly name: 'sigma';
  readonly mode: 'mock' | 'live';
  createAccess(input: CreateAccessInput): Promise<CreatedAccess>;
  revokeAccess(input: { externalId: string; username: string }): Promise<void>;
}

/** Erros que não adianta repetir (dados inválidos, pacote inexistente…). */
export class PermanentProviderError extends Error {
  readonly permanent = true;
}

/** Erros transitórios (timeout, 5xx, limite de taxa) — a fila tenta de novo. */
export class TransientProviderError extends Error {
  readonly permanent = false;
}
