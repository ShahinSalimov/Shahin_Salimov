import type { GenerationRow } from '@workspace/db';
import type { GenerationParams, GenerationResult } from '@workspace/vexora-core';

export interface SubmitResult { providerJobId: string | null; finishAt: Date | null; state?: unknown }
export interface Parts { total: number; current: number }
export type PollResult =
  | { status: 'running'; progress: number; parts?: Parts; state?: unknown }
  | { status: 'done'; results: GenerationResult[]; state?: unknown }
  | { status: 'failed'; error: string; state?: unknown };

/**
 * Contract for a model vendor. Keys live in server env vars only.
 * `submit` starts the job; `poll` advances it (called by the background runner and on reads).
 * `state` is persisted between polls (multi-part videos keep their progress there).
 */
export interface AIProvider {
  readonly id: string;
  submit(id: string, params: GenerationParams, ctx: { userId: string }): Promise<SubmitResult>;
  poll(row: GenerationRow): Promise<PollResult>;
  cancel?(row: GenerationRow): Promise<void>;
}
