import type { PaymentMode } from '@workspace/vexora-core';
import { env } from '../../lib/env';

export type GatewayId = 'sandbox' | 'epoint' | 'payriff';
const LIVE_GATEWAYS: GatewayId[] = ['epoint', 'payriff'];

const mode = (process.env.PAYMENT_MODE ?? 'sandbox') as PaymentMode;
const enabled = process.env.PAYMENTS_ENABLED ? process.env.PAYMENTS_ENABLED === 'true' : !env.isProd;

/**
 * Payment settings from the environment (see .env.example).
 * sandbox → built-in simulated gateway (no real cards, signed callbacks like a real gateway)
 * live    → PAYMENT_GATEWAY (epoint | payriff) with the merchant keys
 */
export const paymentConfig = {
  enabled,
  mode,
  gateway: (mode === 'sandbox' ? 'sandbox' : (process.env.PAYMENT_GATEWAY ?? 'epoint')) as GatewayId,
  merchantId: process.env.MERCHANT_ID ?? '',
  /** never sent to the browser */
  secretKey: process.env.SECRET_KEY ?? (mode === 'sandbox' ? 'sandbox-local-secret' : ''),
  callbackUrl: process.env.CALLBACK_URL ?? '',
  successUrl: process.env.SUCCESS_URL ?? '',
  errorUrl: process.env.ERROR_URL ?? '',
  language: process.env.PAYMENT_LANGUAGE ?? 'az',
  merchantName: process.env.MERCHANT_NAME ?? 'Vexora AI',
};

/** Fail fast on start-up instead of failing on a customer's first payment. */
export function validatePaymentConfig() {
  const c = paymentConfig;
  if (!enabled) return;
  if (c.mode !== 'sandbox' && c.mode !== 'live') throw new Error(`PAYMENT_MODE must be "sandbox" or "live" (got "${c.mode}")`);
  if (c.mode === 'sandbox') {
    // A simulated gateway in production would hand out credits for free.
    if (env.isProd && process.env.ALLOW_SANDBOX_IN_PRODUCTION !== 'true') {
      throw new Error('PAYMENT_MODE=sandbox is blocked in production. Use live keys, PAYMENTS_ENABLED=false, or ALLOW_SANDBOX_IN_PRODUCTION=true for a private staging server.');
    }
    return;
  }
  const missing: string[] = [];
  if (!LIVE_GATEWAYS.includes(c.gateway)) missing.push(`PAYMENT_GATEWAY (one of ${LIVE_GATEWAYS.join(', ')})`);
  if (!c.secretKey) missing.push('SECRET_KEY');
  if (c.gateway === 'epoint' && !c.merchantId) missing.push('MERCHANT_ID');
  for (const [k, v] of [['CALLBACK_URL', c.callbackUrl], ['SUCCESS_URL', c.successUrl], ['ERROR_URL', c.errorUrl]] as const) {
    if (!v) missing.push(k);
    else if (env.isProd && !v.startsWith('https://')) missing.push(`${k} (must be https)`);
  }
  if (missing.length) throw new Error(`Live payments need: ${missing.join(', ')}`);
}
