import { Router, type IRouter, type Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db, paymentsTable } from '@workspace/db';
import { isCurrency, parseCheckoutItem, quote, type CheckoutStart } from '@workspace/vexora-core';
import { requireUser } from '../lib/auth';
import { toPayment } from '../lib/dto';
import { HttpError } from '../lib/http';
import { logger } from '../lib/logger';
import { activeProvider, providerById } from '../lib/payments';
import { markFailed, markPaid, markRefunded } from '../lib/payments/fulfill';
import { parse } from '../lib/validate';

const router: IRouter = Router();
const Id = z.object({ id: z.uuid() });

/** Prices are always computed here from the price book — the client only says what and in which currency. */
router.post('/checkout', requireUser, async (req, res) => {
  const provider = activeProvider();
  if (!provider) throw new HttpError(503, 'payments_disabled');
  const item = parseCheckoutItem(req.body?.item);
  const currency = req.body?.currency;
  if (!item || !isCurrency(currency)) throw new HttpError(400, 'invalid_input');
  const q = quote(item, currency)!;

  const [payment] = await db.insert(paymentsTable).values({
    userId: req.user!.id, provider: provider.id, item, currency, amountMinor: q.amountMinor, credits: q.credits,
  }).returning();
  const returnUrl = `${req.get('origin') ?? ''}/#profile`;
  const start = await provider.startCheckout(payment, { user: req.user!, returnUrl });
  const [p] = await db.update(paymentsTable).set({ providerRef: start.providerRef }).where(eq(paymentsTable.id, payment.id)).returning();

  const body: CheckoutStart = start.mode === 'redirect'
    ? { mode: 'redirect', payment: toPayment(p), redirectUrl: start.redirectUrl }
    : { mode: 'mock', payment: toPayment(p) };
  res.status(201).json(body);
});

/** Dev-only confirmation for the mock provider (the real path is the webhook below). */
router.post('/payments/:id/mock-complete', requireUser, async (req, res) => {
  const { id } = parse(Id, req.params);
  const [p] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.id, id), eq(paymentsTable.userId, req.user!.id)));
  if (!p || p.provider !== 'mock' || activeProvider()?.id !== 'mock') throw new HttpError(404, 'not_found');
  res.json(toPayment((await markPaid(p.id))!));
});

router.get('/payments', requireUser, async (req, res) => {
  const rows = await db.select().from(paymentsTable).where(eq(paymentsTable.userId, req.user!.id)).orderBy(desc(paymentsTable.createdAt)).limit(50);
  res.json({ items: rows.map((r) => toPayment(r)), total: rows.length });
});

/** Provider → server notifications. Needs the raw body for signature checks (see app.ts). */
router.post('/webhooks/:provider', async (req: Request & { rawBody?: Buffer }, res) => {
  const provider = providerById(String(req.params.provider));
  if (!provider?.parseWebhook) throw new HttpError(404, 'not_found');
  const event = await provider.parseWebhook(req);
  if (!event) { res.json({ ignored: true }); return; }
  const where = event.paymentId ? eq(paymentsTable.id, event.paymentId) : eq(paymentsTable.providerRef, event.providerRef ?? '');
  const [p] = await db.select().from(paymentsTable).where(and(where, eq(paymentsTable.provider, provider.id)));
  if (!p) { logger.warn({ event }, 'webhook for unknown payment'); res.json({ ignored: true }); return; }
  if (event.type === 'payment.succeeded') await markPaid(p.id);
  else if (event.type === 'payment.failed') await markFailed(p.id);
  else if (event.type === 'payment.refunded') await markRefunded(p, 'provider webhook');
  res.json({ ok: true });
});

export default router;
