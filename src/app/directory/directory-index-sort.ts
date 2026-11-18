/** Sorting for the language / artist indexes (not station result sorting). */
export type IndexMode = 'languages' | 'artists';
export type IndexOrder = 'count-desc' | 'count-asc' | 'name-asc' | 'name-desc';

export const defaultIndexOrder = (mode: IndexMode): IndexOrder =>
  mode === 'languages' ? 'count-desc' : 'name-asc';

/** Ignore invalid links and disallow count sorting on the Artists index. */
export function indexOrder(mode: IndexMode, requested: string | null): IndexOrder {
  if (requested === 'name-asc' || requested === 'name-desc') return requested;
  if (mode === 'languages' && (requested === 'count-desc' || requested === 'count-asc'))
    return requested;
  return defaultIndexOrder(mode);
}

export function sortIndexDestinations<T extends { id: string; name: string; count: number }>(
  items: readonly T[],
  order: IndexOrder,
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const byName = (a: T, b: T) =>
    collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // Counts are station memberships (including discovery-only stations), not
  // stream counts. Equal counts always use alphabetical A–Z order.
  return [...items].sort((a, b) => {
    if (order === 'count-desc') return b.count - a.count || byName(a, b);
    if (order === 'count-asc') return a.count - b.count || byName(a, b);
    return order === 'name-desc' ? -byName(a, b) : byName(a, b);
  });
}
