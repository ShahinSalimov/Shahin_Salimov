import { and, eq } from 'drizzle-orm';
import { db, paymentsTable, usersTable, type PaymentRow } from '@workspace/db';
import type { CheckoutItem } from '@workspace/vexora-core';
import { addEntry, withUserLock } from '../ledger';

/**
 * Idempotent: only a pending payment becomes paid, so a webhook delivered twice grants credits once.
 * Returns the payment row as it ends up.
 */
export async function markPaid(paymentId: string): Promise<PaymentRow | undefined> {
  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
  if (!existing) return undefined;
  return withUserLock(existing.userId, async (tx) => {
    const [p] = await tx.update(paymentsTable).set({ status: 'paid', paidAt: new Date() })
      .where(and(eq(paymentsTable.id, paymentId), eq(paymentsTable.status, 'pending'))).returning();
    if (!p) return existing;
    await addEntry(tx, p.userId, p.credits, 'purchase', p.id);
    const item = p.item as CheckoutItem;
    if (item.type === 'plan') {
      const renews = new Date();
      if (item.cycle === 'yearly') renews.setFullYear(renews.getFullYear() + 1); else renews.setMonth(renews.getMonth() + 1);
      await tx.update(usersTable).set({ planId: item.planId, billingCycle: item.cycle, planRenewsAt: renews }).where(eq(usersTable.id, p.userId));
    }
    return p;
  });
}

export async function markFailed(paymentId: string) {
  await db.update(paymentsTable).set({ status: 'failed' }).where(and(eq(paymentsTable.id, paymentId), eq(paymentsTable.status, 'pending')));
}

/** Reverses a paid payment: removes its credits (balance may go negative) and drops a plan back to Free. */
export async function markRefunded(payment: PaymentRow, note?: string): Promise<PaymentRow | undefined> {
  return withUserLock(payment.userId, async (tx) => {
    const [p] = await tx.update(paymentsTable).set({ status: 'refunded', refundedAt: new Date() })
      .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, 'paid'))).returning();
    if (!p) return undefined;
    await addEntry(tx, p.userId, -p.credits, 'payment_refund', p.id, note);
    if ((p.item as CheckoutItem).type === 'plan') {
      await tx.update(usersTable).set({ planId: 'free', billingCycle: null, planRenewsAt: null }).where(eq(usersTable.id, p.userId));
    }
    return p;
  });
}
