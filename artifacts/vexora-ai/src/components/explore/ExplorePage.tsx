import { useState } from 'react';
import { SearchX } from 'lucide-react';
import { EXPLORE_ITEMS } from '@/data/catalog';
import type { ExploreItem } from '@/types';
import { ExploreHero } from './ExploreHero';
import { FilterBar } from './FilterBar';
import { MediaCard } from './MediaCard';
import { PreviewModal } from './PreviewModal';
import { useExploreFilter } from './useExploreFilter';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

export function ExplorePage() {
  const { filters, update, reset, results } = useExploreFilter(EXPLORE_ITEMS);
  const [active, setActive] = useState<ExploreItem | null>(null);
  const { t } = useI18n();
  return (
    <>
      <ExploreHero />
      <FilterBar filters={filters} onChange={update} count={results.length} />
      {results.length ? (
        <div className="mt-6 columns-2 gap-4 md:columns-3 xl:columns-4">
          {results.map((item, i) => <MediaCard key={item.id} item={item} index={i} onOpen={setActive} />)}
        </div>
      ) : (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <SearchX size={40} className="text-primary" />
          <p className="text-fg-muted">{t('explore.empty')}</p>
          <Button variant="outline" onClick={reset}>{t('explore.reset')}</Button>
        </div>
      )}
      <PreviewModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
