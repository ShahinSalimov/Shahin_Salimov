import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { quote } from '@workspace/vexora-core';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CardBrands } from '@/components/compliance/CardBrands';
import { useApp } from '@/store/AppStore';
import { backend } from '@/services/backend';
import { getPlan, findPack, percentOff } from '@/data/pricing';
import { errorKey } from '@/lib/errors';
import { goTo, rememberOrder } from '@/lib/payment';
import { useI18n, type TKey } from '@/i18n';

/**
 * Step 1–2 of the payment flow: confirm the order, then the server creates it
 * (POST /api/payment/create) and the browser goes to the gateway's secure page.
 */
export function CheckoutModal() {
  const { checkout, closeCheckout, currency, config } = useApp();
  const { t, fmt } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<TKey | null>(null);
  useEffect(() => { if (checkout) { setBusy(false); setErr(null); } }, [checkout]);
  if (!checkout) return null;

  // Local gateways charge in AZN whatever currency the customer browses in.
  const charge = config?.chargeCurrency ?? currency;
  const q = quote(checkout, charge);
  const shown = quote(checkout, currency);
  if (!q || !shown) return null;
  const label = checkout.type === 'plan'
    ? t('checkout.planLine', { plan: getPlan(checkout.planId).name, cycle: t(checkout.cycle === 'yearly' ? 'pricing.yearly' : 'pricing.monthly') })
    : t('checkout.packLine', { n: fmt.num(findPack(checkout.packId)?.credits ?? q.credits) });

  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await backend.createPayment(checkout, currency);
      rememberOrder(r.orderId);
      goTo(r.checkoutUrl);
    } catch (e) {
      setErr(errorKey(e)); setBusy(false);
    }
  };

  return (
    <Modal open onClose={closeCheckout} title={t('checkout.title')} className="max-w-md">
      <div className="p-6">
        <h2 className="pe-8 font-display text-2xl font-bold">{t('checkout.confirm')}</h2>
        <div className="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm ring-1 ring-line tabular-nums">
          <div className="flex justify-between gap-3"><span>{label}</span><s className="text-fg-subtle">{fmt.money(q.listMinor, charge)}</s></div>
          <div className="flex justify-between gap-3 text-primary-strong"><span>{t('checkout.discount', { n: percentOff(q.listMinor, q.amountMinor) })}</span><span>−{fmt.money(q.listMinor - q.amountMinor, charge)}</span></div>
          <div className="flex justify-between gap-3 border-t border-line pt-2 font-display text-lg font-bold"><span>{t('checkout.total')}</span><span>{fmt.money(q.amountMinor, charge)}</span></div>
        </div>
        {charge !== currency && (
          <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-fg">
            {t('pay.chargedIn', { currency: charge, amount: fmt.money(q.amountMinor, charge) })} ≈ {fmt.money(shown.amountMinor, currency)}
          </p>
        )}
        {config?.paymentMode === 'sandbox' && <p className="mt-3 text-xs text-fg-subtle">{t('pay.sandboxBadge')}</p>}
        {err && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(err)}</p>}
        <Button size="lg" className="mt-5 w-full" onClick={pay} disabled={busy}>
          {busy ? <><Loader2 className="animate-spin" size={18} /> {t('billing.redirecting')}</> : t('checkout.pay', { amount: fmt.money(q.amountMinor, charge) })}
        </Button>
        <div className="mt-4 flex items-start gap-2 text-xs text-fg-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" /> <span>{t('pay.secure')}</span>
        </div>
        <CardBrands className="mt-3 justify-center" />
      </div>
    </Modal>
  );
}
