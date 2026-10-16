import type { Metadata } from 'next';
import { integrationStatuses } from '@/lib/integrations/status';
import { Badge, Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Integrações' };

const MODE = {
  live: { label: 'Ativa', tone: 'success' },
  mock: { label: 'Simulada', tone: 'warning' },
  disabled: { label: 'Desativada', tone: 'neutral' },
} as const;

export default function IntegrationsPage() {
  const list = integrationStatuses();
  return (
    <>
      <PageHeader
        title="Integrações"
        description="Situação de cada serviço externo. Credenciais ficam só nas variáveis de ambiente do servidor e nunca aparecem aqui."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {list.map((i) => (
          <Card key={i.key} title={i.name} actions={<Badge tone={i.issues.length ? 'danger' : MODE[i.mode].tone}>{i.issues.length ? 'Configuração incompleta' : MODE[i.mode].label}</Badge>}>
            {i.issues.length > 0 && (
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-rose-700">
                {i.issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <ul className="space-y-1.5 text-sm text-slate-600">
              {i.notes.map((n) => (
                <li key={n} className="break-words">
                  {n}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
