import 'server-only';
import { safeEqual } from '@/lib/crypto';

/**
 * Autentica a chamada da Kirvano com o token configurado no webhook.
 *
 * Aceita o token no cabeçalho configurado (KIRVANO_TOKEN_HEADER), em
 * "Authorization: Bearer <token>" ou, como último recurso, em ?token= na URL
 * (algumas plataformas só permitem configurar a URL). Confirme na conta qual
 * forma a Kirvano usa e, se possível, restrinja às formas por cabeçalho.
 */
export function verifyKirvanoRequest(req: Request, expectedToken: string, headerName: string): boolean {
  const candidates: string[] = [];
  const custom = req.headers.get(headerName);
  if (custom) candidates.push(custom.trim());
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) candidates.push(auth.slice(7).trim());
  const query = new URL(req.url).searchParams.get('token');
  if (query) candidates.push(query.trim());

  // Compara todos (sem sair no primeiro acerto) para não vazar timing.
  let ok = false;
  for (const c of candidates) ok = safeEqual(c, expectedToken) || ok;
  return ok;
}
