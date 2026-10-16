import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Verificação simples para monitoramento (não expõe configuração). */
export function GET() {
  return NextResponse.json({ ok: true, service: 'tvplaypix-admin', time: new Date().toISOString() });
}
