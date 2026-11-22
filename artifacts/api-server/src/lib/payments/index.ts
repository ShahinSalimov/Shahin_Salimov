import { env } from '../env';
import { mockProvider } from './mock';
import type { PaymentProvider } from './types';

/** Register real adapters here, keyed by the PAYMENT_PROVIDER value. */
const PROVIDERS: Record<string, PaymentProvider> = { mock: mockProvider };

export function activeProvider(): PaymentProvider | null {
  if (env.paymentProvider === 'none') return null;
  const p = PROVIDERS[env.paymentProvider];
  if (!p) throw new Error(`Unknown PAYMENT_PROVIDER "${env.paymentProvider}"`);
  return p;
}
export const providerById = (id: string): PaymentProvider | undefined => PROVIDERS[id];
export type { PaymentProvider } from './types';
