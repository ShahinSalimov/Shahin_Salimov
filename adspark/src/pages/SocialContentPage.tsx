import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Hash, Plus, RefreshCw, Share2, X, Info } from 'lucide-react';
import { useApp, useCampaign } from '../store/app';
import type { SocialContent } from '../lib/schemas';
import { selectedConcept } from '../lib/export/txt';
import { newSeed } from '../lib/engine/util';
import { Button, ButtonLink, Card, CopyButton, EmptyState, PageHeader } from '../components/ui';
import { CampaignMissing, CampaignNav, ExportMenu, GenerationError, useGeneration } from '../components/campaign';
import { CampaignTitle } from './CampaignEditor';

const BLOCKS: { key: 'instagram' | 'tiktok' | 'youtubeShorts' | 'facebook'; label: string; limit: number; note: string }[] = [
  { key: 'instagram', label: 'Instagram caption', limit: 2200, note: 'Only the first ~125 characters show before “more”. Hashtags go at the end.' },
  { key: 'tiktok', label: 'TikTok caption', limit: 2200, note: 'Short and conversational. A few relevant hashtags work best.' },
  { key: 'youtubeShorts', label: 'YouTube Shorts description', limit: 5000, note: 'First line works as the title. #Shorts helps classification.' },
  { key: 'facebook', label: 'Facebook promotional text', limit: 5000, note: 'Lead with the benefit. Few or no hashtags.' },
];

export default function SocialContentPage() {
  const { id } = useParams();
  const c = useCampaign(id);
  const update = useApp((s) => s.updateCampaign);
  const toast = useApp((s) => s.toast);
  const gen = useGeneration();
  const [tag, setTag] = useState('');
  if (!c) return <CampaignMissing />;
  const concept = selectedConcept(c);

  if (!c.social || !concept) {
    return (
      <>
        <PageHeader eyebrow="Social media content" title={<CampaignTitle c={c} />} />
        <CampaignNav c={c} />
        <EmptyState icon={<Share2 className="size-6" />} title="No social content yet" description="Create the full campaign from a concept to get platform-specific captions." action={<ButtonLink to={`/app/campaigns/${c.id}/concepts`}>Go to concepts</ButtonLink>} />
      </>
    );
  }
  const social = c.social;
  const set = (patch: Partial<SocialContent>) => update(c.id, (x) => ({ ...x, social: { ...social, ...patch } }));

  const addTag = () => {
    const clean = tag.replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 59);
    if (!clean) return;
    const value = `#${clean}`;
    if (!social.hashtags.includes(value) && social.hashtags.length < 30) set({ hashtags: [...social.hashtags, value] });
    setTag('');
  };

  return (
    <>
      <PageHeader
        eyebrow="Social media content"
        title={<CampaignTitle c={c} />}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="size-4" />}
              loading={gen.busy === 'social'}
              onClick={() =>
                gen.run('social', async (p) => {
                  const next = await p.social(c.input, concept, newSeed());
                  update(c.id, (x) => ({ ...x, social: next }));
                  toast('success', 'Social content regenerated.');
                })
              }
            >
              Regenerate
            </Button>
            <ExportMenu c={c} />
          </>
        }
      />
      <CampaignNav c={c} />
      <GenerationError error={gen.error} onLocal={gen.retryLocal} onDismiss={gen.clearError} />

      <div className="grid gap-6 lg:grid-cols-2">
        {BLOCKS.map((b) => {
          const value = social[b.key];
          return (
            <Card key={b.key} className="flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <label htmlFor={`soc-${b.key}`} className="font-semibold">
                  {b.label}
                </label>
                <CopyButton text={value} />
              </div>
              <textarea id={`soc-${b.key}`} className="input min-h-56 flex-1 resize-y leading-relaxed" value={value} maxLength={b.limit} onChange={(e) => set({ [b.key]: e.target.value })} aria-describedby={`soc-${b.key}-n`} />
              <p id={`soc-${b.key}-n`} className="mt-2 flex justify-between gap-3 text-xs text-muted">
                <span>{b.note}</span>
                <span className="shrink-0 tabular-nums">
                  {value.length} / {b.limit}
                </span>
              </p>
            </Card>
          );
        })}

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Hash className="size-4 text-secondary" aria-hidden /> Hashtag suggestions
            </h2>
            <CopyButton text={social.hashtags.join(' ')} label="Copy all" />
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Hashtags">
            {social.hashtags.map((h) => (
              <li key={h} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1 text-sm text-[#c4b8ff]">
                {h}
                <button type="button" aria-label={`Remove ${h}`} className="rounded-full p-0.5 hover:bg-white/10" onClick={() => set({ hashtags: social.hashtags.filter((x) => x !== h) })}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTag();
            }}
          >
            <label htmlFor="new-tag" className="sr-only">
              New hashtag
            </label>
            <input id="new-tag" className="input" placeholder="Add a hashtag" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={60} />
            <Button type="submit" variant="secondary" icon={<Plus className="size-4" />}>
              Add
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <label htmlFor="short-title" className="font-semibold">
              Short title
            </label>
            <CopyButton text={social.shortTitle} />
          </div>
          <input id="short-title" className="input" value={social.shortTitle} maxLength={100} onChange={(e) => set({ shortTitle: e.target.value })} />
          <h2 className="mb-3 mt-6 font-semibold">CTA suggestions</h2>
          <ul className="grid gap-2">
            {social.ctas.map((cta, i) => (
              <li key={i} className="flex items-center gap-2">
                <label htmlFor={`cta-${i}`} className="sr-only">
                  CTA suggestion {i + 1}
                </label>
                <input
                  id={`cta-${i}`}
                  className="input"
                  value={cta}
                  maxLength={120}
                  onChange={(e) => set({ ctas: social.ctas.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <CopyButton text={cta} label="Copy" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Info className="size-3.5" aria-hidden /> Suggestions follow common platform conventions. Reach and engagement depend on many factors and are never guaranteed.
      </p>
    </>
  );
}
