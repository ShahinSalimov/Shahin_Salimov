import { FREE_PLAN_CREDITS } from '@workspace/vexora-core';

const isProd = process.env.NODE_ENV === 'production';

/** Runtime configuration. Every value has a safe default; see README for the full list. */
export const env = {
  isProd,
  /** Comma-separated emails that are promoted to admin on register/login. */
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  /**
   * 'none'  → payments closed (free launch, the production default)
   * 'mock'  → simulated checkout for development
   * other   → a real provider adapter registered in lib/payments
   */
  paymentProvider: process.env.PAYMENT_PROVIDER ?? (isProd ? 'none' : 'mock'),
  aiProvider: process.env.AI_PROVIDER ?? 'mock',
  signupEnabled: process.env.SIGNUP_ENABLED !== 'false',
  signupCredits: Number(process.env.SIGNUP_CREDITS ?? FREE_PLAN_CREDITS),
  corsOrigin: process.env.CORS_ORIGIN,
  sessionDays: 30,
};

if (env.isProd && env.paymentProvider === 'mock' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
  // A mock provider in production would hand out credits for free.
  throw new Error('PAYMENT_PROVIDER=mock is not allowed in production. Use "none" or a real provider.');
}
