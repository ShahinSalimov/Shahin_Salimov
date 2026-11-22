import { Check, Flame } from 'lucide-react';
import { toMinor, type Currency } from '@workspace/vexora-core';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { percentOff } from '@/data/pricing';
import { useI18n, type TKey } from '@/i18n';
import type { BillingCycle, Plan } from '@/types';

interface Props {
  plan: Plan; cycle: BillingCycle; currency: Currency; current: boolean; paymentsEnabled: boolean;
  onSelect: (p: Plan) => void; index: number;
}

export function PlanCard({ plan, cycle, currency, current, paymentsEnabled, onSelect, index }: Props) {
  const { t, fmt } = useI18n();
  const p = plan.prices[currency];
  const price = cycle === 'yearly' ? p.yearlyPerMonth : p.monthly;
  const money = (major: number) => fmt.money(toMinor(major), currency);
  const off = percentOff(p.list, price);
  const free = p.list === 0;
  const soon = !free && !paymentsEnabled;
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col rounded-[1.75rem] p-6 ring-1 transition-transform duration-300 hover:-translate-y-1 animate-rise',
        plan.highlight ? 'bg-gradient-to-b from-primary-soft to-surface ring-primary shadow-md lg:-translate-y-3 lg:hover:-translate-y-4' : 'bg-surface ring-line shadow-sm',
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {plan.highlight && (
        <span className="absolute -top-3 start-6 flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">
          <Flame size={13} /> {t('pricing.popular')}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl font-bold">{plan.name}</h3>
        {off > 0 && <span className="shrink-0 rounded-lg bg-accent-soft px-2 py-1 font-display text-sm font-extrabold text-accent-fg ring-1 ring-accent/40">−{off}%</span>}
      </div>
      <p className="text-sm text-fg-muted">{t(`plans.${plan.id}.tagline` as TKey)}</p>
      <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="font-display text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">{money(price)}</span>
        {!free && <span className="mb-1.5 text-sm text-fg-muted">{t('pricing.perMonth')}</span>}
      </div>
      {!free && (
        <p className="mt-1 text-sm">
          <s className="text-fg-subtle">{money(p.list)}</s>
          <span className="ms-2 font-semibold text-primary-strong">
            {cycle === 'yearly'
              ? t('pricing.saveYearly', { total: fmt.money(toMinor(price) * 12, currency), save: fmt.money((toMinor(p.list) - toMinor(price)) * 12, currency) })
              : t('pricing.saveMonthly', { save: money(p.list - price) })}
          </span>
        </p>
      )}
      <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm text-primary-strong">{t('pricing.creditsPerMonth', { n: fmt.num(plan.creditsPerMonth) })}</p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f.key} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-primary" /> {t(`features.${f.key}` as TKey, f.vars)}</li>
        ))}
      </ul>
      <Button className="mt-6 w-full" size="lg" variant={current || soon ? 'outline' : plan.highlight ? 'accent' : 'primary'} disabled={current || soon} onClick={() => onSelect(plan)}>
        {current ? t('pricing.current') : free ? t('pricing.startFree') : soon ? t('billing.soon') : t('pricing.choose', { name: plan.name })}
      </Button>
    </article>
  );
}
