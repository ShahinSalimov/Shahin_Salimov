import { useCallback, useRef, useState } from 'react';
import { aiProvider } from '@/services/ai';
import { useApp } from '@/store/AppStore';
import type { GenerationJob, GenerationParams } from '@/types';

export function useGeneration() {
  const { spendCredits, addCredits, addToLibrary } = useApp();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());

  const run = useCallback(async (params: GenerationParams) => {
    setError(null);
    const cost = aiProvider.estimateCost(params);
    if (!spendCredits(cost)) { setError('Kredit kifayət etmir. Paket al və ya planı yüksəlt.'); return; }
    const ctrl = new AbortController();
    let jobId = '';
    try {
      const final = await aiProvider.generate(params, (job) => {
        if (!jobId) { jobId = job.id; controllers.current.set(jobId, ctrl); }
        setJobs((js) => (js.some((j) => j.id === job.id) ? js.map((j) => (j.id === job.id ? job : j)) : [job, ...js]));
      }, ctrl.signal);
      addToLibrary(final.results);
    } catch (e) {
      addCredits(cost); // refund on failure / cancel
      setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: 'failed', error: (e as Error).name === 'AbortError' ? 'Ləğv edildi' : 'Xəta baş verdi' } : j)));
    } finally {
      controllers.current.delete(jobId);
    }
  }, [spendCredits, addCredits, addToLibrary]);

  const cancel = (id: string) => controllers.current.get(id)?.abort();
  return { jobs, run, cancel, error, estimate: aiProvider.estimateCost };
}
