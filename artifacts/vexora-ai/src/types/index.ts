import type { Dict } from '@/i18n/types';

export type MediaKind = 'image' | 'video';

export type CategoryId =
  | 'all' | 'ads' | 'portrait' | 'product' | 'cinematic' | 'fashion' | 'food' | 'architecture' | 'abstract';

export interface Category { id: CategoryId }

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:4';

export interface ExploreItem {
  id: string;
  title: string;
  prompt: string;
  kind: MediaKind;
  category: Exclude<CategoryId, 'all'>;
  modelId: string;
  aspect: AspectRatio;
  author: string;
  likes: number;
  remixes: number;
  createdAt: string; // ISO
  seed: number;
  durationSec?: number;
  featured?: boolean;
}

export type SortMode = 'trending' | 'newest' | 'most-liked';

export interface ExploreFilters {
  query: string;
  category: CategoryId;
  kind: MediaKind | 'all';
  sort: SortMode;
}

export interface AIModel {
  id: string;
  name: string;
  kind: MediaKind;
  creditCost: number; // per output (per second for video)
  maxDuration?: number;
  badge?: 'new' | 'pro' | 'fast';
}

export type StyleId = keyof Dict['styles'];
export interface StylePreset { id: StyleId; suffix: string }

export interface GenerationParams {
  modelId: string;
  kind: MediaKind;
  prompt: string;
  negativePrompt: string;
  aspect: AspectRatio;
  styleId: StyleId;
  count: number;
  durationSec: number;
  seed: number | null;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface GenerationResult {
  id: string;
  jobId: string;
  kind: MediaKind;
  aspect: AspectRatio;
  seed: number;
  prompt: string;
  modelId: string;
  url?: string; // filled by real providers; mock renders synthetic art from seed
  createdAt: string;
}

export interface GenerationJob {
  id: string;
  params: GenerationParams;
  status: JobStatus;
  progress: number; // 0..1
  cost: number;
  results: GenerationResult[];
  /** i18n key under `gen.` */
  error?: 'cancelled' | 'failed';
}

export type BillingCycle = 'monthly' | 'yearly';
export type PlanId = 'free' | 'starter' | 'creator' | 'studio';

export interface Plan {
  id: PlanId;
  name: string;
  listMonthly: number;      // regular price (USD / month)
  monthly: number;          // discounted monthly price
  yearlyPerMonth: number;   // discounted price per month when billed yearly
  creditsPerMonth: number;
  features: PlanFeature[];
  highlight?: boolean;
}

export type FeatureKey = keyof Dict['features'];
export interface PlanFeature { key: FeatureKey; vars?: Record<string, number> }

export interface CreditPack { id: string; credits: number; listPrice: number; price: number; bonus?: number }

export type CheckoutItem =
  | { type: 'plan'; planId: PlanId; cycle: BillingCycle }
  | { type: 'pack'; packId: string };

export type Route = 'explore' | 'create' | 'pricing' | 'profile';
