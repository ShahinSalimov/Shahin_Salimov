/** Locale-independent helpers. Locale-aware money/number formatting lives in useI18n().fmt. */
export const percentOff = (list: number, price: number) => (list > 0 ? Math.round((1 - price / list) * 100) : 0);
export const aspectToRatio = (a: string) => { const [w, h] = a.split(':').map(Number); return w / h; };
