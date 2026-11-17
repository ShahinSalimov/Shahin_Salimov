import { describe, expect, it } from "vitest";
import { buildUserPrompt } from "./prompt";
import { GenerateInputSchema } from "./schema";
import { adPackToText } from "./format";

const valid = {
  productName: "GlowMist",
  productDescription: "Rose water face mist, 100 ml",
  platform: "tiktok",
  durationSec: "30",
  style: "ugc_testimonial",
  tone: "friendly",
};

describe("GenerateInputSchema", () => {
  it("accepts form strings and coerces duration", () => {
    const r = GenerateInputSchema.parse(valid);
    expect(r.durationSec).toBe(30);
    expect(r.targetAudience).toBe("");
  });

  it("rejects unsupported duration and platform", () => {
    expect(GenerateInputSchema.safeParse({ ...valid, durationSec: "20" }).success).toBe(false);
    expect(GenerateInputSchema.safeParse({ ...valid, platform: "facebook" }).success).toBe(false);
  });

  it("rejects too-short description", () => {
    expect(GenerateInputSchema.safeParse({ ...valid, productDescription: "short" }).success).toBe(false);
  });
});

describe("buildUserPrompt", () => {
  it("includes product facts and the photo instruction only when an image is attached", () => {
    const input = GenerateInputSchema.parse(valid);
    const withImg = buildUserPrompt(input, true);
    expect(withImg).toContain("30-second TikTok ad");
    expect(withImg).toContain("GlowMist");
    expect(withImg).toContain("real product photo");
    expect(buildUserPrompt(input, false)).not.toContain("real product photo");
  });
});

describe("adPackToText", () => {
  it("renders every section", () => {
    const text = adPackToText(
      {
        product_summary: "A mist",
        target_audience: "Women 20-35",
        hooks: [{ type: "question", text: "Dry skin at 3pm?" }],
        scenes: [{ start_sec: 0, end_sec: 3, purpose: "hook", visual: "v", camera: "c", on_screen_text: "t", voiceover: "vo", image_prompt: "ip", video_prompt: "vp" }],
        caption: "cap",
        hashtags: ["#a", "#b"],
        cta: "Shop now",
        music_suggestion: "lofi 90bpm",
      },
      "GlowMist",
    );
    expect(text).toContain("# GlowMist");
    expect(text).toContain("Scene 1 (0s-3s): hook");
    expect(text).toContain("Image prompt: ip");
    expect(text).toContain("#a #b");
  });
});
