import { FREE_PLAN_CREDITS } from '@workspace/vexora-core';

const isProd = process.env.NODE_ENV === 'production';

/** Runtime configuration. Every value has a safe default; see README for the full list. */
export const env = {
  isProd,
  /** Comma-separated emails that are promoted to admin on register/login. */
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  /** 'mock' forces the simulator for every model; 'auto' uses real vendors whose keys are set */
  aiProvider: process.env.AI_PROVIDER ?? 'auto',
  signupEnabled: process.env.SIGNUP_ENABLED !== 'false',
  signupCredits: Number(process.env.SIGNUP_CREDITS ?? FREE_PLAN_CREDITS),
  corsOrigin: process.env.CORS_ORIGIN,
  sessionDays: 30,
};

// Payment settings live in services/payment/config.ts.
