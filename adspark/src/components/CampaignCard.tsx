import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Globe, MonitorPlay } from 'lucide-react';
import type { Campaign } from '../lib/schemas';
import { campaignHref, campaignStage, relativeTime } from '../lib/campaignMeta';
import { useApp } from '../store/app';
import { StoryboardFrame } from './StoryboardFrame';
import { Badge, cx } from './ui';

const STEPS = ['Brief', 'Concepts', 'Campaign'] as const;

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Progress: step ${step} of 3`}>
      {STEPS.map((label, i) => {
        const done = i < step;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={cx('h-1 rounded-full transition-colors', done ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-line')} aria-hidden />
            <span className={cx('flex items-center gap-1 text-[11px]', done ? 'text-ink/80' : 'text-muted/70')}>
              {done ? <Check className="size-3 text-success" aria-hidden /> : null}
              {label}
              <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Visual header: the campaign's own storyboard sketches, or its hook/brief when no storyboard exists yet. */
function Cover({ c }: { c: Campaign }) {
  if (c.scenes.length) {
    return (
      <div className="grid grid-cols-3 gap-px bg-line/60">
        {c.scenes.slice(0, 3).map((s, i) => (
          <StoryboardFrame key={s.id} shot={s.shot} style={c.storyboardStyle} number={i + 1} className="block w-full" />
        ))}
      </div>
    );
  }
  const quote = c.concepts[0]?.hook ?? c.input.problem;
  return (
    <div className="relative flex aspect-[16/5.6] items-center overflow-hidden bg-gradient-to-br from-primary/20 via-elevated to-secondary/10 px-5">
      <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
      <p className="relative line-clamp-2 font-display text-sm font-semibold leading-snug text-ink/90">“{quote}”</p>
    </div>
  );
}

export function CampaignCard({ c, actions }: { c: Campaign; actions?: ReactNode }) {
  const brand = useApp((s) => s.brands.find((b) => b.id === c.input.brandId));
  const stage = campaignStage(c);
  const accent = brand?.colors[0];
  return (
    <article className="card group flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_rgba(128,101,246,0.6)]">
      <Link to={campaignHref(c)} className="block focus-visible:outline-offset-[-2px]" tabIndex={-1} aria-hidden>
        <Cover c={c} />
      </Link>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-elevated font-display font-bold text-[#b9abff]"
            style={accent ? { color: accent } : undefined}
            aria-hidden
          >
            {brand?.logo ? <img src={brand.logo} alt="" className="size-full object-contain" /> : c.input.productName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">
              <Link to={campaignHref(c)} className="hover:text-secondary">
                {c.name}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted">
              {brand?.name ?? c.input.productName} · {c.input.category}
            </p>
          </div>
          <Badge tone={stage.tone} className="shrink-0">
            {stage.label}
          </Badge>
        </div>

        <Progress step={stage.step} />

        <dl className="grid grid-cols-3 gap-2 text-xs text-muted">
          <div className="flex min-w-0 items-center gap-1.5">
            <MonitorPlay className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Platform</dt>
            <dd className="truncate">{c.input.platform}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Duration</dt>
            <dd>{c.input.duration}s</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <Globe className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Language</dt>
            <dd className="truncate">{c.input.language}</dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center gap-1 border-t border-line/70 pt-3">
          <span className="text-xs text-muted">Edited {relativeTime(c.updatedAt)}</span>
          {actions ? <div className="ml-auto flex items-center gap-0.5">{actions}</div> : null}
        </div>
      </div>
    </article>
  );
}
