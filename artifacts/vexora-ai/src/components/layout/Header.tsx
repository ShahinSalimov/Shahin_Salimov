import { Coins, Compass, Sparkles, Tag, User } from 'lucide-react';
import { useApp } from '@/store/AppStore';
import { useI18n, type TKey } from '@/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';
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
  const { route, navigate, me, openAuth } = useApp();
  const { t, fmt } = useI18n();
  return (
    <>
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo onClick={() => navigate('explore')} />
          <nav className="hidden md:flex items-center gap-1 rounded-full bg-surface p-1 ring-1 ring-line" aria-label={t('nav.main')}>
            {NAV.map(({ route: r, label, icon: Icon }) => (
              <button
                key={r}
                onClick={() => navigate(r)}
                aria-current={route === r ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors cursor-pointer',
                  route === r ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon size={15} /> {t(label)}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {me && (
              <button
                onClick={() => navigate('pricing')}
                className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 font-mono text-sm text-primary-strong ring-1 ring-primary/25 hover:ring-primary/50 cursor-pointer"
                aria-label={t('nav.creditsLeft', { n: me.balance })}
                title={`${t('creditKind.paid')}: ${me.paidBalance} · ${t('creditKind.free')}: ${me.freeBalance}`}
              >
                <Coins size={15} /> {fmt.num(me.balance)}
              </button>
            )}
            {me ? <UserMenu /> : me === null && (
              <Button size="sm" variant="outline" onClick={() => openAuth('signin')}>{t('account.signIn')}</Button>
            )}
          </div>
        </div>
      </header>
      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-line bg-bg/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]" aria-label={t('nav.mobile')}>
        {NAV.map(({ route: r, label, icon: Icon }) => (
          <button key={r} onClick={() => navigate(r)} aria-current={route === r ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold cursor-pointer', route === r ? 'text-primary' : 'text-fg-muted')}>
            <Icon size={19} /> {t(label)}
          </button>
        ))}
      </nav>
    </>
  );
}
