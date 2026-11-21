import type { PaymentGateway } from './types';

export const mockGateway: PaymentGateway = {
  name: 'mock',
  async createSession(item, amount) {
    await new Promise((r) => setTimeout(r, 300));
    return { id: `cs_${Math.random().toString(36).slice(2, 10)}`, item, amount, currency: 'USD' };
  },
  async confirm(session) {
    await new Promise((r) => setTimeout(r, 1200));
    return { ok: true, sessionId: session.id };
  },
};
