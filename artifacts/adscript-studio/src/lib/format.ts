import type { AdPack } from "./schema";

export function formatTime(sec: number): string {
  const s = Math.round(sec * 10) / 10;
  return `${s}s`;
}

/** Plain-text export of an ad pack, for "Copy all" and downloads. */
export function adPackToText(pack: AdPack, title?: string): string {
  const out: string[] = [];
  if (title) out.push(`# ${title}`, "");
  out.push(`PRODUCT: ${pack.product_summary}`, `AUDIENCE: ${pack.target_audience}`, "", "HOOKS");
  pack.hooks.forEach((h, i) => out.push(`${i + 1}. [${h.type}] ${h.text}`));
  out.push("", "SCRIPT");
  pack.scenes.forEach((s, i) => {
    out.push(
      "",
      `Scene ${i + 1} (${formatTime(s.start_sec)}-${formatTime(s.end_sec)}): ${s.purpose}`,
      `Visual: ${s.visual}`,
      `Camera: ${s.camera}`,
      `On-screen text: ${s.on_screen_text}`,
      `Voiceover: ${s.voiceover}`,
      `Image prompt: ${s.image_prompt}`,
      `Video prompt: ${s.video_prompt}`,
    );
  });
  out.push("", "CAPTION", pack.caption, "", "HASHTAGS", pack.hashtags.join(" "), "", `CTA: ${pack.cta}`, `MUSIC: ${pack.music_suggestion}`);
  return out.join("\n");
}
