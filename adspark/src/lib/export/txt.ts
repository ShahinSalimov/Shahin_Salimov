import type { Brand, Campaign } from '../schemas';
import { aspectRatio } from '../engine/generate';
import { formatTime } from '../engine/util';

function section(title: string): string {
  return `\n${title.toUpperCase()}\n${'='.repeat(title.length)}\n`;
}

export function selectedConcept(c: Campaign) {
  return c.concepts.find((x) => x.id === c.selectedConceptId) ?? null;
}

export function generatorLabel(c: Campaign): string {
  return c.generator.engine === 'ai'
    ? `AI provider (${c.generator.provider ?? 'unknown'}${c.generator.model ? `, ${c.generator.model}` : ''})`
    : 'AdSpark local template engine (not AI)';
}

export function campaignToText(c: Campaign, brand?: Brand | null): string {
  const concept = selectedConcept(c);
  const out: string[] = [];
  out.push(`ADSPARK CAMPAIGN: ${c.name}`);
  out.push(`Brand: ${brand?.name ?? c.input.productName}`);
  out.push(`Product: ${c.input.productName} | Category: ${c.input.category}`);
  out.push(`Platform: ${c.input.platform} (${aspectRatio(c.input.platform)}) | Duration: ${c.input.duration}s | Language: ${c.input.language}`);
  out.push(`Style: ${c.input.style} | Tone: ${c.input.tone} | Goal: ${c.input.goal}`);
  out.push(`Generated with: ${generatorLabel(c)}`);

  if (concept) {
    out.push(section('Concept'));
    out.push(`Title: ${concept.title}`);
    out.push(`Main idea: ${concept.mainIdea}`);
    out.push(`Target audience: ${concept.audience}`);
    out.push(`Angle: ${concept.angle}`);
    out.push(`Emotional trigger: ${concept.emotionalTrigger}`);
    out.push(`Hook: ${concept.hook}`);
    out.push(`Main message: ${concept.message}`);
    out.push(`Call to action: ${concept.cta}`);
    out.push(`Visual direction: ${concept.visualDirection}`);
  }

  if (c.scenes.length) {
    out.push(section('Video script'));
    let t = 0;
    c.scenes.forEach((s, i) => {
      const start = t;
      t += s.duration;
      out.push(`Scene ${i + 1} [${formatTime(start)}–${formatTime(t)}, ${s.duration}s]`);
      out.push(`  Visual: ${s.visual}`);
      out.push(`  Camera: ${s.camera}`);
      out.push(`  Action: ${s.action}`);
      out.push(`  On-screen text: ${s.onScreenText}`);
      out.push(`  Voiceover: ${s.voiceover}`);
      out.push(`  Sound: ${s.sfx}`);
      out.push(`  Transition: ${s.transition}`);
      out.push('');
    });
    out.push(`Total: ${t}s`);
  }

  if (c.voiceover) {
    out.push(section('Voiceover'));
    out.push(`Language: ${c.voiceover.language} | Tone: ${c.voiceover.tone}`);
    out.push('');
    out.push(c.voiceover.text);
  }

  if (c.social) {
    const s = c.social;
    out.push(section('Social media content'));
    out.push(`Short title: ${s.shortTitle}`);
    out.push('\n-- Instagram caption --\n' + s.instagram);
    out.push('\n-- TikTok caption --\n' + s.tiktok);
    out.push('\n-- YouTube Shorts description --\n' + s.youtubeShorts);
    out.push('\n-- Facebook promotional text --\n' + s.facebook);
    out.push('\n-- Hashtags --\n' + s.hashtags.join(' '));
    out.push('\n-- CTA suggestions --\n' + s.ctas.map((x) => `- ${x}`).join('\n'));
  }
  return out.join('\n') + '\n';
}
