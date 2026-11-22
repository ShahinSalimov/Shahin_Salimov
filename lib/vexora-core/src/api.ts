/** Wire types shared by the API server and the web client. */
import type { Currency } from './currency';
import type { GenerationParams } from './generation';
import type { AspectRatio, MediaKind } from './models';
import type { BillingCycle, CheckoutItem, PlanId } from './pricing';

export type Role = 'user' | 'admin';

export interface PublicConfig {
  paymentsEnabled: boolean;
  paymentProvider: string;
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
  cost: number;
  results: GenerationResult[];
  error: string | null;
  createdAt: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PaymentDTO {
  id: string;
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

/** How the client should finish a checkout. */
export type CheckoutStart =
  | { mode: 'mock'; payment: PaymentDTO }
  | { mode: 'redirect'; payment: PaymentDTO; redirectUrl: string };

export interface CurrencyTotals {
  currency: Currency;
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  paidCount: number;
  refundedCount: number;
}

export interface AdminSummary {
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

export type ApiErrorCode =
  | 'invalid_input' | 'invalid_email' | 'weak_password' | 'email_taken' | 'invalid_credentials'
  | 'unauthorized' | 'forbidden' | 'not_found' | 'insufficient_credits' | 'rate_limited'
  | 'payments_disabled' | 'signup_disabled' | 'invalid_model' | 'invalid_prompt' | 'conflict' | 'server_error';
