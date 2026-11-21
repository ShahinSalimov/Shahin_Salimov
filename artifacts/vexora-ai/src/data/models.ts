import type { AIModel, StylePreset } from '@/types';

/** Internal model catalogue. Taglines live in i18n under `models.<id>`; map ids to real providers in services/ai. */
export const MODELS: AIModel[] = [
  { id: 'ember-img-2', name: 'Ember Image 2', kind: 'image', creditCost: 2, badge: 'new' },
  { id: 'ember-img-fast', name: 'Ember Flash', kind: 'image', creditCost: 1, badge: 'fast' },
  { id: 'ember-img-pro', name: 'Ember Image Pro', kind: 'image', creditCost: 4, badge: 'pro' },
  { id: 'pulse-vid-1', name: 'Pulse Motion', kind: 'video', creditCost: 6, maxDuration: 10, badge: 'new' },
  { id: 'pulse-vid-lite', name: 'Pulse Lite', kind: 'video', creditCost: 3, maxDuration: 6, badge: 'fast' },
];

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'none', suffix: '' },
  { id: 'realistic', suffix: 'photorealistic, natural skin texture, 35mm lens' },
  { id: 'cinematic', suffix: 'cinematic lighting, anamorphic, film grain, IMAX framing' },
  { id: 'studio', suffix: 'studio product shot, seamless backdrop, softbox lighting' },
  { id: 'neon', suffix: 'neon noir, wet asphalt reflections, red and amber glow' },
  { id: 'editorial', suffix: 'high-fashion editorial, magazine cover composition' },
];

export const getModel = (id: string) => MODELS.find((m) => m.id === id) ?? MODELS[0];
