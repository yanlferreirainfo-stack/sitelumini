'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui';
import type { ActionResult } from '@/app/admin/actions';

/**
 * Botão que dispara uma server action e mostra o resultado ao lado.
 * `confirm` pede confirmação antes de ações sensíveis.
 */
export function ActionButton({
  action,
  children,
  variant = 'secondary',
  size = 'md',
  confirm,
  disabled,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  confirm?: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={buttonClass(variant, size)}
        disabled={pending || disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult(await action()));
        }}
      >
        {pending ? 'Aguarde…' : children}
      </button>
      {result && (
        <span role="status" className={result.ok ? 'text-xs text-emerald-700' : 'text-xs text-rose-700'}>
          {result.message}
        </span>
      )}
    </span>
  );
}
