import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp, useCampaign } from '../store/app';
import { aspectRatio } from '../lib/engine/generate';
import { formatTime } from '../lib/engine/util';
import { generatorLabel, selectedConcept } from '../lib/export/txt';
import { StoryboardFrame } from '../components/StoryboardFrame';
import { CampaignMissing } from '../components/campaign';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid gap-1 py-1.5 text-sm sm:grid-cols-[150px_1fr] sm:gap-3 print:grid-cols-[150px_1fr] print:gap-3">
      <dt className="font-semibold text-neutral-500">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words">{v}</dd>
    </div>
  );
}

export default function PrintView() {
  const { id } = useParams();
  const c = useCampaign(id);
  const brands = useApp((s) => s.brands);
  useEffect(() => {
    const prev = document.title;
    if (c) document.title = `${c.name} — AdSofff report`;
    return () => {
      document.title = prev;
    };
  }, [c]);
  if (!c)
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <CampaignMissing />
      </main>
    );
  const brand = brands.find((b) => b.id === c.input.brandId);
  const concept = selectedConcept(c);
  let t = 0;

  return (
    <div className="min-h-dvh bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[820px] flex-wrap items-center justify-between gap-3 px-4">
        <Link to={`/app/campaigns/${c.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-black">
          <ArrowLeft className="size-4" /> Back to campaign
        </Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-[#6c4ff0] px-4 py-2 text-sm font-medium text-white hover:brightness-110">
          <Printer className="size-4" /> Print or save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[820px] bg-white px-5 py-8 text-neutral-900 sm:px-10 sm:py-10 shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="border-b-4 border-[#8065F6] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6c4ff0]">AdSofff campaign report</p>
          <h1 className="mt-2 break-words text-2xl font-extrabold sm:text-3xl">{c.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {brand?.name ?? c.input.productName} · {c.input.platform} ({aspectRatio(c.input.platform)}) · {c.input.duration}s · {c.input.language}
          </p>
        </header>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-2 text-lg font-bold">Overview</h2>
          <dl>
            <Row k="Brand" v={brand?.name ?? c.input.productName} />
            <Row k="Product" v={`${c.input.productName} · ${c.input.category}${c.input.price ? ` · ${c.input.price}` : ''}`} />
            <Row k="Style / tone" v={`${c.input.style} · ${c.input.tone}`} />
            <Row k="Goal" v={c.input.goal} />
            <Row k="Audience" v={c.input.audience} />
            <Row k="Generated with" v={generatorLabel(c)} />
          </dl>
        </section>

        {concept ? (
          <section className="mt-6 break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Concept: {concept.title}</h2>
            <dl>
              <Row k="Main idea" v={concept.mainIdea} />
              <Row k="Angle" v={concept.angle} />
              <Row k="Emotional trigger" v={concept.emotionalTrigger} />
              <Row k="Hook" v={concept.hook} />
              <Row k="Message" v={concept.message} />
              <Row k="Call to action" v={concept.cta} />
              <Row k="Visual direction" v={concept.visualDirection} />
            </dl>
          </section>
        ) : null}

        {c.scenes.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold">Script and storyboard</h2>
            <div className="grid gap-4">
              {c.scenes.map((s, i) => {
                const start = t;
                t += s.duration;
                return (
                  <div key={s.id} className="grid break-inside-avoid gap-4 rounded-lg border border-neutral-200 p-3 sm:grid-cols-[200px_1fr] print:grid-cols-[200px_1fr]">
                    <div>
                      <StoryboardFrame shot={s.shot} style={c.storyboardStyle} number={i + 1} text={s.onScreenText} className="block w-full rounded border border-neutral-200" />
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatTime(start)}–{formatTime(t)} · {s.duration}s · sketch
                      </p>
                    </div>
                    <dl className="text-sm">
                      <Row k="Visual" v={s.visual} />
                      <Row k="Camera" v={s.camera} />
                      <Row k="Action" v={s.action} />
                      <Row k="On-screen text" v={s.onScreenText || '—'} />
                      <Row k="Voiceover" v={s.voiceover || '—'} />
                      <Row k="Sound" v={s.sfx || '—'} />
                      <Row k="Transition" v={s.transition} />
                    </dl>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {c.voiceover ? (
          <section className="mt-8 break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Voiceover</h2>
            <p className="mb-2 text-xs text-neutral-500">
              {c.voiceover.language} · {c.voiceover.tone}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-7">{c.voiceover.text}</p>
          </section>
        ) : null}

        {c.social ? (
          <section className="mt-8">
            <h2 className="mb-2 text-lg font-bold">Social media content</h2>
            <dl>
              <Row k="Short title" v={c.social.shortTitle} />
              <Row k="Instagram" v={c.social.instagram} />
              <Row k="TikTok" v={c.social.tiktok} />
              <Row k="YouTube Shorts" v={c.social.youtubeShorts} />
              <Row k="Facebook" v={c.social.facebook} />
              <Row k="Hashtags" v={c.social.hashtags.join(' ')} />
              <Row k="CTA suggestions" v={c.social.ctas.join('\n')} />
            </dl>
          </section>
        ) : null}
        <footer className="mt-10 border-t border-neutral-200 pt-3 text-xs text-neutral-500">Created with AdSofff · Storyboard frames are illustrative sketches.</footer>
      </article>
    </div>
  );
}
