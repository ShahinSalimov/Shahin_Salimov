/**
 * Scanned content is untrusted. These helpers make it safe to store and show:
 * control characters, zero-width characters and bidirectional overrides
 * (used to disguise text) are removed and lengths are capped.
 * Extracted text is only ever treated as data — never as instructions.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[​-‍⁠﻿‪-‮⁦-⁩]/g;

export function stripUnsafe(s: string): string {
  return s.replace(CONTROL, "").replace(INVISIBLE, "");
}

/** Single-line value: unsafe characters removed, whitespace collapsed, length capped. */
export function cleanInline(s: string | null | undefined, max = 2000): string {
  if (!s) return "";
  const v = stripUnsafe(s).replace(/\s+/g, " ").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** Multi-line text: keeps line breaks, collapses blank lines and runs of spaces. */
export function cleanMultiline(s: string, max = 20_000): string {
  const v = stripUnsafe(s)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();
  return v.length > max ? v.slice(0, max) : v;
}
