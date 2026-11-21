import type { Locale } from '../config';
import type { Dict } from '../types';
import { en } from './en';
import { az } from './az';
import { tr } from './tr';
import { ru } from './ru';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';

export const DICTS: Record<Locale, Dict> = { en, az, tr, ru, de, es, fr };
