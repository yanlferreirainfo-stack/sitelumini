# Arquitetura — TV PlayPix

## Visão geral

```
 Kirvano ──POST──▶ /api/webhooks/kirvano ──┐
                    (token, 256 KB, JSON)  │ ingest_webhook_event()  ← 1 transação:
                                           │   grava evento (único por provider+event_key)
                                           ▼   + enfileira process_webhook
                                     ┌──────────┐
 Vercel Cron (1 min) ─▶ /api/jobs/run│  jobs    │◀── ações do painel (reprocessar, reenviar…)
 after() do webhook  ─▶ runWorker()  └────┬─────┘
                                          │ claim_jobs(): FOR UPDATE SKIP LOCKED
                                          ▼
   process_webhook ──▶ cliente + pedido (máquina de estados) ──▶ provision_access
   provision_access ─▶ AccessProvider (Sigma: mock | live)    ──▶ deliver ×2
   deliver ─────────▶ WhatsApp Cloud API / Resend (disabled | mock | live)
   revoke_access ───▶ AccessProvider.revokeAccess  (reembolso, chargeback, manual)

 Painel (/admin, Next.js App Router) ── leitura com sessão do usuário (RLS)
                                     └─ escrita só via server actions (service role + checagem de papel)
 Tudo ──▶ audit_logs (append-only)
```

## Estrutura de pastas

```
supabase/migrations/   esquema, funções de fila/ingestão, RLS
supabase/seed-admin.sql  primeiro administrador
src/middleware.ts      renova sessão e barra /admin sem login
src/app/api/           webhooks/kirvano · jobs/run · health
src/app/admin/         páginas do painel + actions.ts (server actions)
src/app/login/         login (e-mail/senha do Supabase Auth)
src/lib/
  env.ts               validação das variáveis de ambiente (zod)
  auth.ts              sessão, papéis (admin > operator > viewer)
  audit.ts             registro no histórico
  crypto.ts            AES-256-GCM das senhas, comparação em tempo constante
  queue/               enqueue/claim, worker, backoff
  services/            handlers dos jobs, máquina de estados, ingestão
  integrations/        kirvano · sigma (mock) · whatsapp · email · status
  delivery/messages.ts textos do WhatsApp/e-mail
tests/                 testes unitários (vitest)
scripts/               worker local, webhook de teste, gerador de segredos
```

## Decisões principais

### Idempotência (em camadas)
1. **Webhook**: `webhook_events (provider, event_key)` é único. A chave é o `event_id`
   da Kirvano, se existir, ou `sha256(evento|sale_id|status)`. Reenvio → `200 duplicate:true`,
   nada é reprocessado.
2. **Jobs**: `jobs.idempotency_key` é único (`provision:<pedido>`, `deliver:<pedido>:<canal>`…).
   Enfileirar duas vezes devolve o mesmo job. Ações manuais usam chave nova (`…:manual:<uuid>`).
3. **Pedido**: `orders.kirvano_sale_id` é único; a máquina de estados (`order-state.ts`)
   ignora eventos fora de ordem (ex.: "PIX gerado" depois de "aprovado").
4. **Acesso**: `access_credentials.order_id` é único — no máximo um acesso por pedido.
   O provedor recebe `idempotencyKey = order:<id>`; **a API real do Sigma precisa
   respeitar essa chave (ou permitir buscar o acesso pelo usuário)** para cobrir o caso
   "Sigma criou, mas caímos antes de gravar".
5. **Entregas**: `deliveries (order_id, channel)` é único; uma entrega `sent` não é
   reenviada, exceto por ação manual (`force`). O e-mail envia `Idempotency-Key` ao Resend.

### Fila
- Tabela `jobs` no próprio Postgres (sem infraestrutura extra).
- `claim_jobs` usa `FOR UPDATE SKIP LOCKED`: vários workers em paralelo nunca pegam o mesmo job.
- Job travado em `running` há mais de 10 min (worker morreu) volta a ser elegível.
- Erro **transitório** (timeout, 5xx, 429): nova tentativa com backoff exponencial
  (30 s → 1 min → 2 min … até 1 h, ±20%). Padrão: 5 tentativas.
