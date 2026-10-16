import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentAdmin, hasRole } from '@/lib/auth';
import { dateTime, WEBHOOK_STATUS } from '@/lib/format';
import { Alert, Card, DefinitionList, JsonBlock, PageHeader, StatusBadge } from '@/components/ui';
import { ActionButton } from '@/components/action-button';
import { reprocessWebhook } from '../../actions';
import type { WebhookEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Webhook' };

export default async function WebhookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await supabaseServer();
  const admin = (await getCurrentAdmin())!;
  const { data: event } = await supabase.from('webhook_events').select('*').eq('id', id).maybeSingle<WebhookEvent>();
  if (!event) notFound();
  const { data: order } = await supabase.from('orders').select('id').eq('kirvano_sale_id', event.external_id ?? '').maybeSingle();

  return (
    <>
      <PageHeader
        title={event.event_type ?? 'Webhook'}
        description={<StatusBadge map={WEBHOOK_STATUS} status={event.status} />}
        actions={
          hasRole(admin, 'operator') ? (
            <ActionButton action={reprocessWebhook.bind(null, event.id)} confirm="Reprocessar este evento? A lógica é idempotente: não duplica pedidos nem acessos.">
              Reprocessar
            </ActionButton>
          ) : null
        }
      />
      {event.error && (
        <div className="mb-6">
          <Alert tone="danger" title="Erro no processamento">
            {event.error}
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Detalhes">
          <DefinitionList
            items={[
              ['Origem', event.provider],
              ['Venda', <span key="s" className="font-mono text-xs">{event.external_id}</span>],
              ['Pedido', order ? <Link key="o" href={`/admin/pedidos/${order.id}`} className="text-brand-700 hover:underline">abrir pedido</Link> : '—'],
              ['Tentativas', event.attempts],
              ['Recebido', dateTime(event.received_at)],
              ['Processado', dateTime(event.processed_at)],
              ['Chave de idempotência', <span key="k" className="font-mono text-xs">{event.event_key}</span>],
            ]}
          />
        </Card>
        <Card title="Payload recebido" className="lg:col-span-2">
          <JsonBlock value={event.payload} />
        </Card>
      </div>
    </>
  );
}
