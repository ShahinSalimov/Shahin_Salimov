const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string | null | undefined, now: Date = new Date(), locale = "en"): string {
  if (!iso) return "—";
  const diff = (Date.parse(iso) - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}

export function formatDateTime(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
}

export function formatDate(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? fallback).slice(0, 2)).toUpperCase();
}
