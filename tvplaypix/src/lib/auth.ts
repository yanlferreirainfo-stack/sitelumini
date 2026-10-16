import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import type { AdminRole, AdminUser } from '@/lib/types';

const RANK: Record<AdminRole, number> = { viewer: 1, operator: 2, admin: 3 };

export function hasRole(user: Pick<AdminUser, 'role'>, min: AdminRole): boolean {
  return RANK[user.role] >= RANK[min];
}

/** Administrador logado e ativo, ou null. Memoizado por requisição. */
export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('admin_users')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!data || !data.active) return null;
  return data as AdminUser;
});

/** Para páginas: redireciona se não houver sessão de administrador válida. */
export async function requireAdminPage(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login?erro=sem-permissao');
  return admin;
}

export class AuthorizationError extends Error {}

/** Para server actions: lança erro se o papel for insuficiente. */
export async function requireRole(min: AdminRole): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new AuthorizationError('Sessão expirada. Entre novamente.');
  if (!hasRole(admin, min)) throw new AuthorizationError('Seu perfil não tem permissão para esta ação.');
  return admin;
}
