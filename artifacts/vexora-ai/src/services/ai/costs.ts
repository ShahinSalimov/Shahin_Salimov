import type { GenerationParams } from '@/types';
import { getModel } from '@/data/models';

export function estimateCost(p: GenerationParams): number {
  const m = getModel(p.modelId);
  return m.kind === 'video' ? m.creditCost * p.durationSec : m.creditCost * p.count;
}
