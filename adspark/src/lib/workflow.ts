import type { GenerationProvider } from './ai/provider';
import type { Campaign, Concept, GeneratorInfo, Scene, SocialContent, Voiceover } from './schemas';
import { newSeed } from './engine/util';

export const CONCEPT_COUNT = 5;

/** Regenerates concepts, keeping any the user saved. */
export async function regenerateConcepts(c: Campaign, provider: GenerationProvider): Promise<Concept[]> {
  const kept = c.concepts.filter((k) => k.saved);
  const needed = Math.max(0, CONCEPT_COUNT - kept.length);
  if (needed === 0) return kept;
  const fresh = await provider.concepts(c.input, {
    seed: newSeed(),
    count: needed,
    excludeArchetypes: kept.map((k) => k.archetype),
  });
  return [...kept, ...fresh];
}

/** Replaces one concept with a new one based on an approach not already on screen. */
export async function regenerateSingleConcept(c: Campaign, conceptId: string, provider: GenerationProvider): Promise<Concept[]> {
  const [fresh] = await provider.concepts(c.input, {
    seed: newSeed(),
    count: 1,
    excludeArchetypes: c.concepts.map((k) => k.archetype),
  });
  if (!fresh) return c.concepts;
  return c.concepts.map((k) => (k.id === conceptId ? fresh : k));
}

export interface FullCampaign {
  scenes: Scene[];
  voiceover: Voiceover;
  social: SocialContent;
  generator: GeneratorInfo;
}

export async function buildFullCampaign(c: Campaign, concept: Concept, provider: GenerationProvider): Promise<FullCampaign> {
  const seed = newSeed();
  const scenes = await provider.scenes(c.input, concept, seed);
  const [voiceover, social] = await Promise.all([
    provider.voiceover(c.input, concept, scenes, seed),
    provider.social(c.input, concept, seed),
  ]);
  return { scenes, voiceover, social, generator: provider.info };
}
