import { campaignInputSchema, campaignSchema, type Campaign } from './schemas';
import { generateConcepts, generateScenes, generateSocial, generateVoiceover } from './engine/generate';
import { uid } from './engine/util';

/** Fictional sample business used to show a complete campaign. Clearly named as a sample. */
export const DEMO_INPUT = campaignInputSchema.parse({
  productName: 'Bloom Bakery',
  description:
    'A neighbourhood bakery making sourdough bread and pastries every morning from organic flour, with same-day local delivery.',
  category: 'Restaurant',
  price: '',
  benefits: 'Baked fresh every morning\nOrganic flour, no preservatives\nDelivered to your door the same day',
  audience: 'busy families and young professionals in the city',
  problem: 'Supermarket bread goes stale in a day and tastes like nothing',
  goal: 'Drive sales',
  language: 'English',
  platform: 'Instagram Reels',
  duration: 30,
  tone: 'Warm',
  style: 'Cinematic',
  cta: 'Order today in the link',
});

const DEMO_SEED = 20261111;

export function buildDemoCampaign(now = Date.now()): Campaign {
  const concepts = generateConcepts(DEMO_INPUT, DEMO_SEED);
  const chosen = concepts.find((c) => c.archetype === 'behindScenes') ?? concepts[0];
  const scenes = generateScenes(DEMO_INPUT, chosen, DEMO_SEED);
  return campaignSchema.parse({
    id: uid('cmp_'),
    name: 'Sample: Bloom Bakery morning launch',
    createdAt: now,
    updatedAt: now,
    input: DEMO_INPUT,
    concepts: concepts.map((c) => (c.id === chosen.id ? { ...c, saved: true } : c)),
    selectedConceptId: chosen.id,
    scenes,
    voiceover: generateVoiceover(DEMO_INPUT, scenes),
    social: generateSocial(DEMO_INPUT, chosen, DEMO_SEED),
    storyboardStyle: 'Warm',
    generator: { engine: 'local' },
    seed: DEMO_SEED,
  });
}
