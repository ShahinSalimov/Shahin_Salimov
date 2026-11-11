import type { Campaign } from './schemas';

export function campaignHref(c: Campaign) {
  return c.scenes.length ? `/app/campaigns/${c.id}` : `/app/campaigns/${c.id}/concepts`;
}

export type StageTone = 'success' | 'warning' | 'default';

export function campaignStage(c: Campaign): { label: string; tone: StageTone; step: 1 | 2 | 3 } {
  if (c.scenes.length) return { label: 'Full campaign', tone: 'success', step: 3 };
  if (c.concepts.length) return { label: 'Choosing concept', tone: 'warning', step: 2 };
  return { label: 'Brief only', tone: 'default', step: 1 };
}

export function relativeTime(ts: number, now = Date.now()): string {
  const min = Math.round((now - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}
