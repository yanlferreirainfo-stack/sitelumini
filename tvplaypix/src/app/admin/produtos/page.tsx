import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentAdmin, hasRole } from '@/lib/auth';
import { Alert, Badge, Card, PageHeader, Table, Td } from '@/components/ui';
import { ProductForm } from './product-form';
import type { Product } from '@/lib/types';

export const metadata: Metadata = { title: 'Produtos' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const { editar } = await searchParams;
  const admin = (await getCurrentAdmin())!;
  const supabase = await supabaseServer();
  const { data } = await supabase.from('products').select('*').order('name');
  const products = (data ?? []) as Product[];
  const editing = products.find((p) => p.id === editar);
  const canEdit = hasRole(admin, 'admin');
  const unmapped = products.filter((p) => p.active && !p.sigma_package_id).length;

  return (
    <>
      <PageHeader title="Produtos" description="Liga cada produto da Kirvano ao plano que deve ser criado no Sigma (duração, conexões e pacote)." />
      {unmapped > 0 && (
        <div className="mb-6">
          <Alert tone="warning">
            {unmapped} produto(s) ativo(s) sem pacote Sigma. No modo simulado isso não bloqueia; no modo real, o acesso não será gerado.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Produtos cadastrados" padded={false} className="lg:col-span-2">
          <Table head={['Nome', 'ID Kirvano', 'Pacote Sigma', 'Duração', 'Conexões', 'Situação', '']} empty="Produtos aparecem aqui automaticamente na primeira venda.">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{p.name}</Td>
                <Td mono>{p.kirvano_product_id ?? '—'}</Td>
                <Td mono>{p.sigma_package_id ?? <span className="text-amber-700">não definido</span>}</Td>
                <Td>{p.duration_days} dias</Td>
                <Td>{p.max_connections}</Td>
                <Td>
                  <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                </Td>
                <Td>
                  {canEdit && (
                    <a href={`?editar=${p.id}`} className="text-sm text-brand-700 hover:underline">
                      Editar
                    </a>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        {canEdit && (
          <Card title={editing ? 'Editar produto' : 'Novo produto'}>
            <ProductForm key={editing?.id ?? 'new'} product={editing} />
          </Card>
        )}
      </div>
    </>
  );
}
