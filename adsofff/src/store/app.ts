import { create } from 'zustand';
import { db } from '../lib/db';
import { STANDALONE } from '../lib/edition';
import type { Brand, Campaign, CampaignInput, Concept } from '../lib/schemas';
import { newSeed, uid } from '../lib/engine/util';
import { createRemoteProvider, fetchAiStatus, localProvider, type AiStatus, type GenerationProvider } from '../lib/ai/provider';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AiSettings {
  /** User explicitly opted in to sending campaign data to the configured AI provider. */
  enabled: boolean;
  consentAt: number | null;
}

interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface AppState {
  ready: boolean;
  loadError: string | null;
  skippedRecords: number;
  campaigns: Campaign[];
  brands: Brand[];
  ai: AiSettings;
  aiStatus: AiStatus | null;
  saveState: SaveState;
  toasts: Toast[];

  init(): Promise<void>;
  refreshAiStatus(): Promise<AiStatus>;
  setAi(settings: AiSettings): Promise<void>;
  provider(): GenerationProvider;

  createCampaign(input: CampaignInput): Campaign;
  updateCampaign(id: string, fn: (c: Campaign) => Campaign): void;
  renameCampaign(id: string, name: string): void;
  duplicateCampaign(id: string): Campaign | null;
  deleteCampaign(id: string): Promise<void>;
  importData(campaigns: Campaign[], brands: Brand[]): Promise<{ campaigns: number; brands: number }>;
  addDemoCampaign(): Promise<Campaign>;

  saveBrand(brand: Brand): Promise<void>;
  deleteBrand(id: string): Promise<void>;
  clearAllData(): Promise<void>;

  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: string): void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, Campaign>();

function flushOne(id: string, set: (p: Partial<AppState>) => void) {
  const c = pending.get(id);
  pending.delete(id);
  timers.delete(id);
  if (!c) return;
  db.putCampaign(c)
    .then(() => {
      if (pending.size === 0) set({ saveState: 'saved' });
    })
    .catch(() => set({ saveState: 'error' }));
}

export function flushPendingSaves() {
  for (const [id, t] of timers) {
    clearTimeout(t);
    const c = pending.get(id);
    if (c) void db.putCampaign(c);
  }
  timers.clear();
  pending.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingSaves);
  window.addEventListener('beforeunload', flushPendingSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSaves();
  });
}

