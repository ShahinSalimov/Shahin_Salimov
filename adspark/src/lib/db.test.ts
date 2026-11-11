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
    const brand = { id: 'b1', name: 'Nar', logo: null, colors: ['#8065F6'], tone: 'Warm', audience: '', description: '', website: '', contact: '', createdAt: 1, updatedAt: 1 } as const;
    await db.putBrand({ ...brand, colors: [...brand.colors] });
    await db.putBrand({ ...brand, id: 'b2', name: 'Bad', website: 'javascript:x', colors: [] });
    const brands = await db.listBrands();
    expect(brands.items.map((b) => b.name)).toEqual(['Nar']);
    expect(brands.skipped).toBe(1);
    await db.deleteBrand('b1');
    expect((await db.listBrands()).items).toHaveLength(0);
    await db.clearAll();
    expect((await db.listCampaigns()).items).toHaveLength(0);
  });
});
