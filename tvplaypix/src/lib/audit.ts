import 'server-only';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminUser } from '@/lib/types';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
}

type Actor = { type: 'system' } | { type: 'webhook' } | { type: 'user'; user: AdminUser };

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
  } catch {
    return null; // fora de uma requisição (worker)
  }
}

/**
 * Registra uma ação no histórico. Nunca derruba o fluxo principal: se a gravação
 * falhar, o erro vai para o log do servidor.
 */
export async function audit(actor: Actor, entry: AuditEntry): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('audit_logs')
    .insert({
      actor_type: actor.type,
      actor_id: actor.type === 'user' ? actor.user.id : null,
      actor_email: actor.type === 'user' ? actor.user.email : null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      order_id: entry.orderId ?? null,
      metadata: entry.metadata ?? {},
      ip: actor.type === 'user' ? await clientIp() : null,
    });
  if (error) console.error('[audit] falha ao registrar', entry.action, error.message);
}

export const systemActor: Actor = { type: 'system' };
export const webhookActor: Actor = { type: 'webhook' };
export const userActor = (user: AdminUser): Actor => ({ type: 'user', user });
