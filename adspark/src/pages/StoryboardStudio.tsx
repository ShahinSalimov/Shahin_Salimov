import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Pencil, Play, Pause, Plus, Trash2, SkipBack, SkipForward, Clapperboard, Info } from 'lucide-react';
import { useApp, useCampaign } from '../store/app';
import { STORYBOARD_STYLES, type Campaign, type StoryboardStyle } from '../lib/schemas';
import { blankScene, duplicateAt, insertAfter, move, patchScene, removeAt, totalDuration } from '../lib/scenes';
import { fitDurations } from '../lib/engine/generate';
import { formatTime } from '../lib/engine/util';
import { Button, ButtonLink, Card, ConfirmModal, EmptyState, IconButton, Modal, PageHeader, Tabs } from '../components/ui';
import { CampaignMissing, CampaignNav, ExportMenu } from '../components/campaign';
import { DurationSummary, SceneFields, SHOT_OPTIONS } from '../components/scene';
import { StoryboardFrame } from '../components/StoryboardFrame';
import { CampaignTitle } from './CampaignEditor';

function Preview({ c, open, onClose }: { c: Campaign; open: boolean; onClose: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = totalDuration(c.scenes);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setElapsed(0);
    }
  }, [open]);

  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - elapsed * 1000;
    const timer = setInterval(() => {
      const e = (performance.now() - started) / 1000;
      if (e >= total) {
        setElapsed(total);
        setPlaying(false);
      } else setElapsed(e);
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);

  let acc = 0;
  let index = c.scenes.length - 1;
  const starts = c.scenes.map((s) => {
    const st = acc;
    acc += s.duration;
    return st;
  });
  for (let i = 0; i < c.scenes.length; i++) {
    if (elapsed < starts[i] + c.scenes[i].duration) {
      index = i;
      break;
    }
  }
  const scene = c.scenes[index];
  const jump = (i: number) => {
    const clamped = Math.max(0, Math.min(c.scenes.length - 1, i));
    setPlaying(false);
    setElapsed(starts[clamped] ?? 0);
  };

  return (
    <Modal open={open} onClose={onClose} title="Storyboard preview" wide>
      {scene ? (
        <div>
          <div className="relative overflow-hidden rounded-xl border border-line">
            <StoryboardFrame shot={scene.shot} style={c.storyboardStyle} text={scene.onScreenText} number={index + 1} className="block w-full" />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.round(elapsed)} aria-label="Preview progress">
            <div className="h-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-100" style={{ width: `${total ? (elapsed / total) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <IconButton label="Previous scene" onClick={() => jump(index - 1)}>
              <SkipBack className="size-4" />
            </IconButton>
            <Button
              size="sm"
              icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              onClick={() => {
                if (!playing && elapsed >= total) setElapsed(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <IconButton label="Next scene" onClick={() => jump(index + 1)}>
              <SkipForward className="size-4" />
            </IconButton>
            <span className="ml-auto text-sm tabular-nums text-muted">
              {formatTime(Math.floor(elapsed))} / {formatTime(total)}
            </span>
          </div>
          <div className="mt-4 grid gap-3 rounded-xl border border-line/70 bg-bg/50 p-4 text-sm">
            <p>
              <span className="text-muted">Scene {index + 1} · </span>
              {scene.visual}
            </p>
            <p>
              <span className="text-muted">Camera: </span>
              {scene.camera}
            </p>
            {scene.voiceover ? (
              <p>
                <span className="text-muted">Voiceover: </span>“{scene.voiceover}”
              </p>
            ) : null}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Info className="size-3.5" aria-hidden /> Timed preview of illustrative sketches. It is a planning aid, not rendered video.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Add scenes to preview the storyboard.</p>
      )}
    </Modal>
  );
}

export default function StoryboardStudio() {
  const { id } = useParams();
  const c = useCampaign(id);
  const update = useApp((s) => s.updateCampaign);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  if (!c) return <CampaignMissing />;
  const setScenes = (fn: (s: Campaign['scenes']) => Campaign['scenes']) => update(c.id, (x) => ({ ...x, scenes: fn(x.scenes) }));
  const editingScene = c.scenes.find((s) => s.id === editing);

  if (!c.scenes.length) {
    return (
      <>
        <PageHeader eyebrow="Storyboard Studio" title={<CampaignTitle c={c} />} />
        <CampaignNav c={c} />
        <EmptyState
          icon={<Clapperboard className="size-6" />}
          title="No scenes yet"
          description="Create the full campaign from a concept, or start a storyboard from a blank scene."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to={`/app/campaigns/${c.id}/concepts`} variant="secondary">
                Go to concepts
              </ButtonLink>
              <Button icon={<Plus className="size-4" />} onClick={() => setScenes(() => [blankScene()])}>
                Add first scene
              </Button>
            </div>
          }
        />
      </>
    );
  }

  let t = 0;
  return (
    <>
      <PageHeader
        eyebrow="Storyboard Studio"
        title={<CampaignTitle c={c} />}
        actions={
          <>
            <Button variant="secondary" icon={<Play className="size-4" />} onClick={() => setPreview(true)}>
              Preview storyboard
            </Button>
            <ExportMenu c={c} />
          </>
        }
      />
      <CampaignNav c={c} />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
        <Tabs<StoryboardStyle>
          label="Storyboard visual style"
          value={c.storyboardStyle}
          onChange={(v) => update(c.id, (x) => ({ ...x, storyboardStyle: v }))}
          items={STORYBOARD_STYLES.map((s) => ({ value: s, label: s }))}
        />
        <div className="flex-1">
          <DurationSummary scenes={c.scenes} target={c.input.duration} onFit={() => update(c.id, (x) => ({ ...x, scenes: fitDurations(x.scenes, x.input.duration) }))} />
        </div>
      </div>
      <p className="mb-5 flex items-center gap-2 text-xs text-muted">
        <Info className="size-3.5" aria-hidden /> Frames are simple illustrative sketches chosen by shot type. They are not generated images or video frames.
      </p>

      <ol className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {c.scenes.map((s, i) => {
          const start = t;
          t += s.duration;
          return (
            <li key={s.id}>
              <Card as="article" className="flex h-full flex-col overflow-hidden">
                <button type="button" className="block text-left" onClick={() => setEditing(s.id)} aria-label={`Edit scene ${i + 1}`}>
                  <StoryboardFrame shot={s.shot} style={c.storyboardStyle} text={s.onScreenText} number={i + 1} className="block w-full" />
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {formatTime(start)}–{formatTime(t)} · {s.duration}s
                    </span>
                    <span>{SHOT_OPTIONS.find((o) => o.value === s.shot)?.label}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm">{s.visual}</p>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted">Camera: {s.camera}</p>
                  <div className="mt-auto flex items-center gap-1 pt-4">
                    <IconButton label={`Move scene ${i + 1} up`} disabled={i === 0} onClick={() => setScenes((x) => move(x, i, i - 1))}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={`Move scene ${i + 1} down`} disabled={i === c.scenes.length - 1} onClick={() => setScenes((x) => move(x, i, i + 1))}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label={`Duplicate scene ${i + 1}`} disabled={c.scenes.length >= 30} onClick={() => setScenes((x) => duplicateAt(x, i))}>
                      <Copy className="size-4" />
                    </IconButton>
                    <IconButton label={`Delete scene ${i + 1}`} onClick={() => setDeleting(i)} className="hover:text-danger">
                      <Trash2 className="size-4" />
                    </IconButton>
                    <Button size="sm" variant="secondary" className="ml-auto" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(s.id)}>
                      Edit
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            disabled={c.scenes.length >= 30}
            onClick={() => setScenes((x) => insertAfter(x, x.length - 1, blankScene()))}
            className="flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted transition-colors hover:border-primary/60 hover:text-ink disabled:opacity-40"
          >
            <Plus className="size-6" aria-hidden />
            Add scene
          </button>
        </li>
      </ol>

      <Modal open={!!editingScene} onClose={() => setEditing(null)} title={`Edit scene ${editingScene ? c.scenes.indexOf(editingScene) + 1 : ''}`} wide footer={<Button onClick={() => setEditing(null)}>Done</Button>}>
        {editingScene ? (
          <div className="grid gap-5">
            <StoryboardFrame shot={editingScene.shot} style={c.storyboardStyle} text={editingScene.onScreenText} className="mx-auto block w-full max-w-md rounded-lg border border-line" />
            <SceneFields scene={editingScene} onChange={(patch) => setScenes((x) => patchScene(x, editingScene.id, patch))} />
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title={`Delete scene ${deleting !== null ? deleting + 1 : ''}?`}
        message="The scene will be removed from the script and storyboard. The total duration will change until you fit it again."
        confirmLabel="Delete scene"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) setScenes((x) => removeAt(x, deleting));
        }}
      />

      <Preview c={c} open={preview} onClose={() => setPreview(false)} />
    </>
  );
}
