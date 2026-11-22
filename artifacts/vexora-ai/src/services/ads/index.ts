/**
 * Rewarded ads on the web.
 *  - VITE_ADS_PROVIDER=gpt     → Google Ad Manager rewarded web ads (GPT). Needs VITE_ADS_REWARDED_UNIT,
 *                                e.g. "/1234567/vexora_rewarded". Requires an approved Ad Manager / AdSense account.
 *  - otherwise                 → sandbox: an in-page test ad with a countdown (no money involved).
 * The reward is confirmed by the server (/api/ads/:id/complete) with its own checks.
 */
export type AdOutcome = 'granted' | 'closed' | 'unavailable';

type Listener = (req: { seconds: number; done: (o: AdOutcome) => void } | null) => void;
let listener: Listener | null = null;
/** The <SandboxAdHost/> component registers here to draw the test ad. */
export const onSandboxAd = (l: Listener) => { listener = l; return () => { listener = null; }; };

function showSandbox(seconds: number): Promise<AdOutcome> {
  return new Promise((resolve) => {
    if (!listener) return resolve('unavailable');
    listener({ seconds, done: (o) => { listener?.(null); resolve(o); } });
  });
}

/* ---------- Google Publisher Tag (rewarded web) ---------- */
interface Googletag {
  cmd: { push(fn: () => void): void };
  defineOutOfPageSlot(path: string, format: unknown): GptSlot | null;
  enums: { OutOfPageFormat: { REWARDED: unknown } };
  pubads(): { addEventListener(type: string, fn: (e: GptEvent) => void): void; removeEventListener(type: string, fn: (e: GptEvent) => void): void };
  enableServices(): void;
  display(slot: GptSlot): void;
  destroySlots(slots: GptSlot[]): void;
}
interface GptSlot { addService(s: unknown): GptSlot }
interface GptEvent { slot: GptSlot; isEmpty?: boolean; makeRewardedVisible?: () => void }

let gptLoading: Promise<Googletag> | null = null;
function loadGpt(): Promise<Googletag> {
  if (gptLoading) return gptLoading;
  gptLoading = new Promise((resolve, reject) => {
    const w = window as unknown as { googletag?: Googletag };
    w.googletag = w.googletag ?? ({ cmd: [] } as unknown as Googletag);
    const s = document.createElement('script');
    s.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
    s.async = true;
    s.onload = () => resolve(w.googletag!);
    s.onerror = () => { gptLoading = null; reject(new Error('gpt load failed')); };
    document.head.appendChild(s);
  });
  return gptLoading;
}

async function showGpt(unit: string): Promise<AdOutcome> {
  let gt: Googletag;
  try { gt = await loadGpt(); } catch { return 'unavailable'; }
  return new Promise((resolve) => {
    gt.cmd.push(() => {
      const slot = gt.defineOutOfPageSlot(unit, gt.enums.OutOfPageFormat.REWARDED);
      if (!slot) return resolve('unavailable'); // page/browser does not support rewarded ads
      slot.addService(gt.pubads());
      let granted = false;
      const pub = gt.pubads();
      const finish = (o: AdOutcome) => {
        pub.removeEventListener('rewardedSlotReady', ready); pub.removeEventListener('rewardedSlotGranted', grant);
        pub.removeEventListener('rewardedSlotClosed', closed); pub.removeEventListener('slotRenderEnded', rendered);
        gt.destroySlots([slot]);
        resolve(o);
      };
      const ready = (e: GptEvent) => { if (e.slot === slot) e.makeRewardedVisible?.(); };
      const grant = (e: GptEvent) => { if (e.slot === slot) granted = true; };
      const closed = (e: GptEvent) => { if (e.slot === slot) finish(granted ? 'granted' : 'closed'); };
      const rendered = (e: GptEvent) => { if (e.slot === slot && e.isEmpty) finish('unavailable'); };
      pub.addEventListener('rewardedSlotReady', ready);
      pub.addEventListener('rewardedSlotGranted', grant);
      pub.addEventListener('rewardedSlotClosed', closed);
      pub.addEventListener('slotRenderEnded', rendered);
      gt.enableServices();
      gt.display(slot);
    });
  });
}

const PROVIDER = import.meta.env.VITE_ADS_PROVIDER as string | undefined;
const UNIT = import.meta.env.VITE_ADS_REWARDED_UNIT as string | undefined;
export const adsMode: 'gpt' | 'sandbox' = PROVIDER === 'gpt' && UNIT ? 'gpt' : 'sandbox';

export function showRewardedAd(minSeconds: number): Promise<AdOutcome> {
  return adsMode === 'gpt' ? showGpt(UNIT!) : showSandbox(Math.max(minSeconds, 3));
}
