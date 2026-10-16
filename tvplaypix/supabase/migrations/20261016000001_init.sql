-- =============================================================================
-- TV PlayPix — esquema inicial
--
-- Princípios:
--   * Toda escrita parte do servidor (service role). O navegador nunca escreve
--     direto nas tabelas: RLS libera apenas LEITURA para administradores ativos.
--   * Webhooks são idempotentes: (provider, event_key) é único.
--   * A fila de jobs usa FOR UPDATE SKIP LOCKED e chaves de idempotência.
--   * audit_logs é append-only (UPDATE/DELETE bloqueados por trigger).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.admin_role as enum ('admin', 'operator', 'viewer');

create type public.order_status as enum (
  'pending_payment',  -- PIX/boleto gerado, aguardando pagamento
  'paid',             -- pagamento aprovado, aguardando provisionamento
  'provisioning',     -- gerando acesso no Sigma
  'provisioned',      -- acesso gerado, aguardando entrega
  'delivered',        -- entregue em pelo menos um canal
  'failed',           -- falha definitiva (exige ação manual)
  'refunded',
  'chargeback',
  'canceled'
);

create type public.webhook_status as enum ('received', 'processed', 'ignored', 'failed');

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead', 'canceled');

create type public.delivery_channel as enum ('whatsapp', 'email');

create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create type public.credential_status as enum ('active', 'suspended', 'revoked');

-- -----------------------------------------------------------------------------
-- Utilitário: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administradores (perfil ligado ao auth.users do Supabase)
-- Não existe cadastro público: o primeiro admin é criado manualmente
-- (ver docs/ARQUITETURA.md, seção "Primeiro acesso").
-- -----------------------------------------------------------------------------
create table public.admin_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        public.admin_role not null default 'viewer',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger admin_users_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

-- Verdadeiro se o usuário logado é um administrador ativo.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and active
  );
$$;

-- -----------------------------------------------------------------------------
-- Produtos: mapeia o produto/oferta da Kirvano para o pacote do Sigma
-- -----------------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  kirvano_product_id  text unique,
  kirvano_offer_id    text,
  sigma_package_id    text,          -- preencher quando a documentação do Sigma chegar
  duration_days       integer not null default 30 check (duration_days > 0),
  max_connections     integer not null default 1 check (max_connections > 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,          -- E.164 sem "+", ex.: 5511999998888
  document    text,          -- CPF/CNPJ só com dígitos
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index customers_email_key on public.customers (lower(email)) where email is not null;
create index customers_phone_idx on public.customers (phone);
create index customers_document_idx on public.customers (document);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Pedidos (1 venda Kirvano = 1 pedido)
-- -----------------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  kirvano_sale_id  text not null unique,
  customer_id      uuid not null references public.customers (id),
  product_id       uuid references public.products (id),
  product_name     text,
  status           public.order_status not null default 'pending_payment',
  amount_cents     integer,
  currency         text not null default 'BRL',
  payment_method   text,
  paid_at          timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Eventos de webhook recebidos (armazenados ANTES de qualquer processamento)
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,                -- 'kirvano'
  event_key     text not null,                -- chave de idempotência
  event_type    text,
  external_id   text,                         -- sale_id
  payload       jsonb not null,
  status        public.webhook_status not null default 'received',
  error         text,
  attempts      integer not null default 0,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  unique (provider, event_key)
);
create index webhook_events_received_idx on public.webhook_events (received_at desc);
create index webhook_events_external_idx on public.webhook_events (provider, external_id);

-- -----------------------------------------------------------------------------
-- Acessos gerados no Sigma (1 por pedido). A senha é cifrada pela aplicação
-- (AES-256-GCM, chave em CREDENTIALS_ENCRYPTION_KEY) — o banco nunca vê o texto puro.
-- -----------------------------------------------------------------------------
create table public.access_credentials (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null unique references public.orders (id),
  customer_id         uuid not null references public.customers (id),
  provider            text not null default 'sigma',
  provider_mode       text not null,          -- 'mock' | 'live'
  external_id         text,
  username            text not null,
  password_encrypted  text not null,
  expires_at          timestamptz,
  status              public.credential_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index access_credentials_customer_idx on public.access_credentials (customer_id);
create trigger access_credentials_updated_at before update on public.access_credentials
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Entregas (WhatsApp / e-mail)
-- -----------------------------------------------------------------------------
create table public.deliveries (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id),
  channel              public.delivery_channel not null,
  recipient            text,
  status               public.delivery_status not null default 'pending',
  provider_mode        text,
  provider_message_id  text,
  error                text,
  attempts             integer not null default 0,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (order_id, channel)
);
create trigger deliveries_updated_at before update on public.deliveries
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Fila de processamento
-- -----------------------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  type             text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           public.job_status not null default 'queued',
  idempotency_key  text unique,
  order_id         uuid references public.orders (id),
  attempts         integer not null default 0,
  max_attempts     integer not null default 5 check (max_attempts > 0),
  run_at           timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index jobs_ready_idx on public.jobs (run_at) where status = 'queued';
