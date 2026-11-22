import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { db, paymentsTable, type PaymentRow, type UserRow } from '@workspace/db';
import { findPack, getPlan, quote, type CheckoutItem, type Currency } from '@workspace/vexora-core';
import { HttpError } from '../../lib/http';
import { logger } from '../../lib/logger';
import { paymentConfig } from './config';
import { markFailed, markPaid } from './fulfill';
import type { CallbackInput, PaymentGateway } from './types';

/** Short, unique, gateway-friendly order number, e.g. VXMI8K2Q1A7F3B */
export const newOrderId = () => `VX${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;

function describe(item: CheckoutItem): string {
  if (item.type === 'plan') return `${paymentConfig.merchantName} — ${getPlan(item.planId).name} (${item.cycle})`;
  return `${paymentConfig.merchantName} — ${findPack(item.packId)?.credits ?? ''} credits`;
}

/** Public origin of the web app, for default redirect URLs in development. */
function webBase(req: Request): string {
  const origin = req.get('origin') ?? `${req.protocol}://${req.get('host')}`;
  return origin.replace(/\/$/, '');
}

export function redirectUrls(req: Request, orderId: string) {
  const base = webBase(req);
  const withOrder = (u: string) => { const url = new URL(u); url.searchParams.set('order_id', orderId); return url.toString(); };
  return {
    webBaseUrl: base,
    successUrl: withOrder(paymentConfig.successUrl || `${base}/payment/success`),
    errorUrl: withOrder(paymentConfig.errorUrl || `${base}/payment/failed`),
    callbackUrl: paymentConfig.callbackUrl || `${base}/api/payment/callback`,
  };
}

/** Prices the item on the server, stores a pending order and opens a checkout at the gateway. */
export async function createOrder(gateway: PaymentGateway, user: UserRow, item: CheckoutItem, requested: Currency, req: Request) {
  const currency = gateway.chargeCurrency ?? requested;
  const q = quote(item, currency);
  if (!q) throw new HttpError(400, 'invalid_input');

  const orderId = newOrderId();
  const [payment] = await db.insert(paymentsTable).values({
    orderId, userId: user.id, provider: gateway.id, livemode: gateway.livemode, item, currency, amountMinor: q.amountMinor, credits: q.credits,
  }).returning();

  try {
    const session = await gateway.createCheckout({
      orderId, amountMinor: q.amountMinor, currency, description: describe(item), language: paymentConfig.language, ...redirectUrls(req, orderId),
    });
    const [p] = await db.update(paymentsTable).set({ providerRef: session.providerRef ?? null }).where(eq(paymentsTable.id, payment.id)).returning();
    return { payment: p, checkoutUrl: session.checkoutUrl };
  } catch (err) {
    logger.error({ err, orderId }, 'gateway checkout failed');
    await markFailed(payment.id);
    throw new HttpError(502, 'server_error');
  }
}

/**
 * Shared callback handling for every gateway: authenticity is checked by the adapter,
 * then the order is matched, the amount is verified and credits are granted once.
 */
export async function handleCallback(gateway: PaymentGateway, input: CallbackInput): Promise<PaymentRow | null> {
  const result = await gateway.parseCallback(input);
  if (!result) return null;
  const match = [
    result.orderId ? eq(paymentsTable.orderId, result.orderId) : undefined,
    result.providerRef ? eq(paymentsTable.providerRef, result.providerRef) : undefined,
  ].filter(Boolean);
  if (!match.length) return null;
  const [payment] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.provider, gateway.id), or(...match)));
  if (!payment) { logger.warn({ result }, 'callback for unknown order'); return null; }

  if (result.status === 'paid') {
    if (result.amountMinor !== undefined && result.amountMinor !== payment.amountMinor) {
      logger.error({ orderId: payment.orderId, expected: payment.amountMinor, got: result.amountMinor }, 'callback amount mismatch — not crediting');
      await markFailed(payment.id);
      return payment;
    }
    return (await markPaid(payment.id)) ?? payment;
  }
  await markFailed(payment.id);
  return payment;
}
