import { ASPECTS, STYLE_IDS, STYLE_SUFFIX, findModel, type AspectRatio, type MediaKind, type StyleId } from './models';

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
}

export const PROMPT_MAX = 1500;

/** Credits a generation costs. Single source of truth for client estimate and server charge. */
export function estimateCost(p: Pick<GenerationParams, 'modelId' | 'count' | 'durationSec'>): number {
  const m = findModel(p.modelId);
  if (!m) return 0;
  return m.kind === 'video' ? m.creditCost * p.durationSec : m.creditCost * p.count;
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
  const durationSec = model.kind === 'video' ? Math.min(model.maxDuration ?? 5, Math.max(2, Math.floor(Number(input.durationSec) || 5))) : 0;
  const seedNum = Number(input.seed);
  const seed = input.seed === null || input.seed === undefined || !Number.isFinite(seedNum) ? null : Math.abs(Math.floor(seedNum)) % 2 ** 31;
  return {
    ok: true,
    params: {
      modelId: model.id, kind: model.kind, prompt, negativePrompt: String(input.negativePrompt ?? '').slice(0, 500),
      aspect, styleId, count, durationSec, seed,
    },
  };
}

/** Prompt actually sent to the model (style preset appended). */
export const finalPrompt = (p: GenerationParams) => (STYLE_SUFFIX[p.styleId] ? `${p.prompt}, ${STYLE_SUFFIX[p.styleId]}` : p.prompt);
