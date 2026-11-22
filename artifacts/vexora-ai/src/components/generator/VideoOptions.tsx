import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { CAMERA_MOTIONS, planSegments, type AIModel, type CameraMotion, type Resolution } from '@workspace/vexora-core';
import { Segmented } from '@/components/ui/Segmented';
import { backend } from '@/services/backend';
import { errorKey } from '@/lib/errors';
import { useI18n, type TKey } from '@/i18n';
import type { GenerationParams } from '@/types';

const MAX_BYTES = 5 * 1024 * 1024;
const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-2 block text-xs font-semibold tracking-wide text-fg-muted">{children}</span>;

/** Duration, quality, sound, camera and reference image — shown only for models that support them. */
export function VideoOptions({ model, params, onChange }: { model: AIModel; params: GenerationParams; onChange: (p: Partial<GenerationParams>) => void }) {
  const { t } = useI18n();
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<TKey | null>(null);
  const min = model.minDuration ?? 2;
  const max = model.maxDuration ?? 5;
  const parts = model.maxSegment ? planSegments(params.durationSec, model.maxSegment).length : 1;

  const pick = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > MAX_BYTES) { setErr('errors.invalid_input'); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      const up = await backend.upload(dataUrl);
      setPreview(dataUrl);
      onChange({ referenceKey: up.key });
    } catch (e) { setErr(errorKey(e)); } finally { setUploading(false); if (file.current) file.current.value = ''; }
  };

  return (
    <>
      <div>
        <Label>{t('gen.duration', { n: params.durationSec })}</Label>
        <input type="range" min={min} max={max} value={Math.min(max, Math.max(min, params.durationSec))}
          onChange={(e) => onChange({ durationSec: Number(e.target.value) })} className="w-full accent-[var(--color-primary)]" aria-label={t('gen.durationAria')} />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-fg-subtle"><span>{min}s</span><span>{max}s</span></div>
        {parts > 1 && <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-fg">{t('video.partsNote', { max: model.maxSegment!, n: parts })}</p>}
      </div>

      {model.resolutions && (
        <div>
          <Label>{t('video.resolution')}</Label>
          <Segmented<Resolution> label={t('video.resolution')} value={params.resolution ?? model.resolutions[model.resolutions.length - 1]}
            onChange={(resolution) => onChange({ resolution })} options={model.resolutions.map((r) => ({ value: r, label: r }))} />
        </div>
      )}

      {model.audio && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-line cursor-pointer">
          <span className="text-sm font-medium">{t('video.audio')}</span>
          <input id="gen-audio" type="checkbox" checked={params.audio !== false} onChange={(e) => onChange({ audio: e.target.checked })} className="size-5 accent-[var(--color-primary)]" />
        </label>
      )}

      <label className="block">
        <Label>{t('video.camera')}</Label>
        <select id="gen-camera" value={params.camera ?? 'auto'} onChange={(e) => onChange({ camera: e.target.value as CameraMotion })}
          className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-line outline-none focus:ring-primary cursor-pointer">
          {CAMERA_MOTIONS.map((c) => <option key={c} value={c}>{t(`camera.${c}` as TKey)}</option>)}
        </select>
      </label>

      {model.reference && (
        <div>
          <Label>{t('video.reference')}</Label>
          {params.referenceKey && preview ? (
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2 ring-1 ring-line">
              <img src={preview} alt="" className="size-16 rounded-xl object-cover" />
              <button type="button" onClick={() => { onChange({ referenceKey: null }); setPreview(null); }} className="flex items-center gap-1 text-sm text-fg-muted hover:text-danger cursor-pointer">
                <X size={14} /> {t('video.referenceRemove')}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => file.current?.click()} disabled={uploading}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-5 text-sm font-medium text-fg-muted hover:border-primary hover:text-primary cursor-pointer">
              {uploading ? <><Loader2 size={16} className="animate-spin" /> {t('video.uploading')}</> : <><ImagePlus size={16} /> {t('video.referenceAdd')}</>}
            </button>
          )}
          <input ref={file} id="gen-reference" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <p className="mt-1.5 text-xs text-fg-subtle">{t('video.referenceHint')}</p>
          {err && <p role="alert" className="mt-1.5 text-xs text-danger">{t(err)}</p>}
        </div>
      )}
    </>
  );
}
