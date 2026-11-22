import { useEffect, useState } from 'react';
import { Coins, Crown, Images } from 'lucide-react';
import type { CheckoutItem, GenerationDTO, PaymentDTO } from '@workspace/vexora-core';
import { useApp } from '@/store/AppStore';
import { getPlan, findPack } from '@/data/pricing';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { backend } from '@/services/backend';
import { useI18n, type TKey } from '@/i18n';

export function useItemLabel() {
  const { t, fmt } = useI18n();
  return (item: CheckoutItem) => item.type === 'plan'
    ? t('checkout.planLine', { plan: getPlan(item.planId).name, cycle: t(item.cycle === 'yearly' ? 'pricing.yearly' : 'pricing.monthly') })
    : t('checkout.packLine', { n: fmt.num(findPack(item.packId)?.credits ?? 0) });
}

export function ProfilePage() {
  const { me, navigate, openAuth } = useApp();
  const { t, fmt } = useI18n();
  const itemLabel = useItemLabel();
  const [gens, setGens] = useState<GenerationDTO[] | null>(null);
  const [payments, setPayments] = useState<PaymentDTO[] | null>(null);

  useEffect(() => {
    if (!me) return;
    backend.listGenerations().then((r) => setGens(r.items)).catch(() => setGens([]));
    backend.myPayments().then((r) => setPayments(r.items)).catch(() => setPayments([]));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me === undefined) return <div className="py-10"><div className="skeleton h-24 rounded-3xl" /></div>;
  if (me === null) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-display text-2xl font-bold">{t('history.signedOut')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => openAuth('signin')}>{t('account.signIn')}</Button>
          <Button variant="outline" onClick={() => openAuth('signup')}>{t('auth.signUp')}</Button>
        </div>
      </div>
    );
  }

  const plan = getPlan(me.planId);
  const images = (gens ?? []).filter((g) => g.status === 'done').flatMap((g) => g.results);
  const stats = [
    { icon: Coins, label: t('profile.credits'), value: fmt.num(me.balance) },
    { icon: Crown, label: t('profile.plan'), value: `${plan.name}${me.billingCycle ? ` · ${t(me.billingCycle === 'yearly' ? 'profile.yearly' : 'profile.monthly')}` : ''}` },
    { icon: Images, label: t('profile.library'), value: images.length },
  ];
  return (
    <div className="py-10">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-accent font-display text-3xl font-extrabold text-on-primary">
          {(me.name || me.email).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-extrabold">{me.name}</h1>
          <p className="truncate text-sm text-fg-muted">{me.email}</p>
        </div>
        <Button variant="accent" onClick={() => navigate('pricing')}>{t('profile.upgrade')}</Button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-4 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
            <Icon className="text-primary" />
            <div><p className="text-xs text-fg-subtle">{label}</p><p className="font-display text-xl font-bold">{value}</p></div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold">{t('profile.works')}</h2>
      {gens === null ? <div className="skeleton mt-4 h-40 rounded-3xl" /> : images.length ? (
        <div className="mt-4 columns-2 gap-4 md:columns-4">
          {images.map((r) => (
            <div key={r.id} className="mb-4 break-inside-avoid overflow-hidden rounded-2xl ring-1 ring-line">
              {r.url ? <img src={r.url} alt="" className="block w-full" /> : <GenerativeArt seed={r.seed} aspect={r.aspect} kind={r.kind} className="block h-auto w-full" />}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-fg-muted">{t('profile.empty')} <button onClick={() => navigate('create')} className="font-semibold text-primary hover:underline cursor-pointer">{t('profile.start')}</button></p>
      )}

      <h2 className="mt-12 font-display text-2xl font-bold">{t('history.title')}</h2>
      {payments === null ? <div className="skeleton mt-4 h-24 rounded-3xl" /> : payments.length ? (
        <div className="mt-4 overflow-x-auto rounded-3xl bg-surface shadow-sm ring-1 ring-line">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead className="text-start text-xs text-fg-subtle">
              <tr>{(['date', 'item', 'amount', 'status'] as const).map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{t(`history.${h}` as TKey)}</th>)}</tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3 text-fg-muted">{fmt.date(p.createdAt)}</td>
                  <td className="px-4 py-3">{itemLabel(p.item)}</td>
                  <td className="px-4 py-3 font-semibold">{fmt.money(p.amountMinor, p.currency)}</td>
                  <td className="px-4 py-3"><Badge tone={p.status === 'paid' ? 'primary' : p.status === 'refunded' ? 'accent' : 'neutral'}>{t(`status.${p.status}` as TKey)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-fg-muted">{t('history.empty')}</p>}
    </div>
  );
}
