import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  const notice = erro === 'sem-permissao' ? 'Sua sessão não tem permissão de administrador.' : undefined;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-950 p-12 text-slate-300 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 font-bold text-white">TV</span>
          <span className="text-lg font-semibold text-white">TV PlayPix</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-white">Vendas, acessos e entregas em um só lugar.</h1>
          <p className="mt-4 max-w-md text-sm text-slate-400">
            Pedidos da Kirvano, geração de acessos no Sigma e envio automático por WhatsApp e e-mail, com histórico completo de cada ação.
          </p>
        </div>
        <p className="text-xs text-slate-600">Acesso restrito a administradores autorizados.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-slate-900">Entrar no painel</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Use o e-mail e a senha cadastrados pelo administrador.</p>
          <LoginForm next={next} notice={notice} />
        </div>
      </div>
    </main>
  );
}
