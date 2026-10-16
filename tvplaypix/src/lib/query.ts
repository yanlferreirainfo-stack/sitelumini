/** Remove caracteres com significado na sintaxe de filtros do PostgREST (",", "(", ")", "%", "*"…). */
export function sanitizeSearch(q: string | undefined): string {
  return (q ?? '').replace(/[^\p{L}\p{N}@._+\- ]/gu, '').trim().slice(0, 80);
}

export function pageParam(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export const PAGE_SIZE = 25;

export function range(page: number, size = PAGE_SIZE): [number, number] {
  return [(page - 1) * size, page * size - 1];
}
