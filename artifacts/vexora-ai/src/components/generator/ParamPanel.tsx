import { Dice5, Film, ImageIcon, Lock, Sparkles } from 'lucide-react';
import { MODELS, STYLE_IDS, getModel } from '@/data/models';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { randomSeed } from '@/lib/random';
import { useI18n, type TKey } from '@/i18n';
import type { AspectRatio, GenerationParams, MediaKind } from '@/types';

const ASPECTS: AspectRatio[] = ['1:1', '4:5', '3:4', '9:16', '16:9'];

interface Props {
  params: GenerationParams;
  onChange: (p: Partial<GenerationParams>) => void;
  onSubmit: () => void;
  cost: number;
  credits: number;
  signedIn: boolean;
  busy: boolean;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-2 block text-xs font-semibold tracking-wide text-fg-muted">{children}</span>
);

export function ParamPanel({ params, onChange, onSubmit, cost, credits, signedIn, busy }: Props) {
  const { t } = useI18n();
  const models = MODELS.filter((m) => m.kind === params.kind);
  const model = getModel(params.modelId);
  const setKind = (kind: MediaKind) => {
    const first = MODELS.find((m) => m.kind === kind)!;
    onChange({ kind, modelId: first.id, aspect: kind === 'video' ? '9:16' : params.aspect, durationSec: Math.min(params.durationSec, first.maxDuration ?? 5) });
  };
  const insufficient = signedIn && cost > credits;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex flex-col gap-6 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line lg:sticky lg:top-20"
    >
      <Segmented label={t('gen.kind')} value={params.kind} onChange={setKind} className="self-start"
        options={[{ value: 'image', label: <span className="flex items-center gap-1.5"><ImageIcon size={14} /> {t('gen.image')}</span> },
          { value: 'video', label: <span className="flex items-center gap-1.5"><Film size={14} /> {t('gen.video')}</span> }]} />

      <div>
        <Label>{t('gen.model')}</Label>
        <div className="grid gap-2">
          {models.map((m) => (
            <button type="button" key={m.id} onClick={() => onChange({ modelId: m.id })} aria-pressed={params.modelId === m.id}
              className={cn('flex items-center justify-between rounded-2xl p-3 text-left ring-1 transition cursor-pointer',
                params.modelId === m.id ? 'bg-primary-soft ring-primary' : 'bg-surface-2 ring-line hover:ring-line-strong')}>
              <span>
                <span className="flex items-center gap-2 font-semibold">{m.name} {m.badge && <Badge tone={m.badge === 'pro' ? 'accent' : 'primary'}>{m.badge}</Badge>}</span>
                <span className="text-xs text-fg-muted">{t(`models.${m.id}` as TKey)}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-primary-strong">{m.creditCost}{m.kind === 'video' ? t('gen.perSec') : ''} {t('gen.cr')}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <Label>{t('gen.prompt')}</Label>
        <textarea
          id="gen-prompt"
          dir="auto"
          value={params.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          rows={5}
          maxLength={1500}
          placeholder="Close-up of a red sports car in the rain, neon reflections, cinematic lighting…"
          className="w-full resize-none rounded-2xl bg-surface-2 p-4 font-mono text-sm text-fg placeholder:text-fg-subtle ring-1 ring-line focus:ring-primary outline-none"
        />
        <span className="mt-1 block text-right font-mono text-[11px] text-fg-subtle">{params.prompt.length}/1500</span>
      </label>

      <label className="block">
        <Label>{t('gen.negative')}</Label>
        <input value={params.negativePrompt} onChange={(e) => onChange({ negativePrompt: e.target.value })} placeholder="blurry, watermark, extra fingers"
          className="h-10 w-full rounded-xl bg-surface-2 px-3 font-mono text-sm ring-1 ring-line focus:ring-primary outline-none placeholder:text-fg-subtle" />
      </label>

      <div>
        <Label>{t('gen.style')}</Label>
        <div className="flex flex-wrap gap-2">
          {STYLE_IDS.map((id) => (
            <button type="button" key={id} onClick={() => onChange({ styleId: id })} aria-pressed={params.styleId === id}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 cursor-pointer',
                params.styleId === id ? 'bg-primary-soft text-primary-strong ring-primary/40' : 'bg-surface-2 text-fg-muted ring-line hover:text-fg')}>
              {t(`styles.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t('gen.aspect')}</Label>
        <div className="grid grid-cols-5 gap-2">
          {ASPECTS.map((a) => {
            const [w, h] = a.split(':').map(Number);
            return (
              <button type="button" key={a} onClick={() => onChange({ aspect: a })} aria-pressed={params.aspect === a}
                className={cn('flex flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] font-mono ring-1 cursor-pointer',
                  params.aspect === a ? 'bg-primary-soft ring-primary text-fg' : 'bg-surface-2 ring-line text-fg-muted')}>
                <span className="rounded-[3px] border-2 border-current" style={{ width: 22 * Math.min(1, w / h), height: 22 * Math.min(1, h / w) }} />
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {params.kind === 'image' ? (
        <div>
          <Label>{t('gen.count', { n: params.count })}</Label>
          <input type="range" min={1} max={4} value={params.count} onChange={(e) => onChange({ count: Number(e.target.value) })} className="w-full accent-[var(--color-primary)]" aria-label={t('gen.countAria')} />
        </div>
      ) : (
        <div>
          <Label>{t('gen.duration', { n: params.durationSec })}</Label>
          <input type="range" min={2} max={model.maxDuration ?? 5} value={params.durationSec} onChange={(e) => onChange({ durationSec: Number(e.target.value) })} className="w-full accent-[var(--color-primary)]" aria-label={t('gen.durationAria')} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Label>{t('gen.seed')}</Label>
          <input
            inputMode="numeric"
            value={params.seed ?? ''}
            onChange={(e) => onChange({ seed: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })}
            placeholder={t('gen.seedRandom')}
            className="h-10 w-full rounded-xl bg-surface-2 px-3 font-mono text-sm ring-1 ring-line focus:ring-primary outline-none placeholder:text-fg-subtle"
          />
        </div>
        <Button type="button" variant="outline" size="md" className="mt-6" onClick={() => onChange({ seed: randomSeed() })} aria-label={t('gen.randomSeed')}><Dice5 size={16} /></Button>
        {params.seed !== null && <Button type="button" variant="ghost" size="md" className="mt-6" onClick={() => onChange({ seed: null })} aria-label={t('gen.clearSeed')}><Lock size={16} /></Button>}
      </div>

      <Button type="submit" size="lg" variant={insufficient ? 'outline' : 'primary'} disabled={!params.prompt.trim() || busy} className="w-full">
        <Sparkles size={18} /> {signedIn ? <>{t('gen.submit')} · <span className="font-mono">{cost} {t('gen.cr')}</span></> : t('auth.toCreate')}
      </Button>
    </form>
  );
}
