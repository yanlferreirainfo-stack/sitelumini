import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentAdmin, hasRole } from '@/lib/auth';
import { integrationStatuses } from '@/lib/integrations/status';
import { brl, dateTime, JOB_STATUS, JOB_TYPE_LABEL, ORDER_STATUS, relative } from '@/lib/format';
import { Alert, Card, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from '@/components/ui';
import { ActionButton } from '@/components/action-button';
import { runQueueNow } from './actions';
import type { Job, Order } from '@/lib/types';

export const metadata: Metadata = { title: 'Painel' };

type Stats = Record<
  'sales_today' | 'revenue_today' | 'revenue_30d' | 'orders_pending' | 'orders_failed' | 'orders_delivered' | 'jobs_queued' | 'jobs_running' | 'jobs_dead' | 'webhooks_failed' | 'customers',
  number
>;

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const admin = (await getCurrentAdmin())!;

  const [{ data: stats }, { data: orders }, { data: problems }] = await Promise.all([
    supabase.rpc('dashboard_stats'),
    supabase.from('orders').select('*, customers(name, email)').order('created_at', { ascending: false }).limit(8),
    supabase.from('jobs').select('*').in('status', ['dead']).order('updated_at', { ascending: false }).limit(5),
  ]);
  const s = (stats ?? {}) as Partial<Stats>;
  const simulated = integrationStatuses().filter((i) => i.mode !== 'live');

  return (
    <>
      <PageHeader
        title="Painel"
        description="Visão geral das vendas, da fila de processamento e das entregas."
        actions={
          hasRole(admin, 'operator') ? (
            <ActionButton action={runQueueNow} variant="secondary">
              Processar fila agora
            </ActionButton>
          ) : null
        }
      />

      {simulated.length > 0 && (
        <div className="mb-6">
          <Alert tone="warning" title="Integrações em modo simulado ou desativado">
            {simulated.map((i) => `${i.name}: ${i.mode === 'mock' ? 'simulado' : 'desativado'}`).join(' · ')}.{' '}
            <Link href="/admin/integracoes" className="font-medium underline">
              Ver detalhes
            </Link>
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Vendas hoje" value={s.sales_today ?? 0} hint={brl(s.revenue_today ?? 0)} />
        <Stat label="Receita 30 dias" value={brl(s.revenue_30d ?? 0)} hint={`${s.customers ?? 0} clientes`} />
        <Stat label="Em andamento" value={s.orders_pending ?? 0} hint={`${s.jobs_queued ?? 0} na fila · ${s.jobs_running ?? 0} executando`} />
        <Stat
          label="Precisam de atenção"
          value={(s.orders_failed ?? 0) + (s.jobs_dead ?? 0) + (s.webhooks_failed ?? 0)}
          hint={`${s.orders_failed ?? 0} pedidos · ${s.jobs_dead ?? 0} jobs · ${s.webhooks_failed ?? 0} webhooks`}
          tone={(s.orders_failed ?? 0) + (s.jobs_dead ?? 0) + (s.webhooks_failed ?? 0) > 0 ? 'danger' : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Pedidos recentes" actions={<LinkButton href="/admin/pedidos" size="sm">Ver todos</LinkButton>} padded={false} className="xl:col-span-2">
          <Table head={['Pedido', 'Cliente', 'Valor', 'Status', 'Criado']} empty="Nenhum pedido recebido ainda.">
            {((orders ?? []) as (Order & { customers: { name: string; email: string | null } | null })[]).map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/admin/pedidos/${o.id}`} className="text-brand-700 hover:underline">
                    {o.kirvano_sale_id}
                  </Link>
                </Td>
                <Td>
                  <div className="font-medium text-slate-900">{o.customers?.name ?? '—'}</div>
                  <div className="text-xs text-slate-500">{o.customers?.email}</div>
                </Td>
                <Td>{brl(o.amount_cents)}</Td>
                <Td>
                  <StatusBadge map={ORDER_STATUS} status={o.status} />
                </Td>
                <Td className="text-slate-500">{dateTime(o.created_at)}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Falhas recentes na fila" actions={<LinkButton href="/admin/fila?status=dead" size="sm">Abrir fila</LinkButton>} padded={false}>
          {(problems ?? []).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma falha pendente. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {((problems ?? []) as Job[]).map((j) => (
                <li key={j.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{JOB_TYPE_LABEL[j.type] ?? j.type}</span>
                    <StatusBadge map={JOB_STATUS} status={j.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-rose-700">{j.last_error}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {relative(j.finished_at ?? j.created_at)}
                    {j.order_id && (
                      <>
                        {' · '}
                        <Link href={`/admin/pedidos/${j.order_id}`} className="text-brand-700 hover:underline">
                          ver pedido
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
