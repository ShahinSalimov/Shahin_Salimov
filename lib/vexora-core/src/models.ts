export type MediaKind = 'image' | 'video';
export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:4';
export const ASPECTS: AspectRatio[] = ['1:1', '4:5', '3:4', '9:16', '16:9'];

export type Resolution = '480p' | '720p';
export const RESOLUTIONS: Resolution[] = ['480p', '720p'];

export interface AIModel {
  id: string;
  name: string;
  kind: MediaKind;
  /** credits per output (image) or per second (video) */
  creditCost: number;
  minDuration?: number;
  /** longest video the site offers for this model */
  maxDuration?: number;
  /** longest clip the vendor makes in one call; longer videos are made of joined parts */
  maxSegment?: number;
  /** per-second credit price by resolution (overrides creditCost) */
  costPerSecond?: Partial<Record<Resolution, number>>;
  resolutions?: Resolution[];
  audio?: boolean;
  /** accepts a reference image (product, logo, face) */
  reference?: boolean;
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

/**
 * NOT ENABLED YET (work in progress, waiting for the owner's go-ahead): add to MODELS to show it.
 * ByteDance Seedance 2.5 (via Replicate). Vendor limit: 4–30 s per call; up to 45 s on the site
 * by joining two parts. Credit prices are PLACEHOLDERS — set them from the real per-second API price.
 */
export const SEEDANCE_2_5: AIModel = {
  id: 'seedance-2-5', name: 'Seedance 2.5', kind: 'video', creditCost: 6, minDuration: 4, maxDuration: 45, maxSegment: 30,
  costPerSecond: { '480p': 4, '720p': 6 }, resolutions: ['480p', '720p'], audio: true, reference: true, badge: 'new',
};

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

export const CAMERA_MOTIONS = ['auto', 'static', 'pushIn', 'pullOut', 'panLeft', 'panRight', 'orbit', 'handheld', 'drone'] as const;
export type CameraMotion = (typeof CAMERA_MOTIONS)[number];
/** Written into the prompt — works with any model, no vendor-specific parameter needed. */
export const CAMERA_SUFFIX: Record<CameraMotion, string> = {
  auto: '',
  static: 'static locked-off camera',
  pushIn: 'slow cinematic push-in camera move',
  pullOut: 'slow pull-out camera move revealing the scene',
  panLeft: 'smooth camera pan to the left',
  panRight: 'smooth camera pan to the right',
  orbit: 'smooth 180-degree orbit around the subject',
  handheld: 'handheld camera with subtle natural shake',
  drone: 'aerial drone shot, smooth gliding movement',
};

export const findModel = (id: string) => MODELS.find((m) => m.id === id);
export const getModel = (id: string) => findModel(id) ?? MODELS[0];
