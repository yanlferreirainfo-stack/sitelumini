import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { ACTION_LABEL, dateTime } from '@/lib/format';
import { pageParam, PAGE_SIZE, range } from '@/lib/query';
import { Badge, buttonClass, Card, Field, FilterBar, inputClass, PageHeader, Pagination, Table, Td } from '@/components/ui';
import type { AuditLog } from '@/lib/types';

export const metadata: Metadata = { title: 'Histórico' };

const ACTORS = { user: 'Usuário', system: 'Sistema', webhook: 'Kirvano' } as const;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const actor = params.actor && params.actor in ACTORS ? params.actor : undefined;
  const action = params.action && params.action in ACTION_LABEL ? params.action : undefined;

  const supabase = await supabaseServer();
  let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(...range(page));
  if (actor) query = query.eq('actor_type', actor);
  if (action) query = query.eq('action', action);
  const { data, count } = await query;

  return (
    <>
      <PageHeader title="Histórico de ações" description="Registro imutável de tudo que acontece no sistema: webhooks, jobs, entregas e ações dos administradores." />
      <Card padded={false}>
        <FilterBar>
          <div className="w-full sm:w-48">
            <Field label="Origem">
              <select name="actor" defaultValue={actor ?? ''} className={inputClass}>
                <option value="">Todas</option>
                {Object.entries(ACTORS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="w-full sm:w-72">
            <Field label="Ação">
              <select name="action" defaultValue={action ?? ''} className={inputClass}>
                <option value="">Todas</option>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
        </FilterBar>
        <Table head={['Quando', 'Origem', 'Ação', 'Referência', 'Detalhes']} empty="Nenhum registro.">
          {((data ?? []) as AuditLog[]).map((l) => (
            <tr key={l.id} className="align-top hover:bg-slate-50">
              <Td className="text-slate-500">{dateTime(l.created_at)}</Td>
              <Td>
                <Badge tone={l.actor_type === 'user' ? 'brand' : l.actor_type === 'webhook' ? 'info' : 'neutral'}>{ACTORS[l.actor_type]}</Badge>
                {l.actor_email && <div className="mt-1 text-xs text-slate-500">{l.actor_email}</div>}
              </Td>
              <Td className="font-medium text-slate-800">{ACTION_LABEL[l.action] ?? l.action}</Td>
              <Td>
                {l.order_id ? (
                  <Link href={`/admin/pedidos/${l.order_id}`} className="text-xs text-brand-700 hover:underline">
                    pedido
                  </Link>
                ) : l.entity_type === 'webhook_event' && l.entity_id ? (
                  <Link href={`/admin/webhooks/${l.entity_id}`} className="text-xs text-brand-700 hover:underline">
                    webhook
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">{l.entity_type ?? '—'}</span>
                )}
              </Td>
              <Td className="max-w-md whitespace-normal">
                {Object.keys(l.metadata ?? {}).length > 0 && (
                  <code className="block break-all font-mono text-[11px] leading-relaxed text-slate-500">{JSON.stringify(l.metadata)}</code>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={params} />
      </Card>
    </>
  );
}
