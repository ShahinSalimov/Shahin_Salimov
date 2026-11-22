import type { LegalDoc } from '@/types';

export interface LegalSection { h: string; p: string[] }
export interface LegalText { intro: string; sections: LegalSection[] }
/** Placeholders: {brand} {owner} {email} {country} */
export type LegalContent = Record<LegalDoc, LegalText>;
