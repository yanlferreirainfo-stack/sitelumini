'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { saveProduct, type ActionResult } from '../actions';
import { buttonClass, Field, inputClass } from '@/components/ui';
import type { Product } from '@/lib/types';

export function ProductForm({ product }: { product?: Product }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveProduct, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={product?.id ?? ''} />
      <Field label="Nome">
        <input name="name" required defaultValue={product?.name} className={inputClass} />
      </Field>
      <Field label="ID do produto na Kirvano">
        <input name="kirvano_product_id" defaultValue={product?.kirvano_product_id ?? ''} className={inputClass} />
      </Field>
      <Field label="ID da oferta na Kirvano" hint="Opcional.">
        <input name="kirvano_offer_id" defaultValue={product?.kirvano_offer_id ?? ''} className={inputClass} />
      </Field>
      <Field label="Pacote no Sigma" hint="Preencher quando recebermos a documentação do Sigma.">
        <input name="sigma_package_id" defaultValue={product?.sigma_package_id ?? ''} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duração (dias)">
          <input name="duration_days" type="number" min={1} max={3650} required defaultValue={product?.duration_days ?? 30} className={inputClass} />
        </Field>
        <Field label="Conexões">
          <input name="max_connections" type="number" min={1} max={20} required defaultValue={product?.max_connections ?? 1} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        Ativo
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary')}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {product && (
          <Link href="/admin/produtos" className={buttonClass('ghost')}>
            Cancelar
          </Link>
        )}
      </div>
      {state && <p className={state.ok ? 'text-sm text-emerald-700' : 'text-sm text-rose-700'}>{state.message}</p>}
    </form>
  );
}
