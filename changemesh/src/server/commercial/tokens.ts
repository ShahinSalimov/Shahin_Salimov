import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 256-bit URL-safe random token (invitation links). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * API key format: cm_<8 lowercase alnum>_<43 char secret>.
 * The prefix is stored for display; only the SHA-256 of the full key is stored.
 */
export function newApiKey(): { key: string; prefix: string; hash: string } {
  const bytes = randomBytes(8);
  const id = Array.from(bytes, (b) => ALNUM[b % ALNUM.length]).join("");
  const prefix = `cm_${id}`;
  const key = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { key, prefix, hash: sha256Hex(key) };
}

export function looksLikeApiKey(value: string): boolean {
  return /^cm_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/.test(value);
}
