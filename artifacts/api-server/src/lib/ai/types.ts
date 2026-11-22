import type { GenerationRow } from '@workspace/db';
import type { GenerationParams, GenerationResult } from '@workspace/vexora-core';

export interface SubmitResult { providerJobId: string | null; finishAt: Date | null }
export type PollResult = { status: 'running'; progress: number } | { status: 'done'; results: GenerationResult[] } | { status: 'failed'; error: string };

/**
 * Contract for a model vendor. Keys live in server env vars only.
 * `submit` starts the job; `poll` is called lazily whenever a client reads the job.
 */
export interface AIProvider {
  readonly id: string;
  submit(id: string, params: GenerationParams): Promise<SubmitResult>;
  poll(row: GenerationRow): Promise<PollResult>;
  cancel?(row: GenerationRow): Promise<void>;
}
