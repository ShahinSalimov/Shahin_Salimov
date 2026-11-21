import { Search, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';
import type { ExploreFilters, SortMode } from '@/types';

interface Props { filters: ExploreFilters; onChange: (p: Partial<ExploreFilters>) => void; count: number }

export function FilterBar({ filters, onChange, count }: Props) {
  return (
    <div className="sticky top-16 z-30 -mx-4 space-y-3 bg-ink-900/85 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Axtarış</span>
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Prompt, mövzu və ya müəllif axtar…"
            className="h-12 w-full rounded-2xl bg-ink-800 pl-11 pr-4 text-cream placeholder:text-ink-400 ring-1 ring-ink-700 focus:ring-volt-500 outline-none transition"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Media növü" value={filters.kind} onChange={(kind) => onChange({ kind })}
            options={[{ value: 'all', label: 'Hamısı' }, { value: 'image', label: 'Şəkil' }, { value: 'video', label: 'Video' }]} />
          <label className="relative">
            <span className="sr-only">Sıralama</span>
            <SlidersHorizontal size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-volt-400" />
            <select
              value={filters.sort}
              onChange={(e) => onChange({ sort: e.target.value as SortMode })}
              className="h-10 appearance-none rounded-full bg-ink-800 pl-9 pr-4 text-sm font-semibold text-cream ring-1 ring-ink-700 outline-none focus:ring-volt-500 cursor-pointer"
            >
              <option value="trending">Trend</option>
              <option value="newest">Ən yeni</option>
              <option value="most-liked">Ən çox bəyənilən</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange({ category: c.id })}
            aria-pressed={filters.category === c.id}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-all cursor-pointer',
              filters.category === c.id
                ? 'bg-blaze-500 text-cream ring-blaze-500 -rotate-2'
                : 'bg-ink-800 text-muted ring-ink-700 hover:text-cream hover:ring-ink-600',
            )}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-auto shrink-0 pl-4 font-mono text-xs text-ink-400">{count} nəticə</span>
      </div>
    </div>
  );
}
