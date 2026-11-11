import type { AdStyle, Category, CampaignInput, Concept, Platform, Scene, ShotType, SocialContent, Tone, Voiceover } from '../schemas';
import { ARCHETYPES, CATEGORY_PROFILE, STYLE_LOOK, STYLE_PREFERENCES, type ArchetypeId } from './archetypes';
import { PACKS, fill, type BeatId } from './phrases';
import { createRng, formatTime, parseList, shorten, stripEnd, toHashtag, uid, type Rng } from './util';

export const SCENE_COUNT: Record<number, number> = { 15: 4, 30: 6, 45: 7, 60: 8 };

export function aspectRatio(platform: Platform): string {
  if (platform === 'YouTube') return '16:9 horizontal';
  if (platform === 'Facebook') return '4:5 vertical';
  return '9:16 vertical';
}

/**
 * Splits `total` seconds across scenes proportionally to `weights`,
 * guaranteeing every scene gets at least `min` seconds and the sum is exact.
 */
export function allocateDurations(total: number, weights: number[], min = 2): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const floorMin = Math.min(min, Math.floor(total / n));
  const pool = total - floorMin * n;
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / weightSum) * pool);
  const base = raw.map(Math.floor);
  let remainder = pool - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    base[i] += 1;
    remainder -= 1;
  }
  return base.map((b) => b + floorMin);
}

/** Re-balances existing scene durations to a new total while keeping proportions. */
export function fitDurations(scenes: Scene[], total: number): Scene[] {
  const durations = allocateDurations(
    total,
    scenes.map((s) => s.duration),
    1,
  );
  return scenes.map((s, i) => ({ ...s, duration: durations[i] }));
}

interface Vars {
  product: string;
  problem: string;
  audience: string;
  cta: string;
  price: string;
  benefits: string[];
}

/** Ends user-supplied text with a full stop so it never runs into the next sentence. */
export function sentence(text: string): string {
  const t = text.trim();
  return !t || /[.!?…:]$/.test(t) ? t : `${t}.`;
}

function varsFrom(input: CampaignInput): Vars {
  const benefits = parseList(input.benefits);
  return {
    product: input.productName.trim(),
    problem: stripEnd(input.problem),
    audience: stripEnd(input.audience),
    cta: stripEnd(input.cta),
    price: (input.price ?? '').trim(),
    benefits: benefits.length ? benefits : [stripEnd(input.description).slice(0, 80)],
  };
}

/**
 * Chooses distinct archetypes: two that suit the style, one that suits the category,
 * then the rest from the remaining pool (all deterministic per seed).
 */
function pickArchetypes(style: AdStyle, category: Category, rng: Rng, count: number, exclude: string[]): ArchetypeId[] {
  const chosen: ArchetypeId[] = [];
  const add = (id: ArchetypeId | undefined) => {
    if (id && !chosen.includes(id) && !exclude.includes(id) && chosen.length < count) chosen.push(id);
  };
  const stylePool = rng.shuffle(STYLE_PREFERENCES[style]).filter((id) => !exclude.includes(id));
  const categoryPool = rng.shuffle(CATEGORY_PROFILE[category].boost);
  stylePool.slice(0, 2).forEach(add);
  categoryPool.forEach((id) => {
    if (chosen.length < Math.min(3, count)) add(id);
  });
  for (const id of [...stylePool, ...rng.shuffle(Object.keys(ARCHETYPES) as ArchetypeId[])]) add(id);
  return chosen;
}

function buildConcept(input: CampaignInput, id: ArchetypeId, rng: Rng): Concept {
  const pack = PACKS[input.language];
  const a = ARCHETYPES[id];
  const v = varsFrom(input);
  const t = { product: v.product, problem: v.problem, audience: v.audience, cta: v.cta, price: v.price };
  const leadBenefit = v.benefits[0];
  const profile = CATEGORY_PROFILE[input.category];
  return {
    id: uid('c_'),
    archetype: id,
    title: fill(a.title, t),
    mainIdea: `${fill(a.idea, t)} Build it around ${profile.moment}, and feature the lead benefit: ${leadBenefit}.`,
    audience: v.audience,
    angle: a.angle,
    emotionalTrigger: a.trigger,
    hook: sentence(fill(rng.pick(pack.hooks[id]), t)),
    message: fill(pack.messages[id], t),
    cta: v.cta,
    visualDirection: `${STYLE_LOOK[input.style]} Setting: ${profile.setting}. Hero shot: ${profile.hero}. Frame for ${aspectRatio(input.platform)}.`,
    saved: false,
  };
}

