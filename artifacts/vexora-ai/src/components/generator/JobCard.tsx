import { Download, Loader2, X } from 'lucide-react';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Badge } from '@/components/ui/Badge';
import { getModel } from '@/data/models';
import { aspectToRatio } from '@/lib/format';
import { useI18n } from '@/i18n';
import type { GenerationDTO } from '@/types';

export function JobCard({ job, onCancel }: { job: GenerationDTO; onCancel: (id: string) => void }) {
  const { params } = job;
  const { t } = useI18n();
  const busy = job.status === 'queued' || job.status === 'running';
  const slots = params.kind === 'video' ? 1 : params.count;
  return (
    <article className="rounded-3xl bg-surface p-4 ring-1 ring-line animate-rise">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold" dir="auto">{params.prompt}</p>
          <p className="text-xs text-fg-subtle">{getModel(params.modelId).name} · {params.aspect} · {job.cost} {t('gen.cr')}</p>
        </div>
        {busy ? (
          <button onClick={() => onCancel(job.id)} className="flex items-center gap-1 text-xs text-fg-muted hover:text-danger cursor-pointer"><X size={14} /> {t('gen.cancel')}</button>
        ) : job.status === 'done'
          ? <Badge tone="primary">{t('gen.ready')}</Badge>
          : <Badge tone="neutral">{t(job.status === 'cancelled' ? 'gen.cancelled' : 'gen.failed')}</Badge>}
      </header>
      {busy && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-300" style={{ width: `${Math.max(4, job.progress * 100)}%` }} />
        </div>
      )}
      <div className={slots > 1 ? 'grid grid-cols-2 gap-3' : 'grid'}>
        {job.status === 'done'
          ? job.results.map((r) => (
            <figure key={r.id} className="group relative overflow-hidden rounded-2xl ring-1 ring-line">
              {r.url
                ? (r.kind === 'video' ? <video src={r.url} controls className="block w-full" /> : <img src={r.url} alt={params.prompt} className="block w-full" />)
                : <GenerativeArt seed={r.seed} aspect={r.aspect} kind={r.kind} animate={r.kind === 'video'} className="block h-auto w-full" />}
              <button className="absolute bottom-2 end-2 grid size-9 place-items-center rounded-full bg-surface/90 text-fg opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-primary cursor-pointer" aria-label={t('gen.download')}>
                <Download size={16} />
              </button>
            </figure>
          ))
          : Array.from({ length: slots }, (_, i) => (
            <div key={i} className={`${busy ? 'skeleton' : 'bg-surface-2'} grid place-items-center rounded-2xl`} style={{ aspectRatio: aspectToRatio(params.aspect) }}>
              {busy && <Loader2 className="animate-spin text-primary" />}
            </div>
          ))}
      </div>
    </article>
  );
}
