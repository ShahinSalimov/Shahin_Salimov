import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Wand2, RotateCcw } from 'lucide-react';
import { useApp } from '../store/app';
import { Button, Card, PageHeader, SelectField, TextArea, TextField } from '../components/ui';
import { CATEGORIES, DURATIONS, GOALS, LANGUAGES, PLATFORMS, STYLES, TONES, campaignInputSchema, fieldErrors } from '../lib/schemas';

type FormState = Record<
  'productName' | 'description' | 'category' | 'price' | 'benefits' | 'audience' | 'problem' | 'goal' | 'language' | 'platform' | 'duration' | 'tone' | 'style' | 'cta' | 'brandId',
  string
>;

const EMPTY: FormState = {
  productName: '',
  description: '',
  category: '',
  price: '',
  benefits: '',
  audience: '',
  problem: '',
  goal: 'Drive sales',
  language: 'English',
  platform: 'Instagram Reels',
  duration: '30',
  tone: 'Friendly',
  style: 'Cinematic',
  cta: '',
  brandId: '',
};

const EXAMPLE: FormState = {
  ...EMPTY,
  productName: 'Bloom Bakery',
  description: 'A neighbourhood bakery making sourdough bread and pastries every morning from organic flour, with same-day local delivery.',
  category: 'Restaurant',
  price: '',
  benefits: 'Baked fresh every morning\nOrganic flour, no preservatives\nDelivered to your door the same day',
  audience: 'busy families and young professionals in the city',
  problem: 'Supermarket bread goes stale in a day and tastes like nothing',
  goal: 'Drive sales',
  cta: 'Order today in the link',
};

const DRAFT_KEY = 'adspark:new-campaign-draft';

function loadDraft(): FormState {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    const out = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof FormState)[]) if (typeof parsed[k] === 'string') out[k] = parsed[k] as string;
    return out;
  } catch {
    return EMPTY;
  }
}

export default function NewCampaign() {
  const navigate = useNavigate();
  const brands = useApp((s) => s.brands);
  const createCampaign = useApp((s) => s.createCampaign);
  const [form, setForm] = useState<FormState>(loadDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      /* storage unavailable: drafts are a convenience only */
    }
  }, [form]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: '' }));
  };

  const applyBrand = (id: string) => {
    const b = brands.find((x) => x.id === id);
    setForm((f) =>
      b
        ? {
            ...f,
            brandId: id,
            productName: f.productName || b.name,
            description: f.description || b.description,
            audience: f.audience || b.audience,
            tone: b.tone,
          }
        : { ...f, brandId: '' },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = campaignInputSchema.safeParse({ ...form, duration: Number(form.duration), brandId: form.brandId || undefined });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      document.querySelector<HTMLElement>(`[data-field="${first}"] :is(input,textarea,select)`)?.focus();
      return;
    }
    setSubmitting(true);
    const campaign = createCampaign(parsed.data);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    navigate(`/app/campaigns/${campaign.id}/concepts`);
  };

  const field = (key: keyof FormState) => ({ value: form[key], onChange: set(key), error: errors[key], name: key });

  return (
    <>
      <PageHeader
        eyebrow="New campaign"
        title="Tell us about your product"
        description="The more specific you are about benefits, audience and the problem you solve, the stronger your concepts will be."
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => { setForm(EMPTY); setErrors({}); }}>
              Clear form
            </Button>
            <Button variant="secondary" size="sm" icon={<Wand2 className="size-3.5" />} onClick={() => { setForm(EXAMPLE); setErrors({}); }}>
              Load example
            </Button>
          </>
        }
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card as="section" className="p-6">
            <h2 className="mb-5 font-semibold">Product</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {brands.length ? (
                <SelectField
                  label="Use a Brand Kit profile"
                  optional
                  className="sm:col-span-2"
                  value={form.brandId}
                  onChange={(e) => applyBrand(e.target.value)}
                  options={[{ value: '', label: 'None' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
                  hint="Fills empty fields with your saved brand details and tone."
                />
              ) : null}
              <div data-field="productName">
                <TextField label="Product or business name" required maxLength={80} autoComplete="off" {...field('productName')} />
              </div>
              <div data-field="category">
                <SelectField label="Product category" required placeholder="Choose a category" options={CATEGORIES} {...field('category')} />
              </div>
              <div data-field="description" className="sm:col-span-2">
                <TextArea label="Product description" required maxLength={1200} rows={4} hint="What is it, what makes it different? At least 20 characters." {...field('description')} />
              </div>
              <div data-field="benefits" className="sm:col-span-2">
                <TextArea label="Main benefits" required maxLength={800} rows={3} hint="One benefit per line, or separated by commas. The first three are used most." {...field('benefits')} />
              </div>
              <div data-field="price">
                <TextField label="Product price" optional maxLength={40} hint="Shown exactly as written, e.g. 19 AZN or $49." {...field('price')} />
              </div>
              <div data-field="cta">
                <TextField label="Call to action" required maxLength={80} hint="e.g. Order today, Book a free visit" {...field('cta')} />
              </div>
            </div>
          </Card>

          <Card as="section" className="p-6">
            <h2 className="mb-5 font-semibold">Audience</h2>
            <div className="grid gap-5">
              <div data-field="audience">
                <TextField label="Target audience" required maxLength={300} hint="Who should feel this ad was made for them?" {...field('audience')} />
              </div>
              <div data-field="problem">
                <TextArea label="Customer problem" required maxLength={500} rows={2} hint="The frustration your product removes, in your customer’s words." {...field('problem')} />
              </div>
              <div data-field="goal">
                <SelectField label="Main advertising goal" required options={GOALS} {...field('goal')} />
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card as="section" className="p-6">
            <h2 className="mb-5 font-semibold">Format and style</h2>
            <div className="grid gap-5">
              <div data-field="platform">
                <SelectField label="Social media platform" required options={PLATFORMS} {...field('platform')} />
              </div>
              <div data-field="duration">
                <SelectField label="Video duration" required options={DURATIONS.map((d) => ({ value: String(d), label: `${d} seconds` }))} {...field('duration')} />
              </div>
              <div data-field="language">
                <SelectField label="Campaign language" required options={LANGUAGES} hint="Hooks, voiceover, on-screen text and captions use this language. Production notes stay in English." {...field('language')} />
              </div>
              <div data-field="tone">
                <SelectField label="Advertising tone" required options={TONES} {...field('tone')} />
              </div>
              <div data-field="style">
                <SelectField label="Campaign style" required options={STYLES} {...field('style')} />
              </div>
            </div>
          </Card>
          <div className="lg:sticky lg:top-20">
            <Button type="submit" size="lg" className="w-full" loading={submitting} icon={<Sparkles className="size-4" />}>
              Generate concepts
            </Button>
            {Object.values(errors).some(Boolean) ? (
              <p className="mt-3 text-center text-sm text-danger" role="alert">
                Please fix the highlighted fields.
              </p>
            ) : (
              <p className="mt-3 text-center text-xs text-muted">Your draft is kept while this tab is open.</p>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
