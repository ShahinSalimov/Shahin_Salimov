import { useEffect, useState, type ReactNode } from 'react';
import { MessageCircle, Clock } from 'lucide-react';
import { DEMO, DEMO_CONTACT_NAME, DEMO_CONTACT_PHONE, contactLink, demoState, fmtLeft } from '../lib/demo';

/** Demo versiyada yuxarı zolaq və müddət bitəndə bağlanma ekranı. */
export function DemoGate({ children }: { children: ReactNode }) {
  const [st, setSt] = useState(() => (DEMO ? demoState() : null));
  useEffect(() => {
    if (!DEMO) return;
    const t = setInterval(() => setSt(demoState()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!DEMO || !st) return <>{children}</>;
  const link = contactLink();

  if (st.expired) {
    return (
      <div className="grid min-h-full place-items-center bg-ink px-6 py-12 text-center text-white">
        <div className="max-w-md">
          <img src="./icon.svg" alt="" className="mx-auto size-20 rounded-3xl" />
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Demo müddəti bitdi</h1>
          <p className="mt-3 text-slate-300">
            Sistemi sınadığınız üçün təşəkkür edirik. Tam versiyanı öz biznesinizə uyğunlaşdırılmış şəkildə qurmaq üçün əlaqə saxlayın.
          </p>
          <div className="mt-8 rounded-2xl bg-white/5 p-5">
            <div className="text-sm text-slate-400">Əlaqə</div>
            <div className="mt-1 text-lg font-semibold">{DEMO_CONTACT_NAME}</div>
            {DEMO_CONTACT_PHONE && <div className="tabular mt-1 select-all text-brand-400">{DEMO_CONTACT_PHONE}</div>}
          </div>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-brand-400 px-6 font-semibold text-ink">
              <MessageCircle className="size-5" /> WhatsApp ilə yazın
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="no-print sticky top-0 z-50 flex h-8 items-center justify-center gap-2 bg-brand-400 px-3 text-center text-xs font-semibold text-ink md:text-sm">
        <Clock className="size-3.5 shrink-0" />
        <span>Demo versiya · {fmtLeft(st.left)} qalıb</span>
        <span className="hidden md:inline">· Tam versiya üçün: {DEMO_CONTACT_NAME}{DEMO_CONTACT_PHONE ? ` ${DEMO_CONTACT_PHONE}` : ''}</span>
        {link && <a href={link} target="_blank" rel="noreferrer" className="ml-1 rounded-full bg-ink px-2.5 py-0.5 text-[11px] text-white">Əlaqə</a>}
      </div>
      {children}
    </>
  );
}
