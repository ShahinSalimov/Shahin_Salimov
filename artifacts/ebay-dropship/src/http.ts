export class HttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, url: string) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 500)}`);
    this.status = status;
    this.body = body;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch + JSON with retries on 429/5xx/network errors. */
export async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  retries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, init);
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new HttpError(res.status, text, url);
      } else if (!res.ok) {
        throw new HttpError(res.status, text, url);
      } else {
        return (text ? JSON.parse(text) : {}) as T;
      }
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
    }
    if (attempt < retries) await sleep(500 * 2 ** attempt);
  }
  throw lastErr;
}
