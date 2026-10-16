'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';
import { buttonClass, inputClass } from '@/components/ui';

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  const error = state.error ?? notice;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">E-mail</span>
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Senha</span>
        <input name="password" type="password" autoComplete="current-password" required minLength={8} className={inputClass} />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass('primary') + ' w-full'}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
