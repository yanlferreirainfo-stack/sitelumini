-- =============================================================================
-- Primeiro administrador
--
-- 1. No Supabase: Authentication → Users → "Add user" → "Create new user"
--    (e-mail + senha forte, marque "Auto Confirm User").
-- 2. Desative cadastro público: Authentication → Providers → Email →
--    desligue "Allow new users to sign up".
-- 3. Rode este SQL no SQL Editor trocando o e-mail:
-- =============================================================================
insert into public.admin_users (id, email, full_name, role)
select id, email, 'Administrador', 'admin'
from auth.users
where email = 'voce@seudominio.com.br'
on conflict (id) do update set role = 'admin', active = true;

-- Outros perfis:
--   operator → opera pedidos (reprocessar, reenviar, ver senha), sem configurar produtos
--   viewer   → somente leitura
-- Para bloquear alguém: update public.admin_users set active = false where email = '...';
