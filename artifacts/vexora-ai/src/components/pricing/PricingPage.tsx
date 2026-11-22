import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { PLANS, assertCheaperThanReference, percentOff } from '@/data/pricing';
import { Segmented } from '@/components/ui/Segmented';
import { PlanCard } from './PlanCard';
import { CreditPacks } from './CreditPacks';
import { CurrencySelect } from './CurrencySelect';
import { EarnCreditsCard } from '@/components/ads/EarnCreditsCard';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';
import type { BillingCycle, Plan } from '@/types';

export function PricingPage() {
  const { me, openCheckout, openAuth, navigate, currency, config } = useApp();
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const { t } = useI18n();
  useEffect(() => { if (import.meta.env.DEV) assertCheaperThanReference(); }, []);
  const paymentsEnabled = config?.paymentsEnabled ?? false;

  const maxYearlyOff = Math.max(...PLANS.filter((p) => p.prices[currency].list).map((p) => percentOff(p.prices[currency].list, p.prices[currency].yearlyPerMonth)));
  const select = (p: Plan) => {
    if (p.id === 'free') return me ? navigate('create') : openAuth('signup');
    openCheckout({ type: 'plan', planId: p.id, cycle });
  };

  return (
    <div className="py-10">
      <header className="mx-auto max-w-2xl text-center">
        <p className="inline-block -rotate-2 rounded-lg bg-accent-soft px-3 py-1 font-display text-sm font-bold text-accent-fg ring-1 ring-accent/40">{t('pricing.promo')}</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl text-balance">
          {t('pricing.title1')} <span className="text-gradient">{t('pricing.title2')}</span>
        </h1>
        <p className="mt-3 text-fg-muted">{t('pricing.subtitle')}</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Segmented<BillingCycle> label={t('pricing.cycle')} value={cycle} onChange={setCycle}
            options={[{ value: 'monthly', label: t('pricing.monthly') }, { value: 'yearly', label: <>{t('pricing.yearly')} <span className="ms-1 rounded-full bg-accent-soft px-1.5 text-[10px] text-accent-fg">{t('pricing.upTo', { n: maxYearlyOff })}</span></> }]} />
          <CurrencySelect />
        </div>
        {config && !paymentsEnabled && (
          <p className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-strong">
            <Info size={16} className="shrink-0" /> {t('billing.soonText')}
          </p>
        )}
      </header>
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p, i) => (
          <PlanCard key={p.id} plan={p} cycle={cycle} currency={currency} paymentsEnabled={paymentsEnabled}
            current={!!me && p.id === me.planId} onSelect={select} index={i} />
        ))}
      </div>
      <CreditPacks paymentsEnabled={paymentsEnabled} />
      {me && <div className="mt-10"><EarnCreditsCard /></div>}
    </div>
  );
}
