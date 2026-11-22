import { Router, type IRouter } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db, generationsTable, mediaTable } from '@workspace/db';
import { estimateCost, findModel, normaliseParams } from '@workspace/vexora-core';
import { requireUser } from '../lib/auth';
import { providerById, providerForModel } from '../lib/ai';
import { toGeneration } from '../lib/dto';
import { HttpError } from '../lib/http';
import { refundGeneration, spend, withUserLock } from '../lib/ledger';
import { refresh } from '../services/generation';
import { logger } from '../lib/logger';
import { parse } from '../lib/validate';

const router: IRouter = Router();
router.use('/generations', requireUser);
const Id = z.object({ id: z.uuid() });

router.post('/generations', async (req, res) => {
  const n = normaliseParams(req.body ?? {});
  if (!n.ok) throw new HttpError(400, n.error as 'invalid_model' | 'invalid_prompt');
  const model = findModel(n.params.modelId)!;
  const cost = estimateCost(n.params);
  const provider = providerForModel(model.id);
  const user = req.user!;

  // A reference image must be the user's own upload.
  if (n.params.referenceKey) {
    const [m] = await db.select().from(mediaTable).where(and(eq(mediaTable.key, n.params.referenceKey), eq(mediaTable.userId, user.id), eq(mediaTable.kind, 'upload')));
    if (!m) throw new HttpError(400, 'invalid_input');
  }

  const row = await withUserLock(user.id, async (tx) => {
    const [g] = await tx.insert(generationsTable).values({ userId: user.id, params: n.params, provider: provider.id, cost, status: 'running' }).returning();
    // Free credits (sign-up, ads) only pay for low-cost models.
    await spend(tx, user.id, cost, g.id, model.freeCredits);
    return g;
  });

  try {
    const s = await provider.submit(row.id, n.params, { userId: user.id });
    const [u] = await db.update(generationsTable).set({ providerJobId: s.providerJobId, finishAt: s.finishAt, state: s.state ?? null })
      .where(eq(generationsTable.id, row.id)).returning();
    res.status(201).json(toGeneration(u, 0));
  } catch (err) {
    logger.error({ err }, 'AI submit failed');
    await withUserLock(user.id, async (tx) => {
      await tx.update(generationsTable).set({ status: 'failed', error: 'failed' }).where(eq(generationsTable.id, row.id));
      await refundGeneration(tx, user.id, row.id);
    });
    throw new HttpError(502, 'server_error');
  }
});

router.get('/generations', async (req, res) => {
  const rows = await db.select().from(generationsTable).where(eq(generationsTable.userId, req.user!.id)).orderBy(desc(generationsTable.createdAt)).limit(40);
  const out = await Promise.all(rows.map(async (r) => { const x = await refresh(r); return toGeneration(x.row, x.progress, x.parts); }));
  res.json({ items: out, total: out.length });
});

router.get('/generations/:id', async (req, res) => {
  const { id } = parse(Id, req.params);
  const [row] = await db.select().from(generationsTable).where(and(eq(generationsTable.id, id), eq(generationsTable.userId, req.user!.id)));
  if (!row) throw new HttpError(404, 'not_found');
  const x = await refresh(row);
  res.json(toGeneration(x.row, x.progress, x.parts));
});

router.post('/generations/:id/cancel', async (req, res) => {
  const { id } = parse(Id, req.params);
  const userId = req.user!.id;
  const row = await withUserLock(userId, async (tx) => {
    const [u] = await tx.update(generationsTable).set({ status: 'cancelled', error: 'cancelled' })
      .where(and(eq(generationsTable.id, id), eq(generationsTable.userId, userId), inArray(generationsTable.status, ['queued', 'running']))).returning();
    if (u) await refundGeneration(tx, userId, u.id);
    return u;
  });
  if (!row) throw new HttpError(409, 'conflict');
  await providerById(row.provider).cancel?.(row).catch((err) => logger.warn({ err }, 'provider cancel failed'));
  res.json(toGeneration(row));
});

export default router;
