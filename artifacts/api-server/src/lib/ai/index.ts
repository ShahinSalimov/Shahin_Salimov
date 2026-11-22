import { env } from '../env';
import { mockAI } from './mock';
import type { AIProvider } from './types';

/** Register real vendor adapters here, keyed by the AI_PROVIDER value. */
const PROVIDERS: Record<string, AIProvider> = { mock: mockAI };

export function aiProvider(id = env.aiProvider): AIProvider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown AI_PROVIDER "${id}"`);
  return p;
}
