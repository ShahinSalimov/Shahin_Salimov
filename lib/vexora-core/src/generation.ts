import {
  ASPECTS, CAMERA_MOTIONS, CAMERA_SUFFIX, STYLE_IDS, STYLE_SUFFIX, findModel,
  type AspectRatio, type CameraMotion, type MediaKind, type Resolution, type StyleId,
} from './models';

export interface GenerationParams {
  modelId: string;
  kind: MediaKind;
  prompt: string;
  negativePrompt: string;
  aspect: AspectRatio;
  styleId: StyleId;
  count: number;
  durationSec: number;
  seed: number | null;
  /** video options (ignored by models that don't support them) */
  resolution?: Resolution;
  audio?: boolean;
  camera?: CameraMotion;
  /** uploaded reference image key (product, logo, face) */
  referenceKey?: string | null;
}

export const PROMPT_MAX = 1500;

/** Credits a generation costs. Single source of truth for client estimate and server charge. */
export function estimateCost(p: Pick<GenerationParams, 'modelId' | 'count' | 'durationSec' | 'resolution'>): number {
  const m = findModel(p.modelId);
  if (!m) return 0;
  if (m.kind === 'image') return m.creditCost * p.count;
  const perSecond = (p.resolution && m.costPerSecond?.[p.resolution]) || m.creditCost;
  return perSecond * p.durationSec;
}

/** Splits a long video into near-equal parts no longer than the vendor limit (45 s → 23 + 22). */
export function planSegments(durationSec: number, maxSegment: number): number[] {
  const n = Math.max(1, Math.ceil(durationSec / maxSegment));
  const base = Math.floor(durationSec / n);
  return Array.from({ length: n }, (_, i) => base + (i < durationSec - base * n ? 1 : 0));
}

/** Validates and normalises untrusted params. Returns an error code or the clean params. */
export function normaliseParams(input: Partial<GenerationParams>): { ok: true; params: GenerationParams } | { ok: false; error: string } {
  const model = input.modelId ? findModel(input.modelId) : undefined;
  if (!model) return { ok: false, error: 'invalid_model' };
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt || prompt.length > PROMPT_MAX) return { ok: false, error: 'invalid_prompt' };
  const aspect = ASPECTS.includes(input.aspect as AspectRatio) ? (input.aspect as AspectRatio) : '1:1';
  const styleId = (STYLE_IDS as readonly string[]).includes(String(input.styleId)) ? (input.styleId as StyleId) : 'none';
  const count = model.kind === 'image' ? Math.min(4, Math.max(1, Math.floor(Number(input.count) || 1))) : 1;
  const durationSec = model.kind === 'video'
    ? Math.min(model.maxDuration ?? 5, Math.max(model.minDuration ?? 2, Math.floor(Number(input.durationSec) || 5)))
    : 0;
  const resolution = model.resolutions?.includes(input.resolution as Resolution) ? input.resolution : model.resolutions?.[model.resolutions.length - 1];
  const audio = model.audio ? input.audio !== false : undefined;
  const camera = model.kind === 'video' && (CAMERA_MOTIONS as readonly string[]).includes(String(input.camera)) ? (input.camera as CameraMotion) : 'auto';
  const referenceKey = model.reference && typeof input.referenceKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(input.referenceKey) ? input.referenceKey : null;
  const seedNum = Number(input.seed);
  const seed = input.seed === null || input.seed === undefined || !Number.isFinite(seedNum) ? null : Math.abs(Math.floor(seedNum)) % 2 ** 31;
  return {
    ok: true,
    params: {
      modelId: model.id, kind: model.kind, prompt, negativePrompt: String(input.negativePrompt ?? '').slice(0, 500),
      aspect, styleId, count, durationSec, seed, resolution, audio, camera, referenceKey,
    },
  };
}

/** Prompt actually sent to the model (style preset appended). */
export const finalPrompt = (p: GenerationParams) =>
  [p.prompt, STYLE_SUFFIX[p.styleId], p.camera ? CAMERA_SUFFIX[p.camera] : ''].filter(Boolean).join(', ');
