import 'server-only';
import { env } from '@/lib/env';
import { whatsappConfigIssues } from './whatsapp';
import { emailConfigIssues } from './email';
import type { IntegrationMode } from '@/lib/types';

export interface IntegrationStatus {
  key: string;
  name: string;
  mode: IntegrationMode;
  issues: string[];
  notes: string[];
}

/** Resumo das integrações para o painel. Nunca devolve valores de segredos. */
export function integrationStatuses(): IntegrationStatus[] {
  const e = env();
  return [
    {
      key: 'kirvano',
      name: 'Kirvano (webhook de vendas)',
      mode: 'live',
      issues: [],
      notes: [
        `Endpoint: ${e.APP_URL}/api/webhooks/kirvano`,
        `Token aceito no cabeçalho "${e.KIRVANO_TOKEN_HEADER}", em Authorization: Bearer ou em ?token=.`,
        'Confirme o formato do payload com um evento de teste real antes de vender.',
      ],
    },
    {
      key: 'sigma',
      name: 'Painel Sigma BizzPlay (geração de acessos)',
      mode: e.SIGMA_MODE,
      issues: e.SIGMA_MODE === 'live' ? ['Integração real ainda não implementada — aguardando documentação oficial.'] : [],
      notes: [
        'Modo simulado: gera usuário/senha localmente, sem chamar o Sigma.',
        `Taxa de falha simulada: ${Math.round(e.SIGMA_MOCK_FAILURE_RATE * 100)}%.`,
      ],
    },
    {
      key: 'whatsapp',
      name: 'WhatsApp Cloud API',
      mode: e.WHATSAPP_MODE,
      issues: whatsappConfigIssues().map((v) => `Falta ${v}`),
      notes: [
        e.WHATSAPP_TEMPLATE_NAME ? `Template: ${e.WHATSAPP_TEMPLATE_NAME} (${e.WHATSAPP_TEMPLATE_LANG})` : 'Template ainda não definido.',
        'Mensagens iniciadas pela empresa exigem template aprovado pela Meta.',
      ],
    },
    {
      key: 'email',
      name: 'E-mail (Resend)',
      mode: e.EMAIL_MODE,
      issues: emailConfigIssues().map((v) => `Falta ${v}`),
      notes: [e.EMAIL_FROM ? `Remetente: ${e.EMAIL_FROM}` : 'Remetente ainda não definido.', 'O domínio do remetente precisa estar verificado (SPF/DKIM).'],
    },
  ];
}
