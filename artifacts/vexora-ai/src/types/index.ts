import type { AspectRatio, MediaKind } from '@workspace/vexora-core';

export type {
  AIModel, AspectRatio, BillingCycle, CheckoutItem, CreditPack, Currency, FeatureKey, GenerationDTO, GenerationParams,
  GenerationResult, JobStatus, MediaKind, Me, PaymentDTO, Plan, PlanFeature, PlanId, StyleId,
} from '@workspace/vexora-core';

export type CategoryId =
  | 'all' | 'ads' | 'portrait' | 'product' | 'cinematic' | 'fashion' | 'food' | 'architecture' | 'abstract';

export interface Category { id: CategoryId }

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

export const ROUTES = [
  'explore', 'create', 'pricing', 'profile', 'admin',
  'terms', 'privacy', 'refunds', 'delivery', 'contact',
  'payment-success', 'payment-failed', 'payment-sandbox',
] as const;
export type Route = (typeof ROUTES)[number];
export type LegalDoc = Extract<Route, 'terms' | 'privacy' | 'refunds' | 'delivery' | 'contact'>;
