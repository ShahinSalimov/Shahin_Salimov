import type { AspectRatio, ExploreItem } from '@/types';
import { MODELS } from '@workspace/vexora-core';
import { pick, rng } from '@/lib/random';

/**
 * Synthetic Explore feed. All visuals are rendered procedurally from `seed`
 * (see components/media/GenerativeArt), so there is no third-party media.
 * Titles/prompts are user content, so they stay in their original language (English).
 * Replace with an API call in services/catalog when a backend exists.
 */
const SEEDS: Array<[ExploreItem['category'], string, string]> = [
  ['ads', 'Energy drink red burst', 'Energy drink can bursting through red powder cloud, high-speed photography, amber rim light'],
  ['product', 'Watch macro', 'Luxury wristwatch macro on black obsidian, single warm spotlight, crisp reflections'],
  ['portrait', 'Neon night portrait', 'Portrait of a young woman under red neon signage, shallow depth of field, rain droplets'],
  ['cinematic', 'Desert highway', 'Lone vintage car on desert highway at golden hour, wide anamorphic shot, dust trail'],
  ['fashion', 'Mustard coat editorial', 'Model in oversized mustard coat, brutalist concrete stairs, hard shadows, editorial'],
  ['food', 'Burger close-up', 'Gourmet burger with melting cheese, dark slate background, steam, appetizing macro'],
  ['architecture', 'Flame towers at dusk', 'Futuristic tower with flame-shaped glass facade at dusk, long exposure city lights'],
  ['abstract', 'Liquid metal', 'Liquid metal ribbons in crimson and gold, studio lighting, ultra smooth 3D render'],
  ['ads', 'Perfume ad', 'Perfume bottle floating above black water, golden splash frozen mid-air, luxury ad'],
  ['product', 'Levitating sneaker', 'Red sneaker levitating with exploding fabric threads, black backdrop, dynamic'],
  ['cinematic', 'Rainy alley', 'Tracking shot through a rainy night alley, red taillights, reflective puddles'],
  ['portrait', 'Artisan hands', 'Close-up of an artisan’s hands shaping clay, warm window light, documentary style'],
  ['fashion', 'Runway motion', 'Slow motion runway walk, red silk dress flowing, strobe flashes'],
  ['food', 'Tea table at sunset', 'Traditional tea set with armudu glass, steam, sunset light through lace curtain'],
  ['abstract', 'Fire waves', 'Abstract waves of fire and smoke forming a spiral, black void, high contrast'],
  ['architecture', 'Minimal interior', 'Minimal living room, black marble, single yellow armchair, soft morning light'],
  ['ads', 'Coffee pour spot', 'Coffee pouring in slow motion into black cup, crema swirl, amber backlight'],
  ['cinematic', 'Mountain village drone', 'Drone flyover of a mountain village at sunrise, mist in valleys, epic scale'],
  ['product', 'Headphones spot', 'Wireless headphones on rotating pedestal, red laser lines, tech commercial'],
  ['portrait', 'The boxer', 'Boxer in dark gym, sweat, single overhead light, gritty cinematic portrait'],
  ['fashion', 'Jewelry flat lay', 'Flat lay of gold jewelry on crimson velvet, top-down, soft shadows'],
  ['abstract', 'Particle lion', 'Particle cloud morphing into a lion silhouette, gold sparks, dark background'],
  ['food', 'Pizza cheese pull', 'Cheese pull from a pizza slice, slow motion, wood-fired oven glow'],
  ['ads', 'Sports car teaser', 'Sports car silhouette revealed by sweeping red light, smoke, teaser commercial'],
];

const ASPECTS: AspectRatio[] = ['4:5', '9:16', '1:1', '16:9', '3:4'];
const AUTHORS = ['nova.lab', 'aysel.ai', 'redframe', 'kamran.vfx', 'goldprompt', 'leyla.studio', 'motionbaku', 'pixeltar'];

export const EXPLORE_ITEMS: ExploreItem[] = Array.from({ length: 48 }, (_, i) => {
  const r = rng(1000 + i * 97);
  const [category, title, prompt] = SEEDS[i % SEEDS.length];
  const model = pick(r, MODELS);
  const kind = model.kind;
  return {
    id: `itm_${i.toString(36)}`,
    title,
    prompt,
    kind,
    category,
    modelId: model.id,
    aspect: kind === 'video' ? pick(r, ['9:16', '16:9'] as const) : pick(r, ASPECTS),
    author: pick(r, AUTHORS),
    likes: Math.floor(r() * 9000) + 40,
    remixes: Math.floor(r() * 900),
    createdAt: new Date(Date.UTC(2026, 10, 21) - Math.floor(r() * 30 * 864e5)).toISOString(),
    seed: Math.floor(r() * 2 ** 31),
    durationSec: kind === 'video' ? 4 + Math.floor(r() * 6) : undefined,
    featured: i % 11 === 0,
  };
});
