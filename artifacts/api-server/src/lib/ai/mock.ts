import { randomInt, randomUUID } from 'node:crypto';
import { findModel, planSegments, type GenerationParams, type GenerationResult } from '@workspace/vexora-core';
import type { AIProvider } from './types';

/** Simulated model: finishes after a short delay (longer for multi-part videos); results are seeds rendered as synthetic art. */
export const mockAI: AIProvider = {
  id: 'mock',
  async submit(_id, params) {
    const m = findModel(params.modelId);
    const parts = m?.maxSegment ? planSegments(params.durationSec, m.maxSegment).length : 1;
    const ms = params.kind === 'video' ? 2500 + parts * 1500 : 2000;
    return { providerJobId: null, finishAt: new Date(Date.now() + ms), state: { parts } };
  },
  async poll(row) {
    const finish = row.finishAt?.getTime() ?? Date.now();
    const start = row.createdAt.getTime();
    const total = (row.state as { parts?: number } | null)?.parts ?? 1;
    if (Date.now() < finish) {
      const progress = Math.min(0.99, (Date.now() - start) / Math.max(1, finish - start));
      return { status: 'running', progress, parts: total > 1 ? { total, current: Math.min(total, Math.floor(progress * total) + 1) } : undefined };
    }
    const p = row.params as GenerationParams;
    const n = p.kind === 'video' ? 1 : p.count;
    const base = p.seed ?? randomInt(2 ** 31 - 1);
    const results: GenerationResult[] = Array.from({ length: n }, (_, k) => ({
      id: randomUUID(), kind: p.kind, aspect: p.aspect, seed: (base + k * 7919) % 2 ** 31, url: null,
    }));
    return { status: 'done', results };
  },
};
