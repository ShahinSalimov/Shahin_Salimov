import { useRef, useState } from 'react';
import { ImagePlus, Palette, Plus, Trash2, X, Save } from 'lucide-react';
import { useApp } from '../store/app';
import { brandSchema, fieldErrors, TONES, type Brand, type Tone } from '../lib/schemas';
import { readLogo, FileValidationError } from '../lib/files';
import { uid } from '../lib/engine/util';
import { Button, Card, ConfirmModal, EmptyState, IconButton, PageHeader, SelectField, TextArea, TextField, cx } from '../components/ui';

function newBrand(): Brand {
  const now = Date.now();
  return { id: uid('brd_'), name: '', logo: null, colors: ['#8065F6', '#36B8E8'], tone: 'Friendly', audience: '', description: '', website: '', contact: '', createdAt: now, updatedAt: now };
}

function BrandForm({ initial, isNew, onDone }: { initial: Brand; isNew: boolean; onDone: (b: Brand | null) => void }) {
  const save = useApp((s) => s.saveBrand);
  const toast = useApp((s) => s.toast);
  const [b, setB] = useState<Brand>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setB((x) => ({ ...x, [k]: v }));

  const onLogo = async (file?: File) => {
    if (!file) return;
    setLogoError(null);
    try {
      set('logo', await readLogo(file));
    } catch (e) {
      setLogoError(e instanceof FileValidationError ? e.message : 'The image could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    const r = brandSchema.safeParse({ ...b, updatedAt: Date.now() });
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return;
    }
    setSaving(true);
    try {
      await save(r.data);
      toast('success', `Brand “${r.data.name}” saved.`);
      setErrors({});
      onDone(r.data);
    } catch {
      toast('error', 'The brand could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-5 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-bg/60">
            {b.logo ? <img src={b.logo} alt={`${b.name || 'Brand'} logo`} className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted" aria-hidden />}
          </div>
          <div>
            <p className="label mb-1">Logo</p>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} id="logo-input" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                {b.logo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {b.logo ? (
                <Button size="sm" variant="ghost" onClick={() => set('logo', null)}>
                  Remove
                </Button>
              ) : null}
            </div>
            <p className={cx('mt-1.5 text-xs', logoError ? 'text-danger' : 'text-muted')} role={logoError ? 'alert' : undefined}>
              {logoError ?? 'PNG, JPEG or WebP, up to 500 KB. Stored only in this browser.'}
            </p>
          </div>
        </div>

        <TextField label="Brand name" required maxLength={80} value={b.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <SelectField label="Preferred advertising tone" options={TONES} value={b.tone} onChange={(e) => set('tone', e.target.value as Tone)} />
        <TextArea className="sm:col-span-2" label="Business description" optional rows={3} maxLength={1200} value={b.description} error={errors.description} onChange={(e) => set('description', e.target.value)} />
        <TextField className="sm:col-span-2" label="Target audience" optional maxLength={300} value={b.audience} onChange={(e) => set('audience', e.target.value)} />
        <TextField label="Website" optional type="url" placeholder="https://" maxLength={200} value={b.website} error={errors.website} onChange={(e) => set('website', e.target.value)} />
        <TextField label="Contact information" optional maxLength={300} value={b.contact} onChange={(e) => set('contact', e.target.value)} hint="Phone, email or address shown to customers." />

        <fieldset className="sm:col-span-2">
          <legend className="label">Brand colors</legend>
          <div className="flex flex-wrap items-center gap-3">
            {b.colors.map((color, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-xl border border-line bg-bg/60 py-1 pl-1 pr-1.5">
                <input
                  type="color"
                  aria-label={`Brand color ${i + 1}`}
                  value={color}
                  onChange={(e) => set('colors', b.colors.map((c, j) => (j === i ? e.target.value.toUpperCase() : c)))}
                  className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <span className="font-mono text-xs uppercase text-muted">{color}</span>
                <IconButton label={`Remove color ${i + 1}`} className="size-6" onClick={() => set('colors', b.colors.filter((_, j) => j !== i))}>
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))}
            {b.colors.length < 6 ? (
              <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => set('colors', [...b.colors, '#2FCF97'])}>
                Add color
              </Button>
            ) : null}
          </div>
          {errors.colors || errors['colors.0'] ? <p className="mt-1.5 text-xs text-danger">{errors.colors || errors['colors.0']}</p> : null}
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          {isNew ? (
            <Button variant="ghost" onClick={() => onDone(null)}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" loading={saving} icon={<Save className="size-4" />}>
            Save brand
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function BrandKit() {
  const brands = useApp((s) => s.brands);
  const deleteBrand = useApp((s) => s.deleteBrand);
  const toast = useApp((s) => s.toast);
  const [selected, setSelected] = useState<string | null>(brands[0]?.id ?? null);
  const [draft, setDraft] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const current = draft ?? brands.find((b) => b.id === selected) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Brand Kit"
        title="Your brand profiles"
        description="Save brand details once and apply them when creating a campaign. Stored locally in this browser."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setDraft(newBrand())}>
            New brand profile
          </Button>
        }
      />
      {brands.length === 0 && !draft ? (
        <EmptyState icon={<Palette className="size-6" />} title="No brand profiles yet" description="Add your brand name, logo, colors, tone and audience to reuse them in every campaign." action={<Button onClick={() => setDraft(newBrand())}>Create brand profile</Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Brand profiles" className="flex flex-col gap-2">
            {brands.map((b) => (
              <div key={b.id} className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5', current?.id === b.id ? 'border-primary/60 bg-elevated' : 'border-line bg-surface')}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-current={current?.id === b.id ? 'true' : undefined}
                  onClick={() => {
                    setDraft(null);
                    setSelected(b.id);
                  }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg">
                    {b.logo ? <img src={b.logo} alt="" className="size-full object-contain" /> : <span className="font-display font-bold" style={{ color: b.colors[0] ?? '#8065F6' }}>{b.name.charAt(0)}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{b.name}</span>
                    <span className="flex gap-1 pt-1">
                      {b.colors.map((c, i) => (
                        <span key={i} className="size-2.5 rounded-full" style={{ background: c }} />
                      ))}
                    </span>
                  </span>
                </button>
                <IconButton label={`Delete ${b.name}`} className="hover:text-danger" onClick={() => setDeleting(b)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ))}
            {draft ? <div className="rounded-xl border border-dashed border-primary/60 px-3 py-3 text-sm text-muted">New profile (unsaved)</div> : null}
          </nav>
          {current ? (
            <BrandForm
              key={current.id}
              initial={current}
              isNew={!!draft}
              onDone={(b) => {
                setDraft(null);
                if (b) setSelected(b.id);
              }}
            />
          ) : (
            <Card className="p-6 text-sm text-muted">Select a brand profile to edit it.</Card>
          )}
        </div>
      )}
      <ConfirmModal
        open={!!deleting}
        title="Delete brand profile?"
        message={`“${deleting?.name}” will be removed. Campaigns that used it keep their own copy of the details.`}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteBrand(deleting.id);
          if (selected === deleting.id) setSelected(null);
          toast('success', 'Brand profile deleted.');
        }}
      />
    </>
  );
}
