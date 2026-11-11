import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleCheck, Pencil, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { useApp } from '../store/app';
import { Button, Card, ConfirmModal, PageHeader, SelectField, TextArea, TextField, cx } from '../components/ui';
import { CATEGORIES, DURATIONS, GOALS, LANGUAGES, PLATFORMS, STYLES, TONES } from '../lib/schemas';
import { aspectRatio } from '../lib/engine/generate';
import { parseList } from '../lib/engine/util';
import {
  DEFAULTS,
  LIMITS,
  STEPS,
  clearDraft,
  completedSteps,
  isPristine,
  loadDraft,
  saveDraft,
  validateAll,
  validateFields,
  type FormKey,
  type FormState,
} from '../lib/campaignForm';

const EXAMPLE: FormState = {
  ...DEFAULTS,
  productName: 'Bloom Bakery',
  category: 'Restaurant',
  description: 'A neighbourhood bakery making sourdough bread and pastries every morning from organic flour, with same-day local delivery.',
  benefits: 'Baked fresh every morning\nOrganic flour, no preservatives\nDelivered to your door the same day',
  audience: 'busy families and young professionals in the city',
  problem: 'Supermarket bread goes stale in a day and tastes like nothing',
  cta: 'Order today in the link',
};

const LABELS: Record<FormKey, string> = {
  productName: 'Product or business name',
  category: 'Product category',
  description: 'Product description',
  benefits: 'Main benefits',
  price: 'Product price',
  audience: 'Target audience',
  problem: 'Customer problem',
  goal: 'Main advertising goal',
  platform: 'Social media platform',
  duration: 'Video duration',
  language: 'Campaign language',
  tone: 'Advertising tone',
  style: 'Campaign style',
  cta: 'Call to action',
  brandId: 'Brand Kit profile',
};

function Counter({ value, max }: { value: string; max: number }) {
  const near = value.length > max * 0.9;
  return <span className={cx('tabular-nums', near ? 'text-warning' : 'text-muted/70')}>{value.length}/{max}</span>;
}

