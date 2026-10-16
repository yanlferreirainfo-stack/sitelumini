'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type LoginState = { error: string | null };

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  next: z.string().optional(),
});

/** Só aceita redirecionar para dentro do painel (evita open redirect). */
function safeNext(next: string | undefined): string {
  return next && /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : '/admin';
}

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  // Mensagem genérica: não revelamos se o e-mail existe.
  const invalid = { error: 'E-mail ou senha inválidos.' };
  if (!parsed.success) return invalid;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error || !data.user) return invalid;

  const { data: admin } = await supabaseAdmin().from('admin_users').select('active').eq('id', data.user.id).maybeSingle();
  if (!admin?.active) {
    await supabase.auth.signOut();
    return { error: 'Seu usuário não tem acesso ao painel. Fale com um administrador.' };
  }

  await supabaseAdmin().from('audit_logs').insert({ actor_type: 'user', actor_id: data.user.id, actor_email: data.user.email, action: 'auth.login' });
  redirect(safeNext(parsed.data.next));
}
