import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentAdmin, hasRole } from '@/lib/auth';
import { dateTime, JOB_STATUS, JOB_TYPE_LABEL, relative } from '@/lib/format';
import { pageParam, PAGE_SIZE, range } from '@/lib/query';
import { Card, PageHeader, Pagination, StatusBadge, Table, Td } from '@/components/ui';
import { ActionButton } from '@/components/action-button';
import { cancelJob, retryJob, runQueueNow } from '../actions';
import type { Job, JobStatus } from '@/lib/types';
import clsx from 'clsx';

export const metadata: Metadata = { title: 'Fila' };

const TABS: { key: JobStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'queued', label: 'Na fila' },
  { key: 'running', label: 'Executando' },
  { key: 'dead', label: 'Esgotados' },
  { key: 'succeeded', label: 'Concluídos' },
  { key: 'canceled', label: 'Cancelados' },
];

export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const status = TABS.some((t) => t.key === params.status) ? (params.status as JobStatus | 'all') : 'all';
  const admin = (await getCurrentAdmin())!;
  const canOperate = hasRole(admin, 'operator');

  const supabase = await supabaseServer();
  let query = supabase.from('jobs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(...range(page));
  if (status !== 'all') query = query.eq('status', status);
  const { data, count } = await query;

  return (
    <>
      <PageHeader
        title="Fila de processamento"
        description="Cada etapa (webhook → acesso → entregas) roda como um job com retentativa automática e backoff exponencial."
        actions={canOperate ? <ActionButton action={runQueueNow}>Processar fila agora</ActionButton> : null}
      />
      <Card padded={false}>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === 'all' ? '/admin/fila' : `/admin/fila?status=${t.key}`}
              className={clsx(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                status === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Table head={['Tipo', 'Status', 'Tentativas', 'Agendado', 'Criado', 'Erro', '']} empty="Nenhum job aqui.">
          {((data ?? []) as Job[]).map((j) => (
            <tr key={j.id} className="align-top hover:bg-slate-50">
              <Td>
                <div className="font-medium text-slate-800">{JOB_TYPE_LABEL[j.type] ?? j.type}</div>
                <div className="text-xs text-slate-400">
                  {j.payload.channel ? `${String(j.payload.channel)} · ` : ''}
                  {j.order_id ? (
                    <Link href={`/admin/pedidos/${j.order_id}`} className="text-brand-700 hover:underline">
                      pedido
                    </Link>
                  ) : j.payload.event_id ? (
                    <Link href={`/admin/webhooks/${String(j.payload.event_id)}`} className="text-brand-700 hover:underline">
                      webhook
                    </Link>
                  ) : null}
                </div>
              </Td>
              <Td>
                <StatusBadge map={JOB_STATUS} status={j.status} />
              </Td>
              <Td>
                {j.attempts}/{j.max_attempts}
              </Td>
              <Td className="text-slate-500">{j.status === 'queued' ? relative(j.run_at) : '—'}</Td>
              <Td className="text-slate-500">{dateTime(j.created_at)}</Td>
              <Td className="max-w-sm whitespace-normal text-xs text-rose-700">{j.last_error ?? ''}</Td>
              <Td>
                {canOperate && (j.status === 'dead' || j.status === 'canceled') && (
                  <ActionButton action={retryJob.bind(null, j.id)} size="sm">
                    Tentar de novo
                  </ActionButton>
                )}
                {canOperate && j.status === 'queued' && (
                  <ActionButton action={cancelJob.bind(null, j.id)} size="sm" variant="ghost" confirm="Cancelar este job?">
                    Cancelar
                  </ActionButton>
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