create index jobs_status_idx on public.jobs (status, created_at desc);
create index jobs_order_idx on public.jobs (order_id);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- Enfileira um job. Se a chave de idempotência já existir, devolve o job existente
-- (não duplica). Retorna o id do job.
create or replace function public.enqueue_job(
  p_type text,
  p_payload jsonb,
  p_idempotency_key text default null,
  p_order_id uuid default null,
  p_run_at timestamptz default now(),
  p_max_attempts integer default 5
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.jobs (type, payload, idempotency_key, order_id, run_at, max_attempts)
  values (p_type, coalesce(p_payload, '{}'::jsonb), p_idempotency_key, p_order_id, p_run_at, p_max_attempts)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.jobs where idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;

-- Reserva até p_limit jobs prontos para execução. Jobs "running" travados há mais
-- de p_stale_seconds (worker caiu no meio) voltam a ser elegíveis.
create or replace function public.claim_jobs(
  p_worker text,
  p_limit integer default 10,
  p_stale_seconds integer default 600
) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with ready as (
    select j.id from public.jobs j
    where (j.status = 'queued' and j.run_at <= now())
       or (j.status = 'running' and j.locked_at < now() - make_interval(secs => p_stale_seconds))
    order by j.run_at
    limit p_limit
    for update skip locked
  )
  update public.jobs j
     set status = 'running',
         locked_at = now(),
         locked_by = p_worker,
         attempts = j.attempts + 1
    from ready
   where j.id = ready.id
  returning j.*;
end;
$$;

-- Registra o webhook e enfileira seu processamento na MESMA transação.
-- Retorna (event_id, duplicate). duplicate = true quando o evento já existia.
create or replace function public.ingest_webhook_event(
  p_provider text,
  p_event_key text,
  p_event_type text,
  p_external_id text,
  p_payload jsonb
) returns table (event_id uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.webhook_events (provider, event_key, event_type, external_id, payload)
  values (p_provider, p_event_key, p_event_type, p_external_id, p_payload)
  on conflict (provider, event_key) do nothing
  returning id into v_id;

  if v_id is null then
    select w.id into v_id from public.webhook_events w
     where w.provider = p_provider and w.event_key = p_event_key;
    return query select v_id, true;
    return;
  end if;

  perform public.enqueue_job(
    'process_webhook',
    jsonb_build_object('event_id', v_id),
    'process_webhook:' || v_id::text
  );

  return query select v_id, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- Histórico de ações (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_type   text not null check (actor_type in ('user', 'system', 'webhook')),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  order_id     uuid references public.orders (id),
  metadata     jsonb not null default '{}'::jsonb,
  ip           text,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_order_idx on public.audit_logs (order_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs é somente inclusão (append-only)';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- -----------------------------------------------------------------------------
-- Métricas do painel (uma ida ao banco)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales_today',      (select count(*) from orders where paid_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'revenue_today',    (select coalesce(sum(amount_cents), 0) from orders where paid_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'revenue_30d',      (select coalesce(sum(amount_cents), 0) from orders where paid_at >= now() - interval '30 days' and status not in ('refunded', 'chargeback', 'canceled')),
    'orders_pending',   (select count(*) from orders where status in ('paid', 'provisioning', 'provisioned')),
    'orders_failed',    (select count(*) from orders where status = 'failed'),
    'orders_delivered', (select count(*) from orders where status = 'delivered'),
    'jobs_queued',      (select count(*) from jobs where status = 'queued'),
    'jobs_running',     (select count(*) from jobs where status = 'running'),
    'jobs_dead',        (select count(*) from jobs where status = 'dead'),
    'webhooks_failed',  (select count(*) from webhook_events where status = 'failed'),
    'customers',        (select count(*) from customers)
  )
  where public.is_admin() or auth.role() = 'service_role';
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security: administradores ativos LEEM; ninguém escreve pelo cliente.
-- O service role (usado só no servidor) ignora RLS.
-- -----------------------------------------------------------------------------
alter table public.admin_users        enable row level security;
alter table public.products           enable row level security;
alter table public.customers          enable row level security;
alter table public.orders             enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.access_credentials enable row level security;
alter table public.deliveries         enable row level security;
alter table public.jobs               enable row level security;
alter table public.audit_logs         enable row level security;

create policy admin_users_self_read on public.admin_users
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy products_admin_read on public.products
  for select to authenticated using (public.is_admin());
create policy customers_admin_read on public.customers
  for select to authenticated using (public.is_admin());
create policy orders_admin_read on public.orders
  for select to authenticated using (public.is_admin());
create policy webhook_events_admin_read on public.webhook_events
  for select to authenticated using (public.is_admin());
create policy deliveries_admin_read on public.deliveries
  for select to authenticated using (public.is_admin());
create policy jobs_admin_read on public.jobs
  for select to authenticated using (public.is_admin());
create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());
-- access_credentials: sem policy de leitura. Senhas só passam pelo servidor,
-- com checagem de papel e registro em auditoria.

-- Funções de fila/ingestão só podem ser chamadas pelo service role.
revoke execute on function public.enqueue_job(text, jsonb, text, uuid, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.claim_jobs(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.ingest_webhook_event(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.enqueue_job(text, jsonb, text, uuid, timestamptz, integer) to service_role;
grant execute on function public.claim_jobs(text, integer, integer) to service_role;
grant execute on function public.ingest_webhook_event(text, text, text, text, jsonb) to service_role;
grant execute on function public.dashboard_stats() to authenticated, service_role;
