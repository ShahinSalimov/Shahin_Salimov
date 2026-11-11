import { useParams } from 'react-router-dom';
import { Clock, Info, RefreshCw, ListRestart, Mic } from 'lucide-react';
import { useApp, useCampaign } from '../store/app';
import { LANGUAGES, TONES, type Language, type Tone } from '../lib/schemas';
import { buildVoiceoverText, countSpokenWords, estimateReadingSeconds, regenerateVoiceoverText, TONE_DELIVERY } from '../lib/engine/generate';
import { newSeed } from '../lib/engine/util';
import { selectedConcept } from '../lib/export/txt';
import { Button, ButtonLink, Card, CopyButton, EmptyState, PageHeader, SelectField } from '../components/ui';
import { CampaignMissing, CampaignNav, ExportMenu } from '../components/campaign';
import { CampaignTitle } from './CampaignEditor';

export default function VoiceoverStudio() {
  const { id } = useParams();
  const c = useCampaign(id);
  const update = useApp((s) => s.updateCampaign);
  const toast = useApp((s) => s.toast);
  if (!c) return <CampaignMissing />;

  if (!c.scenes.length) {
    return (
      <>
        <PageHeader eyebrow="Voiceover Studio" title={<CampaignTitle c={c} />} />
        <CampaignNav c={c} />
        <EmptyState icon={<Mic className="size-6" />} title="No voiceover yet" description="Create the full campaign from a concept to get a time-coded voiceover script." action={<ButtonLink to={`/app/campaigns/${c.id}/concepts`}>Go to concepts</ButtonLink>} />
      </>
    );
  }

  const vo = c.voiceover ?? { text: buildVoiceoverText(c.scenes), language: c.input.language, tone: c.input.tone };
  const words = countSpokenWords(vo.text);
  const seconds = estimateReadingSeconds(vo.text, vo.language);
  const target = c.input.duration;
  const ratio = seconds / target;
  const fit = ratio <= 1 ? 'fits' : ratio <= 1.15 ? 'tight' : 'long';

  const setVo = (patch: Partial<typeof vo>) => update(c.id, (x) => ({ ...x, voiceover: { ...vo, ...patch } }));

  const regenerate = (language: Language = vo.language) => {
    const text = regenerateVoiceoverText({ ...c.input, language }, selectedConcept(c), c.scenes, newSeed());
    setVo({ text, language });
    toast('info', `Voiceover rewritten in ${language} with Demo Generation (local templates, not AI).`);
  };

  return (
    <>
      <PageHeader eyebrow="Voiceover Studio" title={<CampaignTitle c={c} />} actions={<ExportMenu c={c} />} />
      <CampaignNav c={c} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="vo-text" className="font-semibold">
              Voiceover script
            </label>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={vo.text} />
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={() => regenerate()}>
                Regenerate
              </Button>
              <Button size="sm" variant="ghost" icon={<ListRestart className="size-3.5" />} onClick={() => setVo({ text: buildVoiceoverText(c.scenes) })} title="Rebuild from the voiceover lines in the script">
                Sync from script
              </Button>
            </div>
          </div>
          <textarea
            id="vo-text"
            className="input min-h-[420px] resize-y font-mono text-[13px] leading-7"
            value={vo.text}
            maxLength={6000}
            onChange={(e) => setVo({ text: e.target.value })}
            aria-describedby="vo-help"
          />
          <p id="vo-help" className="mt-2 text-xs text-muted">
            Time markers in [brackets] follow the scene timings and are not counted as spoken words. Text in (parentheses) is treated as a direction.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-secondary" aria-hidden />
              <h2 className="font-semibold">Estimated reading time</h2>
            </div>
            <p className="mt-3 font-display text-3xl font-bold">
              ~{seconds}s <span className="text-base font-medium text-muted">/ {target}s video</span>
            </p>
            <p className="mt-1 text-sm text-muted">{words} spoken words at a comfortable pace for {vo.language}.</p>
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${fit === 'fits' ? 'bg-success/10 text-success' : fit === 'tight' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`} role="status">
              {fit === 'fits' ? 'Fits the video length with room to breathe.' : fit === 'tight' ? 'Tight. The voice artist will need a quick pace.' : 'Too long for the video. Shorten some lines.'}
            </p>
          </Card>

          <Card className="grid gap-4 p-5">
            <SelectField
              label="Language"
              options={LANGUAGES}
              value={vo.language}
              onChange={(e) => regenerate(e.target.value as Language)}
              hint="Changing the language rewrites the script with the local templates."
            />
            <SelectField label="Tone" options={TONES} value={vo.tone} onChange={(e) => setVo({ tone: e.target.value as Tone })} />
            <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Delivery notes</p>
              <p className="mt-1">{TONE_DELIVERY[vo.tone]}</p>
            </div>
          </Card>

          <p className="flex gap-2 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            AdSpark writes the script only. It does not generate audio. Record it with a voice artist or your own text-to-speech tool.
          </p>
        </div>
      </div>
    </>
  );
}
