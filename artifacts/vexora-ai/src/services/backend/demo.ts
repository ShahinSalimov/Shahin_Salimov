import {
  CURRENCIES, ECONOMICS, FREE_PLAN_CREDITS, MODELS, adCreditsPerView, economicsTable, estimateCost, findModel, netCreditUsd, normaliseParams, quote,
  type AdStatus,
  type AdminUser, type CheckoutItem, type GenerationDTO, type GenerationResult, type Me, type PaymentDTO, type PlanId, type BillingCycle, type Role,
} from '@workspace/vexora-core';
import type { Backend } from './types';
import { ApiError } from './types';

/**
 * In-browser stand-in for the API server, used by the static demo build (VITE_BACKEND=demo).
 * Mirrors the server's rules (prices, costs, idempotent payments) but stores everything in this
 * browser only. It is NOT secure and must never take real payments.
 */
interface DemoUser { id: string; email: string; name: string; passHash: string; role: Role; planId: PlanId; billingCycle: BillingCycle | null; createdAt: string }
interface Entry { userId: string; delta: number; reason: string; refId?: string; bucket?: 'paid' | 'free' }
interface DemoGen extends GenerationDTO { userId: string; finishAt: number }
interface State { users: DemoUser[]; session: string | null; ledger: Entry[]; payments: PaymentDTO[]; gens: DemoGen[]; ads?: { userId: string; at: number }[]; uploads?: Record<string, string> }

const KEY = 'vx.demo.v1';
let memory: State | null = null;

function load(): State {
  if (memory) return memory;
  try { const s = localStorage.getItem(KEY); if (s) return (memory = JSON.parse(s) as State); } catch { /* storage unavailable */ }
  return (memory = { users: [], session: null, ledger: [], payments: [], gens: [] });
}
function save(s: State) { memory = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keep in memory */ } }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
async function hash(s: string) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return s.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7).toString(16); }
}
const bucketSum = (s: State, userId: string, b: 'paid' | 'free') => s.ledger.filter((e) => e.userId === userId && (e.bucket ?? 'paid') === b).reduce((a, e) => a + e.delta, 0);
const balance = (s: State, userId: string) => bucketSum(s, userId, 'paid') + bucketSum(s, userId, 'free');
const toMe = (s: State, u: DemoUser): Me => ({
  id: u.id, email: u.email, name: u.name, role: u.role, planId: u.planId, billingCycle: u.billingCycle,
  balance: balance(s, u.id), paidBalance: bucketSum(s, u.id, 'paid'), freeBalance: bucketSum(s, u.id, 'free'),
});
const DAY = 864e5;
function adStatus(s: State, userId: string): AdStatus {
  const mine = (s.ads ?? []).filter((a) => a.userId === userId);
  const earned = mine.length * adCreditsPerView(MODELS);
  return {
    enabled: true, dailyCap: 10, viewsToday: mine.filter((a) => a.at > Date.now() - (Date.now() % DAY)).length,
    creditsPerView: adCreditsPerView(MODELS), nextCreditProgress: earned - Math.floor(earned), minWatchSeconds: 5,
  };
}
const strip = ({ userId: _u, finishAt: _f, ...dto }: DemoGen): GenerationDTO => dto;

function current(s: State): DemoUser {
  const u = s.users.find((x) => x.id === s.session);
  if (!u) throw new ApiError('unauthorized', 401);
  return u;
}
function admin(s: State) { const u = current(s); if (u.role !== 'admin') throw new ApiError('forbidden', 403); return u; }

function refresh(s: State, g: DemoGen): DemoGen {
  if (g.status !== 'running') return g;
  const now = Date.now();
  const start = Date.parse(g.createdAt);
  if (now < g.finishAt) { g.progress = Math.min(0.99, (now - start) / (g.finishAt - start)); return g; }
  const n = g.params.kind === 'video' ? 1 : g.params.count;
  const base = g.params.seed ?? Math.floor(Math.random() * 2 ** 31);
  g.results = Array.from({ length: n }, (_, k): GenerationResult => ({ id: uid(), kind: g.params.kind, aspect: g.params.aspect, seed: (base + k * 7919) % 2 ** 31, url: null }));
  g.status = 'done'; g.progress = 1;
  save(s);
  return g;
}

