import 'server-only';
import { env } from '@/lib/env';
import { maskSecret, whatsappTemplateParams, type AccessMessageData } from '@/lib/delivery/messages';
import { PermanentProviderError, TransientProviderError } from '@/lib/integrations/sigma/types';
import type { IntegrationMode } from '@/lib/types';

export interface SendResult {
  mode: IntegrationMode;
  messageId: string | null;
  skipped?: boolean;
}

export function whatsappConfigIssues(): string[] {
  const e = env();
  if (e.WHATSAPP_MODE !== 'live') return [];
  const missing: string[] = [];
  if (!e.WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!e.WHATSAPP_ACCESS_TOKEN) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!e.WHATSAPP_TEMPLATE_NAME) missing.push('WHATSAPP_TEMPLATE_NAME');
  return missing;
}

/**
 * Envia os dados de acesso por WhatsApp Cloud API (template aprovado).
 * Mensagens iniciadas pela empresa exigem template — texto livre só funciona
 * dentro da janela de 24h após o cliente escrever.
 */
export async function sendAccessWhatsApp(to: string, data: AccessMessageData): Promise<SendResult> {
  const e = env();
  const params = whatsappTemplateParams(data);

  if (e.WHATSAPP_MODE === 'disabled') return { mode: 'disabled', messageId: null, skipped: true };

  if (e.WHATSAPP_MODE === 'mock') {
    console.info('[whatsapp:mock] para', to, 'params', [params[0], params[1], maskSecret(params[2] ?? ''), params[3]]);
    return { mode: 'mock', messageId: `mock_wa_${Date.now()}` };
  }

  const missing = whatsappConfigIssues();
  if (missing.length) throw new PermanentProviderError(`WhatsApp sem configuração: ${missing.join(', ')}`);

  const res = await fetch(`https://graph.facebook.com/${e.WHATSAPP_API_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: e.WHATSAPP_TEMPLATE_NAME,
        language: { code: e.WHATSAPP_TEMPLATE_LANG },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) {
    const msg = `WhatsApp ${res.status}: ${body.error?.message ?? 'erro desconhecido'}`;
    // 4xx (exceto 429) = problema nos dados/configuração; repetir não resolve.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentProviderError(msg);
    throw new TransientProviderError(msg);
  }
  return { mode: 'live', messageId: body.messages?.[0]?.id ?? null };
}
