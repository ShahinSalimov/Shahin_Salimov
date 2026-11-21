import { ArrowRight, Sparkles } from 'lucide-react';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';

export function ExploreHero() {
  const { navigate } = useApp();
  const { t } = useI18n();
  return (
    <section className="relative grid items-center gap-10 py-10 md:grid-cols-[1.2fr_1fr] md:py-16">
      <div className="relative z-10">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-volt-500/10 px-3 py-1 text-xs font-semibold text-volt-300 ring-1 ring-volt-500/30">
          <Sparkles size={13} /> {t('hero.badge')}
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
          {t('hero.title1')}<br />
          <span className="text-gradient">{t('hero.title2')}</span>
        </h1>
        <p className="mt-5 max-w-lg text-base text-muted sm:text-lg">
          {t('hero.subtitle')}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => navigate('create')}>{t('hero.start')} <ArrowRight size={18} /></Button>
          <Button size="lg" variant="outline" onClick={() => navigate('pricing')}>{t('hero.plans')}</Button>
        </div>
      </div>
      <div className="relative hidden h-[420px] md:block" aria-hidden>
        <div className="absolute right-8 top-0 w-56 rotate-6 overflow-hidden rounded-3xl ring-2 ring-volt-500/60 animate-float shadow-2xl">
          <GenerativeArt seed={77421} aspect="3:4" animate />
        </div>
        <div className="absolute left-4 top-20 w-52 -rotate-6 overflow-hidden rounded-3xl ring-2 ring-blaze-500/60 animate-float shadow-2xl" style={{ animationDelay: '-2s' }}>
          <GenerativeArt seed={9182} aspect="9:16" animate />
        </div>
        <div className="absolute bottom-0 right-24 w-60 rotate-[-2deg] overflow-hidden rounded-3xl ring-1 ring-ink-600 animate-float shadow-2xl" style={{ animationDelay: '-4s' }}>
          <GenerativeArt seed={33310} aspect="16:9" animate />
        </div>
      </div>
    </section>
  );
}
