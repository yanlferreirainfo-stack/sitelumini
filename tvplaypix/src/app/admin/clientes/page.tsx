import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { dateTime } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { pageParam, PAGE_SIZE, range, sanitizeSearch } from '@/lib/query';
import { buttonClass, Card, Field, FilterBar, inputClass, PageHeader, Pagination, Table, Td } from '@/components/ui';
import type { Customer } from '@/lib/types';

export const metadata: Metadata = { title: 'Clientes' };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const q = sanitizeSearch(params.q);

  const supabase = await supabaseServer();
  let query = supabase
    .from('customers')
    .select('*, orders(count)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(...range(page));
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,document.ilike.%${q}%`);
  const { data, count } = await query;

  return (
    <>
      <PageHeader title="Clientes" description="Cadastrados automaticamente a partir das vendas da Kirvano." />
      <Card padded={false}>
        <FilterBar>
          <div className="w-full sm:w-80">
            <Field label="Buscar">
              <input name="q" defaultValue={q} placeholder="Nome, e-mail, telefone ou documento" className={inputClass} />
            </Field>
          </div>
          <button type="submit" className={buttonClass('primary')}>
            Buscar
          </button>
        </FilterBar>
        <Table head={['Nome', 'E-mail', 'Telefone', 'Pedidos', 'Desde']} empty="Nenhum cliente encontrado.">
          {((data ?? []) as (Customer & { orders: { count: number }[] })[]).map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/admin/clientes/${c.id}`} className="font-medium text-brand-700 hover:underline">
                  {c.name}
                </Link>
              </Td>
              <Td>{c.email ?? '—'}</Td>
              <Td>{formatPhone(c.phone)}</Td>
              <Td>{c.orders?.[0]?.count ?? 0}</Td>
              <Td className="text-slate-500">{dateTime(c.created_at)}</Td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={params} />
      </Card>
    </>
  );
}
