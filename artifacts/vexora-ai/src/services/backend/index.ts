import { createDemoBackend } from './demo';
import { createHttpBackend } from './http';
import type { Backend } from './types';

/**
 * VITE_BACKEND=demo → in-browser demo (static hosting, no server).
 * Otherwise → HTTP API at VITE_API_URL (default: same-origin /api).
 */
export const backend: Backend = import.meta.env.VITE_BACKEND === 'demo'
  ? createDemoBackend()
  : createHttpBackend((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

export { ApiError } from './types';
export type { Backend, PaymentsQuery } from './types';
