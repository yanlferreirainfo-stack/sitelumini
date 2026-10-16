import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <Link href="/admin" className="mt-4 inline-block text-sm text-brand-700 underline">
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
