import type { AIProvider } from './types';
import type { GenerationJob } from '@/types';
import { estimateCost } from './costs';

/**
 * Skeleton for a real backend. Expected API (your server):
 *   POST {baseUrl}/generations        -> { id }
 *   GET  {baseUrl}/generations/:id    -> GenerationJob
 */
export function createHttpProvider(baseUrl: string): AIProvider {
  return {
    name: 'http',
    estimateCost,
    async generate(params, onUpdate, signal) {
      const res = await fetch(`${baseUrl}/generations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal,
      });
      if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const job = (await (await fetch(`${baseUrl}/generations/${id}`, { signal })).json()) as GenerationJob;
        onUpdate(job);
        if (job.status === 'done' || job.status === 'failed') return job;
      }
    },
  };
}
