import { Coins, Gift } from 'lucide-react';
import { toMinor } from '@workspace/vexora-core';
import { CREDIT_PACKS, percentOff } from '@/data/pricing';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

export function CreditPacks({ paymentsEnabled }: { paymentsEnabled: boolean }) {
  const { openCheckout, currency } = useApp();
  const { t, fmt } = useI18n();
  return (
    <section className="mt-20">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{t('pricing.packsTitle')}</h2>
      <p className="mt-1 text-fg-muted">{t('pricing.packsSubtitle')}</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => {
          const price = p.prices[currency];
          return (
            <button key={p.id} disabled={!paymentsEnabled} onClick={() => openCheckout({ type: 'pack', packId: p.id })}
              className={cn('group flex min-w-0 items-center gap-4 rounded-3xl bg-surface p-5 text-start shadow-sm ring-1 ring-line transition',
                paymentsEnabled ? 'hover:ring-primary cursor-pointer' : 'opacity-60 cursor-not-allowed')}>
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-fg transition group-hover:rotate-12"><Coins size={26} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-bold">{t('pricing.packCredits', { n: fmt.num(p.credits) })}</span>
                {p.bonus && <span className="flex items-center gap-1 text-xs font-semibold text-primary-strong"><Gift size={12} /> {t('pricing.bonus', { n: p.bonus })}</span>}
              </span>
              <span className="text-end">
                <span className="block font-display text-xl font-bold tabular-nums">{fmt.money(toMinor(price.price), currency)}</span>
                <span className="text-xs"><s className="text-fg-subtle">{fmt.money(toMinor(price.list), currency)}</s> <span className="font-semibold text-accent-fg">−{percentOff(price.list, price.price)}%</span></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
