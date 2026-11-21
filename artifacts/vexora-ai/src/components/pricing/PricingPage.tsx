import { useEffect, useState } from 'react';
import { PLANS, assertCheaperThanReference } from '@/data/pricing';
import { Segmented } from '@/components/ui/Segmented';
import { PlanCard } from './PlanCard';
import { CreditPacks } from './CreditPacks';
import { useApp } from '@/store/AppStore';
import { percentOff } from '@/lib/format';
import type { BillingCycle, Plan } from '@/types';
import { useI18n } from '@/i18n';

export function PricingPage() {
  const { planId, openCheckout, setPlan } = useApp();
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const { t } = useI18n();
  useEffect(() => { if (import.meta.env.DEV) assertCheaperThanReference(); }, []);

  const maxYearlyOff = Math.max(...PLANS.filter((p) => p.listMonthly).map((p) => percentOff(p.listMonthly, p.yearlyPerMonth)));
  const select = (p: Plan) => (p.listMonthly === 0 ? setPlan('free', cycle) : openCheckout({ type: 'plan', planId: p.id, cycle }));

  return (
    <div className="py-10">
      <header className="mx-auto max-w-2xl text-center">
        <p className="inline-block -rotate-2 rounded-lg bg-blaze-500 px-3 py-1 font-display text-sm font-bold text-cream">{t('pricing.promo')}</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t('pricing.title1')} <span className="text-gradient">{t('pricing.title2')}</span>
        </h1>
        <p className="mt-3 text-muted">{t('pricing.subtitle')}</p>
        <div className="mt-8 flex flex-col items-center gap-2">
          <Segmented<BillingCycle> label={t('pricing.cycle')} value={cycle} onChange={setCycle}
            options={[{ value: 'monthly', label: t('pricing.monthly') }, { value: 'yearly', label: <>{t('pricing.yearly')} <span className="ml-1 rounded-full bg-blaze-500 px-1.5 text-[10px] text-cream">{t('pricing.upTo', { n: maxYearlyOff })}</span></> }]} />
        </div>
      </header>
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p, i) => <PlanCard key={p.id} plan={p} cycle={cycle} current={p.id === planId} onSelect={select} index={i} />)}
      </div>
      <CreditPacks />
    </div>
  );
}
