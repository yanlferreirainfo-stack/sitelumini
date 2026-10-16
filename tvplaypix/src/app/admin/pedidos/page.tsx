import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { brl, dateTime, ORDER_STATUS } from '@/lib/format';
import { pageParam, PAGE_SIZE, range, sanitizeSearch } from '@/lib/query';
import { buttonClass, Card, Field, FilterBar, inputClass, PageHeader, Pagination, StatusBadge, Table, Td } from '@/components/ui';
import type { Order, OrderStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Pedidos' };

type Row = Order & { customers: { name: string; email: string | null } | null };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const q = sanitizeSearch(params.q);
  const status = params.status && params.status in ORDER_STATUS ? (params.status as OrderStatus) : undefined;

  const supabase = await supabaseServer();
  let query = supabase
    .from('orders')
    .select('*, customers(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(...range(page));

  if (status) query = query.eq('status', status);
  if (q) {
    const { data: matches } = await supabase
      .from('customers')
      .select('id')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,document.ilike.%${q}%`)
      .limit(200);
    const ids = (matches ?? []).map((m) => m.id);
    query = query.or([`kirvano_sale_id.ilike.%${q}%`, ids.length ? `customer_id.in.(${ids.join(',')})` : null].filter(Boolean).join(','));
  }

  const { data, count } = await query;

  return (
    <>
      <PageHeader title="Pedidos" description="Cada venda recebida da Kirvano gera um pedido. Clique para ver o histórico completo." />
      <Card padded={false}>
        <FilterBar>
          <div className="w-full sm:w-72">
            <Field label="Buscar">
              <input name="q" defaultValue={q} placeholder="ID da venda, nome, e-mail, telefone…" className={inputClass} />
            </Field>
          </div>
          <div className="w-full sm:w-56">
            <Field label="Status">
              <select name="status" defaultValue={status ?? ''} className={inputClass}>
                <option value="">Todos</option>
                {Object.entries(ORDER_STATUS).map(([k, v]) => (
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
          {(q || status) && (
            <Link href="/admin/pedidos" className={buttonClass('ghost')}>
              Limpar
            </Link>
          )}
        </FilterBar>
        <Table head={['Venda Kirvano', 'Cliente', 'Produto', 'Valor', 'Pagamento', 'Status', 'Criado']} empty="Nenhum pedido encontrado.">
          {((data ?? []) as Row[]).map((o) => (
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
              <Td>{o.product_name ?? '—'}</Td>
              <Td>{brl(o.amount_cents)}</Td>
              <Td className="text-slate-500">{o.payment_method ?? '—'}</Td>
              <Td>
                <StatusBadge map={ORDER_STATUS} status={o.status} />
              </Td>
              <Td className="text-slate-500">{dateTime(o.created_at)}</Td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={params} />
      </Card>
    </>
  );
}
