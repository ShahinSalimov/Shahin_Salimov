import { useMemo, useState } from 'react';
import type { ExploreFilters, ExploreItem } from '@/types';

export const DEFAULT_FILTERS: ExploreFilters = { query: '', category: 'all', kind: 'all', sort: 'trending' };

export function filterItems(items: ExploreItem[], f: ExploreFilters): ExploreItem[] {
  const q = f.query.trim().toLowerCase();
  const out = items.filter((i) =>
    (f.category === 'all' || i.category === f.category) &&
    (f.kind === 'all' || i.kind === f.kind) &&
    (!q || `${i.title} ${i.prompt} ${i.author}`.toLowerCase().includes(q)),
  );
  const score = (i: ExploreItem) => i.likes + i.remixes * 4 - (Date.now() - Date.parse(i.createdAt)) / 864e5 * 40;
  out.sort((a, b) =>
    f.sort === 'newest' ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
      : f.sort === 'most-liked' ? b.likes - a.likes
        : score(b) - score(a));
  return out;
}

export function useExploreFilter(items: ExploreItem[]) {
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const results = useMemo(() => filterItems(items, filters), [items, filters]);
  const update = (patch: Partial<ExploreFilters>) => setFilters((f) => ({ ...f, ...patch }));
  return { filters, update, reset: () => setFilters(DEFAULT_FILTERS), results };
}
