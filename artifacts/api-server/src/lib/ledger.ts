import { and, eq, sql } from 'drizzle-orm';
import { creditLedgerTable, db } from '@workspace/db';
import { HttpError } from './http';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Entry = typeof creditLedgerTable.$inferInsert;
type Reason = Entry['reason'];
type Bucket = NonNullable<Entry['bucket']>;
export interface Balances { paid: number; free: number; total: number }

export async function balancesOf(q: Tx | typeof db, userId: string): Promise<Balances> {
  const rows = await q.select({ bucket: creditLedgerTable.bucket, total: sql<string>`coalesce(sum(${creditLedgerTable.delta}), 0)` })
    .from(creditLedgerTable).where(eq(creditLedgerTable.userId, userId)).groupBy(creditLedgerTable.bucket);
  const paid = Number(rows.find((r) => r.bucket === 'paid')?.total ?? 0);
  const free = Number(rows.find((r) => r.bucket === 'free')?.total ?? 0);
  return { paid, free, total: paid + free };
}

export const balanceOf = async (q: Tx | typeof db, userId: string) => (await balancesOf(q, userId)).total;

/** Runs fn in a transaction holding a row lock on the user, so concurrent spends cannot overdraw. */
export function withUserLock<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from vx_users where id = ${userId} for update`);
    return fn(tx);
  });
}

export async function addEntry(tx: Tx, userId: string, delta: number, reason: Reason, refId?: string, note?: string, bucket: Bucket = 'paid') {
  if (delta === 0) return;
  await tx.insert(creditLedgerTable).values({ userId, delta, reason, refId, note, bucket });
}

/**
 * Debits a generation. Free credits are used first, but only when the model allows them;
 * the rest comes from paid credits. Throws 402 insufficient_credits. Call inside withUserLock.
 */
export async function spend(tx: Tx, userId: string, amount: number, refId: string, allowFree: boolean) {
  const b = await balancesOf(tx, userId);
  const fromFree = allowFree ? Math.min(Math.max(b.free, 0), amount) : 0;
  const fromPaid = amount - fromFree;
  if (fromPaid > Math.max(b.paid, 0)) throw new HttpError(402, 'insufficient_credits');
  await addEntry(tx, userId, -fromFree, 'generation', refId, undefined, 'free');
  await addEntry(tx, userId, -fromPaid, 'generation', refId, undefined, 'paid');
}

/** Gives back exactly what a generation took, to the same buckets. Idempotent per generation. */
export async function refundGeneration(tx: Tx, userId: string, generationId: string) {
  const rows = await tx.select({ bucket: creditLedgerTable.bucket, reason: creditLedgerTable.reason, delta: creditLedgerTable.delta })
    .from(creditLedgerTable).where(and(eq(creditLedgerTable.userId, userId), eq(creditLedgerTable.refId, generationId)));
  if (rows.some((r) => r.reason === 'generation_refund')) return;
  for (const r of rows.filter((x) => x.reason === 'generation')) await addEntry(tx, userId, -r.delta, 'generation_refund', generationId, undefined, r.bucket);
}