function markPaid(s: State, p: PaymentDTO) {
  if (p.status !== 'pending') return;
  p.status = 'paid'; p.paidAt = new Date().toISOString();
  s.ledger.push({ userId: p.userId, delta: p.credits, reason: 'purchase', refId: p.id, bucket: 'paid' });
  const item = p.item as CheckoutItem;
  if (item.type === 'plan') { const u = s.users.find((x) => x.id === p.userId)!; u.planId = item.planId; u.billingCycle = item.cycle; }
}

export function createDemoBackend(): Backend {
  return {
    kind: 'demo',
    async config() {
      return {
        paymentsEnabled: true, paymentMode: 'sandbox', paymentGateway: 'sandbox', chargeCurrency: 'AZN',
        signupEnabled: true, signupCredits: FREE_PLAN_CREDITS, currencies: [...CURRENCIES],
      };
    },
    async me() { const s = load(); const u = s.users.find((x) => x.id === s.session); return u ? toMe(s, u) : null; },
    async register({ email, password, name }) {
      await wait();
      const s = load();
      const e = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new ApiError('invalid_email', 400);
      if (password.length < 8) throw new ApiError('weak_password', 400);
      if (s.users.some((u) => u.email === e)) throw new ApiError('email_taken', 409);
      const u: DemoUser = {
        id: uid(), email: e, name: name?.trim() || e.split('@')[0], passHash: await hash(`${e}:${password}`),
        role: s.users.length === 0 ? 'admin' : 'user', planId: 'free', billingCycle: null, createdAt: new Date().toISOString(),
      };
      s.users.push(u); s.ledger.push({ userId: u.id, delta: FREE_PLAN_CREDITS, reason: 'signup_bonus', bucket: 'free' }); s.session = u.id;
      save(s);
      return toMe(s, u);
    },
    async login({ email, password }) {
      await wait();
      const s = load();
      const e = email.trim().toLowerCase();
      const u = s.users.find((x) => x.email === e);
      if (!u || u.passHash !== (await hash(`${e}:${password}`))) throw new ApiError('invalid_credentials', 401);
      s.session = u.id; save(s);
      return toMe(s, u);
    },
    async logout() { const s = load(); s.session = null; save(s); },

    async createGeneration(params) {
      const s = load(); const u = current(s);
      const n = normaliseParams(params);
      if (!n.ok) throw new ApiError(n.error, 400);
      const cost = estimateCost(n.params);
      const free = findModel(n.params.modelId)?.freeCredits ? Math.max(0, Math.min(bucketSum(s, u.id, 'free'), cost)) : 0;
      if (bucketSum(s, u.id, 'paid') < cost - free) throw new ApiError('insufficient_credits', 402);
      const g: DemoGen = {
        id: uid(), userId: u.id, params: n.params, status: 'running', progress: 0, cost, results: [], error: null,
        createdAt: new Date().toISOString(), finishAt: Date.now() + (n.params.kind === 'video' ? 3500 : 2000),
      };
      s.gens.unshift(g); s.gens = s.gens.slice(0, 80);
      if (free) s.ledger.push({ userId: u.id, delta: -free, reason: 'generation', refId: g.id, bucket: 'free' });
      if (cost - free) s.ledger.push({ userId: u.id, delta: -(cost - free), reason: 'generation', refId: g.id, bucket: 'paid' });
      save(s);
      return strip(g);
    },
    async getGeneration(id) {
      const s = load(); const u = current(s);
      const g = s.gens.find((x) => x.id === id && x.userId === u.id);
      if (!g) throw new ApiError('not_found', 404);
      return strip(refresh(s, g));
    },
    async cancelGeneration(id) {
      const s = load(); const u = current(s);
      const g = s.gens.find((x) => x.id === id && x.userId === u.id);
      if (!g || g.status !== 'running') throw new ApiError('conflict', 409);
      g.status = 'cancelled'; g.error = 'cancelled';
      for (const e of s.ledger.filter((x) => x.refId === g.id && x.reason === 'generation')) s.ledger.push({ ...e, delta: -e.delta, reason: 'generation_refund' });
      save(s);
      return strip(g);
    },
    async listGenerations() {
      const s = load(); const u = current(s);
      const items = s.gens.filter((g) => g.userId === u.id).map((g) => strip(refresh(s, g)));
      return { items, total: items.length };
    },

    async createPayment(item) {
      await wait(250);
      const s = load(); const u = current(s);
      // Mirrors local AZ gateways: always charged in AZN.
      const q = quote(item, 'AZN');
      if (!q) throw new ApiError('invalid_input', 400);
      const orderId = `VX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const p: PaymentDTO = {
        id: uid(), orderId, livemode: false, userId: u.id, provider: 'sandbox', item, currency: 'AZN', amountMinor: q.amountMinor, credits: q.credits,
        status: 'pending', createdAt: new Date().toISOString(), paidAt: null, refundedAt: null,
      };
      s.payments.unshift(p); save(s);
      return { orderId, checkoutUrl: '#payment-sandbox', payment: p };
    },
    async paymentStatus(orderId) {
      const s = load(); const u = current(s);
      const p = s.payments.find((x) => x.orderId === orderId && (x.userId === u.id || u.role === 'admin'));
      if (!p) throw new ApiError('not_found', 404);
      return p;
    },
    async sandboxOrder(orderId) {
      const p = await this.paymentStatus(orderId);
      return { orderId, amountMinor: p.amountMinor, currency: p.currency, description: 'Vexora AI', merchant: 'Vexora AI', status: p.status };
    },
    async completeSandbox(orderId, outcome) {
      await wait(700);
      const s = load(); const u = current(s);
      const p = s.payments.find((x) => x.orderId === orderId && x.userId === u.id);
      if (!p) throw new ApiError('not_found', 404);
      if (outcome === 'success') markPaid(s, p); else if (p.status === 'pending') p.status = 'failed';
      save(s);
      return { redirectUrl: outcome === 'success' ? '#payment-success' : '#payment-failed' };
    },
    async myPayments() {
      const s = load(); const u = current(s);
      const items = s.payments.filter((p) => p.userId === u.id);
      return { items, total: items.length };
    },

    async upload(dataUrl) {
      const s = load(); current(s);
      const key = `${uid().replace(/-/g, '').slice(0, 24)}.png`;
      s.uploads = { ...(s.uploads ?? {}), [key]: dataUrl }; save(s);
      return { key, url: dataUrl };
    },
    ads: {
      async status() { const s = load(); return adStatus(s, current(s).id); },
      async start() {
        const s = load(); const u = current(s);
        if (adStatus(s, u.id).viewsToday >= 10) throw new ApiError('rate_limited', 429);
        return { viewId: uid() };
      },
      async complete() {
        const s = load(); const u = current(s);
        const before = Math.floor((s.ads ?? []).filter((a) => a.userId === u.id).length * adCreditsPerView(MODELS));
        s.ads = [...(s.ads ?? []), { userId: u.id, at: Date.now() }];
        const after = Math.floor(s.ads.filter((a) => a.userId === u.id).length * adCreditsPerView(MODELS));
        if (after > before) s.ledger.push({ userId: u.id, delta: after - before, reason: 'ad_reward', bucket: 'free' });
        save(s);
        return { granted: after - before, status: adStatus(s, u.id) };
      },
    },
    admin: {
      async economics() {
        const s = load(); admin(s);
        const views = (s.ads ?? []).length;
        const revenueUsd = s.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + (p.amountMinor / 100) * (ECONOMICS.chargeFx[p.currency] ?? 0), 0);
        const aiCostUsd = 0;
        const fees = revenueUsd * ECONOMICS.gatewayFee; const tax = revenueUsd * ECONOMICS.taxRate; const adRev = views * ECONOMICS.adRevenuePerViewUsd;
        return {
          netCreditUsd: netCreditUsd(), targetMargin: ECONOMICS.targetMargin, gatewayFee: ECONOMICS.gatewayFee, taxRate: ECONOMICS.taxRate,
          adRevenuePerViewUsd: ECONOMICS.adRevenuePerViewUsd, table: economicsTable(MODELS),
          last30d: {
            revenueUsd, gatewayFeesUsd: fees, taxUsd: tax, aiCostUsd, adViews: views, adRevenueUsd: adRev,
            adCreditsGranted: s.ledger.filter((e) => e.reason === 'ad_reward').reduce((a, e) => a + e.delta, 0), fixedCostsUsd: 0,
            profitUsd: revenueUsd - fees - tax - aiCostUsd + adRev,
          },
        };
      },
      async summary() {
        const s = load(); admin(s);
        const totals = CURRENCIES.map((currency) => {
          const paid = s.payments.filter((p) => p.currency === currency && p.status === 'paid');
          const ref = s.payments.filter((p) => p.currency === currency && p.status === 'refunded');
          const net = paid.reduce((a, p) => a + p.amountMinor, 0);
          const refunded = ref.reduce((a, p) => a + p.amountMinor, 0);
          return { currency, grossMinor: net + refunded, refundedMinor: refunded, netMinor: net, paidCount: paid.length, refundedCount: ref.length };
        });
        return {
          mode: 'sandbox' as const, totals, users: s.users.length, payingUsers: new Set(s.payments.filter((p) => p.status === 'paid').map((p) => p.userId)).size,
          generations: s.gens.length, creditsSpent: -s.ledger.filter((e) => e.reason.startsWith('generation')).reduce((a, e) => a + e.delta, 0),
          pendingPayments: s.payments.filter((p) => p.status === 'pending').length,
        };
      },
      async payments(q) {
        const s = load(); admin(s);
        const email = (id: string) => s.users.find((u) => u.id === id)?.email ?? '';
        let items = s.payments.map((p) => ({ ...p, userEmail: email(p.userId) }));
        if (q.status) items = items.filter((p) => p.status === q.status);
        if (q.currency) items = items.filter((p) => p.currency === q.currency);
        if (q.q) items = items.filter((p) => p.userEmail.includes(q.q!.toLowerCase()));
        const offset = q.offset ?? 0;
        return { items: items.slice(offset, offset + (q.limit ?? 25)), total: items.length };
      },
      async refund(id, force) {
        const s = load(); admin(s);
        const p = s.payments.find((x) => x.id === id);
        if (!p) throw new ApiError('not_found', 404);
        if (p.status !== 'paid') throw new ApiError('conflict', 409);
        if (!force && bucketSum(s, p.userId, 'paid') < p.credits) throw new ApiError('credits_used', 409);
        p.status = 'refunded'; p.refundedAt = new Date().toISOString();
        s.ledger.push({ userId: p.userId, delta: -p.credits, reason: 'payment_refund', refId: p.id, bucket: 'paid' });
        if ((p.item as CheckoutItem).type === 'plan') { const u = s.users.find((x) => x.id === p.userId)!; u.planId = 'free'; u.billingCycle = null; }
        save(s);
        return p;
      },
      async users(q) {
        const s = load(); admin(s);
        let list = s.users;
        if (q.q) list = list.filter((u) => u.email.includes(q.q!.toLowerCase()));
        const items: AdminUser[] = list.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, planId: u.planId, balance: balance(s, u.id), createdAt: u.createdAt }));
        return { items, total: items.length };
      },
      async adjustCredits(userId, delta, note) {
        const s = load(); const a = admin(s);
        if (!s.users.some((u) => u.id === userId)) throw new ApiError('not_found', 404);
        s.ledger.push({ userId, delta, reason: 'admin_adjust', refId: a.id + (note ? `:${note}` : ''), bucket: 'paid' });
        save(s);
      },
    },
  };
}