/** Generates `count` concepts built on genuinely different archetypes. */
export function generateConcepts(
  input: CampaignInput,
  seed: number,
  count = 5,
  excludeArchetypes: string[] = [],
): Concept[] {
  const rng = createRng(seed);
  return pickArchetypes(input.style, input.category, rng, count, excludeArchetypes).map((id) => buildConcept(input, id, rng));
}

// ---------------------------------------------------------------------------
// Scenes

interface BeatProduction {
  shot: ShotType;
  visual: string[];
  camera: string[];
  action: string[];
  sfx: string[];
  transition: string[];
  weight: number;
}

const PROD: Record<BeatId, BeatProduction> = {
  hook: {
    shot: 'close',
    weight: 0.7,
    visual: [
      'Strong opening frame in {setting}: the subject is already in the middle of the situation, no slow intro.',
      'Bold first frame in {setting} with the subject facing camera and the key prop clearly visible.',
    ],
    camera: ['Close-up at eye level with a quick push-in over the first second.', 'Static close-up, subject looks straight into the lens.'],
    action: ['Subject delivers the opening line with a clear facial reaction.', 'Subject turns to camera and starts talking immediately.'],
    sfx: ['Short whoosh on the first cut.', 'Subtle riser under the opening line.'],
    transition: ['Hard cut on the last word.', 'Quick whip-pan cut.'],
  },
  problem: {
    shot: 'medium',
    weight: 1.1,
    visual: [
      'The frustration shown honestly in {setting}: the everyday moment the audience recognises.',
      'Slightly desaturated frame of the problem situation in {setting}.',
    ],
    camera: ['Medium shot, handheld with gentle movement to feel real.', 'Locked-off medium shot from a natural viewing height.'],
    action: ['Subject sighs and reacts to the problem in a believable, not exaggerated, way.', 'Subject checks the time or looks around, clearly frustrated.'],
    sfx: ['Low ambient room tone, clock tick or background noise.', 'Muted ambience with a single dull thud accent.'],
    transition: ['Hard cut.', 'Match cut to the next frame.'],
  },
  reveal: {
    shot: 'product',
    weight: 1.2,
    visual: ['{product} enters the frame cleanly against an uncluttered background.', 'Hero shot of {product} in {setting}, well lit and in sharp focus.'],
    camera: ['Slow slider move revealing the product from left to right.', 'Gentle push-in on a tripod, ending on a centered product shot.'],
    action: ['A hand places the product into frame and steps back.', 'Product is revealed as the subject moves aside.'],
    sfx: ['Soft shimmer or swoosh on the reveal.', 'Music beat drops in as the product appears.'],
    transition: ['Hard cut on the beat.', 'Light flash transition.'],
  },
  demo: {
    shot: 'close',
    weight: 1.3,
    visual: ['Clear demonstration of {product} being used in {setting}: {hero}.', 'Over-the-shoulder view of the product in real use, each step readable.'],
    camera: ['Over-the-shoulder medium close-up, steady on a gimbal.', 'Top-down overhead shot from a tripod arm.'],
    action: ['Hands demonstrate the product step by step at a natural pace.', 'Subject uses the product and reacts to how simple it is.'],
    sfx: ['Natural product sounds (clicks, pours, taps) brought forward in the mix.', 'Light UI or tap sounds synced to each step.'],
    transition: ['Cut on action.', 'Speed-ramp cut.'],
  },
  benefit: {
    shot: 'medium',
    weight: 1.2,
    visual: ['Visual proof of the benefit: the result clearly visible in {setting}.', 'Subject enjoying the result, product visible in the frame.'],
    camera: ['Medium shot with a slow dolly-in on a gimbal.', 'Static medium shot, subject centered.'],
    action: ['Subject shows the result with a genuine smile or nod.', 'Subject points to or interacts with the result.'],
    sfx: ['Positive musical lift.', 'Soft pop accent on the on-screen text.'],
    transition: ['Hard cut.', 'Slide transition in the text direction.'],
  },
  proof: {
    shot: 'medium',
    weight: 1.1,
    visual: ['Real customers or team members using {product} in {setting}.', 'Quick montage of real use moments from the target audience.'],
    camera: ['Handheld medium shots, 3 quick angles.', 'Static medium shot, natural framing.'],
    action: ['People use the product naturally. Only real customers with permission, no invented testimonials.', 'Subject gives a short, honest reaction.'],
    sfx: ['Music continues, light ambience.', 'Crowd or room ambience under the music.'],
    transition: ['Cut on the beat.', 'Hard cut.'],
  },
  offer: {
    shot: 'text',
    weight: 1.0,
    visual: ['Clean offer frame: product on one side, price or offer text on the other.', 'Product shot with a bold offer card overlay.'],
    camera: ['Static centered product shot on a tripod.', 'Slow push-in on the product.'],
    action: ['Offer text animates in, product stays still.', 'Hand taps the product as the offer appears.'],
    sfx: ['Cash-register-style ding or soft chime.', 'Bass hit as the offer appears.'],
    transition: ['Hard cut.', 'Zoom cut.'],
  },
  cta: {
    shot: 'text',
    weight: 0.9,
    visual: ['End card: logo, product and the call to action, large and readable.', 'Final frame: subject holds the product next to the call-to-action text.'],
    camera: ['Static centered frame, held long enough to read.', 'Static medium shot, subject looks to camera.'],
    action: ['Logo and CTA text appear; hold the frame.', 'Subject points at the CTA text and smiles.'],
    sfx: ['Music resolves to the final note.', 'Brand sound or final beat.'],
    transition: ['End on the frame (no transition).', 'Fade to end card.'],
  },
  story: {
    shot: 'wide',
    weight: 1.2,
    visual: ['Wide establishing shot of {setting} with the main character in a natural moment.', 'The key moment in {setting}: {moment}.'],
    camera: ['Wide shot on a tripod, natural light.', 'Slow lateral gimbal move following the character.'],
    action: ['Character goes through a routine moment.', 'Character shares a small, genuine moment with someone.'],
    sfx: ['Natural ambience with soft music.', 'Gentle music bed, room tone.'],
    transition: ['Soft cross-dissolve.', 'Match cut on movement.'],
  },
  detail: {
    shot: 'close',
    weight: 1.1,
    visual: ['Macro detail of {product}: {hero}.', 'Extreme close-up of the most distinctive detail of {product}.'],
    camera: ['Macro lens, slow slider move.', 'Close-up with a slow focus pull from foreground to product.'],
    action: ['A hand slowly turns or touches the product.', 'Product rotates slowly on a turntable.'],
    sfx: ['Soft tactile sounds (fabric, glass, packaging).', 'Quiet, airy ambience.'],
    transition: ['Slow cross-dissolve.', 'Focus-pull transition.'],
  },
  myth: {
    shot: 'text',
    weight: 1.2,
    visual: ['Subject faces camera next to on-screen text stating the common myth.', 'Split frame: myth text crossed out, subject reacting.'],
    camera: ['Static medium close-up, subject talks to camera.', 'Medium shot, slight push-in on the reveal.'],
    action: ['Subject shakes head and explains why the myth is wrong.', 'Text is crossed out as the subject points to it.'],
    sfx: ['Buzzer or record-scratch accent.', 'Quick pop on the cross-out.'],
    transition: ['Hard cut.', 'Glitch cut.'],
  },
  bts: {
    shot: 'medium',
    weight: 1.2,
    visual: ['Behind the scenes in {setting}: the {product} team at work.', 'Hands at work during the preparation or delivery process.'],
    camera: ['Handheld documentary-style medium shot.', 'Close-up on hands, steady gimbal.'],
    action: ['Team member works carefully, glances up at camera.', 'Process step completed with visible care.'],
    sfx: ['Authentic work sounds from the location.', 'Ambient sound with a light music bed.'],
    transition: ['Cut on action.', 'Whip-pan cut.'],
  },
  compare: {
    shot: 'medium',
    weight: 1.3,
    visual: [
      'Left/top half: the old way, slightly desaturated. Generic alternative only, no competitor brand.',
      'The new way with {product}: bright, clean, the same task done easily.',
    ],
    camera: ['Static medium shot; the same framing is reused for the next scene.', 'Same framing as the previous scene for a clear comparison.'],
    action: ['Subject struggles with the old way.', 'Subject completes the same task easily with the product.'],
    sfx: ['Muted ambience, slight sigh.', 'Bright musical lift.'],
    transition: ['Match cut to the same framing.', 'Hard cut.'],
  },
};

