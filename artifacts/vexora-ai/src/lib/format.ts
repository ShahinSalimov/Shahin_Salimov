export const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
export const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
export const percentOff = (list: number, price: number) => (list > 0 ? Math.round((1 - price / list) * 100) : 0);
export const aspectToRatio = (a: string) => { const [w, h] = a.split(':').map(Number); return w / h; };