export const useApp = create<AppState>((set, get) => {
  const persistNow = (c: Campaign) => {
    set({ saveState: 'saving' });
    db.putCampaign(c)
      .then(() => {
        if (pending.size === 0) set({ saveState: 'saved' });
      })
      .catch(() => set({ saveState: 'error' }));
  };

  /**
   * Leading + trailing debounce: the first change is written immediately (so a
   * generated script survives an instant reload or tab close), and bursts of
   * edits such as typing are coalesced into one trailing write.
   */
  const persistSoon = (c: Campaign) => {
    const existing = timers.get(c.id);
    if (!existing) {
      persistNow(c);
      timers.set(
        c.id,
        setTimeout(() => flushOne(c.id, set), 250),
      );
      return;
    }
    pending.set(c.id, c);
    set({ saveState: 'saving' });
    clearTimeout(existing);
    timers.set(
      c.id,
      setTimeout(() => flushOne(c.id, set), 250),
    );
  };

  return {
    ready: false,
    loadError: null,
    skippedRecords: 0,
    campaigns: [],
    brands: [],
    ai: { enabled: false, consentAt: null },
    aiStatus: null,
    saveState: 'idle',
    toasts: [],

    async init() {
      if (get().ready) return;
      try {
        const [campaigns, brands, ai] = await Promise.all([db.listCampaigns(), db.listBrands(), db.getSetting<AiSettings>('ai')]);
        set({
          ready: true,
          campaigns: campaigns.items,
          brands: brands.items,
          skippedRecords: campaigns.skipped + brands.skipped,
          ai: ai && typeof ai.enabled === 'boolean' ? ai : { enabled: false, consentAt: null },
        });
      } catch (e) {
        set({ ready: true, loadError: e instanceof Error ? e.message : 'Could not open local storage.' });
      }
      void get().refreshAiStatus();
    },

    async refreshAiStatus() {
      // The offline single-file edition has no server to ask.
      const status = STANDALONE ? { enabled: false, reason: 'This offline edition has no AI server.' } : await fetchAiStatus();
      set({ aiStatus: status });
      return status;
    },

    async setAi(settings) {
      set({ ai: settings });
      await db.setSetting('ai', settings);
    },

    provider() {
      const { ai, aiStatus } = get();
      if (ai.enabled && ai.consentAt && aiStatus?.enabled) return createRemoteProvider(aiStatus);
      return localProvider;
    },

    createCampaign(input) {
      const now = Date.now();
      const campaign: Campaign = {
        id: uid('cmp_'),
        name: `${input.productName} · ${input.platform}`,
        createdAt: now,
        updatedAt: now,
        input,
        concepts: [],
        selectedConceptId: null,
        scenes: [],
        voiceover: null,
        social: null,
        storyboardStyle: 'Clean',
        generator: { engine: 'local' },
        seed: newSeed(),
      };
      set({ campaigns: [campaign, ...get().campaigns] });
      persistNow(campaign);
      return campaign;
    },

    updateCampaign(id, fn) {
      let updated: Campaign | null = null;
      set({
        campaigns: get().campaigns.map((c) => {
          if (c.id !== id) return c;
          updated = { ...fn(c), updatedAt: Date.now() };
          return updated;
        }),
      });
      if (updated) persistSoon(updated);
    },

    renameCampaign(id, name) {
      const clean = name.trim().slice(0, 120);
      if (!clean) return;
      get().updateCampaign(id, (c) => ({ ...c, name: clean }));
    },

    duplicateCampaign(id) {
      const source = get().campaigns.find((c) => c.id === id);
      if (!source) return null;
      const now = Date.now();
      const idMap = new Map<string, string>();
      const concepts: Concept[] = source.concepts.map((k) => {
        const nid = uid('c_');
        idMap.set(k.id, nid);
        return { ...k, id: nid };
      });
      const copy: Campaign = {
        ...structuredClone(source),
        id: uid('cmp_'),
        name: `${source.name} (copy)`.slice(0, 120),
        createdAt: now,
        updatedAt: now,
        concepts,
        selectedConceptId: source.selectedConceptId ? (idMap.get(source.selectedConceptId) ?? null) : null,
        scenes: source.scenes.map((s) => ({ ...s, id: uid('s_') })),
      };
      set({ campaigns: [copy, ...get().campaigns] });
      persistNow(copy);
      return copy;
    },

    async deleteCampaign(id) {
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
      pending.delete(id);
      set({ campaigns: get().campaigns.filter((c) => c.id !== id) });
      await db.deleteCampaign(id);
    },

    async importData(campaigns, brands) {
      const existingIds = new Set(get().campaigns.map((c) => c.id));
      const incoming = campaigns.map((c) => (existingIds.has(c.id) ? { ...c, id: uid('cmp_'), name: `${c.name} (imported)`.slice(0, 120) } : c));
      for (const c of incoming) await db.putCampaign(c);
      const brandIds = new Set(get().brands.map((b) => b.id));
      const incomingBrands = brands.map((b) => (brandIds.has(b.id) ? { ...b, id: uid('brd_') } : b));
      for (const b of incomingBrands) await db.putBrand(b);
      set({
        campaigns: [...incoming, ...get().campaigns].sort((a, b) => b.updatedAt - a.updatedAt),
        brands: [...get().brands, ...incomingBrands],
      });
      return { campaigns: incoming.length, brands: incomingBrands.length };
    },

    async addDemoCampaign() {
      const { buildDemoCampaign } = await import('../lib/demoCampaign');
      const demo = buildDemoCampaign();
      await get().importData([demo], []);
      return demo;
    },

    async saveBrand(brand) {
      await db.putBrand(brand);
      const exists = get().brands.some((b) => b.id === brand.id);
      set({ brands: exists ? get().brands.map((b) => (b.id === brand.id ? brand : b)) : [...get().brands, brand] });
    },

    async deleteBrand(id) {
      await db.deleteBrand(id);
      set({ brands: get().brands.filter((b) => b.id !== id) });
    },

    async clearAllData() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      pending.clear();
      await db.clearAll();
      set({ campaigns: [], brands: [], ai: { enabled: false, consentAt: null }, skippedRecords: 0, saveState: 'idle' });
    },

    toast(kind, message) {
      const id = uid('t_');
      set({ toasts: [...get().toasts, { id, kind, message }] });
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  };
});

export function useCampaign(id: string | undefined): Campaign | undefined {
  return useApp((s) => s.campaigns.find((c) => c.id === id));
}
