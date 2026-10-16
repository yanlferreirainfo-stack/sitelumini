'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/admin', label: 'Painel', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: 'M6 2h12l2 5H4l2-5zM4 7h16v14H4zM9 11h6' },
  { href: '/admin/clientes', label: 'Clientes', icon: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6' },
  { href: '/admin/fila', label: 'Fila', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/admin/webhooks', label: 'Webhooks', icon: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z' },
  { href: '/admin/produtos', label: 'Produtos', icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8' },
  { href: '/admin/auditoria', label: 'Histórico', icon: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/admin/integracoes', label: 'Integrações', icon: 'M8 12h8M12 8v8M4 4h16v16H4z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 shrink-0" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Sidebar({ user, signOut }: { user: { email: string; role: string; name: string | null }; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Abrir menu" aria-expanded={open}>
          <Icon d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
        </button>
      </div>

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-slate-300 transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="hidden px-5 py-5 lg:block">
          <Brand />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 lg:py-0">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href) ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              )}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-slate-100">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-slate-500">
            {user.email} · {user.role}
          </p>
          <form action={signOut} className="mt-3">
            <button type="submit" className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-400 ring-1 ring-white/10 hover:bg-white/5 hover:text-white">
              Sair
            </button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">TV</span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">TV PlayPix</p>
        <p className="text-[11px] text-slate-500">Administração</p>
      </div>
    </div>
  );
}
