import { z } from 'zod';
import {
  conceptSchema,
  sceneSchema,
  socialSchema,
  type CampaignInput,
  type Concept,
  type GeneratorInfo,
  type Scene,
  type SocialContent,
  type Voiceover,
} from '../schemas';
import { fitDurations, generateConcepts, generateScenes, generateSocial, generateVoiceover, buildVoiceoverText } from '../engine/generate';
import { uid } from '../engine/util';

/** Every generation backend (local templates or a real AI provider) implements this contract. */
export interface GenerationProvider {
  readonly info: GeneratorInfo;
  concepts(input: CampaignInput, opts: { seed: number; count: number; excludeArchetypes?: string[] }): Promise<Concept[]>;
  scenes(input: CampaignInput, concept: Concept, seed: number): Promise<Scene[]>;
  voiceover(input: CampaignInput, concept: Concept, scenes: Scene[], seed: number): Promise<Voiceover>;
  social(input: CampaignInput, concept: Concept, seed: number): Promise<SocialContent>;
}

export const localProvider: GenerationProvider = {
  info: { engine: 'local' },
  async concepts(input, { seed, count, excludeArchetypes }) {
    return generateConcepts(input, seed, count, excludeArchetypes);
  },
  async scenes(input, concept, seed) {
    return generateScenes(input, concept, seed);
  },
  async voiceover(input, _concept, scenes) {
    return generateVoiceover(input, scenes);
  },
  async social(input, concept, seed) {
    return generateSocial(input, concept, seed);
  },
};

// ---------------------------------------------------------------------------
// Remote provider: talks only to the AdSpark server proxy, never to a vendor directly.

export const aiStatusSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().optional(),
  model: z.string().optional(),
  remainingToday: z.number().optional(),
  limitPerClient: z.number().optional(),
  reason: z.string().optional(),
});

export type AiStatus = z.infer<typeof aiStatusSchema>;

export class AiRequestError extends Error {}

export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  try {
    const res = await fetch('/api/ai/status', { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { enabled: false, reason: 'The AdSpark server is not running.' };
    const parsed = aiStatusSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : { enabled: false, reason: 'Unexpected response from the server.' };
  } catch {
    return { enabled: false, reason: 'The AdSpark server is not running.' };
  }
}

async function callAi<T>(task: string, body: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-AdSpark-Consent': 'granted' },
      body: JSON.stringify({ task, ...body }),
    });
  } catch {
    throw new AiRequestError('Could not reach the AdSpark server.');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    const message = (json as { error?: string } | null)?.error;
    throw new AiRequestError(message || `AI request failed (${res.status}).`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AiRequestError('The AI response did not match the expected format.');
  return parsed.data;
}

const aiConcept = conceptSchema.omit({ id: true, saved: true, archetype: true });
const aiScene = sceneSchema.omit({ id: true, beat: true });

export function createRemoteProvider(status: AiStatus): GenerationProvider {
  const info: GeneratorInfo = { engine: 'ai', provider: status.provider, model: status.model };
  return {
    info,
    async concepts(input, { count }) {
      const data = await callAi('concepts', { input, count }, z.object({ concepts: z.array(aiConcept).min(1).max(8) }));
      return data.concepts.slice(0, count).map((c) => ({ ...c, id: uid('c_'), archetype: 'ai', saved: false }));
    },
    async scenes(input, concept) {
      const data = await callAi('script', { input, concept }, z.object({ scenes: z.array(aiScene).min(2).max(12) }));
      const scenes = data.scenes.map((s) => ({ ...s, id: uid('s_'), beat: 'custom' }));
      // Guarantee the timing invariant even if the model's arithmetic is off.
      return fitDurations(scenes, input.duration);
    },
    async voiceover(input, _concept, scenes) {
      // Voiceover is derived from the scene lines so timing markers stay accurate.
      return { text: buildVoiceoverText(scenes), language: input.language, tone: input.tone };
    },
    async social(input, concept) {
      return callAi('social', { input, concept }, socialSchema);
    },
  };
}
