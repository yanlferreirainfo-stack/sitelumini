import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { getCurrentAdmin, hasRole } from '@/lib/auth';
import { dateTime, WEBHOOK_STATUS } from '@/lib/format';
import { pageParam, PAGE_SIZE, range } from '@/lib/query';
import { buttonClass, Card, Field, FilterBar, inputClass, PageHeader, Pagination, StatusBadge, Table, Td } from '@/components/ui';
import { SimulateSaleForm } from './simulate-form';
import type { WebhookEvent, WebhookStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Webhooks' };

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const status = params.status && params.status in WEBHOOK_STATUS ? (params.status as WebhookStatus) : undefined;
  const admin = (await getCurrentAdmin())!;

  const supabase = await supabaseServer();
  let query = supabase
    .from('webhook_events')
    .select('id, provider, event_type, external_id, status, error, attempts, received_at, processed_at', { count: 'exact' })
    .order('received_at', { ascending: false })
    .range(...range(page));
  if (status) query = query.eq('status', status);
  const { data, count } = await query;

  const showSimulator = env().ALLOW_TEST_TOOLS && hasRole(admin, 'admin');

  return (
    <>
      <PageHeader title="Webhooks" description="Todo evento recebido é gravado antes de ser processado. Reenvios da Kirvano são descartados automaticamente." />

      {showSimulator && (
        <div className="mb-6">
          <Card title="Simular venda da Kirvano (ambiente de teste)">
            <SimulateSaleForm />
          </Card>
        </div>
      )}

      <Card padded={false}>
        <FilterBar>
          <div className="w-full sm:w-56">
            <Field label="Status">
              <select name="status" defaultValue={status ?? ''} className={inputClass}>
                <option value="">Todos</option>
                {Object.entries(WEBHOOK_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="submit" className={buttonClass('primary')}>
            Filtrar
          </button>
        </FilterBar>
        <Table head={['Evento', 'Venda', 'Status', 'Tentativas', 'Recebido', 'Processado']} empty="Nenhum webhook recebido.">
          {((data ?? []) as WebhookEvent[]).map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td mono>
                <Link href={`/admin/webhooks/${e.id}`} className="text-brand-700 hover:underline">
                  {e.event_type ?? '—'}
                </Link>
              </Td>
              <Td mono>{e.external_id}</Td>
              <Td>
                <StatusBadge map={WEBHOOK_STATUS} status={e.status} />
                {e.error && <div className="mt-1 max-w-xs truncate text-xs text-rose-700" title={e.error}>{e.error}</div>}
              </Td>
              <Td>{e.attempts}</Td>
              <Td className="text-slate-500">{dateTime(e.received_at)}</Td>
              <Td className="text-slate-500">{dateTime(e.processed_at)}</Td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={params} />
      </Card>
    </>
  );
}
