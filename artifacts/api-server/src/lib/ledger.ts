import { eq, sql } from 'drizzle-orm';
import { creditLedgerTable, db } from '@workspace/db';
import { HttpError } from './http';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reason = typeof creditLedgerTable.$inferInsert['reason'];

export async function balanceOf(q: Tx | typeof db, userId: string): Promise<number> {
  const [r] = await q.select({ total: sql<string>`coalesce(sum(${creditLedgerTable.delta}), 0)` })
    .from(creditLedgerTable).where(eq(creditLedgerTable.userId, userId));
  return Number(r.total);
}

/** Runs fn in a transaction holding a row lock on the user, so concurrent spends cannot overdraw. */
export function withUserLock<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from vx_users where id = ${userId} for update`);
    return fn(tx);
  });
}

export async function addEntry(tx: Tx, userId: string, delta: number, reason: Reason, refId?: string, note?: string) {
  if (delta === 0) return;
  await tx.insert(creditLedgerTable).values({ userId, delta, reason, refId, note });
}

/** Debits credits or throws 402 insufficient_credits. Must be called inside withUserLock. */
export async function spend(tx: Tx, userId: string, amount: number, refId: string) {
  if (await balanceOf(tx, userId) < amount) throw new HttpError(402, 'insufficient_credits');
  await addEntry(tx, userId, -amount, 'generation', refId);
}
