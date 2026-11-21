import { Coins, Compass, Sparkles, Tag, User } from 'lucide-react';
import { useApp } from '@/store/AppStore';
import { useI18n, type TKey } from '@/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { Route } from '@/types';

const NAV: { route: Route; label: TKey; icon: typeof Compass }[] = [
  { route: 'explore', label: 'nav.explore', icon: Compass },
  { route: 'create', label: 'nav.create', icon: Sparkles },
  { route: 'pricing', label: 'nav.pricing', icon: Tag },
  { route: 'profile', label: 'nav.profile', icon: User },
];

export function Header() {
  const { route, navigate, credits } = useApp();
  const { t } = useI18n();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-900/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo onClick={() => navigate('explore')} />
          <nav className="hidden md:flex items-center gap-1 rounded-full bg-ink-800/70 p-1 ring-1 ring-ink-700" aria-label={t('nav.main')}>
            {NAV.map(({ route: r, label, icon: Icon }) => (
              <button
                key={r}
                onClick={() => navigate(r)}
                aria-current={route === r ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors cursor-pointer',
                  route === r ? 'bg-blaze-500 text-cream' : 'text-muted hover:text-cream',
                )}
              >
                <Icon size={15} /> {t(label)}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              onClick={() => navigate('pricing')}
              className="flex items-center gap-1.5 rounded-full bg-volt-500/10 px-3 py-1.5 font-mono text-sm text-volt-300 ring-1 ring-volt-500/30 hover:bg-volt-500/20 cursor-pointer"
              aria-label={t('nav.creditsLeft', { n: credits })}
            >
              <Coins size={15} /> {credits}
            </button>
            <div className="hidden sm:block">
              <Button size="sm" onClick={() => navigate('create')}><Sparkles size={15} /> {t('nav.create')}</Button>
            </div>
          </div>
        </div>
      </header>
      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-ink-700 bg-ink-900/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]" aria-label={t('nav.mobile')}>
        {NAV.map(({ route: r, label, icon: Icon }) => (
          <button key={r} onClick={() => navigate(r)} aria-current={route === r ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold cursor-pointer', route === r ? 'text-volt-400' : 'text-muted')}>
            <Icon size={19} /> {t(label)}
          </button>
        ))}
      </nav>
    </>
  );
}
