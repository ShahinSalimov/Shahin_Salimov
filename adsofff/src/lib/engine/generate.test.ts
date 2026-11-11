import { describe, expect, it } from 'vitest';
import { allocateDurations, countSpokenWords, estimateReadingSeconds, fitDurations, generateConcepts, generateScenes, generateSocial, planBeats, regenerateVoiceoverText, SCENE_COUNT, generateVoiceover } from './generate';
import { parseList, shorten, toHashtag } from './util';
import { ARCHETYPES } from './archetypes';
import { campaignInputSchema, CATEGORIES, DURATIONS, LANGUAGES, STYLES, type CampaignInput } from '../schemas';
import { CATEGORY_PROFILE } from './archetypes';

const base: CampaignInput = campaignInputSchema.parse({
  productName: 'Bloom Bakery',
  description: 'Neighbourhood bakery making sourdough bread every morning.',
  category: 'Restaurant',
  price: '5 AZN',
  benefits: 'Baked fresh every morning\nOrganic flour, no preservatives\nSame-day delivery',
  audience: 'busy families',
  problem: 'Supermarket bread goes stale in a day',
  goal: 'Drive sales',
  language: 'English',
  platform: 'Instagram Reels',
  duration: 30,
  tone: 'Friendly',
  style: 'Cinematic',
  cta: 'Order today',
});

describe('allocateDurations', () => {
  it('always sums exactly to the total with the minimum respected', () => {
    for (const total of [15, 30, 45, 60, 7, 100]) {
      for (const weights of [[1, 1, 1, 1], [0.7, 1.2, 1.3, 0.9, 1, 1.1], [5, 1, 1, 1, 1, 1, 1, 1]]) {
        const d = allocateDurations(total, weights, 2);
        expect(d.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.min(...d)).toBeGreaterThanOrEqual(Math.min(2, Math.floor(total / weights.length)));
      }
    }
  });
});

