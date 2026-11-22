import { Router, type IRouter } from 'express';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { adViewsTable, creditLedgerTable, db } from '@workspace/db';
import { ECONOMICS, MODELS, adCreditsPerView, type AdStatus } from '@workspace/vexora-core';
import { requireUser } from '../lib/auth';
import { HttpError } from '../lib/http';
import { addEntry, withUserLock } from '../lib/ledger';
import { rateLimit } from '../lib/rateLimit';
import { parse } from '../lib/validate';

/**
 * Rewarded ads → free credits (usable only on low-cost image models).
 * Web rewarded ads report "reward granted" in the browser, so the server adds its own checks:
 * signed-in users only, a daily cap, a minimum watch time and per-IP rate limits.
 */
export const adsConfig = {
  enabled: process.env.ADS_ENABLED ? process.env.ADS_ENABLED === 'true' : true,
  dailyCap: Number(process.env.ADS_DAILY_CAP ?? 10),
  minWatchSeconds: Number(process.env.ADS_MIN_WATCH_SECONDS ?? 15),
};
if (process.env.ADS_REVENUE_PER_VIEW_USD) ECONOMICS.adRevenuePerViewUsd = Number(process.env.ADS_REVENUE_PER_VIEW_USD);

const router: IRouter = Router();
router.use('/ads', requireUser);

const startOfDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

async function totals(userId: string) {
  const [[today], [all], [granted]] = await Promise.all([
    db.select({ n: count() }).from(adViewsTable).where(and(eq(adViewsTable.userId, userId), eq(adViewsTable.status, 'completed'), gte(adViewsTable.createdAt, startOfDay()))),
    db.select({ n: count() }).from(adViewsTable).where(and(eq(adViewsTable.userId, userId), eq(adViewsTable.status, 'completed'))),
    db.select({ n: sql<string>`coalesce(sum(${creditLedgerTable.delta}), 0)` }).from(creditLedgerTable)
      .where(and(eq(creditLedgerTable.userId, userId), eq(creditLedgerTable.reason, 'ad_reward'))),
  ]);
  return { today: today.n, all: all.n, granted: Number(granted.n) };
}

async function status(userId: string): Promise<AdStatus> {
  const t = await totals(userId);
  const perView = adCreditsPerView(MODELS);
  const earned = t.all * perView;
  return {
    enabled: adsConfig.enabled, dailyCap: adsConfig.dailyCap, viewsToday: t.today, creditsPerView: perView,
    nextCreditProgress: earned - Math.floor(earned), minWatchSeconds: adsConfig.minWatchSeconds,
  };
}

router.get('/ads/status', async (req, res) => { res.json(await status(req.user!.id)); });

router.post('/ads/start', rateLimit({ key: 'ads', windowMs: 60_000, max: 6 }), async (req, res) => {
  if (!adsConfig.enabled) throw new HttpError(503, 'payments_disabled');
  const t = await totals(req.user!.id);
  if (t.today >= adsConfig.dailyCap) throw new HttpError(429, 'rate_limited');
  const [v] = await db.insert(adViewsTable).values({ userId: req.user!.id }).returning();
  res.status(201).json({ viewId: v.id });
});

/** Called when the ad SDK reports the reward. Grants whole credits as completed views accumulate. */
router.post('/ads/:id/complete', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const userId = req.user!.id;
  const granted = await withUserLock(userId, async (tx) => {
    const [v] = await tx.select().from(adViewsTable).where(and(eq(adViewsTable.id, id), eq(adViewsTable.userId, userId)));
    if (!v || v.status !== 'started') throw new HttpError(409, 'conflict');
    const watched = (Date.now() - v.createdAt.getTime()) / 1000;
    if (watched < adsConfig.minWatchSeconds) {
      await tx.update(adViewsTable).set({ status: 'rejected' }).where(eq(adViewsTable.id, id));
      throw new HttpError(409, 'conflict');
    }
    await tx.update(adViewsTable).set({ status: 'completed', completedAt: new Date() }).where(eq(adViewsTable.id, id));
    const [[all], [g]] = await Promise.all([
      tx.select({ n: count() }).from(adViewsTable).where(and(eq(adViewsTable.userId, userId), eq(adViewsTable.status, 'completed'))),
      tx.select({ n: sql<string>`coalesce(sum(${creditLedgerTable.delta}), 0)` }).from(creditLedgerTable)
        .where(and(eq(creditLedgerTable.userId, userId), eq(creditLedgerTable.reason, 'ad_reward'))),
    ]);
    const due = Math.floor(all.n * adCreditsPerView(MODELS)) - Number(g.n);
    await addEntry(tx, userId, due, 'ad_reward', id, undefined, 'free');
    return Math.max(0, due);
  });
  res.json({ granted, status: await status(userId) });
});

export default router;
