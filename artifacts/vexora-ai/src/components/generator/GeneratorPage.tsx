import { useEffect, useState } from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';
import { ParamPanel } from './ParamPanel';
import { JobCard } from './JobCard';
import { useGeneration } from './useGeneration';
import { useApp } from '@/store/AppStore';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import type { GenerationParams } from '@/types';

const INITIAL: GenerationParams = {
  modelId: 'ember-img-2', kind: 'image', prompt: '', negativePrompt: '', aspect: '4:5', styleId: 'realistic', count: 2, durationSec: 5, seed: null,
};

export function GeneratorPage() {
  const { me, navigate, consumeRemix, openAuth } = useApp();
  const { t } = useI18n();
  const [params, setParams] = useState<GenerationParams>(INITIAL);
  const { jobs, run, cancel, error, submitting, estimate } = useGeneration();

  useEffect(() => { const p = consumeRemix(); if (p) setParams((s) => ({ ...s, prompt: p })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!params.prompt.trim()) return;
    if (me) void run(params); else openAuth('signup');
  };

  return (
    <div className="py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{t('gen.title1')} <span className="text-gradient">{t('gen.title2')}</span></h1>
        <p className="mt-1 text-fg-muted">{t('gen.subtitle')}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <ParamPanel params={params} onChange={(p) => setParams((s) => ({ ...s, ...p }))} onSubmit={submit}
          cost={estimate(params)} credits={me?.balance ?? 0} signedIn={!!me} busy={submitting} />
        <section aria-live="polite" className="min-w-0 space-y-4">
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger ring-1 ring-danger/20">
              <AlertTriangle size={18} /> <span className="flex-1">{t(error)}</span>
              {error === 'errors.insufficient_credits' && <Button size="sm" variant="accent" onClick={() => navigate('pricing')}>{t('gen.buy')}</Button>}
            </div>
          )}
          {jobs.length ? jobs.map((j) => <JobCard key={j.id} job={j} onCancel={cancel} />) : (
            <div className="grid min-h-[420px] place-items-center rounded-3xl border-2 border-dashed border-line-strong bg-surface/50 p-10 text-center">
              <div>
                <Wand2 className="mx-auto mb-3 text-primary" size={36} />
                <p className="font-display text-xl font-bold">{t('gen.emptyTitle')}</p>
                <p className="mt-1 text-sm text-fg-muted">{t('gen.emptyText')}</p>
                <Button variant="outline" className="mt-5" onClick={() => navigate('explore')}>{t('gen.inspire')}</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
