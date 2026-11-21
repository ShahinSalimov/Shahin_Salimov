import type { AIModel, StylePreset } from '@/types';

/** Internal model catalogue. Names are Salimofff's own labels; map them to real providers in services/ai. */
export const MODELS: AIModel[] = [
  { id: 'ember-img-2', name: 'Ember Image 2', kind: 'image', tagline: 'Realistic foto, dəqiq işıq', creditCost: 2, badge: 'new' },
  { id: 'ember-img-fast', name: 'Ember Flash', kind: 'image', tagline: 'Sürətli eskiz və variantlar', creditCost: 1, badge: 'fast' },
  { id: 'ember-img-pro', name: 'Ember Image Pro', kind: 'image', tagline: '4K detal, məhsul çəkilişi', creditCost: 4, badge: 'pro' },
  { id: 'pulse-vid-1', name: 'Pulse Motion', kind: 'video', tagline: 'Cinematic camera movement', creditCost: 6, maxDuration: 10, badge: 'new' },
  { id: 'pulse-vid-lite', name: 'Pulse Lite', kind: 'video', tagline: 'Qısa Reels/TikTok klipləri', creditCost: 3, maxDuration: 6, badge: 'fast' },
];

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'none', label: 'Sərbəst', suffix: '' },
  { id: 'realistic', label: 'Realistic', suffix: 'photorealistic, natural skin texture, 35mm lens' },
  { id: 'cinematic', label: 'Cinematic', suffix: 'cinematic lighting, anamorphic, film grain, IMAX framing' },
  { id: 'studio', label: 'Studio product', suffix: 'studio product shot, seamless backdrop, softbox lighting' },
  { id: 'neon', label: 'Neon noir', suffix: 'neon noir, wet asphalt reflections, red and amber glow' },
  { id: 'editorial', label: 'Editorial', suffix: 'high-fashion editorial, magazine cover composition' },
];

export const getModel = (id: string) => MODELS.find((m) => m.id === id) ?? MODELS[0];
