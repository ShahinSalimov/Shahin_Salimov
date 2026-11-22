import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { PaymentDTO } from '@workspace/vexora-core';
import { backend } from '@/services/backend';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';
import { currentOrderId } from '@/lib/payment';
import { getPlan } from '@/data/pricing';
import { Button } from '@/components/ui/Button';

const POLL_MS = 1500;
const SLOW_AFTER = 20; // polls (~30 s)

/**
 * /payment/success and /payment/failed. The gateway's redirect can arrive before its callback,
 * so the page asks the server for the real status instead of trusting the URL.
 */
export function PaymentResultPage({ expected }: { expected: 'success' | 'failed' }) {
  const { me, refreshMe, navigate, openAuth } = useApp();
  const { t, fmt } = useI18n();
  const orderId = currentOrderId();
  const [payment, setPayment] = useState<PaymentDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (!me || !orderId) return;
    let stop = false;
    const tick = async () => {
      try {
        const p = await backend.paymentStatus(orderId);
        if (stop) return;
        setPayment(p);
        if (p.status === 'paid') { void refreshMe(); return; }
        if (p.status === 'pending' && expected === 'success') { setPolls((n) => n + 1); setTimeout(tick, POLL_MS); }
      } catch { if (!stop) setMissing(true); }
    };
    void tick();
    return () => { stop = true; };
  }, [me?.id, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me === null) {
    return (
      <Shell icon={<Clock className="text-fg-subtle" size={48} />} title={t('history.signedOut')}>
        <Button onClick={() => openAuth('signin')}>{t('account.signIn')}</Button>
      </Shell>
    );
  }
  if (!orderId || missing) {
    return <Shell icon={<XCircle className="text-fg-subtle" size={48} />} title={t('pay.notFound')}><Button variant="outline" onClick={() => navigate('pricing')}>{t('nav.pricing')}</Button></Shell>;
  }

  const details = payment && (
    <dl className="mx-auto mt-6 max-w-xs space-y-1 rounded-2xl bg-surface-2 p-4 text-sm ring-1 ring-line tabular-nums">
      <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('pay.orderNo')}</dt><dd className="font-mono">{payment.orderId}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('pay.amount')}</dt><dd className="font-semibold">{fmt.money(payment.amountMinor, payment.currency)}</dd></div>
    </dl>
  );

  if (payment?.status === 'paid') {
    return (
      <Shell icon={<CheckCircle2 className="text-primary" size={56} />} title={t('pay.successTitle')}>
        <p className="text-fg-muted">{t('pay.successText', { n: fmt.num(payment.credits) })}</p>
        {payment.item.type === 'plan' && <p className="mt-1 text-fg-muted">{t('pay.planActive', { plan: getPlan(payment.item.planId).name })}</p>}
        {details}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => navigate('create')}>{t('pay.toStudio')}</Button>
          <Button variant="outline" onClick={() => navigate('profile')}>{t('pay.toProfile')}</Button>
        </div>
      </Shell>
    );
  }
  if (payment && (payment.status === 'failed' || expected === 'failed')) {
    return (
      <Shell icon={<XCircle className="text-danger" size={56} />} title={t('pay.failedTitle')}>
        <p className="text-fg-muted">{t('pay.failedText')}</p>
        {details}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => navigate('pricing')}>{t('pay.tryAgain')}</Button>
          <Button variant="outline" onClick={() => navigate('contact')}>{t('legal.contact')}</Button>
        </div>
      </Shell>
    );
  }
  return (
    <Shell icon={<Loader2 className="animate-spin text-primary" size={48} />} title={t('pay.confirming')}>
      {polls >= SLOW_AFTER && <p className="text-fg-muted">{t('pay.confirmingSlow')}</p>}
      {details}
    </Shell>
  );
}

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-lg py-20 text-center" aria-live="polite">
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-4 font-display text-3xl font-bold text-balance">{title}</h1>
      <div className="mt-3">{children}</div>
    </section>
  );
}
