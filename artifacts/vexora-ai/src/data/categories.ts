import type { Category } from '@/types';

/** Labels live in i18n under `categories.<id>`. */
export const CATEGORIES: Category[] = (
  ['all', 'ads', 'product', 'portrait', 'cinematic', 'fashion', 'food', 'architecture', 'abstract'] as const
).map((id) => ({ id }));
