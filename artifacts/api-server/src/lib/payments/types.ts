import type { Request } from 'express';
import type { PaymentRow, UserRow } from '@workspace/db';

export type StartResult = { mode: 'mock'; providerRef: string } | { mode: 'redirect'; providerRef: string; redirectUrl: string };

export interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'payment.refunded';
  /** our payment id if the provider echoes metadata, otherwise matched by providerRef */
  paymentId?: string;
  providerRef?: string;
}

/**
 * Contract for a real gateway (e.g. a local AZ acquirer or a merchant-of-record).
 * Card data must never touch this server: use the provider's hosted checkout page.
 */
export interface PaymentProvider {
  readonly id: string;
  startCheckout(payment: PaymentRow, ctx: { user: UserRow; returnUrl: string }): Promise<StartResult>;
  /** Verify the signature using the raw body and map the event. Return null to ignore. */
  parseWebhook?(req: Request & { rawBody?: Buffer }): Promise<WebhookEvent | null>;
  /** Ask the provider to refund. Called before the local refund is recorded. */
  refund?(payment: PaymentRow): Promise<void>;
}
