import { Heart, Play, Repeat2 } from 'lucide-react';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Badge } from '@/components/ui/Badge';
import { getModel } from '@/data/models';
import { compact } from '@/lib/format';
import type { ExploreItem } from '@/types';

interface Props { item: ExploreItem; index: number; onOpen: (i: ExploreItem) => void }

export function MediaCard({ item, index, onOpen }: Props) {
  return (
    <article className="group mb-4 break-inside-avoid animate-rise" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <button
        onClick={() => onOpen(item)}
        className="relative block w-full overflow-hidden rounded-[var(--radius-card)] ring-1 ring-ink-700 transition-all duration-300 hover:ring-volt-500/70 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgb(255_42_60/.6)] cursor-pointer text-left"
        aria-label={`${item.title} — önizləməni aç`}
      >
        <GenerativeArt seed={item.seed} aspect={item.aspect} kind={item.kind} className="block w-full h-auto transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <Badge tone={item.kind === 'video' ? 'red' : 'dark'}>
            {item.kind === 'video' ? <><Play size={10} fill="currentColor" /> {item.durationSec}s</> : 'Şəkil'}
          </Badge>
          {item.featured && <Badge tone="yellow">Seçilmiş</Badge>}
        </div>
        <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent p-4 pt-12 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="line-clamp-2 text-xs text-cream/80">{item.prompt}</p>
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between px-1 text-xs">
        <div className="min-w-0">
          <p className="truncate font-semibold text-cream">{item.title}</p>
          <p className="truncate text-ink-400">@{item.author} · {getModel(item.modelId).name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-muted">
          <span className="flex items-center gap-1"><Heart size={12} /> {compact(item.likes)}</span>
          <span className="flex items-center gap-1"><Repeat2 size={12} /> {compact(item.remixes)}</span>
        </div>
      </div>
    </article>
  );
}
