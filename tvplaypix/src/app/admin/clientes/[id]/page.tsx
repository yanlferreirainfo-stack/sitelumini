import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { brl, dateTime, ORDER_STATUS } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { Card, DefinitionList, PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import type { Customer, Order } from '@/lib/types';

export const metadata: Metadata = { title: 'Cliente' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await supabaseServer();
  const [{ data: customer }, { data: orders }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).maybeSingle<Customer>(),
    supabase.from('orders').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
  ]);
  if (!customer) notFound();

  const list = (orders ?? []) as Order[];
  const total = list.filter((o) => !['refunded', 'chargeback', 'canceled', 'pending_payment'].includes(o.status)).reduce((s, o) => s + (o.amount_cents ?? 0), 0);

  return (
    <>
      <PageHeader title={customer.name} description={`Cliente desde ${dateTime(customer.created_at)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Dados">
          <DefinitionList
            items={[
              ['E-mail', customer.email],
              ['WhatsApp', formatPhone(customer.phone)],
              ['Documento', customer.document],
              ['Total pago', brl(total)],
            ]}
          />
        </Card>
        <Card title="Pedidos" padded={false} className="lg:col-span-2">
          <Table head={['Venda', 'Produto', 'Valor', 'Status', 'Data']} empty="Sem pedidos.">
            {list.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/admin/pedidos/${o.id}`} className="text-brand-700 hover:underline">
                    {o.kirvano_sale_id}
                  </Link>
                </Td>
                <Td>{o.product_name ?? '—'}</Td>
                <Td>{brl(o.amount_cents)}</Td>
                <Td>
                  <StatusBadge map={ORDER_STATUS} status={o.status} />
                </Td>
                <Td className="text-slate-500">{dateTime(o.created_at)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
