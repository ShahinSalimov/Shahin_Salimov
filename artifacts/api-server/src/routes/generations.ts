import { Router, type IRouter } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db, generationsTable, type GenerationRow } from '@workspace/db';
import { estimateCost, normaliseParams } from '@workspace/vexora-core';
import { requireUser } from '../lib/auth';
import { aiProvider } from '../lib/ai';
import { toGeneration } from '../lib/dto';
import { HttpError } from '../lib/http';
import { addEntry, spend, withUserLock } from '../lib/ledger';
import { logger } from '../lib/logger';
import { parse } from '../lib/validate';

const router: IRouter = Router();
router.use('/generations', requireUser);
const Id = z.object({ id: z.uuid() });

/** Brings a running job up to date with its provider; refunds credits if it failed. */
async function refresh(row: GenerationRow): Promise<{ row: GenerationRow; progress: number }> {
  if (row.status !== 'running' && row.status !== 'queued') return { row, progress: row.status === 'done' ? 1 : 0 };
  const r = await aiProvider(row.provider).poll(row);
  if (r.status === 'running') return { row, progress: r.progress };
  if (r.status === 'done') {
    const [u] = await db.update(generationsTable).set({ status: 'done', results: r.results })
      .where(and(eq(generationsTable.id, row.id), eq(generationsTable.status, 'running'))).returning();
    return { row: u ?? row, progress: 1 };
  }
  const failed = await withUserLock(row.userId, async (tx) => {
    const [u] = await tx.update(generationsTable).set({ status: 'failed', error: 'failed' })
      .where(and(eq(generationsTable.id, row.id), eq(generationsTable.status, 'running'))).returning();
    if (u) await addEntry(tx, row.userId, row.cost, 'generation_refund', row.id);
    return u;
  });
  return { row: failed ?? row, progress: 0 };
}

router.post('/generations', async (req, res) => {
  const n = normaliseParams(req.body ?? {});
  if (!n.ok) throw new HttpError(400, n.error as 'invalid_model' | 'invalid_prompt');
  const cost = estimateCost(n.params);
  const provider = aiProvider();
  const user = req.user!;

  const row = await withUserLock(user.id, async (tx) => {
    const [g] = await tx.insert(generationsTable).values({ userId: user.id, params: n.params, provider: provider.id, cost, status: 'running' }).returning();
    await spend(tx, user.id, cost, g.id);
    return g;
  });

  try {
    const s = await provider.submit(row.id, n.params);
    const [u] = await db.update(generationsTable).set({ providerJobId: s.providerJobId, finishAt: s.finishAt }).where(eq(generationsTable.id, row.id)).returning();
    res.status(201).json(toGeneration(u, 0));
  } catch (err) {
    logger.error({ err }, 'AI submit failed');
    await withUserLock(user.id, async (tx) => {
      await tx.update(generationsTable).set({ status: 'failed', error: 'failed' }).where(eq(generationsTable.id, row.id));
      await addEntry(tx, user.id, cost, 'generation_refund', row.id);
    });
    throw new HttpError(502, 'server_error');
  }
});

router.get('/generations', async (req, res) => {
  const rows = await db.select().from(generationsTable).where(eq(generationsTable.userId, req.user!.id)).orderBy(desc(generationsTable.createdAt)).limit(40);
  const out = await Promise.all(rows.map(async (r) => { const x = await refresh(r); return toGeneration(x.row, x.progress); }));
  res.json({ items: out, total: out.length });
});

router.get('/generations/:id', async (req, res) => {
  const { id } = parse(Id, req.params);
  const [row] = await db.select().from(generationsTable).where(and(eq(generationsTable.id, id), eq(generationsTable.userId, req.user!.id)));
  if (!row) throw new HttpError(404, 'not_found');
  const x = await refresh(row);
  res.json(toGeneration(x.row, x.progress));
});

router.post('/generations/:id/cancel', async (req, res) => {
  const { id } = parse(Id, req.params);
  const userId = req.user!.id;
  const row = await withUserLock(userId, async (tx) => {
    const [u] = await tx.update(generationsTable).set({ status: 'cancelled', error: 'cancelled' })
      .where(and(eq(generationsTable.id, id), eq(generationsTable.userId, userId), inArray(generationsTable.status, ['queued', 'running']))).returning();
    if (u) await addEntry(tx, userId, u.cost, 'generation_refund', u.id);
    return u;
  });
  if (!row) throw new HttpError(409, 'conflict');
  await aiProvider(row.provider).cancel?.(row).catch((err) => logger.warn({ err }, 'provider cancel failed'));
  res.json(toGeneration(row));
});

export default router;
