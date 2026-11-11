import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Lightbulb, Pencil, Plus, X, ChevronDown } from 'lucide-react';
import { useApp, useCampaign } from '../store/app';
import { fitDurations, aspectRatio } from '../lib/engine/generate';
import { blankScene, insertAfter, patchScene } from '../lib/scenes';
import { formatTime } from '../lib/engine/util';
import { selectedConcept } from '../lib/export/txt';
import { Badge, Button, ButtonLink, Card, EmptyState, IconButton, PageHeader } from '../components/ui';
import { CampaignMissing, CampaignNav, ExportMenu, GeneratorBadge } from '../components/campaign';
import { DurationSummary, SceneFields } from '../components/scene';
import type { Campaign } from '../lib/schemas';

export function CampaignTitle({ c }: { c: Campaign }) {
  const rename = useApp((s) => s.renameCampaign);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(c.name);
  if (!editing)
    return (
      <span className="inline-flex items-center gap-2">
        <span className="break-words">{c.name}</span>
        <IconButton
          label="Rename campaign"
          onClick={() => {
            setValue(c.name);
            setEditing(true);
          }}
        >
          <Pencil className="size-4" />
        </IconButton>
      </span>
    );
  const commit = () => {
    if (value.trim()) rename(c.id, value);
    setEditing(false);
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <label htmlFor="rename" className="sr-only">
        Campaign name
      </label>
      <input id="rename" autoFocus className="input max-w-md font-display text-xl font-bold" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
      <IconButton label="Save name" type="submit">
        <Check className="size-4 text-success" />
      </IconButton>
      <IconButton label="Cancel rename" onClick={() => setEditing(false)}>
        <X className="size-4" />
      </IconButton>
    </form>
  );
}

export default function CampaignEditor() {
  const { id } = useParams();
  const c = useCampaign(id);
  const update = useApp((s) => s.updateCampaign);
  if (!c) return <CampaignMissing />;
  const concept = selectedConcept(c);

  if (!c.scenes.length) {
    return (
      <>
        <PageHeader eyebrow="Campaign editor" title={<CampaignTitle c={c} />} />
        <CampaignNav c={c} />
        <EmptyState
          icon={<Lightbulb className="size-6" />}
          title="Choose a concept first"
          description="Pick one of the generated concepts and create the full campaign to get the script, storyboard, voiceover and captions."
          action={<ButtonLink to={`/app/campaigns/${c.id}/concepts`}>Go to concepts</ButtonLink>}
        />
      </>
    );
  }

  let t = 0;
  return (
    <>
      <PageHeader
        eyebrow="Campaign editor · Video script"
        title={<CampaignTitle c={c} />}
        description={`${c.input.platform} (${aspectRatio(c.input.platform)}) · ${c.input.duration}s · ${c.input.language} · ${c.input.style}`}
        actions={<ExportMenu c={c} />}
      />
      <CampaignNav c={c} />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section aria-labelledby="script-h" className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="script-h" className="text-lg font-semibold">
              Scenes
            </h2>
            <GeneratorBadge c={c} />
          </div>
          <DurationSummary scenes={c.scenes} target={c.input.duration} onFit={() => update(c.id, (x) => ({ ...x, scenes: fitDurations(x.scenes, x.input.duration) }))} />
          <div className="mt-4 flex flex-col gap-4">
            {c.scenes.map((s, i) => {
              const start = t;
              t += s.duration;
              return (
                <Card as="article" key={s.id} className="overflow-hidden">
                  <details open={i < 2} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display text-sm font-bold text-[#b9abff]">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.onScreenText || s.visual}</p>
                        <p className="text-xs text-muted">
                          {formatTime(start)}–{formatTime(t)} · {s.duration}s · {s.beat !== 'custom' ? s.beat : 'custom scene'}
                        </p>
                      </div>
                      <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="border-t border-line/70 px-5 py-5">
                      <SceneFields scene={s} onChange={(patch) => update(c.id, (x) => ({ ...x, scenes: patchScene(x.scenes, s.id, patch) }))} />
                    </div>
                  </details>
                </Card>
              );
            })}
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            icon={<Plus className="size-4" />}
            onClick={() => update(c.id, (x) => ({ ...x, scenes: insertAfter(x.scenes, x.scenes.length - 1, blankScene()) }))}
            disabled={c.scenes.length >= 30}
          >
            Add scene
          </Button>
        </section>

        <aside className="flex flex-col gap-4">
          {concept ? (
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Selected concept</p>
              <h2 className="mt-1.5 font-semibold">{concept.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{concept.mainIdea}</p>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Hook</dt>
                  <dd>{concept.hook}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Message</dt>
                  <dd>{concept.message}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Visual direction</dt>
                  <dd className="text-muted">{concept.visualDirection}</dd>
                </div>
              </dl>
              <Link to={`/app/campaigns/${c.id}/concepts`} className="mt-4 inline-block text-sm text-secondary hover:underline">
                Change or edit concept
              </Link>
            </Card>
          ) : null}
          <Card className="p-5">
            <h2 className="font-semibold">Brief</h2>
            <dl className="mt-3 grid gap-2.5 text-sm">
              {[
                ['Product', `${c.input.productName} · ${c.input.category}`],
                ['Audience', c.input.audience],
                ['Problem', c.input.problem],
                ['Goal', c.input.goal],
                ['Tone', c.input.tone],
                ['CTA', c.input.cta],
                ...(c.input.price ? [['Price', c.input.price]] : []),
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[80px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>{c.scenes.length} scenes</Badge>
              <Badge>{c.voiceover ? 'Voiceover ready' : 'No voiceover'}</Badge>
              <Badge>{c.social ? 'Captions ready' : 'No captions'}</Badge>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
