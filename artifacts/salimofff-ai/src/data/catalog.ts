import type { AspectRatio, ExploreItem } from '@/types';
import { MODELS } from './models';
import { pick, rng } from '@/lib/random';

/**
 * Synthetic Explore feed. All visuals are rendered procedurally from `seed`
 * (see components/media/GenerativeArt), so there is no third-party media.
 * Replace with an API call in services/catalog when a backend exists.
 */
const SEEDS: Array<[ExploreItem['category'], string, string]> = [
  ['ads', 'Enerji içkisi — qırmızı toz partlayışı', 'Energy drink can bursting through red powder cloud, high-speed photography, amber rim light'],
  ['product', 'Saat makro', 'Luxury wristwatch macro on black obsidian, single warm spotlight, crisp reflections'],
  ['portrait', 'Gecə şəhər portreti', 'Portrait of a young woman under red neon signage, shallow depth of field, rain droplets'],
  ['cinematic', 'Səhra yolu', 'Lone vintage car on desert highway at golden hour, wide anamorphic shot, dust trail'],
  ['fashion', 'Sarı palto editorial', 'Model in oversized mustard coat, brutalist concrete stairs, hard shadows, editorial'],
  ['food', 'Burger close-up', 'Gourmet burger with melting cheese, dark slate background, steam, appetizing macro'],
  ['architecture', 'Bakı küləyi', 'Futuristic tower with flame-shaped glass facade at dusk, long exposure city lights'],
  ['abstract', 'Maye metal', 'Liquid metal ribbons in crimson and gold, studio lighting, ultra smooth 3D render'],
  ['ads', 'Parfüm reklamı', 'Perfume bottle floating above black water, golden splash frozen mid-air, luxury ad'],
  ['product', 'Sneaker levitasiya', 'Red sneaker levitating with exploding fabric threads, black backdrop, dynamic'],
  ['cinematic', 'Yağışlı küçə', 'Tracking shot through a rainy night alley, red taillights, reflective puddles'],
  ['portrait', 'Usta əlləri', 'Close-up of an artisan’s hands shaping clay, warm window light, documentary style'],
  ['fashion', 'Runway hərəkəti', 'Slow motion runway walk, red silk dress flowing, strobe flashes'],
  ['food', 'Çay süfrəsi', 'Traditional tea set with armudu glass, steam, sunset light through lace curtain'],
  ['abstract', 'Od dalğaları', 'Abstract waves of fire and smoke forming a spiral, black void, high contrast'],
  ['architecture', 'Minimal interyer', 'Minimal living room, black marble, single yellow armchair, soft morning light'],
  ['ads', 'Kofe reklam klipi', 'Coffee pouring in slow motion into black cup, crema swirl, amber backlight'],
  ['cinematic', 'Dron — dağ kəndi', 'Drone flyover of a mountain village at sunrise, mist in valleys, epic scale'],
  ['product', 'Qulaqlıq', 'Wireless headphones on rotating pedestal, red laser lines, tech commercial'],
  ['portrait', 'Boksçu', 'Boxer in dark gym, sweat, single overhead light, gritty cinematic portrait'],
  ['fashion', 'Aksesuar flatlay', 'Flat lay of gold jewelry on crimson velvet, top-down, soft shadows'],
  ['abstract', 'Hissəcik buludu', 'Particle cloud morphing into a lion silhouette, gold sparks, dark background'],
  ['food', 'Pizza dartma', 'Cheese pull from a pizza slice, slow motion, wood-fired oven glow'],
  ['ads', 'Avtomobil teaser', 'Sports car silhouette revealed by sweeping red light, smoke, teaser commercial'],
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
