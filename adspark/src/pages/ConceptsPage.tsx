import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Pencil, RefreshCw, Star, Sparkles, Quote, Target, Heart, Info } from 'lucide-react';
import { useApp, useCampaign } from '../store/app';
import type { Campaign, Concept } from '../lib/schemas';
import { conceptSchema } from '../lib/schemas';
import { buildFullCampaign, regenerateConcepts, regenerateSingleConcept } from '../lib/workflow';
import { Badge, Button, Card, ConfirmModal, Modal, PageHeader, Spinner, TextArea, TextField, cx } from '../components/ui';
import { CampaignMissing, CampaignNav, GenerationError, GeneratorBadge, useGeneration } from '../components/campaign';

const DETAIL_FIELDS: [keyof Concept, string][] = [
  ['mainIdea', 'Main idea'],
  ['audience', 'Target audience'],
  ['angle', 'Advertising angle'],
  ['emotionalTrigger', 'Emotional trigger'],
  ['hook', 'Opening hook'],
  ['message', 'Main message'],
  ['cta', 'Call to action'],
  ['visualDirection', 'Suggested visual direction'],
];

function ConceptEditor({ concept, onSave, onClose }: { concept: Concept; onSave: (c: Concept) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(concept);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Concept) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Edit concept"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const r = conceptSchema.safeParse(draft);
              if (!r.success || !draft.title.trim()) {
                setError(r.success ? 'Title is required.' : (r.error.issues[0]?.message ?? 'Invalid concept.'));
                return;
              }
              onSave(r.data);
              onClose();
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextField label="Campaign title" value={draft.title} onChange={set('title')} maxLength={120} />
        {DETAIL_FIELDS.map(([k, label]) => (
          <TextArea key={k} label={label} value={String(draft[k])} onChange={set(k)} rows={k === 'mainIdea' || k === 'visualDirection' ? 3 : 2} maxLength={800} />
        ))}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function ConceptCard({
  concept,
  index,
  selected,
  busy,
  onView,
  onEdit,
  onRegenerate,
  onToggleSave,
  onCreate,
}: {
  concept: Concept;
  index: number;
  selected: boolean;
  busy: string | null;
  onView: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onToggleSave: () => void;
  onCreate: () => void;
}) {
  return (
    <Card as="article" className={cx('flex flex-col p-6 transition-colors', selected ? 'border-primary/70' : 'hover:border-line')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Concept {index + 1}</p>
          <h3 className="mt-1.5 text-lg font-semibold leading-snug">{concept.title}</h3>
        </div>
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={concept.saved}
          aria-label={concept.saved ? 'Unsave concept' : 'Save concept'}
          title={concept.saved ? 'Saved: kept when you regenerate' : 'Save: keep this concept when regenerating'}
          className={cx('rounded-lg p-1.5 transition-colors', concept.saved ? 'text-warning' : 'text-muted hover:text-ink')}
        >
          <Star className="size-5" fill={concept.saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="mt-4 flex gap-2 rounded-xl border border-line/70 bg-bg/50 p-3.5">
        <Quote className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm leading-relaxed text-ink/90">{concept.hook}</p>
      </div>
      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted">{concept.mainIdea}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="primary">
          <Heart className="size-3" aria-hidden /> {concept.emotionalTrigger}
        </Badge>
        <Badge>
          <Target className="size-3" aria-hidden /> {concept.angle.split(':')[0]}
        </Badge>
        {selected ? <Badge tone="success">In use</Badge> : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={onView}>
          View
        </Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={busy === `one:${concept.id}`} disabled={!!busy} onClick={onRegenerate}>
          Regenerate
        </Button>
        <Button size="sm" className="ml-auto" icon={<Sparkles className="size-3.5" />} loading={busy === `full:${concept.id}`} disabled={!!busy} onClick={onCreate}>
          Create Full Campaign
        </Button>
      </div>
    </Card>
  );
}

export default function ConceptsPage() {
  const { id } = useParams();
  const c = useCampaign(id);
  const update = useApp((s) => s.updateCampaign);
  const toast = useApp((s) => s.toast);
  const navigate = useNavigate();
  const gen = useGeneration();
  const [viewing, setViewing] = useState<Concept | null>(null);
  const [editing, setEditing] = useState<Concept | null>(null);
  const [confirm, setConfirm] = useState<Concept | null>(null);
  const autoRan = useRef(false);

  const { run } = gen;
  const generateAll = useCallback(
    (campaign: Campaign) =>
      run('all', async (p) => {
        const concepts = await regenerateConcepts(campaign, p);
        update(campaign.id, (x) => ({ ...x, concepts, generator: p.info }));
      }),
    [run, update],
  );

  useEffect(() => {
    if (c && c.concepts.length === 0 && !autoRan.current) {
      autoRan.current = true;
      void generateAll(c);
    }
  }, [c, generateAll]);

  if (!c) return <CampaignMissing />;

  const createFull = (concept: Concept) =>
    gen.run(`full:${concept.id}`, async (p) => {
      const full = await buildFullCampaign(c, concept, p);
      update(c.id, (x) => ({ ...x, selectedConceptId: concept.id, ...full }));
      toast('success', 'Full campaign created.');
      navigate(`/app/campaigns/${c.id}`);
    });

  return (
    <>
      <PageHeader
        eyebrow="Campaign generator"
        title={c.name}
        description={`${c.input.platform} · ${c.input.duration}s · ${c.input.style} · ${c.input.tone} · ${c.input.language}`}
        actions={
          <>
            <GeneratorBadge c={c} />
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={gen.busy === 'all'} disabled={!!gen.busy} onClick={() => generateAll(c)}>
              {c.concepts.length ? 'Regenerate unsaved' : 'Generate concepts'}
            </Button>
          </>
        }
      />
      <CampaignNav c={c} />
      {c.generator.engine === 'local' && c.concepts.length ? (
        <p className="mb-5 flex gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink/85" role="note">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            <strong className="font-semibold">Demo Generation.</strong> These concepts come from AdSpark’s local template library, adapted to your category, style and
            brief. No AI model was used. Review and edit them before production.
          </span>
        </p>
      ) : null}
      <GenerationError error={gen.error} onLocal={gen.retryLocal} onDismiss={gen.clearError} />

      {c.concepts.length === 0 ? (
        <Card className="flex justify-center py-16">{gen.busy ? <Spinner label="Drafting five concepts" /> : <p className="text-sm text-muted">No concepts yet. Use “Generate concepts” above.</p>}</Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            Star the concepts you like to keep them when regenerating. Choose one and create the full campaign: script, storyboard, voiceover and captions.
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {c.concepts.map((k, i) => (
              <ConceptCard
                key={k.id}
                concept={k}
                index={i}
                selected={c.selectedConceptId === k.id && c.scenes.length > 0}
                busy={gen.busy}
                onView={() => setViewing(k)}
                onEdit={() => setEditing(k)}
                onToggleSave={() => update(c.id, (x) => ({ ...x, concepts: x.concepts.map((y) => (y.id === k.id ? { ...y, saved: !y.saved } : y)) }))}
                onRegenerate={() =>
                  gen.run(`one:${k.id}`, async (p) => {
                    const concepts = await regenerateSingleConcept(c, k.id, p);
                    update(c.id, (x) => ({ ...x, concepts, selectedConceptId: x.selectedConceptId === k.id ? null : x.selectedConceptId }));
                  })
                }
                onCreate={() => (c.scenes.length ? setConfirm(k) : void createFull(k))}
              />
            ))}
          </div>
        </>
      )}

      <Modal
        open={!!viewing}
        wide
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ''}
        footer={
          viewing ? (
            <Button
              icon={<Sparkles className="size-4" />}
              onClick={() => {
                const k = viewing;
                setViewing(null);
                if (c.scenes.length) setConfirm(k);
                else void createFull(k);
              }}
            >
              Create Full Campaign
            </Button>
          ) : null
        }
      >
        {viewing ? (
          <dl className="grid gap-4">
            {DETAIL_FIELDS.map(([k, label]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
                <dd className="mt-1 text-sm leading-relaxed">{String(viewing[k])}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>

      {editing ? (
        <ConceptEditor
          concept={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            update(c.id, (x) => ({ ...x, concepts: x.concepts.map((y) => (y.id === next.id ? next : y)) }));
            toast('success', 'Concept updated.');
          }}
        />
      ) : null}

      <ConfirmModal
        open={!!confirm}
        title="Replace the current campaign?"
        message="This campaign already has a script, storyboard, voiceover and captions. Creating a new full campaign replaces them. Your concepts are kept. Duplicate the campaign first in My Campaigns if you want to keep both."
        confirmLabel="Replace"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void createFull(confirm);
        }}
      />
    </>
  );
}
