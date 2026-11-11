import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, FileDown, Lightbulb, Lock, Mic, Palette, Share2, Sparkles, Cpu, ScrollText } from 'lucide-react';
import { Logo } from '../components/Layout';
import { ButtonLink } from '../components/ui';
import { StoryboardFrame } from '../components/StoryboardFrame';
import type { ShotType } from '../lib/schemas';

const STEPS = [
  { n: '01', title: 'Describe your product', text: 'Name, benefits, audience, the problem you solve and the action you want people to take.' },
  { n: '02', title: 'Pick a direction', text: 'Review five different advertising concepts, each with its own angle, hook and emotional trigger.' },
  { n: '03', title: 'Get the full campaign', text: 'Timed video script, storyboard, voiceover and platform-specific captions in one click.' },
  { n: '04', title: 'Edit and export', text: 'Refine every scene, then export a PDF report, a TXT script or a JSON project file.' },
];

const FEATURES = [
  { icon: Lightbulb, title: 'Five distinct concepts', text: 'Problem–solution, before & after, behind the scenes, myth-busting and more. Never five copies of one idea.' },
  { icon: ScrollText, title: 'Production-ready scripts', text: '15, 30, 45 or 60 seconds, split into scenes whose durations always add up exactly.' },
  { icon: Clapperboard, title: 'Storyboard Studio', text: 'Add, duplicate, reorder and edit scenes, then preview the cut with timed playback.' },
  { icon: Mic, title: 'Voiceover scripts', text: 'Time-coded narration with reading-time estimates so you know it fits before you record.' },
  { icon: Share2, title: 'Platform-native copy', text: 'Instagram, TikTok, YouTube Shorts and Facebook text written to each platform’s conventions.' },
  { icon: Palette, title: 'Brand Kit', text: 'Save your brand voice, audience and colors once and reuse them in every new campaign.' },
];

const PREVIEW: { shot: ShotType; label: string; t: string }[] = [
  { shot: 'close', label: 'Hook', t: '0:00' },
  { shot: 'product', label: 'Reveal', t: '0:03' },
  { shot: 'medium', label: 'Benefit', t: '0:08' },
  { shot: 'text', label: 'CTA', t: '0:12' },
];

export default function Landing() {
  return (
    <div className="relative overflow-x-hidden">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[720px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" aria-hidden />

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-5 md:px-8">
        <Link to="/" aria-label="AdSpark home">
          <Logo />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-2 sm:gap-5">
          <button type="button" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })} className="hidden text-sm text-muted hover:text-ink sm:inline">
            How it works
          </button>
          <Link to="/pricing" className="text-sm text-muted hover:text-ink">Pricing</Link>
          <ButtonLink to="/app" size="sm" variant="secondary">Open app</ButtonLink>
        </nav>
      </header>

      <main id="content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-7xl px-4 pb-20 pt-12 md:px-8 md:pt-20">
          <div className="animate-fade-up mx-auto max-w-3xl text-center">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-medium text-[#c4b8ff]">
              <Sparkles className="size-3.5" aria-hidden /> Campaign planning for small teams and creators
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl md:text-6xl">
              Turn Any Product Into a <span className="text-gradient">Powerful Ad Campaign.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
              AdSpark turns basic product information into advertising concepts, timed video scripts, storyboards, voiceover and
              social captions — ready to hand to your camera, editor or client.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink to="/app/new" size="lg" icon={<Sparkles className="size-4" />}>Create Campaign</ButtonLink>
              <ButtonLink to="/app" size="lg" variant="outline">
                Go to dashboard <ArrowRight className="size-4" />
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-muted">No account. Your projects stay in this browser.</p>
          </div>

          <div className="animate-fade-up relative mx-auto mt-16 max-w-5xl [animation-delay:120ms]">
            <div className="card overflow-hidden p-2 shadow-[0_40px_120px_-40px_rgba(128,101,246,0.55)]">
              <div className="rounded-xl border border-line/70 bg-bg/70 p-4 md:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-secondary">Storyboard · 15s · Instagram Reels</p>
                    <p className="mt-1 font-display text-lg font-semibold">Example layout: “The Everyday Fix”</p>
                  </div>
                  <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">Illustrative sketches</span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {PREVIEW.map((p, i) => (
                    <div key={p.label} className="overflow-hidden rounded-lg border border-line/70 bg-surface">
                      <StoryboardFrame shot={p.shot} style="Neon" number={i + 1} className="block w-full" />
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-muted">{p.t}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-7xl scroll-mt-8 px-4 py-20 md:px-8">
          <h2 className="text-center text-3xl font-bold md:text-4xl">From brief to campaign in four steps</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-6 transition-colors hover:border-primary/40">
                <span className="font-display text-sm font-bold text-gradient">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Everything in one workspace</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">Built for the way ads actually get made</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card group p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-secondary/15 text-[#c4b8ff]">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-6 lg:col-span-2">
              <div className="flex items-center gap-3">
                <Cpu className="size-5 text-secondary" aria-hidden />
                <h2 className="text-xl font-bold">Honest about how your content is made</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Out of the box, AdSpark runs in Demo Generation mode, a local template engine: proven advertising structures filled with your product details. It
                works offline and costs nothing per campaign. It is not AI, and the app always labels it that way. If you run the optional
                AdSpark server with your own AI provider key, you can switch to AI generation — only after you explicitly allow it.
              </p>
            </div>
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <Lock className="size-5 text-success" aria-hidden />
                <h2 className="text-xl font-bold">Local-first</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">Campaigns and brand kits are stored in your browser. No accounts, no tracking, no analytics. Back up or delete everything at any time.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-24 pt-8 md:px-8">
          <div className="card relative overflow-hidden px-6 py-14 text-center">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/15" aria-hidden />
            <FileDown className="relative mx-auto size-8 text-secondary" aria-hidden />
            <h2 className="relative mt-4 text-3xl font-bold">Your next campaign is a brief away</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted">Start with one product. Leave with concepts, a script, a storyboard and captions you can export.</p>
            <div className="relative mt-8">
              <ButtonLink to="/app/new" size="lg" icon={<Sparkles className="size-4" />}>Create Campaign</ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:flex-row md:px-8">
          <Logo className="text-base" />
          <div className="flex gap-6">
            <Link to="/pricing" className="hover:text-ink">Pricing</Link>
            <Link to="/app/settings#privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/app" className="hover:text-ink">Dashboard</Link>
          </div>
          <p>© {new Date().getFullYear()} AdSpark</p>
        </div>
      </footer>
    </div>
  );
}
