import type { Brand, Campaign } from '../schemas';
import { aspectRatio } from '../engine/generate';
import { formatTime } from '../engine/util';
import { generatorLabel, selectedConcept } from './txt';

/** Renderer-independent report model. The PDF renders it; tests assert on it. */
export type ReportBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'field'; label: string; value: string }
  | { kind: 'scene'; number: number; meta: string; fields: [string, string][] }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  | { kind: 'tags'; text: string };

export interface Report {
  title: string;
  subtitle: string;
  brand: string;
  blocks: ReportBlock[];
}

export function buildReport(c: Campaign, brand?: Brand | null): Report {
  const blocks: ReportBlock[] = [];
  const brandName = brand?.name ?? c.input.productName;
  const h = (text: string) => blocks.push({ kind: 'heading', text });
  const f = (label: string, value: string) => blocks.push({ kind: 'field', label, value: value || '—' });

  h('Campaign overview');
  f('Brand', brandName);
  f('Product', `${c.input.productName} (${c.input.category})${c.input.price ? ` · ${c.input.price}` : ''}`);
  f('Format', `${c.input.platform}, ${aspectRatio(c.input.platform)}, ${c.input.duration} seconds`);
  f('Style and tone', `${c.input.style} · ${c.input.tone} · Goal: ${c.input.goal}`);
  f('Target audience', c.input.audience);
  f('Customer problem', c.input.problem);
  f('Generated with', generatorLabel(c));
  if (brand?.website || brand?.contact) f('Contact', [brand.website, brand.contact].filter(Boolean).join(' · '));

  const concept = selectedConcept(c);
  if (concept) {
    h('Campaign concept');
    f('Title', concept.title);
    f('Main idea', concept.mainIdea);
    f('Advertising angle', concept.angle);
    f('Emotional trigger', concept.emotionalTrigger);
    f('Opening hook', concept.hook);
    f('Main message', concept.message);
    f('Call to action', concept.cta);
    f('Visual direction', concept.visualDirection);
  }

  if (c.scenes.length) {
    const total = c.scenes.reduce((a, s) => a + s.duration, 0);
    h(`Advertising script and storyboard (${total}s)`);
    let t = 0;
    c.scenes.forEach((s, i) => {
      const start = t;
      t += s.duration;
      blocks.push({
        kind: 'scene',
        number: i + 1,
        meta: `${formatTime(start)}–${formatTime(t)} · ${s.duration}s · ${s.shot} shot`,
        fields: [
          ['Visual', s.visual],
          ['Camera', s.camera],
          ['Action', s.action],
          ['On-screen text', s.onScreenText || '—'],
          ['Voiceover', s.voiceover || '—'],
          ['Sound effects', s.sfx || '—'],
          ['Transition', s.transition],
        ],
      });
    });
  }

  if (c.voiceover) {
    h('Voiceover');
    blocks.push({ kind: 'paragraph', text: `Language: ${c.voiceover.language} · Tone: ${c.voiceover.tone}`, muted: true });
    blocks.push({ kind: 'paragraph', text: c.voiceover.text });
  }

  if (c.social) {
    h('Social media captions');
    f('Short title', c.social.shortTitle);
    f('Instagram caption', c.social.instagram);
    f('TikTok caption', c.social.tiktok);
    f('YouTube Shorts description', c.social.youtubeShorts);
    f('Facebook promotional text', c.social.facebook);
    h('Hashtags');
    blocks.push({ kind: 'tags', text: c.social.hashtags.join('  ') });
    f('CTA suggestions', c.social.ctas.map((x) => `• ${x}`).join('\n'));
  }

  return {
    title: c.name,
    subtitle: `${brandName} · ${c.input.platform} · ${c.input.duration}s · ${c.input.language}`,
    brand: brandName,
    blocks,
  };
}
