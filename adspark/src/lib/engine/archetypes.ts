import type { AdStyle, Category } from '../schemas';
import type { BeatId } from './phrases';

export type ArchetypeId =
  | 'problemSolution'
  | 'transformation'
  | 'dayInLife'
  | 'socialProof'
  | 'productHero'
  | 'mythBusting'
  | 'behindScenes'
  | 'offerCountdown'
  | 'emotionalStory'
  | 'comparison'
  | 'threeReasons';

export interface Archetype {
  id: ArchetypeId;
  /** Internal working title; {product} is replaced. */
  title: string;
  idea: string;
  angle: string;
  trigger: string;
  /** Six core beats, first is always hook and last is always cta. */
  beats: BeatId[];
  /** Extra beats inserted before the CTA for longer videos. */
  extras: BeatId[];
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  problemSolution: {
    id: 'problemSolution',
    title: 'The Everyday Fix',
    idea: 'Open on the exact frustration your audience lives with, then show {product} removing it in one clear, believable moment.',
    angle: 'Problem → solution: name the pain point first, then present the product as the simplest fix.',
    trigger: 'Relief',
    beats: ['hook', 'problem', 'reveal', 'demo', 'benefit', 'cta'],
    extras: ['benefit', 'proof'],
  },
  transformation: {
    id: 'transformation',
    title: 'Before & After',
    idea: 'Build a clear visual contrast between life before and after {product}, using one match-cut as the turning point.',
    angle: 'Transformation: the result is the hero, the product is the bridge.',
    trigger: 'Aspiration',
    beats: ['hook', 'problem', 'reveal', 'benefit', 'proof', 'cta'],
    extras: ['demo', 'benefit'],
  },
  dayInLife: {
    id: 'dayInLife',
    title: 'A Day With {product}',
    idea: 'Follow one relatable person through a normal day and show where {product} naturally makes it better.',
    angle: 'Lifestyle integration: show the product in context instead of selling it directly.',
    trigger: 'Belonging',
    beats: ['hook', 'story', 'demo', 'benefit', 'story', 'cta'],
    extras: ['benefit', 'detail'],
  },
  socialProof: {
    id: 'socialProof',
    title: 'Real Talk Review',
    idea: 'A creator-style, face-to-camera honest review of {product}: first impression, real use, and a clear verdict.',
    angle: 'UGC testimonial: peer-to-peer trust instead of brand voice. Use a real customer or creator, never invented reviews.',
    trigger: 'Trust',
    beats: ['hook', 'problem', 'demo', 'proof', 'benefit', 'cta'],
    extras: ['benefit', 'detail'],
  },
  productHero: {
    id: 'productHero',
    title: 'Close-Up Craft',
    idea: 'Let the product speak: slow, tactile close-ups of {product} that reveal quality one detail at a time.',
    angle: 'Product as hero: sensory detail and texture over explanation.',
    trigger: 'Desire',
    beats: ['hook', 'detail', 'detail', 'benefit', 'reveal', 'cta'],
    extras: ['benefit', 'detail'],
  },
  mythBusting: {
    id: 'mythBusting',
    title: 'What Nobody Tells You',
    idea: 'Challenge a common belief in the category, then use {product} as the evidence that there is a better way.',
    angle: 'Myth vs. fact: earn attention through curiosity, then reward it with a useful insight.',
    trigger: 'Curiosity',
    beats: ['hook', 'myth', 'reveal', 'benefit', 'proof', 'cta'],
    extras: ['demo', 'benefit'],
  },
  behindScenes: {
    id: 'behindScenes',
    title: 'Behind the Process',
    idea: 'Show the people, preparation and care behind {product} so the audience understands why it is worth it.',
    angle: 'Authenticity: transparency about how it is made or delivered builds credibility.',
    trigger: 'Trust and pride',
    beats: ['hook', 'bts', 'bts', 'detail', 'benefit', 'cta'],
    extras: ['benefit', 'proof'],
  },
  offerCountdown: {
    id: 'offerCountdown',
    title: 'Limited Offer Countdown',
    idea: 'A fast, clear promotional cut that states the offer for {product} early and repeats the CTA with a real deadline.',
    angle: 'Promotion: value plus a genuine time limit. Only use deadlines that actually exist.',
    trigger: 'Urgency',
    beats: ['hook', 'reveal', 'benefit', 'offer', 'benefit', 'cta'],
    extras: ['benefit', 'demo'],
  },
  emotionalStory: {
    id: 'emotionalStory',
    title: 'The Moment That Matters',
    idea: 'A short human story where {product} is present in a meaningful moment, told with restraint and warmth.',
    angle: 'Emotional storytelling: the feeling comes first, the product supports the story.',
    trigger: 'Warmth and nostalgia',
    beats: ['hook', 'story', 'problem', 'reveal', 'story', 'cta'],
    extras: ['benefit', 'detail'],
  },
  comparison: {
    id: 'comparison',
    title: 'Old Way vs. New Way',
    idea: 'Split the story into the old way and the {product} way, side by side, so the difference is obvious without exaggeration.',
    angle: 'Comparison: contrast with a generic alternative, never with a named competitor.',
    trigger: 'Smart-choice satisfaction',
    beats: ['hook', 'compare', 'compare', 'benefit', 'proof', 'cta'],
    extras: ['demo', 'benefit'],
  },
  threeReasons: {
    id: 'threeReasons',
    title: '3 Reasons to Choose {product}',
    idea: 'A tight, numbered list of the three strongest benefits of {product}, one benefit per scene.',
    angle: 'Listicle: structured, skimmable, easy to remember.',
    trigger: 'Certainty',
    beats: ['hook', 'benefit', 'benefit', 'benefit', 'proof', 'cta'],
    extras: ['demo', 'detail'],
  },
};

