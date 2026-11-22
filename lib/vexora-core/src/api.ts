/** Wire types shared by the API server and the web client. */
import type { Currency } from './currency';
import type { GenerationParams } from './generation';
import type { AspectRatio, MediaKind } from './models';
import type { BillingCycle, CheckoutItem, PlanId } from './pricing';

export type Role = 'user' | 'admin';

export type PaymentMode = 'sandbox' | 'live';

export interface PublicConfig {
  paymentsEnabled: boolean;
  /** sandbox = simulated gateway, no real cards; live = real gateway */
  paymentMode: PaymentMode;
  /** active gateway id: sandbox | epoint | payriff */
  paymentGateway: string;
  /** currency the gateway actually charges in (local AZ gateways: AZN); null = any listed currency */
  chargeCurrency: Currency | null;
  signupEnabled: boolean;
  signupCredits: number;
  currencies: Currency[];
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  planId: PlanId;
  billingCycle: BillingCycle | null;
  balance: number;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface GenerationResult {
  id: string;
  kind: MediaKind;
  aspect: AspectRatio;
  seed: number;
  /** Real providers return a media URL; the mock leaves it empty and the client renders synthetic art from `seed`. */
  url: string | null;
}

export interface GenerationDTO {
  id: string;
  params: GenerationParams;
  status: JobStatus;
  progress: number;
  /** long videos are made of joined parts: which part is rendering now */
  parts?: { total: number; current: number };
  cost: number;
  results: GenerationResult[];
  error: string | null;
  createdAt: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PaymentDTO {
  id: string;
  /** public order number sent to the gateway */
  orderId: string;
  livemode: boolean;
  userId: string;
  userEmail?: string;
  provider: string;
  item: CheckoutItem;
  currency: Currency;
  amountMinor: number;
  credits: number;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

/** Result of POST /api/payment/create: send the browser to checkoutUrl (gateway or sandbox page). */
export interface PaymentCreateResult {
  orderId: string;
  checkoutUrl: string;
  payment: PaymentDTO;
}

/** What the sandbox "gateway" page shows. */
export interface SandboxOrder {
  orderId: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  merchant: string;
  status: PaymentStatus;
}

export interface CurrencyTotals {
  currency: Currency;
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  paidCount: number;
  refundedCount: number;
}

export interface AdminSummary {
  /** totals cover only payments made in this mode (sandbox tests never count as revenue in live) */
  mode: PaymentMode;
  totals: CurrencyTotals[];
  users: number;
  payingUsers: number;
  generations: number;
  creditsSpent: number;
  pendingPayments: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  planId: PlanId;
  balance: number;
  createdAt: string;
}

export interface Page<T> { items: T[]; total: number }

/** POST /api/uploads → reference image stored on the server */
export interface UploadResult { key: string; url: string }

export type ApiErrorCode =
  | 'invalid_input' | 'invalid_email' | 'weak_password' | 'email_taken' | 'invalid_credentials'
  | 'unauthorized' | 'forbidden' | 'not_found' | 'insufficient_credits' | 'rate_limited'
  | 'payments_disabled' | 'signup_disabled' | 'invalid_model' | 'invalid_prompt' | 'conflict' | 'server_error';
