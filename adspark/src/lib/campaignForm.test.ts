import { describe, expect, it } from 'vitest';
import { DEFAULTS, DRAFT_KEY, STEPS, clearDraft, completedSteps, isPristine, loadDraft, saveDraft, validateAll, validateFields, type FormState } from './campaignForm';

const valid: FormState = {
  ...DEFAULTS,
  productName: 'Bloom Bakery',
  category: 'Restaurant',
  description: 'Neighbourhood bakery with fresh sourdough every morning.',
  benefits: 'Fresh, organic',
  audience: 'families',
  problem: 'Stale bread',
  cta: 'Order today',
};

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('step validation', () => {
  it('defaults satisfy every select field so users only type what matters', () => {
    const errs = validateFields(DEFAULTS, ['goal', 'platform', 'duration', 'language', 'tone', 'style']);
    expect(errs).toEqual({});
  });
  it('only reports errors for the requested step', () => {
    const errs = validateFields(DEFAULTS, STEPS[0].fields);
    expect(Object.keys(errs).sort()).toEqual(['benefits', 'category', 'description', 'productName']);
    expect(errs.price).toBeUndefined();
  });
  it('price is optional, description needs 20 characters', () => {
    expect(validateFields({ ...valid, price: '' }, ['price'])).toEqual({});
    expect(validateFields({ ...valid, description: 'too short' }, ['description']).description).toMatch(/20 characters/);
  });
  it('validateAll returns data or the first invalid step', () => {
    expect(validateAll(valid).data?.duration).toBe(30);
    expect(validateAll({ ...valid, cta: '' }).firstInvalidStep).toBe(2);
    expect(validateAll({ ...valid, audience: '' }).firstInvalidStep).toBe(1);
  });
  it('tracks completed steps for the progress bar', () => {
    expect(completedSteps(DEFAULTS)).toEqual([false, false, false, false]);
    expect(completedSteps(valid)).toEqual([true, true, true, false]);
  });
  it('rejects tampered select values', () => {
    expect(validateFields({ ...valid, duration: '20' }, ['duration']).duration).toBeTruthy();
  });
});

describe('draft persistence', () => {
  it('saves, loads and clears drafts', () => {
    const s = memoryStorage();
    expect(loadDraft(s)).toBeNull();
    saveDraft(valid, 2, s);
    const d = loadDraft(s)!;
    expect(d.form.productName).toBe('Bloom Bakery');
    expect(d.step).toBe(2);
    clearDraft(s);
    expect(s.m.has(DRAFT_KEY)).toBe(false);
  });
  it('survives corrupt or hostile drafts', () => {
    const s = memoryStorage();
    s.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft(s)).toBeNull();
    s.setItem(DRAFT_KEY, JSON.stringify({ form: { productName: 42, cta: 'Buy', evil: 'x' }, step: 99 }));
    const d = loadDraft(s)!;
    expect(d.form.productName).toBe('');
    expect(d.form.cta).toBe('Buy');
    expect(d.step).toBe(STEPS.length - 1);
    expect('evil' in d.form).toBe(false);
  });
  it('works without storage', () => {
    expect(saveDraft(valid, 0, null)).toBeNull();
    expect(loadDraft(null)).toBeNull();
    expect(isPristine(DEFAULTS)).toBe(true);
    expect(isPristine(valid)).toBe(false);
  });
});
