import type { CheckoutItem } from '@/types';

export interface CheckoutSession { id: string; item: CheckoutItem; amount: number; currency: 'USD' }
export type PaymentResult = { ok: true; sessionId: string } | { ok: false; error: string };

/** Implement for Stripe / Paddle / local bank gateway. Card data must be handled by the gateway's hosted fields. */
export interface PaymentGateway {
  readonly name: string;
  createSession(item: CheckoutItem, amount: number): Promise<CheckoutSession>;
  confirm(session: CheckoutSession): Promise<PaymentResult>;
}
