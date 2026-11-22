import { and, eq, inArray, lt } from 'drizzle-orm';
import { db, generationsTable, type GenerationRow } from '@workspace/db';
import { providerById } from '../lib/ai';
import type { Parts } from '../lib/ai/types';
import { refundGeneration, withUserLock } from '../lib/ledger';
import { logger } from '../lib/logger';

const busy = new Set<string>(); // one advance at a time per job (single API instance)

/** Advances a running job with its provider; refunds its credits if it fails. */
export async function refresh(row: GenerationRow): Promise<{ row: GenerationRow; progress: number; parts?: Parts }> {
  if (row.status !== 'running' && row.status !== 'queued') return { row, progress: row.status === 'done' ? 1 : 0 };
  if (busy.has(row.id)) return { row, progress: 0 };
  busy.add(row.id);
  try {
    let r;
    try { r = await providerById(row.provider).poll(row); } catch (err) {
      logger.error({ err, id: row.id }, 'AI poll failed');
      // Transient errors keep the job running; jobs stuck for 30 min are failed by the runner.
      return { row, progress: 0 };
    }
    if (r.status === 'running') {
      if (r.state !== undefined) await db.update(generationsTable).set({ state: r.state }).where(eq(generationsTable.id, row.id));
      return { row, progress: r.progress, parts: r.parts };
    }
    if (r.status === 'done') {
      const [u] = await db.update(generationsTable).set({ status: 'done', results: r.results, state: r.state ?? row.state })
        .where(and(eq(generationsTable.id, row.id), eq(generationsTable.status, 'running'))).returning();
      return { row: u ?? row, progress: 1 };
    }
    return { row: (await failGeneration(row, r.error)) ?? row, progress: 0 };
  } finally { busy.delete(row.id); }
}

export function failGeneration(row: GenerationRow, error: string) {
  logger.warn({ id: row.id, error }, 'generation failed — refunding');
  return withUserLock(row.userId, async (tx) => {
    const [u] = await tx.update(generationsTable).set({ status: 'failed', error: 'failed' })
      .where(and(eq(generationsTable.id, row.id), inArray(generationsTable.status, ['queued', 'running']))).returning();
    if (u) await refundGeneration(tx, row.userId, row.id);
    return u;
  });
}

/** Background loop: long videos keep progressing even if the customer closed the tab. */
export function startGenerationRunner(intervalMs = 4000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rows = await db.select().from(generationsTable).where(eq(generationsTable.status, 'running')).limit(20);
      for (const row of rows) await refresh(row);
      const stale = await db.select().from(generationsTable)
        .where(and(eq(generationsTable.status, 'running'), lt(generationsTable.createdAt, new Date(Date.now() - 30 * 60_000)))).limit(20);
      for (const row of stale) await failGeneration(row, 'timeout');
    } catch (err) { logger.error({ err }, 'generation runner tick failed'); } finally { running = false; }
  };
  return setInterval(tick, intervalMs);
}
