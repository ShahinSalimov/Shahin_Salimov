import { useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { onSandboxAd, type AdOutcome } from '@/services/ads';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';

/** Draws the test ad used when no real ad network is configured (sandbox). */
export function SandboxAdHost() {
  const { t } = useI18n();
  const [req, setReq] = useState<{ seconds: number; done: (o: AdOutcome) => void } | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => onSandboxAd((r) => { setReq(r); if (r) setLeft(r.seconds); }), []);
  useEffect(() => {
    if (!req || left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [req, left]);
  if (!req) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-overlay/70 p-4" role="dialog" aria-modal="true" aria-label={t('ads.title')}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-xl ring-1 ring-line">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-fg"><FlaskConical size={13} /> {t('ads.sandbox', { s: req.seconds })}</p>
        <div className="mt-4 grid aspect-video place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent font-display text-5xl font-extrabold text-on-primary tabular-nums">{Math.max(0, left)}</div>
        <div className="mt-5 flex justify-center gap-2">
          {left > 0
            ? <Button variant="outline" onClick={() => req.done('closed')}><X size={16} /> {t('common.close')}</Button>
            : <Button onClick={() => req.done('granted')}>{t('checkout.continue')}</Button>}
        </div>
      </div>
    </div>
  );
}
