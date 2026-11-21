export const LOCALES = {
  en: { label: 'English', intl: 'en-US' },
  az: { label: 'Azərbaycan', intl: 'az-AZ' },
  tr: { label: 'Türkçe', intl: 'tr-TR' },
  ru: { label: 'Русский', intl: 'ru-RU' },
  de: { label: 'Deutsch', intl: 'de-DE' },
  es: { label: 'Español', intl: 'es-ES' },
  fr: { label: 'Français', intl: 'fr-FR' },
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = 'en';
export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && v in LOCALES;
