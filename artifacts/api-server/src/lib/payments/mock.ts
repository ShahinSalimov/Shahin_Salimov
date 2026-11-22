import type { PaymentProvider } from './types';

/** Development-only provider: the client confirms the payment itself. Blocked in production by env.ts. */
export const mockProvider: PaymentProvider = {
  id: 'mock',
  async startCheckout(payment) {
    return { mode: 'mock', providerRef: `mock_${payment.id}` };
  },
  async refund() { /* nothing to call */ },
};
