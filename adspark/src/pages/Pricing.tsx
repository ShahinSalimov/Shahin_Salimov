import { Link } from 'react-router-dom';
import { Check, Info } from 'lucide-react';
import { Logo } from '../components/Layout';
import { ButtonLink, cx } from '../components/ui';

const PLANS = [
  {
    name: 'Starter',
    price: 5,
    blurb: 'For trying ideas on a single product.',
    features: ['Basic campaign generation', '3 concepts per campaign', '15-second scripts', 'Social captions', 'TXT export'],
  },
  {
    name: 'Pro',
    price: 15,
    blurb: 'For creators and small businesses running regular ads.',
    featured: true,
    features: ['5 concepts per campaign', 'All video durations (15–60s)', 'Complete storyboard', 'Voiceover scripts', 'PDF and JSON export', 'Brand Kit'],
  },
  {
    name: 'Agency',
    price: 29,
    blurb: 'For teams managing several brands.',
    features: ['Everything in Pro', 'Multiple brand profiles', 'Campaign duplication', 'Advanced export', 'Campaign organization'],
  },
];

export default function Pricing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 md:px-8">
        <Link to="/" aria-label="AdSpark home">
          <Logo />
        </Link>
        <ButtonLink to="/app" size="sm" variant="secondary">
          Open app
        </ButtonLink>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Pricing</p>
          <h1 className="mt-3 text-4xl font-extrabold md:text-5xl">Simple monthly editions</h1>
          <p className="mt-4 text-muted">Proposed packages for the hosted version of AdSpark.</p>
        </div>

        <div role="note" className="mx-auto mt-8 flex max-w-3xl gap-3 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm text-ink/90">
          <Info className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
          <p>
            These editions are proposals and are not on sale yet. There is no billing or checkout in this version, and nothing is charged.
            Until plans and entitlements launch, every feature listed here is unlocked for everyone in this local build.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <section
              key={p.name}
              aria-labelledby={`plan-${p.name}`}
              className={cx('card relative flex flex-col p-7', p.featured && 'border-primary/60 shadow-[0_30px_80px_-30px_rgba(128,101,246,0.6)]')}
            >
              {p.featured ? <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">Most complete for solo work</span> : null}
              <h2 id={`plan-${p.name}`} className="text-lg font-semibold">
                {p.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold">${p.price}</span>
                <span className="text-sm text-muted">/ month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <ButtonLink to="/app/new" variant={p.featured ? 'primary' : 'secondary'} className="mt-8 w-full">
                Use free while in preview
              </ButtonLink>
            </section>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted">Optional AI generation requires your own AI provider account and is billed by that provider, not by AdSpark.</p>
      </main>
    </div>
  );
}
