import crypto from "node:crypto";
import { config } from "./config.js";
import { PILLARS, SYSTEM_IDEAS, IDEA_SCHEMA, ideasUserPrompt } from "./ai/prompts.js";
import { offlineIdeas } from "./ai/fallback.js";
import { aiEnabled, generateJSON } from "./ai/claude.js";
import { dayKey } from "./access.js";

// ---------- time helpers (timezone-aware, server clock) ----------

export function localClock(tz, now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: dayKey(tz, now), minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10) };
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Slot indexes whose time has passed today. */
export function dueSlots(slots, tz, now = Date.now()) {
  const { minutes } = localClock(tz, now);
  return slots.map((s, i) => (toMin(s) <= minutes ? i : -1)).filter((i) => i >= 0);
}

export function nextSlot(slots, tz, now = Date.now()) {
  const { minutes } = localClock(tz, now);
  const i = slots.findIndex((s) => toMin(s) > minutes);
  return i === -1 ? { index: 0, time: slots[0], tomorrow: true } : { index: i, time: slots[i], tomorrow: false };
}

// ---------- duplicate protection ----------

const STOP = new Set(["və", "ilə", "bu", "bir", "üçün", "the", "vs", "pov", "mən", "sən", "nə", "ki", "da", "də"]);

export function tokens(s) {
  return new Set(
    String(s)
      .toLocaleLowerCase("az")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export function isDuplicate(title, previousTitles, threshold = 0.5) {
  return previousTitles.some((t) => similarity(title, t) >= threshold);
}

// ---------- pillar rotation with feedback ----------

export function pickPillars(acc, count, ideas) {
  const stats = {};
  for (const i of ideas.slice(-90)) {
    const s = (stats[i.pillarId] ||= { skipped: 0, used: 0 });
    if (i.status === "skipped") s.skipped++;
    if (i.status === "shot" || i.status === "posted" || i.status === "saved") s.used++;
  }
  const weak = (p) => (stats[p.id]?.skipped || 0) >= 3 && (stats[p.id]?.used || 0) === 0;
  const pool = PILLARS.filter((p) => !weak(p));
  const list = pool.length >= count ? pool : PILLARS;
  const out = [];
  let c = acc.pillarCursor || 0;
  while (out.length < count) {
    out.push(list[c % list.length]);
    c++;
  }
  acc.pillarCursor = c;
  return out;
}

// ---------- generation ----------

const locks = new Map();

export async function generateSlot(store, acc, { date, slotIndex, force = false }) {
  const key = `${acc.id}:${date}:${slotIndex}`;
  if (locks.has(key)) return locks.get(key);
  const job = (async () => {
    const list = store.ideasOf(acc.id);
    const existing = list.filter((i) => i.date === date && i.slotIndex === slotIndex && !i.replaced);
    if (existing.length && !force) return existing;
    if (force) existing.forEach((i) => (i.replaced = true));

    const pillars = pickPillars(acc, config.ideasPerSlot, list);
    const prevTitles = list.slice(-120).map((i) => i.title);
    const skippedHints = list.filter((i) => i.status === "skipped").slice(-8).map((i) => i.title);

    let raw = [];
    let source = "offline";
    if (aiEnabled()) {
      try {
        const { data } = await generateJSON({
          system: SYSTEM_IDEAS,
          user: ideasUserPrompt({
            profile: acc.profile,
            count: pillars.length,
            slotIndex,
            pillars,
            avoidTitles: prevTitles.slice(-60),
            skippedHints,
            dateLabel: date,
          }),
          schema: IDEA_SCHEMA,
        });
        raw = (data.ideas || []).filter((i) => !isDuplicate(i.title, prevTitles));
        source = "ai";
      } catch (e) {
        store.log("ai.error", { accountId: acc.id, scope: "ideas", message: String(e.message).slice(0, 200) });
      }
    }
    // Top up with offline ideas if AI is off, failed, or returned duplicates.
    if (raw.length < pillars.length) {
      const missing = pillars.slice(raw.length);
      const taken = [...prevTitles, ...raw.map((r) => r.title)];
      raw.push(...offlineIdeas({ profile: acc.profile, pillars: missing, seed: hashSeed(key + Date.now()), exclude: (t) => isDuplicate(t, taken) }));
    }

    const created = raw.slice(0, pillars.length).map((r, idx) => ({
      id: "idea_" + crypto.randomBytes(6).toString("base64url"),
      accountId: acc.id,
      date,
      slotIndex,
      slotTime: config.slots[slotIndex],
      createdAt: new Date().toISOString(),
      status: "new",
      pillarId: pillars[idx]?.id,
      source: r.offline ? "offline" : source,
      ...r,
    }));
    list.push(...created);
    if (list.length > 1500) list.splice(0, list.length - 1500);
    acc.usage.ideasGenerated += created.length;
    store.log("ideas.generated", { accountId: acc.id, date, slotIndex, count: created.length, source });
    store.save();
    return created;
  })().finally(() => locks.delete(key));
  locks.set(key, job);
  return job;
}

function hashSeed(s) {
  return parseInt(crypto.createHash("md5").update(s).digest("hex").slice(0, 8), 16);
}

/**
 * Make sure every due slot of today exists. If the account has never received ideas,
 * deliver one slot immediately so a fresh trial is never empty.
 */
export async function ensureToday(store, acc, now = Date.now()) {
  const { date } = localClock(config.timezone, now);
  const due = dueSlots(config.slots, config.timezone, now);
  const list = store.ideasOf(acc.id);
  if (!due.length && !list.length) due.push(0);
  const missing = due.filter((slotIndex) => !list.some((i) => i.date === date && i.slotIndex === slotIndex));
  const results = await Promise.all(missing.map((slotIndex) => generateSlot(store, acc, { date, slotIndex })));
  return { date, fresh: results.flat() };
}
