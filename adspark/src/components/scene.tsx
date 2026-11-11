import { CircleCheck, TriangleAlert, Scale } from 'lucide-react';
import type { Scene, ShotType } from '../lib/schemas';
import { totalDuration } from '../lib/scenes';
import { Button, SelectField, TextArea, TextField } from './ui';

export const SHOT_OPTIONS: { value: ShotType; label: string }[] = [
  { value: 'wide', label: 'Wide shot' },
  { value: 'medium', label: 'Medium shot' },
  { value: 'close', label: 'Close-up' },
  { value: 'product', label: 'Product shot' },
  { value: 'pov', label: 'POV / hands' },
  { value: 'text', label: 'Text / end card' },
];

export function DurationSummary({ scenes, target, onFit }: { scenes: Scene[]; target: number; onFit: () => void }) {
  const total = totalDuration(scenes);
  const ok = total === target;
  return (
    <div
      role="status"
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center ${ok ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/10'}`}
    >
      {ok ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />}
      <p className="flex-1">
        <span className="font-medium">
          {scenes.length} scenes · {total}s of {target}s
        </span>
        <span className="text-muted">{ok ? ' — timing matches the selected video duration.' : ` — ${total > target ? `${total - target}s too long` : `${target - total}s short`}.`}</span>
      </p>
      {!ok && scenes.length > 0 ? (
        <Button size="sm" variant="secondary" icon={<Scale className="size-3.5" />} onClick={onFit} disabled={scenes.length > target}>
          Fit to {target}s
        </Button>
      ) : null}
    </div>
  );
}

export function SceneFields({ scene, onChange, compact }: { scene: Scene; onChange: (patch: Partial<Scene>) => void; compact?: boolean }) {
  const t = (k: keyof Scene) => ({
    value: String(scene[k] ?? ''),
    onChange: (e: { target: { value: string } }) => onChange({ [k]: e.target.value } as Partial<Scene>),
  });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Duration (seconds)"
        type="number"
        min={1}
        max={60}
        inputMode="numeric"
        value={String(scene.duration)}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange({ duration: Math.min(60, Math.max(1, n)) });
        }}
      />
      <SelectField label="Shot type" options={SHOT_OPTIONS} value={scene.shot} onChange={(e) => onChange({ shot: e.target.value as ShotType })} />
      <TextArea className="sm:col-span-2" label="Visual description" rows={2} maxLength={800} {...t('visual')} />
      <TextArea className="sm:col-span-2" label="Camera direction" rows={compact ? 1 : 2} maxLength={400} {...t('camera')} />
      <TextField className="sm:col-span-2" label="On-screen text" maxLength={200} {...t('onScreenText')} />
      {compact ? null : (
        <>
          <TextArea className="sm:col-span-2" label="Character or product action" rows={2} maxLength={400} {...t('action')} />
          <TextArea className="sm:col-span-2" label="Voiceover" rows={2} maxLength={600} {...t('voiceover')} />
          <TextField label="Sound effects" maxLength={200} {...t('sfx')} />
          <TextField label="Transition" maxLength={120} {...t('transition')} />
        </>
      )}
    </div>
  );
}