- Erro **permanente** (dados inválidos, 4xx, configuração faltando) ou tentativas
  esgotadas: job vira `dead`, pedido vai para `failed` com `last_error`, e aparece em
  "Precisam de atenção" no painel. O operador corrige e clica "Tentar de novo".
- Execução: `after()` logo após o webhook (latência baixa) + cron a cada minuto (garantia).
  Cada execução busca lotes até esvaziar a fila ou acabar o tempo (45 s).

### Segurança
- **Sem cadastro público**: só quem está em `admin_users` com `active = true` entra.
- Middleware usa `auth.getUser()` (valida o token no Supabase, não só o cookie).
- Papéis checados em **toda** server action (`requireRole`), não só na interface.
- **RLS**: o navegador só lê, e só se for admin ativo. Nenhuma escrita direta.
  `access_credentials` não tem policy de leitura — senhas só via servidor.
- Senhas dos acessos cifradas com AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`); revelar
  exige perfil operador e grava `credential.revealed` no histórico. Logs mascaram senhas.
- Webhook: token comparado em tempo constante, limite de 256 KB, JSON validado com zod.
- `/api/jobs/run` exige `Authorization: Bearer CRON_SECRET`.
- Funções `claim_jobs`, `enqueue_job` e `ingest_webhook_event` só executam com service role.
- `audit_logs` é append-only (trigger bloqueia UPDATE/DELETE).
- Cabeçalhos: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy; `/admin` sem cache.
- Login com mensagem genérica (não revela se o e-mail existe) e redirecionamento só
  para `/admin/*` (sem open redirect).

### Integrações sem credenciais = simuladas
| Integração | Padrão | Para ativar |
|---|---|---|
| Kirvano | ativo (só recebe) | configurar URL + token no painel da Kirvano e **validar o formato do payload** |
| Sigma BizzPlay | `mock` | implementar `SigmaLiveProvider` com a documentação oficial; `SIGMA_MODE=live` hoje **recusa** provisionar |
| WhatsApp Cloud API | `mock` | número, token permanente, template aprovado; `WHATSAPP_MODE=live` |
| E-mail (Resend) | `mock` | domínio verificado, API key; `EMAIL_MODE=live` |

Em `live` com variáveis faltando, o job falha com erro permanente claro e o painel
mostra "Configuração incompleta" em Integrações.

## Pendências para produção

- [ ] **Kirvano**: enviar um evento de teste real e conferir nomes de campos em
      `src/lib/integrations/kirvano/parse.ts` (o payload bruto fica em `webhook_events`,
      então dá para reprocessar depois de ajustar). Confirmar como o token é enviado e
      restringir `verify.ts` a essa forma.
- [ ] **Sigma**: documentação oficial → implementar `SigmaLiveProvider`
      (`src/lib/integrations/sigma/index.ts`): criar, renovar, revogar, idempotência,
      códigos de erro (mapear para `PermanentProviderError`/`TransientProviderError`).
      Preencher "Pacote Sigma" em Produtos.
- [ ] **WhatsApp**: aprovar template com 4 variáveis (nome, usuário, senha, validade) —
      ver `whatsappTemplateParams` em `delivery/messages.ts`.
- [ ] **Renovações** (`SUBSCRIPTION_RENEWED`): hoje tratadas como nova aprovação. Se a
      Kirvano reutilizar o `sale_id`, será preciso um job `renew_access`.
- [ ] Rate limiting no webhook (ex.: Vercel Firewall / Upstash) se houver abuso.
- [ ] CSP com nonce (remover `'unsafe-inline'` de scripts).
- [ ] Alertas (e-mail/Slack) quando um job ficar `dead`.
- [ ] Gerar tipos com `supabase gen types typescript` e tipar o cliente.
