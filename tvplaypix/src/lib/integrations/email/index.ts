import 'server-only';
import { env } from '@/lib/env';
import { accessEmail, maskSecret, type AccessMessageData } from '@/lib/delivery/messages';
import { PermanentProviderError, TransientProviderError } from '@/lib/integrations/sigma/types';
import type { SendResult } from '@/lib/integrations/whatsapp';

export function emailConfigIssues(): string[] {
  const e = env();
  if (e.EMAIL_MODE !== 'live') return [];
  const missing: string[] = [];
  if (!e.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!e.EMAIL_FROM) missing.push('EMAIL_FROM');
  return missing;
}

/** Envia os dados de acesso por e-mail (Resend). */
export async function sendAccessEmail(to: string, data: AccessMessageData, idempotencyKey: string): Promise<SendResult> {
  const e = env();
  const mail = accessEmail(data);

  if (e.EMAIL_MODE === 'disabled') return { mode: 'disabled', messageId: null, skipped: true };

  if (e.EMAIL_MODE === 'mock') {
    console.info('[email:mock] para', to, '|', mail.subject, '| usuário', data.username, 'senha', maskSecret(data.password));
    return { mode: 'mock', messageId: `mock_email_${Date.now()}` };
  }

  const missing = emailConfigIssues();
  if (missing.length) throw new PermanentProviderError(`E-mail sem configuração: ${missing.join(', ')}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // Resend descarta reenvios com a mesma chave (24h).
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: e.EMAIL_FROM,
      to: [to],
      reply_to: e.EMAIL_REPLY_TO || undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    const msg = `E-mail ${res.status}: ${body.message ?? 'erro desconhecido'}`;
    if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentProviderError(msg);
    throw new TransientProviderError(msg);
  }
  return { mode: 'live', messageId: body.id ?? null };
}
