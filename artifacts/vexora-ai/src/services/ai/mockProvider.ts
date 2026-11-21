import type { AIProvider } from './types';
import type { GenerationJob, GenerationResult } from '@/types';
import { estimateCost } from './costs';
import { randomSeed } from '@/lib/random';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

/** Simulates queue → progress → results. Outputs are seeds rendered as synthetic art. */
export const mockProvider: AIProvider = {
  name: 'mock',
  estimateCost,
  generate(params, onUpdate, signal) {
    const job: GenerationJob = { id: uid('job'), params, status: 'queued', progress: 0, cost: estimateCost(params), results: [] };
    onUpdate({ ...job });
    const steps = params.kind === 'video' ? 28 : 16;
    return new Promise((resolve, reject) => {
      let i = 0;
      const timer = setInterval(() => {
        if (signal?.aborted) { clearInterval(timer); reject(new DOMException('Aborted', 'AbortError')); return; }
        i++;
        job.status = 'running';
        job.progress = Math.min(i / steps, 1);
        if (i >= steps) {
          clearInterval(timer);
          const n = params.kind === 'video' ? 1 : params.count;
          const base = params.seed ?? randomSeed();
          job.results = Array.from({ length: n }, (_, k): GenerationResult => ({
            id: uid('res'), jobId: job.id, kind: params.kind, aspect: params.aspect,
            seed: base + k * 7919, prompt: params.prompt, modelId: params.modelId, createdAt: new Date().toISOString(),
          }));
          job.status = 'done';
          onUpdate({ ...job });
          resolve({ ...job });
          return;
        }
        onUpdate({ ...job });
      }, 120);
    });
  },
};
