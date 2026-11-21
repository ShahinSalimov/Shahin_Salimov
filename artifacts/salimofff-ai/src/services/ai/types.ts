import type { GenerationJob, GenerationParams } from '@/types';

/**
 * Provider-agnostic contract. Implement this for a real backend
 * (e.g. an HTTP adapter that calls your own API, which in turn calls the model vendor).
 * Never call a vendor API with a secret key directly from the browser.
 */
export interface AIProvider {
  readonly name: string;
  estimateCost(params: GenerationParams): number;
  /** Starts a job and streams progress via onUpdate; resolves with the final job. */
  generate(params: GenerationParams, onUpdate: (job: GenerationJob) => void, signal?: AbortSignal): Promise<GenerationJob>;
}
