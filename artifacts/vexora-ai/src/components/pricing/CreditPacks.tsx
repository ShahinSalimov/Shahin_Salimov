import { Coins, Gift } from 'lucide-react';
import { CREDIT_PACKS } from '@/data/pricing';
import { percentOff } from '@/lib/format';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/AppStore';

export function CreditPacks() {
  const { openCheckout } = useApp();
  const { t, fmt } = useI18n();
  const usd = fmt.usd;
  return (
    <section className="mt-20">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{t('pricing.packsTitle')}</h2>
      <p className="mt-1 text-muted">{t('pricing.packsSubtitle')}</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => (
          <button key={p.id} onClick={() => openCheckout({ type: 'pack', packId: p.id })}
            className="group flex items-center gap-4 rounded-3xl bg-ink-850 p-5 text-left ring-1 ring-ink-700 transition hover:ring-volt-500 cursor-pointer">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-volt-500/15 text-volt-400 transition group-hover:rotate-12"><Coins size={26} /></span>
            <span className="flex-1">
              <span className="block font-display text-xl font-bold">{t('pricing.packCredits', { n: fmt.num(p.credits) })}</span>
              {p.bonus && <span className="flex items-center gap-1 text-xs font-semibold text-blaze-300"><Gift size={12} /> {t('pricing.bonus', { n: p.bonus })}</span>}
            </span>
            <span className="text-right">
              <span className="block font-display text-xl font-bold">{usd(p.price)}</span>
              <span className="text-xs"><s className="text-ink-400">{usd(p.listPrice)}</s> <span className="font-semibold text-volt-300">−{percentOff(p.listPrice, p.price)}%</span></span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
