import { z } from 'zod';

export const CATEGORIES = [
  'Restaurant',
  'Fashion',
  'Beauty',
  'Technology',
  'Real Estate',
  'Education',
  'Fitness',
  'E-commerce',
  'Local Services',
  'Other',
] as const;

export const LANGUAGES = ['English', 'Azerbaijani', 'Turkish', 'Russian'] as const;

export const PLATFORMS = ['Instagram Reels', 'TikTok', 'YouTube Shorts', 'Facebook', 'YouTube'] as const;

export const DURATIONS = [15, 30, 45, 60] as const;

export const STYLES = [
  'Cinematic',
  'Emotional',
  'Funny',
  'Luxury',
  'Minimal',
  'UGC',
  'Product demonstration',
  'Storytelling',
  'Promotional',
] as const;

export const TONES = ['Friendly', 'Professional', 'Energetic', 'Bold', 'Warm', 'Playful', 'Inspirational', 'Calm'] as const;

export const GOALS = [
  'Brand awareness',
  'Drive sales',
  'Generate leads',
  'Launch a new product',
  'Promote an offer',
  'Increase store visits',
  'Grow followers',
] as const;

export const STORYBOARD_STYLES = ['Sketch', 'Clean', 'Neon', 'Warm'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Language = (typeof LANGUAGES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Duration = (typeof DURATIONS)[number];
export type AdStyle = (typeof STYLES)[number];
export type Tone = (typeof TONES)[number];
export type Goal = (typeof GOALS)[number];
export type StoryboardStyle = (typeof STORYBOARD_STYLES)[number];

const text = (max: number) => z.string().trim().max(max);
const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const campaignInputSchema = z.object({
  productName: required('Product or business name', 80),
  description: z
    .string()
    .trim()
    .min(20, 'Describe the product in at least 20 characters')
    .max(1200, 'Description must be at most 1200 characters'),
  category: z.enum(CATEGORIES, { error: 'Choose a category' }),
  price: text(40).optional().default(''),
  benefits: z
    .string()
    .trim()
    .min(3, 'List at least one main benefit')
    .max(800, 'Benefits must be at most 800 characters'),
  audience: required('Target audience', 300),
  problem: required('Customer problem', 500),
  goal: z.enum(GOALS, { error: 'Choose an advertising goal' }),
  language: z.enum(LANGUAGES, { error: 'Choose a language' }),
  platform: z.enum(PLATFORMS, { error: 'Choose a platform' }),
  duration: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)], { error: 'Choose a duration' }),
  tone: z.enum(TONES, { error: 'Choose a tone' }),
  style: z.enum(STYLES, { error: 'Choose a campaign style' }),
  cta: required('Call to action', 80),
  brandId: z.string().max(64).optional(),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const conceptSchema = z.object({
  id: z.string().min(1).max(64),
  archetype: z.string().max(60),
  title: text(120),
  mainIdea: text(800),
  audience: text(300),
  angle: text(300),
  emotionalTrigger: text(120),
  hook: text(300),
  message: text(500),
  cta: text(120),
  visualDirection: text(600),
  saved: z.boolean().default(false),
});

export type Concept = z.infer<typeof conceptSchema>;

export const sceneSchema = z.object({
  id: z.string().min(1).max(64),
  duration: z.number().int().min(1).max(60),
  beat: z.string().max(40).default('custom'),
  shot: z.enum(['wide', 'medium', 'close', 'product', 'text', 'pov']).default('medium'),
  visual: text(800),
  camera: text(400),
  action: text(400),
  onScreenText: text(200),
  voiceover: text(600),
  sfx: text(200),
  transition: text(120),
});

export type Scene = z.infer<typeof sceneSchema>;
export type ShotType = Scene['shot'];

export const voiceoverSchema = z.object({
  text: text(6000),
  language: z.enum(LANGUAGES),
  tone: z.enum(TONES),
});

export type Voiceover = z.infer<typeof voiceoverSchema>;

export const socialSchema = z.object({
  instagram: text(2200),
  tiktok: text(2200),
  youtubeShorts: text(5000),
  facebook: text(5000),
  hashtags: z.array(text(60)).max(30),
  shortTitle: text(100),
  ctas: z.array(text(120)).max(10),
});

export type SocialContent = z.infer<typeof socialSchema>;

export const generatorInfoSchema = z.object({
  engine: z.enum(['local', 'ai']),
  provider: z.string().max(40).optional(),
  model: z.string().max(120).optional(),
});

export type GeneratorInfo = z.infer<typeof generatorInfoSchema>;

export const campaignSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(120).min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  input: campaignInputSchema,
  concepts: z.array(conceptSchema).max(12),
  selectedConceptId: z.string().max(64).nullable().default(null),
  scenes: z.array(sceneSchema).max(30),
  voiceover: voiceoverSchema.nullable().default(null),
  social: socialSchema.nullable().default(null),
  storyboardStyle: z.enum(STORYBOARD_STYLES).default('Clean'),
  generator: generatorInfoSchema.default({ engine: 'local' }),
  seed: z.number().int().default(1),
});

export type Campaign = z.infer<typeof campaignSchema>;

export const brandSchema = z.object({
  id: z.string().min(1).max(64),
  name: required('Brand name', 80),
  logo: z
    .string()
    .max(1_500_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Invalid logo data')
    .nullable()
    .default(null),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #8065F6')).max(6),
  tone: z.enum(TONES),
  audience: text(300),
  description: text(1200),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^https?:\/\/[^\s<>"']+$/i.test(v), 'Website must start with http:// or https://'),
  contact: text(300),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Brand = z.infer<typeof brandSchema>;

export const backupSchema = z.object({
  app: z.literal('AdSpark'),
  kind: z.literal('backup'),
  version: z.literal(1),
  exportedAt: z.number(),
  campaigns: z.array(z.unknown()).max(1000),
  brands: z.array(z.unknown()).max(100),
});

export const projectFileSchema = z.object({
  app: z.literal('AdSpark'),
  kind: z.literal('campaign'),
  version: z.literal(1),
  exportedAt: z.number(),
  campaign: z.unknown(),
});

/** Formats the first Zod issue per field into a flat record for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
