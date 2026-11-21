import { Download, Loader2, X } from 'lucide-react';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Badge } from '@/components/ui/Badge';
import { getModel } from '@/data/models';
import { aspectToRatio } from '@/lib/format';
import { useI18n } from '@/i18n';
import type { GenerationJob } from '@/types';

export function JobCard({ job, onCancel }: { job: GenerationJob; onCancel: (id: string) => void }) {
  const { params } = job;
  const { t } = useI18n();
  const busy = job.status === 'queued' || job.status === 'running';
  const slots = params.kind === 'video' ? 1 : params.count;
  return (
    <article className="rounded-3xl bg-ink-850 p-4 ring-1 ring-ink-700 animate-rise">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold">{params.prompt}</p>
          <p className="text-xs text-ink-400">{getModel(params.modelId).name} · {params.aspect} · {job.cost} {t('gen.cr')}</p>
        </div>
        {busy ? (
          <button onClick={() => onCancel(job.id)} className="flex items-center gap-1 text-xs text-muted hover:text-blaze-300 cursor-pointer"><X size={14} /> {t('gen.cancel')}</button>
        ) : job.status === 'failed' ? <Badge tone="red">{t(`gen.${job.error ?? 'failed'}`)}</Badge> : <Badge tone="yellow">{t('gen.ready')}</Badge>}
      </header>
      {busy && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-blaze-500 to-volt-500 transition-[width] duration-150" style={{ width: `${job.progress * 100}%` }} />
        </div>
      )}
      <div className={slots > 1 ? 'grid grid-cols-2 gap-3' : 'grid'}>
        {job.status === 'done'
          ? job.results.map((r) => (
            <figure key={r.id} className="group relative overflow-hidden rounded-2xl ring-1 ring-ink-700">
              <GenerativeArt seed={r.seed} aspect={r.aspect} kind={r.kind} animate={r.kind === 'video'} className="block w-full h-auto" />
              <button className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-ink-900/80 opacity-0 transition group-hover:opacity-100 hover:text-volt-300 cursor-pointer" aria-label={t('gen.download')}>
                <Download size={16} />
              </button>
            </figure>
          ))
          : Array.from({ length: slots }, (_, i) => (
            <div key={i} className="skeleton grid place-items-center rounded-2xl" style={{ aspectRatio: aspectToRatio(params.aspect) }}>
              {busy && <Loader2 className="animate-spin text-volt-400" />}
            </div>
          ))}
      </div>
    </article>
  );
}
