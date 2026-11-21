import { Check, Flame } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { percentOff } from '@/lib/format';
import { useI18n } from '@/i18n';
import type { BillingCycle, Plan } from '@/types';

interface Props { plan: Plan; cycle: BillingCycle; current: boolean; onSelect: (p: Plan) => void; index: number }

export function PlanCard({ plan, cycle, current, onSelect, index }: Props) {
  const { t, fmt } = useI18n();
  const usd = fmt.usd;
  const price = cycle === 'yearly' ? plan.yearlyPerMonth : plan.monthly;
  const off = percentOff(plan.listMonthly, price);
  const free = plan.listMonthly === 0;
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col rounded-[1.75rem] p-6 ring-1 transition-transform duration-300 hover:-translate-y-1 animate-rise',
        plan.highlight ? 'bg-gradient-to-b from-blaze-600/25 to-ink-850 ring-blaze-500 lg:-translate-y-3 lg:hover:-translate-y-4' : 'bg-ink-850 ring-ink-700',
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-6 flex items-center gap-1 rounded-full bg-volt-500 px-3 py-1 text-xs font-bold text-ink-900">
          <Flame size={13} /> {t('pricing.popular')}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl font-bold">{plan.name}</h3>
        {off > 0 && (
          <span className="shrink-0 rotate-6 rounded-lg bg-blaze-500 px-2 py-1 font-display text-sm font-extrabold text-cream shadow-lg">−{off}%</span>
        )}
      </div>
      <p className="text-sm text-muted">{t(`plans.${plan.id}.tagline`)}</p>
      <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="font-display text-5xl font-extrabold tracking-tight">{usd(price)}</span>
        {!free && <span className="mb-1.5 text-sm text-muted">{t('pricing.perMonth')}</span>}

      </div>
      {!free && (
        <p className="mt-1 text-sm">
          <s className="text-ink-400">{usd(plan.listMonthly)}</s>
          <span className="ml-2 font-semibold text-volt-300">
            {cycle === 'yearly'
              ? t('pricing.saveYearly', { total: usd(price * 12), save: usd((plan.listMonthly - price) * 12) })
              : t('pricing.saveMonthly', { save: usd(plan.listMonthly - price) })}
          </span>
        </p>
      )}
      <p className="mt-4 rounded-xl bg-ink-900/70 px-3 py-2 font-mono text-sm text-volt-300 ring-1 ring-ink-700">{t('pricing.creditsPerMonth', { n: fmt.num(plan.creditsPerMonth) })}</p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f.key} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-blaze-400" /> {t(`features.${f.key}`, f.vars)}</li>
        ))}
      </ul>
      <Button className="mt-6 w-full" size="lg" variant={plan.highlight ? 'volt' : current ? 'outline' : 'primary'} disabled={current} onClick={() => onSelect(plan)}>
        {current ? t('pricing.current') : free ? t('pricing.startFree') : t('pricing.choose', { name: plan.name })}
      </Button>
    </article>
  );
}
