import type { GenerationRow, PaymentRow, UserRow } from '@workspace/db';
import type { CheckoutItem, Currency, GenerationDTO, GenerationParams, GenerationResult, Me, PaymentDTO } from '@workspace/vexora-core';

export const toMe = (u: UserRow, b: { paid: number; free: number; total: number }): Me => ({
  id: u.id, email: u.email, name: u.name, role: u.role, planId: u.planId, billingCycle: u.billingCycle ?? null,
  balance: b.total, paidBalance: b.paid, freeBalance: b.free,
});

export const toPayment = (p: PaymentRow, userEmail?: string): PaymentDTO => ({
  id: p.id, orderId: p.orderId, livemode: p.livemode, userId: p.userId, userEmail, provider: p.provider, item: p.item as CheckoutItem, currency: p.currency as Currency,
  amountMinor: p.amountMinor, credits: p.credits, status: p.status, createdAt: p.createdAt.toISOString(),
  paidAt: p.paidAt?.toISOString() ?? null, refundedAt: p.refundedAt?.toISOString() ?? null,
});

export const toGeneration = (g: GenerationRow, progress?: number, parts?: GenerationDTO['parts']): GenerationDTO => ({
  id: g.id, params: g.params as GenerationParams, status: g.status, cost: g.cost,
  progress: g.status === 'done' ? 1 : progress ?? 0, parts,
  results: g.results as GenerationResult[], error: g.error, createdAt: g.createdAt.toISOString(),
});
