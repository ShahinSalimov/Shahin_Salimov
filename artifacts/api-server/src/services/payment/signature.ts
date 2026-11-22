import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const b64json = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
export const fromB64json = <T,>(s: string): T => JSON.parse(Buffer.from(s, 'base64').toString('utf8')) as T;

/** Epoint scheme: base64( sha1_raw( secret + data + secret ) ) */
export const epointSignature = (secret: string, data: string) => createHash('sha1').update(secret + data + secret).digest('base64');

/** Sandbox scheme: base64( hmac_sha256( secret, data ) ) */
export const hmacSignature = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "12.34" ↔ 1234 */
export const minorToDecimal = (minor: number) => (minor / 100).toFixed(2);
export const decimalToMinor = (v: unknown) => Math.round(Number(v) * 100);
