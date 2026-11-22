import { useEffect, useState } from 'react';
import type { AdEconomics } from '@workspace/vexora-core';
import { backend } from '@/services/backend';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useAdminText } from './adminText';

const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(n !== 0 && Math.abs(n) < 1 ? 3 : 2)}`;

/** Owner view of whether the business makes money: 30-day P&L and per-model margins. */
export function EconomicsPanel({ reload }: { reload: number }) {
  const a = useAdminText();
  const { fmt } = useI18n();
  const [e, setE] = useState<AdEconomics | null>(null);
  useEffect(() => { backend.admin.economics().then(setE).catch(() => setE(null)); }, [reload]);
  if (!e) return <div className="skeleton mt-8 h-48 rounded-3xl" />;
  const l = e.last30d;
  const rows: [string, number, 'in' | 'out'][] = [
    [a('revenue'), l.revenueUsd, 'in'], [a('adIncome'), l.adRevenueUsd, 'in'], [a('fees'), l.gatewayFeesUsd, 'out'],
    [a('tax'), l.taxUsd, 'out'], [a('aiCost'), l.aiCostUsd, 'out'], [a('fixed'), l.fixedCostsUsd, 'out'],
  ];
  const pct = (x: number) => `${Math.round(x * 100)}`;

  return (
    <section className="mt-10 space-y-4" aria-labelledby="econ-title">
      <h2 id="econ-title" className="font-display text-2xl font-bold">{a('econTitle')}</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map(([k, v, dir]) => (
            <div key={k} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
              <dt className="text-xs text-fg-subtle">{k}</dt>
              <dd className={cn('font-display text-xl font-bold tabular-nums', dir === 'out' && v > 0 && 'text-fg-muted')}>{dir === 'out' && v > 0 ? '−' : ''}{usd(v)}</dd>
            </div>
          ))}
        </dl>
        <div className={cn('flex flex-col justify-center rounded-3xl p-5 ring-1', l.profitUsd >= 0 ? 'bg-primary-soft ring-primary/30' : 'bg-danger-soft ring-danger/30')}>
          <p className="text-sm font-semibold">{l.profitUsd >= 0 ? a('profit') : a('loss')}</p>
          <p className={cn('font-display text-4xl font-extrabold tabular-nums', l.profitUsd >= 0 ? 'text-primary-strong' : 'text-danger')}>{usd(l.profitUsd)}</p>
          <p className="mt-1 text-xs text-fg-muted">{a('adViews', { n: fmt.num(l.adViews), c: fmt.num(l.adCreditsGranted) })}</p>
        </div>
      </div>
      <p className="text-xs text-fg-subtle">{a('econNote')}</p>

      <div className="overflow-x-auto rounded-3xl bg-surface shadow-sm ring-1 ring-line">
        <table className="w-full min-w-[680px] text-sm tabular-nums">
          <caption className="px-4 pt-4 text-start font-semibold">{a('unitTitle')}</caption>
          <thead className="text-xs text-fg-subtle">
            <tr>{[a('model'), a('unit'), a('vendor'), a('charged'), a('minRevenue'), a('margin')].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {e.table.map((r) => (
              <tr key={r.modelId + (r.resolution ?? '')} className="border-t border-line">
                <td className="px-4 py-2.5">{r.name}{r.resolution && <span className="text-fg-subtle"> · {r.resolution}</span>} {r.freeCredits && <Badge tone="accent">{a('freeOk')}</Badge>}</td>
                <td className="px-4 py-2.5 text-fg-muted">{a(r.unit === 'image' ? 'perImage' : 'perSecond')}</td>
                <td className="px-4 py-2.5">{usd(r.vendorCostUsd)}</td>
                <td className="px-4 py-2.5 font-semibold">{r.credits} cr</td>
                <td className="px-4 py-2.5">{usd(r.revenueUsd)}</td>
                <td className={cn('px-4 py-2.5 font-semibold', r.margin >= e.targetMargin ? 'text-primary-strong' : 'text-danger')}>{pct(r.margin)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 pb-4 text-xs text-fg-subtle">{a('marginRule', { m: pct(e.targetMargin), g: (e.gatewayFee * 100).toFixed(1), t: pct(e.taxRate) })}</p>
      </div>
    </section>
  );
}
