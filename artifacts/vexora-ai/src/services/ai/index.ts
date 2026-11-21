import { mockProvider } from './mockProvider';
import { createHttpProvider } from './httpProvider';
import type { AIProvider } from './types';

/** Set VITE_AI_API_URL to switch from the mock to a real backend. */
const apiUrl = import.meta.env.VITE_AI_API_URL as string | undefined;
export const aiProvider: AIProvider = apiUrl ? createHttpProvider(apiUrl) : mockProvider;
export type { AIProvider };
