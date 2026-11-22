import type { Backend } from './types';
import { ApiError } from './types';

export function createHttpBackend(baseUrl: string): Backend {
  async function call<T>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, unknown> }): Promise<T> {
    const qs = init?.query
      ? '?' + new URLSearchParams(Object.entries(init.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
      : '';
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}${qs}`, {
        method: init?.method ?? 'GET',
        credentials: 'include',
        headers: init?.method && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.method && init.method !== 'GET' ? JSON.stringify(init.body ?? {}) : undefined,
      });
    } catch {
      throw new ApiError('network_error');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError((data as { error?: string }).error ?? 'server_error', res.status);
    return data as T;
  }
  const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body });

  return {
    kind: 'http',
    config: () => call('/config'),
    me: async () => (await call<{ user: Awaited<ReturnType<Backend['me']>> }>('/auth/me')).user,
    register: async (input) => (await post<{ user: never }>('/auth/register', input)).user,
    login: async (input) => (await post<{ user: never }>('/auth/login', input)).user,
    logout: async () => { await post('/auth/logout'); },
    createGeneration: (params) => post('/generations', params),
    getGeneration: (id) => call(`/generations/${id}`),
    cancelGeneration: (id) => post(`/generations/${id}/cancel`),
    listGenerations: () => call('/generations'),
    createPayment: (item, currency) => post('/payment/create', { item, currency }),
    paymentStatus: (orderId) => call(`/payment/status/${encodeURIComponent(orderId)}`),
    myPayments: () => call('/payments'),
    sandboxOrder: (orderId) => call(`/payment/sandbox/${encodeURIComponent(orderId)}`),
    completeSandbox: (orderId, outcome) => post(`/payment/sandbox/${encodeURIComponent(orderId)}/complete`, { outcome }),
    admin: {
      summary: () => call('/admin/summary'),
      payments: (q) => call('/admin/payments', { query: { ...q } }),
      refund: (id) => post(`/admin/payments/${id}/refund`),
      users: (q) => call('/admin/users', { query: q }),
      adjustCredits: async (id, delta, note) => { await post(`/admin/users/${id}/credits`, { delta, note }); },
    },
  };
}
