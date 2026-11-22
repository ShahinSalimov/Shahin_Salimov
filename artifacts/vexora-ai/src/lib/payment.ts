const LAST_ORDER = 'vx.lastOrder';

/** Order number from the gateway redirect (?order_id=…) or the one this tab just started. */
export function currentOrderId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('order_id');
  if (fromUrl) return fromUrl;
  try { return sessionStorage.getItem(LAST_ORDER); } catch { return null; }
}

export function rememberOrder(orderId: string) {
  try { sessionStorage.setItem(LAST_ORDER, orderId); } catch { /* ignore */ }
}

/** Gateway URLs are absolute; the in-browser demo returns a hash. */
export function goTo(url: string) {
  if (url.startsWith('#')) window.location.hash = url.slice(1);
  else window.location.assign(url);
}
