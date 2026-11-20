/** Small deterministic PRNG (mulberry32) so local generation is reproducible per seed. */
export function createRng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

export function newSeed(): number {
  return Math.floor(Math.random() * 2_147_483_646) + 1;
}

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${prefix}${rand}`;
}

/** Splits a free-text benefit list (lines, commas, semicolons, bullets) into clean items. */
export function parseList(raw: string): string[] {
  // One benefit per line wins; commas only separate items when everything is on a single line.
  const multiLine = /\r?\n/.test(raw.trim());
  const splitter = multiLine ? /\r?\n|;|•|·/ : /;|,|•|·/;
  return raw
    .split(splitter)
    .map((s) => s.replace(/^[\s\-*–—\d.)]+/, '').trim())
    .filter((s) => s.length > 1)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .map((s) => s.replace(/[.!]+$/, ''));
}

/** Truncates at a word boundary for short on-screen text. */
export function shorten(value: string, max = 38): string {
  const clean = value.replace(/\s+/g, ' ').trim().replace(/[.!?:]+$/, '');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trim()}…`;
}

export function lowerFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

export function stripEnd(value: string): string {
  return value.trim().replace(/[.!?]+$/, '');
}

/** Converts a product name into a hashtag-safe token. */
export function toHashtag(value: string): string {
  const token = value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
  return token.slice(0, 40);
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