export const STYLE_PREFERENCES: Record<AdStyle, ArchetypeId[]> = {
  Cinematic: ['productHero', 'emotionalStory', 'transformation', 'behindScenes'],
  Emotional: ['emotionalStory', 'transformation', 'dayInLife', 'behindScenes'],
  Funny: ['mythBusting', 'comparison', 'dayInLife', 'problemSolution'],
  Luxury: ['productHero', 'behindScenes', 'emotionalStory', 'transformation'],
  Minimal: ['productHero', 'threeReasons', 'comparison', 'problemSolution'],
  UGC: ['socialProof', 'dayInLife', 'problemSolution', 'mythBusting'],
  'Product demonstration': ['problemSolution', 'threeReasons', 'comparison', 'transformation'],
  Storytelling: ['emotionalStory', 'dayInLife', 'transformation', 'behindScenes'],
  Promotional: ['offerCountdown', 'threeReasons', 'problemSolution', 'comparison'],
};

export const STYLE_LOOK: Record<AdStyle, string> = {
  Cinematic: 'Cinematic look: controlled contrast, shallow depth of field, motivated practical lighting and a restrained color grade.',
  Emotional: 'Warm, natural light (golden hour or window light), close framing on faces and hands, soft color grade.',
  Funny: 'Bright, high-key lighting, punchy saturated colors, quick cuts and clear reaction shots.',
  Luxury: 'Dark, clean backdrop, soft rim light, slow camera moves and plenty of negative space around the product.',
  Minimal: 'Seamless neutral background, one clear subject per frame, even soft lighting and simple typography.',
  UGC: 'Phone-shot vertical footage, natural light, handheld framing and authentic, unpolished delivery.',
  'Product demonstration': 'Evenly lit tabletop or real-use setting, clear hand demonstrations and readable close-ups.',
  Storytelling: 'Natural, documentary-style coverage with consistent characters and a clear beginning, middle and end.',
  Promotional: 'Bold brand colors, high-energy pacing, large readable text and a clear offer frame.',
};

export const CATEGORY_SETTING: Record<Category, string> = {
  Restaurant: 'the restaurant kitchen and dining tables',
  Fashion: 'a city street and a fitting room mirror',
  Beauty: 'a bright vanity or bathroom mirror',
  Technology: 'a tidy desk setup',
  'Real Estate': 'the property interior and exterior',
  Education: 'a study desk or classroom',
  Fitness: 'a gym floor or outdoor training spot',
  'E-commerce': 'a home doorstep and living room',
  'Local Services': "a customer's home and the business storefront",
  Other: 'a real-life setting where the product is used',
};
