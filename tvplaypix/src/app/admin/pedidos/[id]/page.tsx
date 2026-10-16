import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminPage, hasRole } from '@/lib/auth';
import { formatPhone } from '@/lib/phone';
import { ACTION_LABEL, brl, date, dateTime, DELIVERY_STATUS, JOB_STATUS, JOB_TYPE_LABEL, ORDER_STATUS, WEBHOOK_STATUS } from '@/lib/format';
import { Alert, Badge, Card, DefinitionList, PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import { ActionButton } from '@/components/action-button';
import { RevealPassword } from '@/components/reveal-password';
import { resendDelivery, reprovisionOrder, retryJob, revokeOrderAccess } from '../../actions';
import type { AccessCredential, AuditLog, Customer, Delivery, Job, Order, WebhookEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Pedido' };

const statusLabel = (v: unknown) => (typeof v === 'string' && v in ORDER_STATUS ? ORDER_STATUS[v as Order['status']].label : 'novo');

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = await requireAdminPage();
  const supabase = await supabaseServer();

  const { data: order } = await supabase.from('orders').select('*').eq('id', id).maybeSingle<Order>();
  if (!order) notFound();

  const [{ data: customer }, { data: deliveries }, { data: jobs }, { data: logs }, { data: events }, { data: cred }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', order.customer_id).maybeSingle<Customer>(),
    supabase.from('deliveries').select('*').eq('order_id', id).order('channel'),
    supabase.from('jobs').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    supabase.from('audit_logs').select('*').eq('order_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('webhook_events').select('id, event_type, status, received_at, error').eq('provider', 'kirvano').eq('external_id', order.kirvano_sale_id).order('received_at', { ascending: false }),
    // Credenciais não têm policy de leitura para o navegador: lidas pelo servidor, sem a senha.
    supabaseAdmin()
      .from('access_credentials')
      .select('id, username, status, expires_at, provider, provider_mode, external_id, created_at')
      .eq('order_id', id)
      .maybeSingle<Omit<AccessCredential, 'password_encrypted'>>(),
  ]);

  const canOperate = hasRole(admin, 'operator');
  const canProvision = ['paid', 'provisioning', 'failed', 'provisioned'].includes(order.status);

  return (
    <>
      <PageHeader
        title={`Pedido ${order.kirvano_sale_id}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge map={ORDER_STATUS} status={order.status} /> criado em {dateTime(order.created_at)}
          </span>
        }
        actions={
          canOperate && canProvision ? (
            <ActionButton action={reprovisionOrder.bind(null, order.id)} variant={order.status === 'failed' ? 'primary' : 'secondary'}>
              {cred ? 'Reprocessar acesso' : 'Gerar acesso agora'}
            </ActionButton>
          ) : null
        }
      />

      {order.last_error && (
        <div className="mb-6">
          <Alert tone="danger" title="Último erro">
            {order.last_error}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Resumo">
            <DefinitionList
              items={[
                ['Produto', order.product_name],
                ['Valor', brl(order.amount_cents)],
                ['Forma de pagamento', order.payment_method],
                ['Pago em', dateTime(order.paid_at)],
                ['Atualizado', dateTime(order.updated_at)],
                ['ID interno', <span key="id" className="font-mono text-xs">{order.id}</span>],
              ]}
            />
          </Card>

          <Card
            title="Acesso (Sigma)"
            actions={
              cred && cred.status === 'active' && hasRole(admin, 'admin') ? (
                <ActionButton action={revokeOrderAccess.bind(null, order.id)} variant="danger" size="sm" confirm="Revogar o acesso deste cliente no Sigma?">
                  Revogar
                </ActionButton>
              ) : null
            }
          >
            {cred ? (
              <DefinitionList
                items={[
                  ['Usuário', <code key="u" className="font-mono">{cred.username}</code>],
                  ['Senha', <RevealPassword key="p" orderId={order.id} canReveal={canOperate} />],
                  ['Validade', date(cred.expires_at)],
                  ['Situação', <Badge key="s" tone={cred.status === 'active' ? 'success' : 'danger'}>{cred.status === 'active' ? 'Ativo' : cred.status === 'revoked' ? 'Revogado' : 'Suspenso'}</Badge>],
                  ['Modo', <Badge key="m" tone={cred.provider_mode === 'mock' ? 'warning' : 'neutral'}>{cred.provider_mode === 'mock' ? 'Simulado' : 'Real'}</Badge>],
                  ['ID no Sigma', <span key="e" className="font-mono text-xs">{cred.external_id}</span>],
                ]}
              />
            ) : (
              <p className="text-sm text-slate-500">
                {canProvision ? 'O acesso ainda não foi gerado. Acompanhe a fila abaixo.' : 'Acesso só é gerado para pedidos pagos.'}
              </p>
            )}
          </Card>

          <Card title="Entregas" padded={false}>
            <Table head={['Canal', 'Destinatário', 'Status', 'Enviado', '']} empty="Nenhuma entrega registrada ainda.">
              {((deliveries ?? []) as Delivery[]).map((d) => (
                <tr key={d.id}>
                  <Td>{d.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}</Td>
                  <Td>{d.channel === 'whatsapp' ? formatPhone(d.recipient) : (d.recipient ?? '—')}</Td>
                  <Td>
                    <StatusBadge map={DELIVERY_STATUS} status={d.status} />
                    {d.provider_mode === 'mock' && <span className="ml-1 text-xs text-amber-700">(simulado)</span>}
                    <div className="mt-1 text-xs text-slate-400">
                      {d.attempts} tentativa{d.attempts === 1 ? '' : 's'}
                    </div>
                    {d.error && <div className="mt-1 max-w-xs truncate text-xs text-rose-700" title={d.error}>{d.error}</div>}
                  </Td>
                  <Td className="text-slate-500">{dateTime(d.sent_at)}</Td>
                  <Td>
                    {canOperate && cred?.status === 'active' && (
                      <ActionButton action={resendDelivery.bind(null, order.id, d.channel)} size="sm" confirm="Reenviar os dados de acesso?">
                        Reenviar
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Jobs da fila" padded={false}>
            <Table head={['Tipo', 'Status', 'Tentativas', 'Próxima execução', 'Erro', '']} empty="Nenhum job para este pedido.">
              {((jobs ?? []) as Job[]).map((j) => (
                <tr key={j.id}>
                  <Td>{JOB_TYPE_LABEL[j.type] ?? j.type}{j.payload.channel ? ` · ${String(j.payload.channel)}` : ''}</Td>
                  <Td><StatusBadge map={JOB_STATUS} status={j.status} /></Td>
                  <Td>{j.attempts}/{j.max_attempts}</Td>
                  <Td className="text-slate-500">{j.status === 'queued' ? dateTime(j.run_at) : '—'}</Td>
                  <Td className="max-w-xs truncate text-xs text-rose-700">{j.last_error ?? ''}</Td>
                  <Td>
                    {canOperate && (j.status === 'dead' || j.status === 'canceled') && (
                      <ActionButton action={retryJob.bind(null, j.id)} size="sm">Tentar de novo</ActionButton>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Cliente">
            {customer ? (
              <div className="space-y-2 text-sm">
                <Link href={`/admin/clientes/${customer.id}`} className="font-medium text-brand-700 hover:underline">
                  {customer.name}
                </Link>
                <p className="text-slate-600">{customer.email ?? 'sem e-mail'}</p>
                <p className="text-slate-600">{formatPhone(customer.phone)}</p>
                {customer.document && <p className="font-mono text-xs text-slate-500">Doc. {customer.document}</p>}
              </div>
            ) : (
              '—'
            )}
          </Card>

          <Card title="Webhooks desta venda" padded={false}>
            <ul className="divide-y divide-slate-100">
              {((events ?? []) as Pick<WebhookEvent, 'id' | 'event_type' | 'status' | 'received_at' | 'error'>[]).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/admin/webhooks/${e.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                    {e.event_type}
                  </Link>
                  <span className="flex items-center gap-2">
                    <StatusBadge map={WEBHOOK_STATUS} status={e.status} />
                    <span className="text-xs text-slate-400">{dateTime(e.received_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Histórico">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {((logs ?? []) as AuditLog[]).map((l) => (
                <li key={l.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
                  <p className="text-sm font-medium text-slate-800">{ACTION_LABEL[l.action] ?? l.action}</p>
                  <p className="text-xs text-slate-500">
                    {dateTime(l.created_at)} · {l.actor_type === 'user' ? l.actor_email : l.actor_type === 'webhook' ? 'Kirvano' : 'Sistema'}
                  </p>
                  {typeof l.metadata?.error === 'string' && <p className="mt-0.5 text-xs text-rose-700">{l.metadata.error}</p>}
                  {typeof l.metadata?.to === 'string' && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {statusLabel(l.metadata.from)} → {statusLabel(l.metadata.to)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
