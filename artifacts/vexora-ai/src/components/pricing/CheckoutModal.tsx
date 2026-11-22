import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { quote, type PaymentDTO } from '@workspace/vexora-core';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppStore';
import { backend } from '@/services/backend';
import { getPlan, findPack, percentOff } from '@/data/pricing';
import { errorKey } from '@/lib/errors';
import { useI18n, type TKey } from '@/i18n';

type Step = 'review' | 'processing' | 'redirecting' | 'success';

/**
 * Checkout: the server creates the payment and prices it. A real provider returns a hosted
 * payment page (redirect); the dev/demo provider is confirmed here instead.
 */
export function CheckoutModal() {
  const { checkout, closeCheckout, currency, refreshMe, config } = useApp();
  const { t, fmt } = useI18n();
  const [step, setStep] = useState<Step>('review');
  const [err, setErr] = useState<TKey | null>(null);
  const [paid, setPaid] = useState<PaymentDTO | null>(null);
  useEffect(() => { if (checkout) { setStep('review'); setErr(null); setPaid(null); } }, [checkout]);
  if (!checkout) return null;
  const q = quote(checkout, currency);
  if (!q) return null;
  const label = checkout.type === 'plan'
    ? t('checkout.planLine', { plan: getPlan(checkout.planId).name, cycle: t(checkout.cycle === 'yearly' ? 'pricing.yearly' : 'pricing.monthly') })
    : t('checkout.packLine', { n: fmt.num(findPack(checkout.packId)?.credits ?? q.credits) });

  const pay = async () => {
    setStep('processing'); setErr(null);
    try {
      const start = await backend.checkout(checkout, currency);
      if (start.mode === 'redirect') { setStep('redirecting'); window.location.assign(start.redirectUrl); return; }
      setPaid(await backend.completeMockPayment(start.payment.id));
      await refreshMe();
      setStep('success');
    } catch (e) {
      setErr(errorKey(e)); setStep('review');
    }
  };

  return (
    <Modal open onClose={closeCheckout} title={t('checkout.title')} className="max-w-md">
      <div className="p-6">
        {step === 'success' && paid ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={56} className="mx-auto text-primary" />
            <h2 className="mt-4 font-display text-2xl font-bold">{t('checkout.successTitle')}</h2>
            <p className="mt-1 text-fg-muted">{t('checkout.successText', { n: fmt.num(paid.credits) })}</p>
            <Button className="mt-6" onClick={closeCheckout}>{t('checkout.continue')}</Button>
          </div>
        ) : (
          <>
            <h2 className="pe-8 font-display text-2xl font-bold">{t('checkout.confirm')}</h2>
            <div className="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm ring-1 ring-line tabular-nums">
              <div className="flex justify-between gap-3"><span>{label}</span><s className="text-fg-subtle">{fmt.money(q.listMinor, currency)}</s></div>
              <div className="flex justify-between gap-3 text-primary-strong"><span>{t('checkout.discount', { n: percentOff(q.listMinor, q.amountMinor) })}</span><span>−{fmt.money(q.listMinor - q.amountMinor, currency)}</span></div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-display text-lg font-bold"><span>{t('checkout.total')}</span><span>{fmt.money(q.amountMinor, currency)}</span></div>
            </div>
            {['mock', 'demo'].includes(config?.paymentProvider ?? '') && <p className="mt-4 text-xs text-fg-subtle">{t('checkout.demo')}</p>}
            {err && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(err)}</p>}
            <Button size="lg" className="mt-5 w-full" onClick={pay} disabled={step !== 'review'}>
              {step === 'processing' && <><Loader2 className="animate-spin" size={18} /> {t('checkout.processing')}</>}
              {step === 'redirecting' && <><Loader2 className="animate-spin" size={18} /> {t('billing.redirecting')}</>}
              {step === 'review' && t('checkout.pay', { amount: fmt.money(q.amountMinor, currency) })}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-fg-muted"><ShieldCheck size={14} /> {t('checkout.cancelAnytime')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
