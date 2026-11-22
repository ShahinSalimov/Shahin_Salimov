import { Router, type IRouter, type Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db, paymentsTable } from '@workspace/db';
import { isCurrency, parseCheckoutItem, type PaymentCreateResult, type SandboxOrder, type Currency } from '@workspace/vexora-core';
import { requireUser } from '../lib/auth';
import { toPayment } from '../lib/dto';
import { HttpError } from '../lib/http';
import { logger } from '../lib/logger';
import { parse } from '../lib/validate';
import { activeGateway, paymentConfig, sandboxGateway } from '../services/payment';
import { createOrder, handleCallback, redirectUrls } from '../services/payment/orders';
import { InvalidSignatureError } from '../services/payment/types';

const router: IRouter = Router();
const OrderParam = z.object({ orderId: z.string().regex(/^VX[A-Z0-9]{6,30}$/) });

async function ownOrder(req: Request) {
  const { orderId } = parse(OrderParam, req.params);
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId));
  if (!p || (p.userId !== req.user!.id && req.user!.role !== 'admin')) throw new HttpError(404, 'not_found');
  return p;
}

/** 1–2. Customer picks a plan/pack → server prices it, stores the order and returns the gateway checkout URL. */
router.post('/payment/create', requireUser, async (req, res) => {
  const gateway = activeGateway();
  if (!gateway) throw new HttpError(503, 'payments_disabled');
  const item = parseCheckoutItem(req.body?.item);
  const currency = req.body?.currency;
  if (!item || !isCurrency(currency)) throw new HttpError(400, 'invalid_input');
  const { payment, checkoutUrl } = await createOrder(gateway, req.user!, item, currency, req);
  const body: PaymentCreateResult = { orderId: payment.orderId, checkoutUrl, payment: toPayment(payment) };
  res.status(201).json(body);
});

/** 3. Gateway → server notification (form or JSON). Always answers quickly; credits are granted once. */
router.post('/payment/callback', async (req: Request & { rawBody?: Buffer }, res) => {
  const gateway = activeGateway();
  if (!gateway) { res.status(503).json({ status: 'disabled' }); return; }
  try {
    const p = await handleCallback(gateway, { body: req.body, rawBody: req.rawBody, headers: req.headers });
    res.json({ status: 'ok', order_id: p?.orderId ?? null });
  } catch (err) {
    if (err instanceof InvalidSignatureError) { logger.warn('payment callback with invalid signature'); res.status(400).json({ status: 'invalid_signature' }); return; }
    throw err;
  }
});

/** Success/failed pages poll this: the redirect can arrive before the callback. */
router.get('/payment/status/:orderId', requireUser, async (req, res) => {
  res.json(toPayment(await ownOrder(req)));
});

/** Sandbox "hosted payment page" data. */
router.get('/payment/sandbox/:orderId', requireUser, async (req, res) => {
  if (paymentConfig.mode !== 'sandbox' || !activeGateway()) throw new HttpError(404, 'not_found');
  const p = await ownOrder(req);
  const body: SandboxOrder = {
    orderId: p.orderId, amountMinor: p.amountMinor, currency: p.currency as Currency,
    description: paymentConfig.merchantName, merchant: paymentConfig.merchantName, status: p.status,
  };
  res.json(body);
});

/** 4. Sandbox: simulate the customer's choice. Builds a signed callback and runs it through the real callback path. */
router.post('/payment/sandbox/:orderId/complete', requireUser, async (req, res) => {
  if (paymentConfig.mode !== 'sandbox' || !activeGateway()) throw new HttpError(404, 'not_found');
  const p = await ownOrder(req);
  const outcome = parse(z.object({ outcome: z.enum(['success', 'failed']) }), req.body).outcome;
  const signed = sandboxGateway.buildCallback(p.orderId, outcome, p.amountMinor, p.currency);
  await handleCallback(sandboxGateway, { body: signed, headers: {} });
  const urls = redirectUrls(req, p.orderId);
  res.json({ redirectUrl: outcome === 'success' ? urls.successUrl : urls.errorUrl });
});

router.get('/payments', requireUser, async (req, res) => {
  const rows = await db.select().from(paymentsTable).where(and(eq(paymentsTable.userId, req.user!.id))).orderBy(desc(paymentsTable.createdAt)).limit(50);
  res.json({ items: rows.map((r) => toPayment(r)), total: rows.length });
});

export default router;