function Stepper({ step, done, onJump }: { step: number; done: boolean[]; onJump: (i: number) => void }) {
  const pct = Math.round((done.filter(Boolean).length / 3) * 100);
  return (
    <nav aria-label="Campaign brief progress" className="mb-6">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>
          Step {step + 1} of {STEPS.length}: <span className="text-ink">{STEPS[step].label}</span>
        </span>
        <span aria-label={`${pct}% of required information complete`}>{pct}% complete</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const current = i === step;
          const complete = done[i];
          const reachable = i <= step || done.slice(0, i).every(Boolean);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!reachable}
                aria-current={current ? 'step' : undefined}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  current ? 'border-primary/60 bg-primary/10' : 'border-line bg-surface hover:border-primary/40',
                )}
              >
                <span
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    complete ? 'bg-success/20 text-success' : current ? 'bg-primary text-white' : 'bg-elevated text-muted',
                  )}
                >
                  {complete ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-medium">{s.label}</span>
                  <span className="block truncate text-[11px] text-muted">{s.description}</span>
                </span>
                <span className="sr-only sm:hidden">{s.label}</span>
                {complete ? <span className="sr-only"> (complete)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ReviewSection({ title, onEdit, rows }: { title: string; onEdit: () => void; rows: [string, ReactNode][] }) {
  return (
    <Card as="section" className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </Button>
      </div>
      <dl className="grid gap-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 whitespace-pre-line break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default function NewCampaign() {
  const navigate = useNavigate();
  const brands = useApp((s) => s.brands);
  const createCampaign = useApp((s) => s.createCampaign);
  const initial = useMemo(() => loadDraft(), []);
  const [form, setForm] = useState<FormState>(initial?.form ?? DEFAULTS);
  const [step, setStep] = useState(initial?.step ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Partial<Record<FormKey, boolean>>>({});
  const [savedAt, setSavedAt] = useState<number | null>(initial?.savedAt ?? null);
  const [restored] = useState(!!initial && !isPristine(initial.form));
  const [confirmReset, setConfirmReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const done = completedSteps(form);

  // Persist drafts (debounced) so nothing is lost on reload or accidental navigation.
  useEffect(() => {
    if (submitting) return;
    if (isPristine(form)) {
      clearDraft();
      setSavedAt(null);
      return;
    }
    const t = setTimeout(() => setSavedAt(saveDraft(form, step)), 300);
    return () => clearTimeout(t);
  }, [form, step, submitting]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const update = (key: FormKey, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    // Inline validation: re-check a field once it has been touched or has an error.
    if (touched[key] || errors[key]) setErrors((e) => ({ ...e, [key]: validateFields(next, [key])[key] ?? '' }));
  };

  const blur = (key: FormKey) => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors((e) => ({ ...e, [key]: validateFields(form, [key])[key] ?? '' }));
  };

  const focusField = (key: string) => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[name="${key}"]`)?.focus());
  };

  const next = () => {
    const errs = validateFields(form, STEPS[step].fields);
    setErrors((e) => ({ ...e, ...Object.fromEntries(STEPS[step].fields.map((f) => [f, errs[f] ?? ''])) }));
    setTouched((t) => ({ ...t, ...Object.fromEntries(STEPS[step].fields.map((f) => [f, true])) }));
    const first = STEPS[step].fields.find((f) => errs[f]);
    if (first) {
      focusField(first);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const jump = (i: number) => {
    if (i > step) {
      // Moving forward still requires the steps in between to be valid.
      for (let s = step; s < i; s++) {
        const errs = validateFields(form, STEPS[s].fields);
        if (Object.keys(errs).length) {
          setErrors((e) => ({ ...e, ...errs }));
          setStep(s);
          return;
        }
      }
    }
    setStep(i);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      next();
      return;
    }
    const r = validateAll(form);
    if (!r.data) {
      setErrors(r.errors);
      setStep(Math.max(0, r.firstInvalidStep));
      return;
    }
    setSubmitting(true);
    const campaign = createCampaign(r.data);
    clearDraft();
    navigate(`/app/campaigns/${campaign.id}/concepts`);
  };

  const applyBrand = (id: string) => {
    const b = brands.find((x) => x.id === id);
    setForm((f) =>
      b
        ? { ...f, brandId: id, productName: f.productName || b.name, description: f.description || b.description, audience: f.audience || b.audience, tone: b.tone }
        : { ...f, brandId: '' },
    );
  };

  const field = (key: FormKey) => ({
    name: key,
    value: form[key],
    error: errors[key] || undefined,
    onChange: (e: { target: { value: string } }) => update(key, e.target.value),
    onBlur: () => blur(key),
  });

  const hintWithCount = (key: FormKey, hint: string) => (
    <span className="flex justify-between gap-3">
      <span>{hint}</span>
      <Counter value={form[key]} max={LIMITS[key] ?? 0} />
    </span>
  );

  const brandName = brands.find((b) => b.id === form.brandId)?.name;
  const benefits = parseList(form.benefits);

  return (
    <>
      <PageHeader
        eyebrow="New campaign"
        title="Campaign brief"
        description="Four short steps. The more specific your benefits, audience and problem, the stronger the concepts."
        actions={
          <>
            <span className="text-xs text-muted" role="status" aria-live="polite">
              {savedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <CircleCheck className="size-3.5 text-success" aria-hidden /> Draft saved
                </span>
              ) : null}
            </span>
            <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmReset(true)} disabled={isPristine(form)}>
              Discard draft
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Wand2 className="size-3.5" />}
              onClick={() => {
                setForm(EXAMPLE);
                setErrors({});
              }}
            >
              Load example
            </Button>
          </>
        }
      />

      {restored ? (
        <p className="mb-4 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-2.5 text-sm text-ink/90" role="status">
          Your unfinished brief was restored from this browser.
        </p>
      ) : null}

      <Stepper step={step} done={done} onJump={jump} />

      <form onSubmit={submit} noValidate aria-labelledby="step-heading">
        <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="sr-only">
          {STEPS[step].label}: {STEPS[step].description}
        </h2>

        {step === 0 ? (
          <Card as="section" className="grid gap-5 p-6 sm:grid-cols-2">
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
            <TextField label={LABELS.productName} required maxLength={LIMITS.productName} autoComplete="off" {...field('productName')} />
            <SelectField label={LABELS.category} required placeholder="Choose a category" options={CATEGORIES} {...field('category')} />
            <TextArea
              className="sm:col-span-2"
              label={LABELS.description}
              required
              rows={4}
              maxLength={LIMITS.description}
              hint={hintWithCount('description', 'What is it and what makes it different? At least 20 characters.')}
              {...field('description')}
            />
            <TextArea
              className="sm:col-span-2"
              label={LABELS.benefits}
              required
              rows={3}
              maxLength={LIMITS.benefits}
              hint={hintWithCount('benefits', 'One per line or separated by commas. The first three are used most.')}
              {...field('benefits')}
            />
            <TextField label={LABELS.price} optional maxLength={LIMITS.price} hint="Leave empty to skip price mentions. Shown exactly as written." {...field('price')} />
          </Card>
        ) : null}

        {step === 1 ? (
          <Card as="section" className="grid gap-5 p-6">
            <TextField label={LABELS.audience} required maxLength={LIMITS.audience} hint="Who should feel this ad was made for them?" {...field('audience')} />
            <TextArea
              label={LABELS.problem}
              required
              rows={3}
              maxLength={LIMITS.problem}
              hint={hintWithCount('problem', 'The frustration your product removes, in your customer’s words.')}
              {...field('problem')}
            />
            <SelectField label={LABELS.goal} required options={GOALS} {...field('goal')} />
          </Card>
        ) : null}

        {step === 2 ? (
          <Card as="section" className="grid gap-5 p-6 sm:grid-cols-2">
            <SelectField label={LABELS.platform} required options={PLATFORMS} hint={`Framed for ${aspectRatio(form.platform as never) ?? ''}.`} {...field('platform')} />
            <SelectField label={LABELS.duration} required options={DURATIONS.map((d) => ({ value: String(d), label: `${d} seconds` }))} {...field('duration')} />
            <SelectField
              label={LABELS.language}
              required
              options={LANGUAGES}
              hint="Hooks, voiceover, on-screen text and captions use this language. Production notes stay in English."
              {...field('language')}
            />
            <SelectField label={LABELS.tone} required options={TONES} {...field('tone')} />
            <SelectField label={LABELS.style} required options={STYLES} {...field('style')} />
            <TextField label={LABELS.cta} required maxLength={LIMITS.cta} hint="e.g. Order today, Book a free visit" {...field('cta')} />
          </Card>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-5">
            <ReviewSection
              title="Product"
              onEdit={() => setStep(0)}
              rows={[
                ...(brandName ? ([['Brand Kit', brandName]] as [string, ReactNode][]) : []),
                [LABELS.productName, form.productName],
                [LABELS.category, form.category],
                [LABELS.description, form.description],
                [LABELS.benefits, <ul className="list-inside list-disc">{benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>],
                [LABELS.price, form.price || <span className="text-muted">Not specified</span>],
              ]}
            />
            <ReviewSection
              title="Audience"
              onEdit={() => setStep(1)}
              rows={[
                [LABELS.audience, form.audience],
                [LABELS.problem, form.problem],
                [LABELS.goal, form.goal],
              ]}
            />
            <ReviewSection
              title="Format"
              onEdit={() => setStep(2)}
              rows={[
                [LABELS.platform, `${form.platform} (${aspectRatio(form.platform as never)})`],
                [LABELS.duration, `${form.duration} seconds`],
                [LABELS.language, form.language],
                ['Tone and style', `${form.tone} · ${form.style}`],
                [LABELS.cta, form.cta],
              ]}
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            {Object.values(errors).some(Boolean) ? (
              <p className="text-sm text-danger" role="alert">
                Please fix the highlighted fields.
              </p>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button type="submit">
                {step === STEPS.length - 2 ? 'Review brief' : 'Continue'} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={submitting} icon={<Sparkles className="size-4" />}>
                Generate concepts
              </Button>
            )}
          </div>
        </div>
      </form>

      <ConfirmModal
        open={confirmReset}
        title="Discard this draft?"
        message="All fields return to their defaults and the saved draft is removed from this browser."
        confirmLabel="Discard draft"
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          clearDraft();
          setForm(DEFAULTS);
          setErrors({});
          setTouched({});
          setStep(0);
        }}
      />
    </>
  );
}
