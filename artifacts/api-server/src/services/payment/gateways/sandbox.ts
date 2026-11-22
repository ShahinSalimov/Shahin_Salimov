import { paymentConfig } from '../config';
import { b64json, fromB64json, hmacSignature, minorToDecimal, decimalToMinor, safeEqual } from '../signature';
import { InvalidSignatureError, type PaymentGateway } from '../types';

interface SandboxData { order_id: string; status: 'success' | 'failed'; amount: string; currency: string; transaction: string }

/**
 * Simulated gateway for PAYMENT_MODE=sandbox.
 * Its "hosted page" is the web app's /payment/sandbox screen; its callback is a signed
 * data+signature form, exactly like a real gateway, so the whole flow runs without cards.
 */
export const sandboxGateway: PaymentGateway & {
  buildCallback(orderId: string, outcome: 'success' | 'failed', amountMinor: number, currency: string): { data: string; signature: string };
} = {
  id: 'sandbox',
  livemode: false,
  // Local AZ gateways charge in AZN; the sandbox behaves the same so tests match production.
  chargeCurrency: 'AZN',

  async createCheckout(req) {
    const url = new URL(`${req.webBaseUrl}/payment/sandbox`);
    url.searchParams.set('order_id', req.orderId);
    return { checkoutUrl: url.toString(), providerRef: `sbx_${req.orderId}` };
  },

  buildCallback(orderId, outcome, amountMinor, currency) {
    const data = b64json({ order_id: orderId, status: outcome, amount: minorToDecimal(amountMinor), currency, transaction: `sbx_${orderId}` } satisfies SandboxData);
    return { data, signature: hmacSignature(paymentConfig.secretKey, data) };
  },

  async parseCallback({ body }) {
    const { data, signature } = (body ?? {}) as { data?: string; signature?: string };
    if (!data || !signature || !safeEqual(hmacSignature(paymentConfig.secretKey, data), signature)) throw new InvalidSignatureError();
    const d = fromB64json<SandboxData>(data);
    return { orderId: d.order_id, providerRef: d.transaction, status: d.status === 'success' ? 'paid' : 'failed', amountMinor: decimalToMinor(d.amount) };
  },

  async refund() { /* simulated */ },
};
