import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { campaignInputSchema, campaignSchema } from './schemas';

const input = campaignInputSchema.parse({
  productName: 'Test',
  description: 'A product description that is long enough.',
  category: 'Other',
  benefits: 'Good',
  audience: 'Everyone',
  problem: 'Problem',
  goal: 'Brand awareness',
  language: 'Turkish',
  platform: 'YouTube',
  duration: 60,
  tone: 'Calm',
  style: 'Minimal',
  cta: 'Visit us',
});

describe('IndexedDB storage', () => {
  it('saves, lists, skips invalid records, and deletes', async () => {
    const c = campaignSchema.parse({ id: 'a', name: 'A', createdAt: 1, updatedAt: 5, input, concepts: [], scenes: [] });
    await db.putCampaign(c);
    await db.putCampaign({ ...c, id: 'b', name: 'B', updatedAt: 9 });
    await db.putCampaign({ id: 'broken' } as never);
    const list = await db.listCampaigns();
    expect(list.items.map((x) => x.id)).toEqual(['b', 'a']);
    expect(list.skipped).toBe(1);
    await db.deleteCampaign('a');
    expect((await db.listCampaigns()).items.map((x) => x.id)).toEqual(['b']);
    await db.setSetting('ai', { enabled: true });
    expect(await db.getSetting('ai')).toEqual({ enabled: true });
    await db.clearAll();
    expect((await db.listCampaigns()).items).toHaveLength(0);
  });
});
