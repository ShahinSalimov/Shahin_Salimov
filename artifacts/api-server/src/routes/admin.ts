import { Router, type IRouter } from 'express';
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod/v4';
import { creditLedgerTable, db, generationsTable, paymentsTable, usersTable } from '@workspace/db';
import { CURRENCIES, type AdminSummary, type AdminUser, type Currency } from '@workspace/vexora-core';
import { requireAdmin } from '../lib/auth';
import { toPayment } from '../lib/dto';
import { HttpError } from '../lib/http';
import { addEntry, withUserLock } from '../lib/ledger';
import { gatewayById, paymentConfig } from '../services/payment';
import { markRefunded } from '../services/payment/fulfill';
import { parse } from '../lib/validate';

/** Owner-only "Kassa": revenue per currency, payments, refunds and user credits. */
const router: IRouter = Router();
router.use('/admin', requireAdmin);

const Id = z.object({ id: z.uuid() });
const PaymentsQuery = z.object({
  status: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  currency: z.enum(CURRENCIES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/admin/summary', async (_req, res) => {
  // In live mode sandbox test payments never count as revenue (and vice versa).
  const live = paymentConfig.mode === 'live';
  const rows = await db.select({
    currency: paymentsTable.currency,
    status: paymentsTable.status,
    sum: sql<string>`coalesce(sum(${paymentsTable.amountMinor}), 0)`,
    n: count(),
  }).from(paymentsTable).where(and(inArray(paymentsTable.status, ['paid', 'refunded']), eq(paymentsTable.livemode, live)))
    .groupBy(paymentsTable.currency, paymentsTable.status);

  const totals = CURRENCIES.map((currency: Currency) => {
    const paid = rows.find((r) => r.currency === currency && r.status === 'paid');
    const refunded = rows.find((r) => r.currency === currency && r.status === 'refunded');
    const netMinor = Number(paid?.sum ?? 0);
    const refundedMinor = Number(refunded?.sum ?? 0);
    return { currency, grossMinor: netMinor + refundedMinor, refundedMinor, netMinor, paidCount: paid?.n ?? 0, refundedCount: refunded?.n ?? 0 };
  });

  const [[users], [paying], [gens], [spent], [pending]] = await Promise.all([
    db.select({ n: count() }).from(usersTable),
    db.select({ n: sql<number>`count(distinct ${paymentsTable.userId})::int` }).from(paymentsTable).where(and(eq(paymentsTable.status, 'paid'), eq(paymentsTable.livemode, live))),
    db.select({ n: count() }).from(generationsTable),
    db.select({ n: sql<string>`coalesce(-sum(${creditLedgerTable.delta}), 0)` }).from(creditLedgerTable)
      .where(inArray(creditLedgerTable.reason, ['generation', 'generation_refund'])),
    db.select({ n: count() }).from(paymentsTable).where(and(eq(paymentsTable.status, 'pending'), eq(paymentsTable.livemode, live))),
  ]);

  const body: AdminSummary = {
    mode: paymentConfig.mode,
    totals, users: users.n, payingUsers: paying.n, generations: gens.n, creditsSpent: Number(spent.n), pendingPayments: pending.n,
  };
  res.json(body);
});

router.get('/admin/payments', async (req, res) => {
  const q = parse(PaymentsQuery, req.query);
  const filters: SQL[] = [];
  if (q.status) filters.push(eq(paymentsTable.status, q.status));
  if (q.currency) filters.push(eq(paymentsTable.currency, q.currency));
  if (q.q) filters.push(or(ilike(usersTable.email, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`), eq(paymentsTable.orderId, q.q.toUpperCase()))!);
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [total]] = await Promise.all([
    db.select({ p: paymentsTable, email: usersTable.email }).from(paymentsTable).innerJoin(usersTable, eq(usersTable.id, paymentsTable.userId))
      .where(where).orderBy(desc(paymentsTable.createdAt)).limit(q.limit).offset(q.offset),
    db.select({ n: count() }).from(paymentsTable).innerJoin(usersTable, eq(usersTable.id, paymentsTable.userId)).where(where),
  ]);
  res.json({ items: rows.map((r) => toPayment(r.p, r.email)), total: total.n });
});

router.post('/admin/payments/:id/refund', async (req, res) => {
  const { id } = parse(Id, req.params);
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!p) throw new HttpError(404, 'not_found');
  if (p.status !== 'paid') throw new HttpError(409, 'conflict');
  // Gateways without a refund API are refunded in their merchant cabinet; this records it.
  await gatewayById(p.provider)?.refund?.(p);
  const r = await markRefunded(p, `admin:${req.user!.email}`);
  if (!r) throw new HttpError(409, 'conflict');
  res.json(toPayment(r));
});

router.get('/admin/users', async (req, res) => {
  const { q, limit, offset } = parse(PaymentsQuery.pick({ q: true, limit: true, offset: true }), req.query);
  const where = q ? ilike(usersTable.email, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined;
  // Fully qualified names: drizzle renders bare column names inside sql``, which would bind `id` to the ledger table.
  const balance = sql<string>`coalesce((select sum(l.delta) from vx_credit_ledger l where l.user_id = "vx_users"."id"), 0)`;
  const [rows, [total]] = await Promise.all([
    db.select({ u: usersTable, balance }).from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
    db.select({ n: count() }).from(usersTable).where(where),
  ]);
  const items: AdminUser[] = rows.map(({ u, balance: b }) => ({
    id: u.id, email: u.email, name: u.name, role: u.role, planId: u.planId, balance: Number(b), createdAt: u.createdAt.toISOString(),
  }));
  res.json({ items, total: total.n });
});

router.post('/admin/users/:id/credits', async (req, res) => {
  const { id } = parse(Id, req.params);
  const body = parse(z.object({ delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0), note: z.string().trim().max(200).optional() }), req.body);
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id));
  if (!u) throw new HttpError(404, 'not_found');
  await withUserLock(id, (tx) => addEntry(tx, id, body.delta, 'admin_adjust', req.user!.id, body.note));
  res.json({ ok: true });
});

export default router;
