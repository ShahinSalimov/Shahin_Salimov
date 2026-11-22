import { useEffect, useState } from 'react';
import { Gift, Loader2, PlayCircle } from 'lucide-react';
import type { AdStatus } from '@workspace/vexora-core';
import { backend } from '@/services/backend';
import { showRewardedAd } from '@/services/ads';
import { useApp } from '@/store/AppStore';
import { useI18n, type TKey } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/** "Watch an ad → free credits" (image generation only). */
export function EarnCreditsCard({ compact = false }: { compact?: boolean }) {
  const { me, refreshMe } = useApp();
  const { t } = useI18n();
  const [status, setStatus] = useState<AdStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ key: TKey; vars?: Record<string, number>; tone: 'ok' | 'info' | 'err' } | null>(null);

  useEffect(() => { if (me) backend.ads.status().then(setStatus).catch(() => setStatus(null)); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me || !status?.enabled) return null;
  const limited = status.viewsToday >= status.dailyCap;

  const watch = async () => {
    setBusy(true); setMsg(null);
    try {
      const { viewId } = await backend.ads.start();
      const outcome = await showRewardedAd(status.minWatchSeconds);
      if (outcome === 'unavailable') { setMsg({ key: 'ads.unavailable', tone: 'info' }); return; }
      if (outcome === 'closed') { setMsg({ key: 'ads.closed', tone: 'info' }); return; }
      const r = await backend.ads.complete(viewId);
      setStatus(r.status);
      setMsg(r.granted > 0 ? { key: 'ads.earned', vars: { n: r.granted }, tone: 'ok' } : { key: 'ads.counted', tone: 'info' });
      if (r.granted > 0) void refreshMe();
    } catch (e) {
      setMsg({ key: errorKey(e), tone: 'err' });
      backend.ads.status().then(setStatus).catch(() => undefined);
    } finally { setBusy(false); }
  };

  return (
    <section className={cn('rounded-3xl bg-surface ring-1 ring-line shadow-sm', compact ? 'p-4' : 'p-6')} aria-labelledby="earn-title">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-fg"><Gift size={20} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="earn-title" className="font-display font-bold">{t('ads.title')}</h2>
          <p className="text-sm text-fg-muted">{t('ads.text')}</p>
        </div>
        <Button variant="accent" onClick={watch} disabled={busy || limited}>
          {busy ? <><Loader2 size={16} className="animate-spin" /> {t('ads.watching')}</> : <><PlayCircle size={16} /> {t('ads.watch')}</>}
        </Button>
      </div>
      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(status.nextCreditProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(status.nextCreditProgress * 100)}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-fg-subtle">
          <span>{t('ads.progress', { p: Math.round(status.nextCreditProgress * 100) })}</span>
          <span>{limited ? t('ads.limit') : t('ads.today', { n: status.viewsToday, cap: status.dailyCap })}</span>
        </div>
        {!compact && <p className="mt-2 text-xs text-fg-subtle">{t('ads.freeOnlyNote')}</p>}
        {msg && <p role="status" className={cn('mt-2 text-sm', msg.tone === 'ok' ? 'text-primary-strong' : msg.tone === 'err' ? 'text-danger' : 'text-fg-muted')}>{t(msg.key, msg.vars)}</p>}
      </div>
    </section>
  );
}
