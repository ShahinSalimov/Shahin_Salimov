import { Check, Flame } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { percentOff, usd } from '@/lib/format';
import type { BillingCycle, Plan } from '@/types';

interface Props { plan: Plan; cycle: BillingCycle; current: boolean; onSelect: (p: Plan) => void; index: number }

export function PlanCard({ plan, cycle, current, onSelect, index }: Props) {
  const price = cycle === 'yearly' ? plan.yearlyPerMonth : plan.monthly;
  const off = percentOff(plan.listMonthly, price);
  const free = plan.listMonthly === 0;
  return (
    <article
      className={cn(
        'relative flex flex-col rounded-[1.75rem] p-6 ring-1 transition-transform duration-300 hover:-translate-y-1 animate-rise',
        plan.highlight ? 'bg-gradient-to-b from-blaze-600/25 to-ink-850 ring-blaze-500 lg:-translate-y-3 lg:hover:-translate-y-4' : 'bg-ink-850 ring-ink-700',
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-6 flex items-center gap-1 rounded-full bg-volt-500 px-3 py-1 text-xs font-bold text-ink-900">
          <Flame size={13} /> Ən populyar
        </span>
      )}
      <h3 className="font-display text-xl font-bold">{plan.name}</h3>
      <p className="text-sm text-muted">{plan.tagline}</p>
      <div className="mt-6 flex items-end gap-2">
        <span className="font-display text-5xl font-extrabold tracking-tight">{usd(price)}</span>
        {!free && <span className="mb-1.5 text-sm text-muted">/ay</span>}
        {off > 0 && (
          <span className="mb-2 ml-auto rotate-6 rounded-lg bg-blaze-500 px-2 py-1 font-display text-sm font-extrabold text-cream shadow-lg">−{off}%</span>
        )}
      </div>
      {!free && (
        <p className="mt-1 text-sm">
          <s className="text-ink-400">{usd(plan.listMonthly)}</s>
          <span className="ml-2 font-semibold text-volt-300">
            {cycle === 'yearly' ? `İllik ${usd(price * 12)} — ${usd((plan.listMonthly - price) * 12)} qənaət` : `Ayda ${usd(plan.listMonthly - price)} qənaət`}
          </span>
        </p>
      )}
      <p className="mt-4 rounded-xl bg-ink-900/70 px-3 py-2 font-mono text-sm text-volt-300 ring-1 ring-ink-700">{plan.creditsPerMonth.toLocaleString('az')} kredit / ay</p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-blaze-400" /> {f}</li>
        ))}
      </ul>
      <Button className="mt-6 w-full" size="lg" variant={plan.highlight ? 'volt' : current ? 'outline' : 'primary'} disabled={current} onClick={() => onSelect(plan)}>
        {current ? 'Cari plan' : free ? 'Pulsuz başla' : `${plan.name} seç`}
      </Button>
    </article>
  );
}