const PRIORITY: Partial<Record<BeatId, number>> = {
  reveal: 0,
  offer: 1,
  compare: 1,
  myth: 2,
  benefit: 2,
  demo: 3,
  detail: 3,
  bts: 3,
  problem: 4,
  story: 4,
  proof: 5,
};

export function planBeats(archetype: ArchetypeId, count: number): BeatId[] {
  const a = ARCHETYPES[archetype];
  const middle = a.beats.slice(1, -1);
  const slots = Math.max(0, count - 2);
  let chosen: BeatId[];
  if (slots <= middle.length) {
    chosen = middle
      .map((beat, index) => ({ beat, index, p: PRIORITY[beat] ?? 6 }))
      .sort((x, y) => x.p - y.p || x.index - y.index)
      .slice(0, slots)
      .sort((x, y) => x.index - y.index)
      .map((x) => x.beat);
  } else {
    chosen = [...middle];
    for (let i = 0; chosen.length < slots; i++) chosen.push(a.extras[i % a.extras.length]);
  }
  return ['hook', ...chosen, 'cta'];
}

const UGC_CAMERA = 'Handheld phone, vertical, natural movement.';

export function generateScenes(input: CampaignInput, concept: Concept, seed: number): Scene[] {
  const rng = createRng(seed);
  const pack = PACKS[input.language];
  const v = varsFrom(input);
  const archetype = (concept.archetype in ARCHETYPES ? concept.archetype : 'problemSolution') as ArchetypeId;
  const beats = planBeats(archetype, SCENE_COUNT[input.duration] ?? 6);
  const durations = allocateDurations(
    input.duration,
    beats.map((b) => PROD[b].weight),
    2,
  );
  const { setting, hero, moment } = CATEGORY_PROFILE[input.category];
  let benefitIndex = 0;
  const occurrences = new Map<BeatId, number>();
  const offsets = new Map<BeatId, number>();
  const base = { product: v.product, problem: v.problem, audience: v.audience, cta: v.cta, price: v.price, setting, hero, moment };

  return beats.map((beat, i) => {
    const prod = PROD[beat];
    // Repeated beats alternate variants so two scenes never read the same; 'compare' always goes old → new.
    if (!offsets.has(beat)) offsets.set(beat, beat === 'compare' ? 0 : rng.int(2));
    const seen = occurrences.get(beat) ?? 0;
    occurrences.set(beat, seen + 1);
    const variant = (offsets.get(beat)! + seen) % 2;
    const benefit = beat === 'benefit' ? v.benefits[benefitIndex++ % v.benefits.length] : v.benefits[0];
    const priceLine = v.price ? fill(pack.priceLine, { price: v.price }) : pack.availableNow;
    const vars = { ...base, benefit, priceLine };

    let voiceover: string;
    let onScreenText: string;
    switch (beat) {
      case 'hook':
        voiceover = concept.hook;
        onScreenText = shorten(concept.hook, 42);
        break;
      case 'problem':
        voiceover = sentence(fill(pack.vo.problem[variant], vars));
        onScreenText = shorten(v.problem);
        break;
      case 'reveal':
        voiceover = fill(pack.vo.reveal[variant], vars);
        onScreenText = shorten(v.product, 40);
        break;
      case 'benefit':
        voiceover = fill(pack.vo.benefit[variant], vars);
        onScreenText = shorten(benefit);
        break;
      case 'offer':
        voiceover = fill(pack.vo.offer[variant], vars);
        onScreenText = v.price ? shorten(v.price, 30) : pack.ost.offer[1];
        break;
      case 'cta':
        voiceover = variant === 0 && i > 0 ? `${concept.message} ${fill(pack.vo.cta[0], vars)}` : fill(pack.vo.cta[1], vars);
        onScreenText = shorten(v.cta, 40);
        break;
      default:
        voiceover = fill(pack.vo[beat][variant], vars);
        onScreenText = pack.ost[beat][variant];
    }

    const camera = input.style === 'UGC' && beat !== 'cta' ? UGC_CAMERA : prod.camera[variant];

    return {
      id: uid('s_'),
      duration: durations[i],
      beat,
      shot: prod.shot,
      visual: fill(prod.visual[variant], vars),
      camera,
      action: prod.action[variant],
      onScreenText,
      voiceover,
      sfx: prod.sfx[variant],
      transition: i === beats.length - 1 ? 'End on the frame (no transition).' : prod.transition[variant],
    };
  });
}

