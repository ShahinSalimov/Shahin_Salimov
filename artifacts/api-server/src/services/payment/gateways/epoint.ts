import { paymentConfig } from '../config';
import { b64json, decimalToMinor, epointSignature, fromB64json, minorToDecimal, safeEqual } from '../signature';
import { InvalidSignatureError, type PaymentGateway } from '../types';

/**
 * Epoint (epoint.az) adapter.
 *
 * Protocol as implemented (VERIFY against Epoint's current merchant docs before going live —
 * they could not be fetched while this was written):
 *  - request:  POST {API}/request, form fields `data` = base64(JSON), `signature` = base64(sha1(private_key + data + private_key))
 *  - JSON:     public_key, amount ("12.34"), currency "AZN", language, order_id, description,
 *              success_redirect_url, error_redirect_url
 *  - response: { status: "success", redirect_url, transaction }
 *  - callback: POST to the result URL set in the Epoint cabinet (= CALLBACK_URL) with the same
 *              data+signature pair; decoded JSON has order_id, status ("success" | other), amount, transaction
 */
const API = process.env.EPOINT_API_URL ?? 'https://epoint.az/api/1';

interface EpointCallback { order_id: string; status: string; amount?: string; transaction?: string; message?: string }

export const epointGateway: PaymentGateway = {
  id: 'epoint',
  livemode: true,
  chargeCurrency: 'AZN',

  async createCheckout(req) {
    const data = b64json({
      public_key: paymentConfig.merchantId,
      amount: minorToDecimal(req.amountMinor),
      currency: 'AZN',
      language: req.language,
      order_id: req.orderId,
      description: req.description,
      success_redirect_url: req.successUrl,
      error_redirect_url: req.errorUrl,
    });
    const res = await fetch(`${API}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data, signature: epointSignature(paymentConfig.secretKey, data) }),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; redirect_url?: string; transaction?: string; message?: string };
    if (!res.ok || json.status !== 'success' || !json.redirect_url) {
      throw new Error(`Epoint request failed: ${res.status} ${json.message ?? ''}`.trim());
    }
    return { checkoutUrl: json.redirect_url, providerRef: json.transaction };
  },

  async parseCallback({ body }) {
    const { data, signature } = (body ?? {}) as { data?: string; signature?: string };
    if (!data || !signature || !safeEqual(epointSignature(paymentConfig.secretKey, data), signature)) throw new InvalidSignatureError();
    const d = fromB64json<EpointCallback>(data);
    return {
      orderId: d.order_id,
      providerRef: d.transaction,
      status: d.status === 'success' ? 'paid' : 'failed',
      amountMinor: d.amount !== undefined ? decimalToMinor(d.amount) : undefined,
    };
  },
  // Refunds: done in the Epoint merchant cabinet; the Cashbox then records them.
};
