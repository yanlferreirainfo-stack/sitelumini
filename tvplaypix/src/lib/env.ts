import 'server-only';
import { z } from 'zod';

/**
 * Variáveis de ambiente do servidor, validadas na primeira leitura.
 * Nada aqui vai para o navegador (exceto as NEXT_PUBLIC_*, lidas em outro lugar).
 *
 * Integrações externas têm um "modo":
 *   - disabled: não envia nada (o job registra a entrega como "skipped")
 *   - mock:     simula a chamada (padrão até recebermos credenciais/documentação)
 *   - live:     chama a API real — só funciona com todas as credenciais preenchidas
 */
const mode = z.enum(['disabled', 'mock', 'live']);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  APP_URL: z.string().url().default('http://localhost:3000'),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET precisa de pelo menos 32 caracteres'),
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'CREDENTIALS_ENCRYPTION_KEY deve ter 32 bytes em base64'),
  ALLOW_TEST_TOOLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Kirvano — o token configurado no webhook do painel da Kirvano.
  KIRVANO_WEBHOOK_TOKEN: z.string().min(16, 'KIRVANO_WEBHOOK_TOKEN precisa de pelo menos 16 caracteres'),
  KIRVANO_TOKEN_HEADER: z.string().default('x-kirvano-token'),

  // Sigma BizzPlay — só "mock" até chegar a documentação oficial.
  SIGMA_MODE: z.enum(['mock', 'live']).default('mock'),
  SIGMA_API_URL: z.string().url().optional(),
  SIGMA_API_KEY: z.string().optional(),
  SIGMA_MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  ACCESS_SERVER_URL: z.string().optional(),

  // WhatsApp Cloud API (Meta)
  WHATSAPP_MODE: mode.default('mock'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('pt_BR'),

  // E-mail (Resend)
  EMAIL_MODE: mode.default('mock'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),

  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}\nVeja .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
