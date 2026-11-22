import type { TKey } from '@/i18n';
import { ApiError } from '@/services/backend';

const KNOWN = new Set([
  'invalid_input', 'invalid_email', 'weak_password', 'email_taken', 'invalid_credentials', 'unauthorized', 'forbidden', 'not_found',
  'insufficient_credits', 'rate_limited', 'payments_disabled', 'signup_disabled', 'invalid_model', 'invalid_prompt', 'conflict',
  'server_error', 'network_error',
]);

/** Maps any thrown value to a translatable message key. */
export function errorKey(e: unknown): TKey {
  const code = e instanceof ApiError ? e.code : 'server_error';
  return `errors.${KNOWN.has(code) ? code : 'server_error'}` as TKey;
}
