import type { GenerationRow, PaymentRow, UserRow } from '@workspace/db';
import type { CheckoutItem, Currency, GenerationDTO, GenerationParams, GenerationResult, Me, PaymentDTO } from '@workspace/vexora-core';

export const toMe = (u: UserRow, balance: number): Me => ({
  id: u.id, email: u.email, name: u.name, role: u.role, planId: u.planId, billingCycle: u.billingCycle ?? null, balance,
});

export const toPayment = (p: PaymentRow, userEmail?: string): PaymentDTO => ({
  id: p.id, userId: p.userId, userEmail, provider: p.provider, item: p.item as CheckoutItem, currency: p.currency as Currency,
  amountMinor: p.amountMinor, credits: p.credits, status: p.status, createdAt: p.createdAt.toISOString(),
  paidAt: p.paidAt?.toISOString() ?? null, refundedAt: p.refundedAt?.toISOString() ?? null,
});

export const toGeneration = (g: GenerationRow, progress?: number): GenerationDTO => ({
  id: g.id, params: g.params as GenerationParams, status: g.status, cost: g.cost,
  progress: g.status === 'done' ? 1 : progress ?? 0,
  results: g.results as GenerationResult[], error: g.error, createdAt: g.createdAt.toISOString(),
});
