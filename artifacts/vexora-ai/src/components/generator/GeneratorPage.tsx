import { useEffect, useState } from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';
import { ParamPanel } from './ParamPanel';
import { JobCard } from './JobCard';
import { useGeneration } from './useGeneration';
import { useApp } from '@/store/AppStore';
import { Button } from '@/components/ui/Button';
import { STYLE_PRESETS } from '@/data/models';
import type { GenerationParams } from '@/types';

const INITIAL: GenerationParams = {
  modelId: 'ember-img-2', kind: 'image', prompt: '', negativePrompt: '', aspect: '4:5', styleId: 'realistic', count: 2, durationSec: 5, seed: null,
};

export function GeneratorPage() {
  const { credits, navigate, consumeRemix } = useApp();
  const [params, setParams] = useState<GenerationParams>(INITIAL);
  const { jobs, run, cancel, error, estimate } = useGeneration();

  useEffect(() => { const p = consumeRemix(); if (p) setParams((s) => ({ ...s, prompt: p })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const style = STYLE_PRESETS.find((s) => s.id === params.styleId)?.suffix;
    void run({ ...params, prompt: style ? `${params.prompt.trim()}, ${style}` : params.prompt.trim() });
  };

  return (
    <div className="py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Yaratma <span className="text-gradient">studiyası</span></h1>
        <p className="mt-1 text-muted">Model seç, prompt yaz, parametrləri tənzimlə.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <ParamPanel params={params} onChange={(p) => setParams((s) => ({ ...s, ...p }))} onSubmit={submit} cost={estimate(params)} credits={credits} />
        <section aria-live="polite" className="space-y-4">
          {error && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-blaze-500/10 p-4 text-sm text-blaze-300 ring-1 ring-blaze-500/40">
              <AlertTriangle size={18} /> <span className="flex-1">{error}</span>
              <Button size="sm" variant="volt" onClick={() => navigate('pricing')}>Kredit al</Button>
            </div>
          )}
          {jobs.length ? jobs.map((j) => <JobCard key={j.id} job={j} onCancel={cancel} />) : (
            <div className="grid min-h-[420px] place-items-center rounded-3xl border-2 border-dashed border-ink-700 p-10 text-center">
              <div>
                <Wand2 className="mx-auto mb-3 text-volt-400" size={36} />
                <p className="font-display text-xl font-bold">Nəticələr burada görünəcək</p>
                <p className="mt-1 text-sm text-muted">Kəşf et bölməsindən hazır prompt-u remix edə bilərsən.</p>
                <Button variant="outline" className="mt-5" onClick={() => navigate('explore')}>İlham al</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