// ---------------------------------------------------------------------------
// Voiceover

export const TONE_DELIVERY: Record<Tone, string> = {
  Friendly: 'Conversational and smiling, like talking to a friend.',
  Professional: 'Clear, confident and measured. Crisp consonants, no rush.',
  Energetic: 'Upbeat and punchy. Lift the energy on each new scene.',
  Bold: 'Strong and direct. Short pauses before key words.',
  Warm: 'Soft, sincere and close to the microphone.',
  Playful: 'Light and cheeky, with a smile in the voice.',
  Inspirational: 'Rising, hopeful delivery that builds toward the CTA.',
  Calm: 'Slow, relaxed pace with natural breathing room.',
};

/** Builds the voiceover script with scene time markers so a voice artist can follow the cut. */
export function buildVoiceoverText(scenes: Scene[]): string {
  let t = 0;
  return scenes
    .map((s) => {
      const start = t;
      t += s.duration;
      return `[${formatTime(start)}–${formatTime(t)}] ${s.voiceover.trim()}`;
    })
    .join('\n\n');
}

export function generateVoiceover(input: CampaignInput, scenes: Scene[]): Voiceover {
  return { text: buildVoiceoverText(scenes), language: input.language, tone: input.tone };
}

/** Counts spoken words, ignoring [time markers] and (stage directions). */
export function countSpokenWords(text: string): number {
  const spoken = text.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  return spoken.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function estimateReadingSeconds(text: string, language: CampaignInput['language']): number {
  const words = countSpokenWords(text);
  return Math.round((words / PACKS[language].wpm) * 60);
}

// ---------------------------------------------------------------------------
// Social

export function generateSocial(input: CampaignInput, concept: Concept, seed: number): SocialContent {
  const rng = createRng(seed);
  const pack = PACKS[input.language];
  const s = pack.social;
  const v = varsFrom(input);
  const t = { product: v.product, cta: v.cta, price: v.price };
  const productTag = toHashtag(v.product);
  const categoryTags = pack.categoryTags[input.category];
  const tags = (list: string[]) => list.filter(Boolean).map((x) => `#${x}`);

  const allTags = Array.from(
    new Set([productTag, ...categoryTags, input.platform === 'TikTok' ? 'tiktok' : '', input.platform === 'YouTube Shorts' ? 'shorts' : '', input.platform === 'Instagram Reels' ? 'reels' : ''].filter(Boolean)),
  );

  const benefits = v.benefits.slice(0, 3);
  const priceLine = v.price ? fill(pack.priceLine, { price: v.price }) : '';

  const instagram = [
    concept.hook,
    '',
    concept.message,
    '',
    s.whyLove,
    ...benefits.map((b) => `• ${b}`),
    '',
    [priceLine, `${v.cta}.`].filter(Boolean).join(' '),
    // Skip "link in bio" when the CTA already points to a link.
    /link|bio|ссылк|bağlantı/i.test(v.cta) ? '' : s.linkInBio,
    '',
    s.commentPrompt,
    '',
    tags(allTags.slice(0, 8)).join(' '),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const tiktok = [sentence(shorten(concept.hook, 90)), s.tiktokTail, tags([productTag, ...rng.shuffle(categoryTags).slice(0, 3), 'fyp']).join(' ')].join(' ');

  const shortTitle = shorten(`${v.product}: ${stripEnd(concept.message.replace(v.product, '').trim()) || concept.title}`, 60);

  const youtubeShorts = [shortTitle, '', concept.message, benefits.length ? benefits.join(' · ') : '', '', `${v.cta}. ${s.shortsTail}`, '', tags(['shorts', productTag, ...categoryTags.slice(0, 2)]).join(' ')].join('\n');

  const facebook = [
    fill(s.fbHeadline, t),
    '',
    concept.hook,
    '',
    concept.message,
    '',
    s.whyLove,
    ...benefits.map((b) => `• ${b}`),
    '',
    [priceLine, `${v.cta}.`].filter(Boolean).join(' '),
    '',
    tags([productTag, categoryTags[0]]).join(' '),
  ].join('\n');

  return {
    instagram,
    tiktok,
    youtubeShorts,
    facebook,
    hashtags: tags(allTags).slice(0, 12),
    shortTitle,
    ctas: [...s.ctas.map((c) => fill(c, t)), s.learnMore],
  };
}

/**
 * Rewrites the voiceover in another language/variant using the local templates,
 * keeping the current scene timings. Returns the new text and whether every line was regenerated.
 */
export function regenerateVoiceoverText(input: CampaignInput, concept: Concept | null, scenes: Scene[], seed: number): string {
  const archetype = (concept && concept.archetype in ARCHETYPES ? concept.archetype : 'problemSolution') as ArchetypeId;
  const rng = createRng(seed);
  const localized = buildConcept(input, archetype, rng);
  const generated = generateScenes({ ...input }, localized, seed);
  const byBeat = new Map<string, string[]>();
  for (const g of generated) byBeat.set(g.beat, [...(byBeat.get(g.beat) ?? []), g.voiceover]);
  const merged = scenes.map((s, i) => {
    const pool = byBeat.get(s.beat);
    const line = pool && pool.length ? pool.shift()! : (generated[i]?.voiceover ?? s.voiceover);
    return { ...s, voiceover: line };
  });
  return buildVoiceoverText(merged);
}
