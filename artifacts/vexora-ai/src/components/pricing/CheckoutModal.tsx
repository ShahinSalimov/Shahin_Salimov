import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppStore';
import { paymentGateway } from '@/services/payments';
import { priceFor } from '@/services/pricing';
import { percentOff, usd } from '@/lib/format';

type Step = 'review' | 'processing' | 'success' | 'error';

/** Mock checkout. Card fields are placeholders — a real gateway must render its own hosted fields here. */
export function CheckoutModal() {
  const { checkout, closeCheckout, addCredits, setPlan } = useApp();
  const [step, setStep] = useState<Step>('review');
  const [err, setErr] = useState('');
  useEffect(() => { if (checkout) setStep('review'); }, [checkout]);
  if (!checkout) return null;
  const { amount, listAmount, label, credits } = priceFor(checkout);

  const pay = async () => {
    setStep('processing');
    const session = await paymentGateway.createSession(checkout, amount);
    const res = await paymentGateway.confirm(session);
    if (!res.ok) { setErr(res.error); setStep('error'); return; }
    if (checkout.type === 'plan') setPlan(checkout.planId, checkout.cycle);
    addCredits(credits);
    setStep('success');
  };

  return (
    <Modal open onClose={closeCheckout} title="Ödəniş" className="max-w-md">
      <div className="p-6">
        {step === 'success' ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={56} className="mx-auto text-volt-400" />
            <h2 className="mt-4 font-display text-2xl font-bold">Ödəniş tamamlandı</h2>
            <p className="mt-1 text-muted">Hesabına <span className="font-mono text-volt-300">{credits}</span> kredit əlavə olundu.</p>
            <Button className="mt-6" onClick={closeCheckout}>Davam et</Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">Sifarişi təsdiqlə</h2>
            <div className="mt-5 space-y-2 rounded-2xl bg-ink-900 p-4 text-sm ring-1 ring-ink-700">
              <div className="flex justify-between"><span>{label}</span><s className="text-ink-400">{usd(listAmount)}</s></div>
              <div className="flex justify-between text-volt-300"><span>Endirim ({percentOff(listAmount, amount)}%)</span><span>−{usd(listAmount - amount)}</span></div>
              <div className="flex justify-between border-t border-ink-700 pt-2 font-display text-lg font-bold"><span>Cəmi</span><span>{usd(amount)}</span></div>
            </div>
            <fieldset disabled className="mt-5 space-y-2 opacity-60" aria-describedby="demo-note">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-volt-400">Kart məlumatı</legend>
              <div className="h-11 rounded-xl bg-ink-800 px-3 leading-[2.75rem] font-mono text-sm text-ink-400 ring-1 ring-ink-700">•••• •••• •••• 4242</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-11 rounded-xl bg-ink-800 px-3 leading-[2.75rem] font-mono text-sm text-ink-400 ring-1 ring-ink-700">12 / 30</div>
                <div className="h-11 rounded-xl bg-ink-800 px-3 leading-[2.75rem] font-mono text-sm text-ink-400 ring-1 ring-ink-700">•••</div>
              </div>
            </fieldset>
            <p id="demo-note" className="mt-2 text-xs text-ink-400">Demo rejim: real ödəniş alınmır. Gateway qoşulanda bu sahələr onun hosted form-u ilə əvəzlənəcək.</p>
            {step === 'error' && <p className="mt-3 text-sm text-blaze-300">{err}</p>}
            <Button size="lg" className="mt-5 w-full" onClick={pay} disabled={step === 'processing'}>
              {step === 'processing' ? <><Loader2 className="animate-spin" size={18} /> Emal olunur…</> : <>{usd(amount)} ödə</>}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck size={14} /> İstənilən vaxt ləğv et</p>
          </>
        )}
      </div>
    </Modal>
  );
}
