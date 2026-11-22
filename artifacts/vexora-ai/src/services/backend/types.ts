import type {
  AdminSummary, AdminUser, CheckoutItem, Currency, GenerationDTO, GenerationParams, Me, Page, PaymentCreateResult, PaymentDTO, PaymentStatus,
  PublicConfig, SandboxOrder, AdStatus, AdEconomics, UploadResult,
} from '@workspace/vexora-core';

export interface PaymentsQuery { status?: PaymentStatus; currency?: Currency; q?: string; limit?: number; offset?: number }

/** Everything the UI needs from a server. Implemented over HTTP (real API) and in-browser (static demo). */
export interface Backend {
  readonly kind: 'http' | 'demo';
  config(): Promise<PublicConfig>;
  me(): Promise<Me | null>;
  register(input: { email: string; password: string; name?: string }): Promise<Me>;
  login(input: { email: string; password: string }): Promise<Me>;
  logout(): Promise<void>;

  createGeneration(params: GenerationParams): Promise<GenerationDTO>;
  getGeneration(id: string): Promise<GenerationDTO>;
  cancelGeneration(id: string): Promise<GenerationDTO>;
  listGenerations(): Promise<Page<GenerationDTO>>;

  /** POST /api/payment/create → send the browser to checkoutUrl */
  createPayment(item: CheckoutItem, currency: Currency): Promise<PaymentCreateResult>;
  paymentStatus(orderId: string): Promise<PaymentDTO>;
  myPayments(): Promise<Page<PaymentDTO>>;
  /** sandbox gateway page */
  sandboxOrder(orderId: string): Promise<SandboxOrder>;
  completeSandbox(orderId: string, outcome: 'success' | 'failed'): Promise<{ redirectUrl: string }>;

  /** reference image as a data URL → stored file */
  upload(dataUrl: string): Promise<UploadResult>;

  /** rewarded ads → free credits (image models only) */
  ads: {
    status(): Promise<AdStatus>;
    start(): Promise<{ viewId: string }>;
    complete(viewId: string): Promise<{ granted: number; status: AdStatus }>;
  };

  admin: {
    summary(): Promise<AdminSummary>;
    economics(): Promise<AdEconomics>;
    payments(q: PaymentsQuery): Promise<Page<PaymentDTO>>;
    /** force = refund even though the customer already used credits */
    refund(paymentId: string, force?: boolean): Promise<PaymentDTO>;
    users(q: { q?: string; limit?: number; offset?: number }): Promise<Page<AdminUser>>;
    adjustCredits(userId: string, delta: number, note?: string): Promise<void>;
  };
}

/** Error carrying the API's machine-readable code (translated in the UI under `errors.<code>`). */
export class ApiError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}
