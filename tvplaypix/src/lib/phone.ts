export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * Normaliza telefone brasileiro para E.164 sem "+" (formato do WhatsApp Cloud API).
 * "(11) 99999-8888" → "5511999998888". Retorna null se não parecer um número válido.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  let d = onlyDigits(value);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número, sem país
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

/** "5511999998888" → "+55 (11) 99999-8888" */
export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const split = rest.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
  }
  return d ? `+${d}` : '—';
}
