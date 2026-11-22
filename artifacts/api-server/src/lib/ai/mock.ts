import { randomInt, randomUUID } from 'node:crypto';
import type { GenerationParams, GenerationResult } from '@workspace/vexora-core';
import type { AIProvider } from './types';

/** Simulated model: finishes after a short delay and returns seeds the client renders as synthetic art. */
export const mockAI: AIProvider = {
  id: 'mock',
  async submit(_id, params) {
    return { providerJobId: null, finishAt: new Date(Date.now() + (params.kind === 'video' ? 3500 : 2000)) };
  },
  async poll(row) {
    const finish = row.finishAt?.getTime() ?? Date.now();
    const start = row.createdAt.getTime();
    if (Date.now() < finish) return { status: 'running', progress: Math.min(0.99, (Date.now() - start) / Math.max(1, finish - start)) };
    const p = row.params as GenerationParams;
    const n = p.kind === 'video' ? 1 : p.count;
    const base = p.seed ?? randomInt(2 ** 31 - 1);
    const results: GenerationResult[] = Array.from({ length: n }, (_, k) => ({
      id: randomUUID(), kind: p.kind, aspect: p.aspect, seed: (base + k * 7919) % 2 ** 31, url: null,
    }));
    return { status: 'done', results };
  },
};
