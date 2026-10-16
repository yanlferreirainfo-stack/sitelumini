# TV PlayPix — Painel administrativo

Sistema que recebe vendas da **Kirvano** por webhook, cria clientes e pedidos, gera o
acesso individual no **Painel Sigma BizzPlay** e entrega usuário/senha por **WhatsApp
Cloud API** e **e-mail** — com fila de processamento, retentativas, histórico de ações e
painel administrativo.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS)

> ⚠️ Nesta versão **Sigma, WhatsApp e e-mail rodam em modo simulado**. Nenhuma
> integração real é chamada até as credenciais e a documentação oficial serem
> configuradas. Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Funcionalidades

- **Webhook Kirvano** autenticado por token, idempotente (reenvios são descartados) e
  com o payload bruto guardado para auditoria e reprocessamento.
- **Fila de jobs no Postgres** com reserva concorrente segura, backoff exponencial,
  distinção entre erro transitório e permanente, e fila de "esgotados" para ação manual.
- **Pedidos** com máquina de estados (aguardando pagamento → pago → gerando acesso →
  acesso gerado → entregue; reembolso/chargeback revogam o acesso).
- **Acessos** com senha cifrada (AES-256-GCM); revelar a senha exige permissão e fica
  registrado.
- **Entregas** por WhatsApp (template) e e-mail (HTML), com reenvio manual.
- **Histórico imutável** de tudo: webhooks, jobs, entregas, logins e ações dos usuários.
- **Painel**: indicadores, pedidos, clientes, fila, webhooks, produtos (mapeamento
  Kirvano → Sigma), histórico e status das integrações. Responsivo.
- **Perfis**: `admin`, `operator`, `viewer`.
- **Simulador de vendas** no painel (só com `ALLOW_TEST_TOOLS=true`).

## Como rodar

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Aplique a migração: SQL Editor → cole `supabase/migrations/20261016000001_init.sql`
   (ou `supabase link && supabase db push` com a CLI).
3. Desative o cadastro público (Authentication → Providers → Email → *Allow new users to sign up*: off).
4. Crie seu usuário (Authentication → Users → Add user) e rode `supabase/seed-admin.sql`
   com o seu e-mail.

### 2. Aplicação
```bash
cd tvplaypix
npm install
cp .env.example .env.local
npm run secrets          # gera CRON_SECRET, CREDENTIALS_ENCRYPTION_KEY e KIRVANO_WEBHOOK_TOKEN
# preencha .env.local com as chaves do Supabase e os segredos gerados
npm run dev              # http://localhost:3000
npm run worker           # (outro terminal) processa a fila a cada 5 s
```

### 3. Testar o fluxo
- Painel → **Webhooks** → *Simular venda da Kirvano*, ou
- `npm run webhook:test` (venda nova) · `npm run webhook:test -- --sale=SIM-1` duas vezes
  (idempotência) · `npm run webhook:test -- --event=SALE_REFUNDED --sale=SIM-1` (revogação).
- Falhas: `SIGMA_MOCK_FAILURE_RATE=0.5` (transitórias) ou cliente com
  `[falha-permanente]` no nome.

### Verificações
```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Deploy (Vercel)

1. Importe o repositório com **Root Directory = `tvplaypix`**.
2. Configure as variáveis do `.env.example` (com `ALLOW_TEST_TOOLS=false`).
3. `vercel.json` agenda `/api/jobs/run` a cada minuto (o Vercel envia o `CRON_SECRET`).
   Cron por minuto exige plano Pro; alternativa: `pg_cron` + `pg_net` no Supabase ou
   qualquer agendador chamando a rota com `Authorization: Bearer <CRON_SECRET>`.
4. Na Kirvano, cadastre o webhook `https://SEU-DOMINIO/api/webhooks/kirvano` com o
   token `KIRVANO_WEBHOOK_TOKEN`.

## Endpoints

| Rota | Uso | Proteção |
|---|---|---|
| `POST /api/webhooks/kirvano` | vendas da Kirvano | token |
| `GET/POST /api/jobs/run` | processa a fila | `Bearer CRON_SECRET` |
| `GET /api/health` | monitoramento | pública, sem dados |
| `/admin/*` | painel | sessão + perfil |
