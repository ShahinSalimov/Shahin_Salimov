import { z } from 'zod';

/**
 * Output schemas sent to the provider as structured-output formats.
 * Kept deliberately simple (no defaults, no length limits) so every provider's
 * strict JSON-schema mode accepts them. The app's own, stricter schemas
 * (src/lib/schemas.ts) validate the result afterwards.
 */
export const providerSchemas = {
  concepts: z.object({
    concepts: z.array(
      z.object({
        title: z.string(),
        mainIdea: z.string(),
        audience: z.string(),
        angle: z.string(),
        emotionalTrigger: z.string(),
        hook: z.string(),
        message: z.string(),
        cta: z.string(),
        visualDirection: z.string(),
      }),
    ),
  }),
  script: z.object({
    scenes: z.array(
      z.object({
        duration: z.number().int(),
        shot: z.enum(['wide', 'medium', 'close', 'product', 'text', 'pov']),
        visual: z.string(),
        camera: z.string(),
        action: z.string(),
        onScreenText: z.string(),
        voiceover: z.string(),
        sfx: z.string(),
        transition: z.string(),
      }),
    ),
  }),
  social: z.object({
    instagram: z.string(),
    tiktok: z.string(),
    youtubeShorts: z.string(),
    facebook: z.string(),
    hashtags: z.array(z.string()),
    shortTitle: z.string(),
    ctas: z.array(z.string()),
  }),
} as const;

export type ProviderTask = keyof typeof providerSchemas;
