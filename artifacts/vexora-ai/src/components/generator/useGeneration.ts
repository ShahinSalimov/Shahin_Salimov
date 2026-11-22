import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateCost, type GenerationDTO, type GenerationParams } from '@workspace/vexora-core';
import { backend } from '@/services/backend';
import { useApp } from '@/store/AppStore';
import { errorKey } from '@/lib/errors';
import type { TKey } from '@/i18n';

const POLL_MS = 500;
const active = (g: GenerationDTO) => g.status === 'running' || g.status === 'queued';

/** Starts jobs on the server and polls them until they settle. Credits are charged/refunded server-side. */
export function useGeneration() {
  const { refreshMe } = useApp();
  const [jobs, setJobs] = useState<GenerationDTO[]>([]);
  const [error, setError] = useState<TKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const upsert = (g: GenerationDTO) => setJobs((js) => (js.some((j) => j.id === g.id) ? js.map((j) => (j.id === g.id ? g : j)) : [g, ...js]));

  useEffect(() => {
    if (!jobs.some(active)) return;
    timer.current = window.setTimeout(async () => {
      const updates = await Promise.all(jobs.filter(active).map((j) => backend.getGeneration(j.id).catch(() => j)));
      updates.forEach(upsert);
      if (updates.some((u) => !active(u))) void refreshMe();
    }, POLL_MS);
    return () => window.clearTimeout(timer.current);
  }, [jobs, refreshMe]);

  const run = useCallback(async (params: GenerationParams) => {
    setError(null);
    setSubmitting(true);
    try {
      upsert(await backend.createGeneration(params));
      void refreshMe();
    } catch (e) {
      setError(errorKey(e));
    } finally { setSubmitting(false); }
  }, [refreshMe]);

  const cancel = useCallback(async (id: string) => {
    try { upsert(await backend.cancelGeneration(id)); void refreshMe(); } catch { /* already finished */ }
  }, [refreshMe]);

  return { jobs, run, cancel, error, submitting, estimate: estimateCost };
}
