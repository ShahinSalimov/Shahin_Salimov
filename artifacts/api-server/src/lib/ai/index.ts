import { findModel } from '@workspace/vexora-core';
import { env } from '../env';
import { mockAI } from './mock';
import { replicateAI } from './replicate';
import type { AIProvider } from './types';

const PROVIDERS: Record<string, AIProvider> = { mock: mockAI, replicate: replicateAI };

/** Models with a real vendor adapter. Everything else (and AI_PROVIDER=mock) uses the simulator. */
const VENDOR_BY_MODEL: Record<string, string> = { 'seedance-2-5': 'replicate' };

export function providerForModel(modelId: string): AIProvider {
  const vendor = VENDOR_BY_MODEL[modelId];
  if (env.aiProvider === 'mock' || !vendor || !findModel(modelId)) return mockAI;
  if (vendor === 'replicate' && !process.env.REPLICATE_API_TOKEN) return mockAI;
  return PROVIDERS[vendor];
}

export const providerById = (id: string): AIProvider => PROVIDERS[id] ?? mockAI;

/** Real vendors need a public URL for our media (they download reference images and frames). */
export function validateAIConfig() {
  if (env.aiProvider !== 'mock' && process.env.REPLICATE_API_TOKEN && !process.env.PUBLIC_BASE_URL) {
    throw new Error('REPLICATE_API_TOKEN is set: PUBLIC_BASE_URL is required so Replicate can fetch reference images and frames.');
  }
}
