import { describe, expect, it } from 'vitest';
import { brandSchema, campaignInputSchema, fieldErrors } from './schemas';

describe('campaignInputSchema', () => {
  it('reports every missing required field and allows empty price', () => {
    const r = campaignInputSchema.safeParse({ price: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errs = fieldErrors(r.error);
    for (const k of ['productName', 'description', 'category', 'benefits', 'audience', 'problem', 'goal', 'language', 'platform', 'duration', 'tone', 'style', 'cta']) {
      expect(errs[k], k).toBeTruthy();
    }
    expect(errs.price).toBeUndefined();
  });

  it('rejects unknown enum values and durations', () => {
    const r = campaignInputSchema.safeParse({ duration: 20, platform: 'MySpace' });
    expect(r.success).toBe(false);
  });
});

describe('brandSchema', () => {
  const ok = { id: 'b1', name: 'Bloom', logo: null, colors: ['#8065F6'], tone: 'Warm', audience: '', description: '', website: '', contact: '', createdAt: 1, updatedAt: 1 };
  it('accepts a valid brand', () => expect(brandSchema.safeParse(ok).success).toBe(true));
  it('rejects javascript: websites and svg logos', () => {
    expect(brandSchema.safeParse({ ...ok, website: 'javascript:alert(1)' }).success).toBe(false);
    expect(brandSchema.safeParse({ ...ok, logo: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false);
    expect(brandSchema.safeParse({ ...ok, colors: ['red'] }).success).toBe(false);
  });
});
