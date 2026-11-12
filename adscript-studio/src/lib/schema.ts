import * as z from "zod";

export const PLATFORMS = ["tiktok", "instagram_reels", "youtube_shorts"] as const;
export const DURATIONS = [15, 30, 45, 60] as const;
export const STYLES = [
  "ugc_testimonial",
  "cinematic",
  "problem_solution",
  "funny_skit",
  "unboxing",
  "before_after",
] as const;
export const TONES = ["energetic", "luxury", "friendly", "bold", "calm"] as const;

export const PLATFORM_LABELS: Record<(typeof PLATFORMS)[number], string> = {
  tiktok: "TikTok",
  instagram_reels: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
};

export const STYLE_LABELS: Record<(typeof STYLES)[number], string> = {
  ugc_testimonial: "UGC testimonial",
  cinematic: "Cinematic product film",
  problem_solution: "Problem → Solution",
  funny_skit: "Funny skit",
  unboxing: "Unboxing",
  before_after: "Before / After",
};

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What the user submits from the generator form. */
export const GenerateInputSchema = z.object({
  productName: z.string().trim().min(2, "Product name is too short").max(120),
  productDescription: z.string().trim().min(10, "Describe the product in at least 10 characters").max(2000),
  targetAudience: z.string().trim().max(300).optional().default(""),
  platform: z.enum(PLATFORMS),
  durationSec: z.coerce
    .number()
    .int()
    .refine((v) => (DURATIONS as readonly number[]).includes(v), "Unsupported duration"),
  style: z.enum(STYLES),
  tone: z.enum(TONES),
});
export type GenerateInput = z.infer<typeof GenerateInputSchema>;

/** What Claude must return (enforced with structured outputs). */
export const AdPackSchema = z.object({
  product_summary: z.string().describe("One sentence: what the product is and its main benefit."),
  target_audience: z.string().describe("Who the ad speaks to, specific and concrete."),
  hooks: z
    .array(
      z.object({
        type: z.string().describe("Hook technique, e.g. 'pattern interrupt', 'bold claim', 'question'."),
        text: z.string().describe("The spoken/on-screen hook line for the first 1-3 seconds."),
      }),
    )
    .describe("Exactly 3 alternative hooks."),
  scenes: z
    .array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        purpose: z.string().describe("hook / problem / demo / proof / offer / CTA"),
        visual: z.string().describe("What the viewer sees."),
        camera: z.string().describe("Camera angle and movement, e.g. 'close-up, slow push-in'."),
        on_screen_text: z.string(),
        voiceover: z.string(),
        image_prompt: z.string().describe("English prompt for an AI image generator for this scene's keyframe."),
        video_prompt: z.string().describe("English prompt for an AI video generator (image-to-video) for this scene."),
      }),
    )
    .describe("Scenes covering the full duration back-to-back, starting at 0."),
  caption: z.string(),
  hashtags: z.array(z.string()).describe("8-15 hashtags without spaces, each starting with #."),
  cta: z.string(),
  music_suggestion: z.string().describe("Mood/genre/BPM of background music. No copyrighted track names."),
});
export type AdPack = z.infer<typeof AdPackSchema>;
