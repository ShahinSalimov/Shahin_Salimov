import type { Locale } from '@/i18n';
import type { LegalContent } from './types';
import { en } from './en';
import { az } from './az';
import { tr } from './tr';
import { ru } from './ru';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';

export const LEGAL: Record<Locale, LegalContent> = { en, az, tr, ru, de, es, fr };