describe('generateConcepts', () => {
  it('returns 5 concepts built on 5 different archetypes for every style', () => {
    for (const style of STYLES) {
      for (const seed of [1, 42, 999]) {
        const concepts = generateConcepts({ ...base, style }, seed);
        expect(concepts).toHaveLength(5);
        expect(new Set(concepts.map((c) => c.archetype)).size).toBe(5);
        expect(new Set(concepts.map((c) => c.title)).size).toBe(5);
        for (const c of concepts) {
          for (const field of ['title', 'mainIdea', 'audience', 'angle', 'emotionalTrigger', 'hook', 'message', 'cta', 'visualDirection'] as const) {
            expect(c[field].length, `${field} empty`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('respects excluded archetypes', () => {
    const exclude = ['problemSolution', 'productHero', 'emotionalStory'];
    const concepts = generateConcepts(base, 7, 5, exclude);
    expect(concepts.some((c) => exclude.includes(c.archetype))).toBe(false);
  });

  it('is deterministic per seed', () => {
    const a = generateConcepts(base, 123).map((c) => c.archetype + c.hook);
    const b = generateConcepts(base, 123).map((c) => c.archetype + c.hook);
    expect(a).toEqual(b);
  });

  it('has no unfilled placeholders in any language', () => {
    for (const language of LANGUAGES) {
      for (const c of generateConcepts({ ...base, language }, 5, 11)) {
        expect(JSON.stringify(c)).not.toMatch(/\{[a-z]+\}/i);
      }
    }
  });
});

describe('category-aware generation', () => {
  it('includes at least one archetype suited to the category', () => {
    for (const category of CATEGORIES) {
      for (const seed of [1, 2, 3, 4]) {
        const archetypes = generateConcepts({ ...base, category, style: 'Minimal' }, seed).map((c) => c.archetype);
        expect(archetypes.some((a) => (CATEGORY_PROFILE[category].boost as string[]).includes(a)), `${category}/${seed}`).toBe(true);
      }
    }
  });

  it('uses category-specific settings, hero shots and moments', () => {
    const food = generateConcepts({ ...base, category: 'Restaurant' }, 8)[0];
    const home = generateConcepts({ ...base, category: 'Real Estate' }, 8)[0];
    expect(food.visualDirection).toContain(CATEGORY_PROFILE.Restaurant.hero);
    expect(home.visualDirection).toContain(CATEGORY_PROFILE['Real Estate'].setting);
    expect(home.mainIdea).toContain(CATEGORY_PROFILE['Real Estate'].moment);
    const detailScene = generateScenes(base, { ...food, archetype: 'productHero' }, 1).find((s) => s.beat === 'detail' && s.visual.startsWith('Macro'));
    if (detailScene) expect(detailScene.visual).toContain(CATEGORY_PROFILE.Restaurant.hero);
  });

  it('gives different concept sets for different seeds (regenerate) but identical for the same seed', () => {
    const sets = new Set([1, 2, 3, 4, 5, 6].map((seed) => generateConcepts(base, seed).map((c) => c.archetype).join()));
    expect(sets.size).toBeGreaterThan(1);
  });
});

describe('generateScenes', () => {
  it('produces the right scene count and exact total for every duration, archetype and language', () => {
    for (const duration of DURATIONS) {
      for (const archetype of Object.keys(ARCHETYPES)) {
        for (const language of LANGUAGES) {
          const input = { ...base, duration, language };
          const concept = { ...generateConcepts(input, 3)[0], archetype };
          const scenes = generateScenes(input, concept, 17);
          expect(scenes).toHaveLength(SCENE_COUNT[duration]);
          expect(scenes.reduce((a, s) => a + s.duration, 0)).toBe(duration);
          expect(scenes[0].beat).toBe('hook');
          expect(scenes[scenes.length - 1].beat).toBe('cta');
          for (const s of scenes) {
            expect(s.duration).toBeGreaterThanOrEqual(2);
            expect(s.visual && s.camera && s.action && s.voiceover && s.transition).toBeTruthy();
            expect(JSON.stringify(s)).not.toMatch(/\{[a-z]+\}/i);
          }
        }
      }
    }
  });

  it('keeps the product reveal in short videos', () => {
    expect(planBeats('problemSolution', 4)).toEqual(['hook', 'reveal', 'benefit', 'cta']);
    expect(planBeats('threeReasons', 8)).toHaveLength(8);
  });

  it('never repeats the same visual for back-to-back scenes of the same beat', () => {
    const concept = { ...generateConcepts(base, 3)[0], archetype: 'behindScenes' };
    for (const seed of [1, 2, 3, 4, 5]) {
      const bts = generateScenes(base, concept, seed).filter((s) => s.beat === 'bts');
      expect(new Set(bts.map((s) => s.visual)).size).toBe(bts.length);
    }
  });

  it('cycles through different benefits', () => {
    const concept = { ...generateConcepts(base, 3)[0], archetype: 'threeReasons' };
    const scenes = generateScenes(base, concept, 1);
    const texts = scenes.filter((s) => s.beat === 'benefit').map((s) => s.onScreenText);
    expect(new Set(texts).size).toBe(3);
  });
});

describe('fitDurations', () => {
  it('rebalances edited scenes to the target duration', () => {
    const scenes = generateScenes(base, generateConcepts(base, 1)[0], 1).map((s, i) => ({ ...s, duration: i + 3 }));
    expect(fitDurations(scenes, 30).reduce((a, s) => a + s.duration, 0)).toBe(30);
  });
});

describe('voiceover', () => {
  it('adds time markers that match scene timing and ignores them when counting', () => {
    const scenes = generateScenes(base, generateConcepts(base, 1)[0], 1);
    const vo = generateVoiceover(base, scenes);
    expect(vo.text.startsWith('[0:00–')).toBe(true);
    expect(vo.text).toContain('–0:30]');
    expect(countSpokenWords('[0:00–0:03] Hello there (pause) friend.')).toBe(3);
    expect(estimateReadingSeconds('one two three four five', 'English')).toBe(2);
  });

  it('rewrites the voiceover in another language while keeping timings', () => {
    const concept = generateConcepts(base, 1)[0];
    const scenes = generateScenes(base, concept, 1);
    const ru = regenerateVoiceoverText({ ...base, language: 'Russian' }, concept, scenes, 5);
    expect(ru).toMatch(/[а-яё]/i);
    expect(ru.match(/\[/g)).toHaveLength(scenes.length);
  });
});

describe('generateSocial', () => {
  it('creates platform-specific content in each language', () => {
    for (const language of LANGUAGES) {
      const input = { ...base, language };
      const s = generateSocial(input, generateConcepts(input, 2)[0], 2);
      expect(s.instagram.length).toBeLessThanOrEqual(2200);
      expect(s.tiktok.length).toBeLessThan(s.instagram.length);
      expect(s.youtubeShorts).toContain('#shorts');
      expect(s.hashtags.every((h) => h.startsWith('#') && !h.includes(' '))).toBe(true);
      expect(s.shortTitle.length).toBeLessThanOrEqual(61);
      expect(s.ctas.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(s)).not.toMatch(/\{[a-z]+\}/i);
      expect(JSON.stringify(s).toLowerCase()).not.toContain('viral');
    }
  });
});

describe('social platform conventions', () => {
  const s = generateSocial(base, generateConcepts(base, 4)[0], 4);
  it('keeps hashtags relevant: product, category and platform tags only', () => {
    expect(s.hashtags).toContain('#BloomBakery');
    expect(s.hashtags).toContain('#restaurant');
    expect(s.hashtags).toContain('#reels');
    expect(new Set(s.hashtags).size).toBe(s.hashtags.length);
  });
  it('uses few hashtags on Facebook and more on Instagram', () => {
    const count = (t: string) => (t.match(/#\S+/g) ?? []).length;
    expect(count(s.facebook)).toBeLessThanOrEqual(2);
    expect(count(s.instagram)).toBeGreaterThanOrEqual(4);
    expect(count(s.tiktok)).toBeLessThanOrEqual(6);
  });
  it('puts the CTA in every caption', () => {
    for (const t of [s.instagram, s.youtubeShorts, s.facebook]) expect(t).toContain('Order today');
    expect(s.ctas[0]).toBe('Order today');
  });
});

describe('copy quality', () => {
  it('never runs user text into the next sentence', () => {
    for (const language of LANGUAGES) {
      const input = { ...base, language, problem: 'Bread goes stale in a day' };
      for (const c of generateConcepts(input, 3)) expect(c.hook).toMatch(/[.!?…:]$/);
      const s = generateSocial(input, { ...generateConcepts(input, 3)[0], hook: 'Sound familiar? Bread goes stale' }, 3);
      expect(s.tiktok).toContain('Bread goes stale.');
    }
  });
  it('keeps product names uninflected in Azerbaijani, Turkish and Russian templates', () => {
    for (const language of ['Azerbaijani', 'Turkish'] as const) {
      const text = JSON.stringify(generateConcepts({ ...base, language }, 1, 11));
      expect(text).not.toMatch(/Bloom Bakery (arxasında|arkasında|sınamaq|denemek|bu qədər xoşuma|bu kadar hoşuma)/);
    }
    const ru = JSON.stringify(generateConcepts({ ...base, language: 'Russian' }, 1, 11));
    expect(ru).not.toMatch(/не ожидал|Попробовал бы/);
  });
});

describe('reading time', () => {
  it('uses language-specific speaking rates', () => {
    const text = Array.from({ length: 130 }, () => 'word').join(' ');
    expect(estimateReadingSeconds(text, 'English')).toBe(52);
    expect(estimateReadingSeconds(text, 'Russian')).toBe(60);
    expect(estimateReadingSeconds(text, 'Azerbaijani')).toBe(62);
  });
});

describe('utils', () => {
  it('parses benefit lists from lines, commas and bullets', () => {
    expect(parseList('- fast\n• cheap, reliable; 4) local')).toEqual(['Fast', 'Cheap, reliable', 'Local']);
    expect(parseList('fast, cheap, reliable')).toEqual(['Fast', 'Cheap', 'Reliable']);
    expect(parseList('Organic flour, no preservatives\nSame-day delivery')).toEqual(['Organic flour, no preservatives', 'Same-day delivery']);
  });
  it('shortens at a word boundary', () => {
    expect(shorten('Supermarket bread goes stale in a single day', 20)).toBe('Supermarket bread…');
  });
  it('builds unicode-safe hashtags', () => {
    expect(toHashtag('Şirin Çörək Evi!')).toBe('ŞirinÇörəkEvi');
  });
});
