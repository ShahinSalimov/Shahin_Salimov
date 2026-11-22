import type { PaymentRow } from '@workspace/db';
import type { Currency } from '@workspace/vexora-core';

export interface CheckoutRequest {
  orderId: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  language: string;
  callbackUrl: string;
  successUrl: string;
  errorUrl: string;
  /** where the web app lives — used by the sandbox to host its fake payment page */
  webBaseUrl: string;
}

export interface CheckoutSession {
  /** gateway's hosted payment page; the browser is sent here */
  checkoutUrl: string;
  /** gateway-side id (transaction / order), if it gives one */
  providerRef?: string;
}

export interface CallbackInput {
  body: unknown;
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface CallbackResult {
  /** our order number, when the gateway echoes it */
  orderId?: string;
  /** gateway-side id, used when orderId is not echoed */
  providerRef?: string;
  status: 'paid' | 'failed';
  /** amount the gateway says was charged, checked against the order */
  amountMinor?: number;
}

export class InvalidSignatureError extends Error {
  constructor() { super('invalid_signature'); }
}

/**
 * One adapter per gateway. Card data never touches this server:
 * the customer pays on the gateway's own page (checkoutUrl).
 */
export interface PaymentGateway {
  readonly id: string;
  /** real money? false for the sandbox */
  readonly livemode: boolean;
  /** currency the gateway charges in; null = whatever the customer picked */
  readonly chargeCurrency: Currency | null;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verify authenticity (signature or server-side status lookup) and normalise. Return null to ignore (e.g. still pending). */
  parseCallback(input: CallbackInput): Promise<CallbackResult | null>;
  /** Refund through the gateway API. If absent, refund in the gateway's merchant cabinet. */
  refund?(payment: PaymentRow): Promise<void>;
}
