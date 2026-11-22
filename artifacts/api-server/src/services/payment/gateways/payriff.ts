import { paymentConfig } from '../config';
import { minorToDecimal } from '../signature';
import type { PaymentGateway } from '../types';

/**
 * Payriff (payriff.com) adapter.
 *
 * Protocol as implemented (VERIFY against Payriff's current API docs before going live —
 * they could not be fetched while this was written):
 *  - create:   POST {API}/orders, header `Authorization: <SECRET_KEY>`, JSON body
 *              { amount, language, currency: "AZN", description, callbackUrl, cardSave: false, operation: "PURCHASE", metadata }
 *              → { payload: { orderId, paymentUrl, transactionId } }
 *  - callback: Payriff posts the order back to callbackUrl. The body is NOT trusted:
 *              the order is re-read with GET {API}/orders/{orderId} using the secret key.
 *  - statuses: PAID / APPROVED → paid; DECLINED / CANCELED / EXPIRED → failed; anything else → still pending
 */
const API = process.env.PAYRIFF_API_URL ?? 'https://api.payriff.com/api/v3';

const headers = () => ({ Authorization: paymentConfig.secretKey, 'Content-Type': 'application/json' });

export const payriffGateway: PaymentGateway = {
  id: 'payriff',
  livemode: true,
  chargeCurrency: 'AZN',

  async createCheckout(req) {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        amount: Number(minorToDecimal(req.amountMinor)),
        language: req.language.toUpperCase(),
        currency: 'AZN',
        description: req.description,
        callbackUrl: req.callbackUrl,
        cardSave: false,
        operation: 'PURCHASE',
        metadata: { order_id: req.orderId },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { payload?: { orderId?: string; paymentUrl?: string }; message?: string };
    if (!res.ok || !json.payload?.paymentUrl) throw new Error(`Payriff create order failed: ${res.status} ${json.message ?? ''}`.trim());
    return { checkoutUrl: json.payload.paymentUrl, providerRef: json.payload.orderId };
  },

  async parseCallback({ body }) {
    const b = (body ?? {}) as { payload?: { orderId?: string }; orderId?: string };
    const payriffOrderId = b.payload?.orderId ?? b.orderId;
    if (!payriffOrderId) return null;
    // Source of truth: ask Payriff directly with our secret key.
    const res = await fetch(`${API}/orders/${encodeURIComponent(payriffOrderId)}`, { headers: headers() });
    if (!res.ok) throw new Error(`Payriff order lookup failed: ${res.status}`);
    const json = (await res.json()) as { payload?: { paymentStatus?: string; amount?: number; metadata?: { order_id?: string } } };
    const status = String(json.payload?.paymentStatus ?? '').toUpperCase();
    const amountMinor = json.payload?.amount !== undefined ? Math.round(json.payload.amount * 100) : undefined;
    const base = { providerRef: payriffOrderId, orderId: json.payload?.metadata?.order_id, amountMinor };
    if (['PAID', 'APPROVED'].includes(status)) return { ...base, status: 'paid' };
    if (['DECLINED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(status)) return { ...base, status: 'failed' };
    return null;
  },
  // Refunds: done in the Payriff cabinet; the Cashbox then records them.
};
