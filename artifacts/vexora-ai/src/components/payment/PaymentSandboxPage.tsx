import { useEffect, useState } from 'react';
import { FlaskConical, Loader2, Lock } from 'lucide-react';
import type { SandboxOrder } from '@workspace/vexora-core';
import { backend } from '@/services/backend';
import { useI18n, type TKey } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { currentOrderId, goTo } from '@/lib/payment';
import { Button } from '@/components/ui/Button';
import { CardBrands } from '@/components/compliance/CardBrands';

const field = 'h-11 w-full rounded-xl bg-surface-2 px-3 font-mono text-sm text-fg-muted ring-1 ring-line';

/**
 * Stand-in for the bank's hosted payment page (PAYMENT_MODE=sandbox).
 * The buttons trigger a signed callback on the server, then return like a real gateway would.
 */
export function PaymentSandboxPage() {
  const { t, fmt } = useI18n();
  const orderId = currentOrderId();
  const [order, setOrder] = useState<SandboxOrder | null>(null);
  const [err, setErr] = useState<TKey | null>(null);
  const [busy, setBusy] = useState<'success' | 'failed' | null>(null);

  useEffect(() => {
    if (!orderId) { setErr('pay.notFound'); return; }
    backend.sandboxOrder(orderId).then(setOrder).catch((e) => setErr(errorKey(e) === 'errors.not_found' ? 'pay.notFound' : errorKey(e)));
  }, [orderId]);

  const finish = async (outcome: 'success' | 'failed') => {
    if (!orderId) return;
    setBusy(outcome);
    try { goTo((await backend.completeSandbox(orderId, outcome)).redirectUrl); } catch (e) { setErr(errorKey(e)); setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <p className="mb-4 flex items-center justify-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-fg ring-1 ring-accent/40">
        <FlaskConical size={16} /> {t('pay.sandboxBadge')}
      </p>
      <section className="rounded-3xl bg-surface p-6 shadow-md ring-1 ring-line">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold"><Lock size={18} className="text-primary" /> {t('pay.sandboxTitle')}</h1>
          <CardBrands />
        </div>
        <p className="mt-2 text-sm text-fg-muted">{t('pay.sandboxNote')}</p>

        {err && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(err)}</p>}
        {!order && !err && <div className="skeleton mt-6 h-40 rounded-2xl" />}
        {order && (
          <>
            <dl className="mt-6 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm ring-1 ring-line tabular-nums">
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('pay.merchant')}</dt><dd className="font-medium">{order.merchant}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('pay.order')}</dt><dd className="font-mono">{order.orderId}</dd></div>
              <div className="flex justify-between gap-3 border-t border-line pt-2"><dt className="font-semibold">{t('pay.amount')}</dt><dd className="font-display text-lg font-bold">{fmt.money(order.amountMinor, order.currency)}</dd></div>
            </dl>
            <fieldset disabled className="mt-5 space-y-2">
              <legend className="mb-2 text-xs font-semibold text-fg-muted">{t('pay.testCard')}</legend>
              <div className={`${field} leading-[2.75rem]`}>4169 7388 0000 0000</div>
              <div className="grid grid-cols-2 gap-2">
                <div className={`${field} leading-[2.75rem]`}>12 / 30</div>
                <div className={`${field} leading-[2.75rem]`}>123</div>
              </div>
            </fieldset>
            <div className="mt-6 grid gap-2">
              <Button size="lg" onClick={() => finish('success')} disabled={!!busy || order.status !== 'pending'}>
                {busy === 'success' && <Loader2 size={18} className="animate-spin" />} {t('pay.approve')} · {fmt.money(order.amountMinor, order.currency)}
              </Button>
              <Button size="lg" variant="outline" onClick={() => finish('failed')} disabled={!!busy || order.status !== 'pending'}>
                {busy === 'failed' && <Loader2 size={18} className="animate-spin" />} {t('pay.decline')}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
