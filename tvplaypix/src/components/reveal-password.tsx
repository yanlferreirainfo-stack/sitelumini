'use client';

import { useState, useTransition } from 'react';
import { buttonClass } from '@/components/ui';
import { revealCredential } from '@/app/admin/actions';

/** Senha oculta por padrão; revelar exige permissão e gera registro no histórico. */
export function RevealPassword({ orderId, canReveal }: { orderId: string; canReveal: boolean }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (password) {
    return (
      <span className="inline-flex items-center gap-2">
        <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm">{password}</code>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => navigator.clipboard?.writeText(password)}>
          Copiar
        </button>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setPassword(null)}>
          Ocultar
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm tracking-widest text-slate-400">••••••••</span>
      {canReveal && (
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revealCredential(orderId);
              if (r.ok && r.password) setPassword(r.password);
              else setError(r.message);
            })
          }
        >
          {pending ? '…' : 'Revelar'}
        </button>
      )}
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </span>
  );
}
