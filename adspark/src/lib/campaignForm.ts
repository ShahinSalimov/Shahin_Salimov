import { campaignInputSchema, fieldErrors, type CampaignInput } from './schemas';

export const FORM_KEYS = [
  'productName',
  'category',
  'description',
  'benefits',
  'price',
  'audience',
  'problem',
  'goal',
  'platform',
  'duration',
  'language',
  'tone',
  'style',
  'cta',
  'brandId',
] as const;

export type FormKey = (typeof FORM_KEYS)[number];
export type FormState = Record<FormKey, string>;

export const DEFAULTS: FormState = {
  productName: '',
  category: '',
  description: '',
  benefits: '',
  price: '',
  audience: '',
  problem: '',
  goal: 'Drive sales',
  platform: 'Instagram Reels',
  duration: '30',
  language: 'English',
  tone: 'Friendly',
  style: 'Cinematic',
  cta: '',
  brandId: '',
};

export const LIMITS: Partial<Record<FormKey, number>> = {
  productName: 80,
  description: 1200,
  benefits: 800,
  price: 40,
  audience: 300,
  problem: 500,
  cta: 80,
};

export interface Step {
  id: 'product' | 'audience' | 'format' | 'review';
  label: string;
  description: string;
  fields: FormKey[];
}

export const STEPS: Step[] = [
  { id: 'product', label: 'Product', description: 'What you sell and why it is worth it', fields: ['productName', 'category', 'description', 'benefits', 'price'] },
  { id: 'audience', label: 'Audience', description: 'Who it is for and what it solves', fields: ['audience', 'problem', 'goal'] },
  { id: 'format', label: 'Format', description: 'Platform, length, language and style', fields: ['platform', 'duration', 'language', 'tone', 'style', 'cta'] },
  { id: 'review', label: 'Review', description: 'Check everything before generating', fields: [] },
];

export function toInput(form: FormState): unknown {
  return { ...form, duration: Number(form.duration), brandId: form.brandId || undefined };
}

/** Validates the whole form but returns only errors for the requested fields. */
export function validateFields(form: FormState, fields: readonly FormKey[]): Record<string, string> {
  const r = campaignInputSchema.safeParse(toInput(form));
  if (r.success) return {};
  const all = fieldErrors(r.error);
  const out: Record<string, string> = {};
  for (const f of fields) if (all[f]) out[f] = all[f];
  return out;
}

export function validateAll(form: FormState): { data: CampaignInput | null; errors: Record<string, string>; firstInvalidStep: number } {
  const r = campaignInputSchema.safeParse(toInput(form));
  if (r.success) return { data: r.data, errors: {}, firstInvalidStep: -1 };
  const errors = fieldErrors(r.error);
  const firstInvalidStep = STEPS.findIndex((s) => s.fields.some((f) => errors[f]));
  return { data: null, errors, firstInvalidStep };
}

/** Steps whose fields are all valid (used for the progress indicator). */
export function completedSteps(form: FormState): boolean[] {
  return STEPS.map((s) => s.fields.length > 0 && Object.keys(validateFields(form, s.fields)).length === 0);
}

// ---------------------------------------------------------------------------
// Draft persistence (localStorage, best effort)

export const DRAFT_KEY = 'adspark:new-campaign-draft:v2';

export interface Draft {
  form: FormState;
  step: number;
  savedAt: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(s: StorageLike | null = storage()): Draft | null {
  try {
    const raw = s?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.form) return null;
    const form = { ...DEFAULTS };
    for (const k of FORM_KEYS) {
      const v = (parsed.form as Partial<FormState>)[k];
      if (typeof v === 'string') form[k] = v.slice(0, (LIMITS[k] ?? 200) + 50);
    }
    const step = Number.isInteger(parsed.step) ? Math.min(Math.max(parsed.step as number, 0), STEPS.length - 1) : 0;
    return { form, step, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now() };
  } catch {
    return null;
  }
}

export function saveDraft(form: FormState, step: number, s: StorageLike | null = storage()): number | null {
  const savedAt = Date.now();
  try {
    s?.setItem(DRAFT_KEY, JSON.stringify({ form, step, savedAt }));
    return s ? savedAt : null;
  } catch {
    return null;
  }
}

export function clearDraft(s: StorageLike | null = storage()) {
  try {
    s?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function isPristine(form: FormState): boolean {
  return FORM_KEYS.every((k) => form[k] === DEFAULTS[k]);
}
