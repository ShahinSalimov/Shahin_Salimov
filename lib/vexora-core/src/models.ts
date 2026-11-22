export type MediaKind = 'image' | 'video';
export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:4';
export const ASPECTS: AspectRatio[] = ['1:1', '4:5', '3:4', '9:16', '16:9'];

export interface AIModel {
  id: string;
  name: string;
  kind: MediaKind;
  /** credits per output (image) or per second (video) */
  creditCost: number;
  maxDuration?: number;
  badge?: 'new' | 'pro' | 'fast';
}

/** Internal model catalogue. Map ids to real vendors in the server's AI adapter. */
export const MODELS: AIModel[] = [
  { id: 'ember-img-2', name: 'Ember Image 2', kind: 'image', creditCost: 2, badge: 'new' },
  { id: 'ember-img-fast', name: 'Ember Flash', kind: 'image', creditCost: 1, badge: 'fast' },
  { id: 'ember-img-pro', name: 'Ember Image Pro', kind: 'image', creditCost: 4, badge: 'pro' },
  { id: 'pulse-vid-1', name: 'Pulse Motion', kind: 'video', creditCost: 6, maxDuration: 10, badge: 'new' },
  { id: 'pulse-vid-lite', name: 'Pulse Lite', kind: 'video', creditCost: 3, maxDuration: 6, badge: 'fast' },
];

export const STYLE_IDS = ['none', 'realistic', 'cinematic', 'studio', 'neon', 'editorial'] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export const STYLE_SUFFIX: Record<StyleId, string> = {
  none: '',
  realistic: 'photorealistic, natural skin texture, 35mm lens',
  cinematic: 'cinematic lighting, anamorphic, film grain, IMAX framing',
  studio: 'studio product shot, seamless backdrop, softbox lighting',
  neon: 'neon noir, wet asphalt reflections, red and amber glow',
  editorial: 'high-fashion editorial, magazine cover composition',
};

export const findModel = (id: string) => MODELS.find((m) => m.id === id);
export const getModel = (id: string) => findModel(id) ?? MODELS[0];
