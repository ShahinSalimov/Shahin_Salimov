import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/db.js";
import * as A from "../src/access.js";
import { similarity, isDuplicate, dueSlots, nextSlot, pickPillars } from "../src/ideas.js";
import { offlineIdeas } from "../src/ai/fallback.js";
import { PILLARS } from "../src/ai/prompts.js";
import { suggestForAd } from "../src/proq.js";

const tmpStore = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), "rp-")));
const DEV1 = "device_aaaaaaaaaaaaaaaa";
const DEV2 = "device_bbbbbbbbbbbbbbbb";
const DEV3 = "device_cccccccccccccccc";
const H = 3600_000;

test("trial: activation starts the clock on first open, not on creation", () => {
  const s = tmpStore();
  const { account, token } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  assert.equal(account.status, "pending");
  const t0 = Date.parse("2026-11-20T10:00:00Z");
  assert.ok(A.enterAccount(s, A.findByToken(s, token), DEV1, {}, t0).ok);
  assert.equal(account.status, "active");
  assert.equal(Date.parse(account.expiresAt) - t0, 72 * H);
});

test("trial: blocks after 72h and cannot be re-activated", () => {
  const s = tmpStore();
  const { account, token } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  const t0 = Date.now();
  A.enterAccount(s, account, DEV1, {}, t0);
  const cookie = A.createSession(s, account.id, DEV1, "secret".repeat(8));
  assert.ok(A.authorize(s, cookie, DEV1, "secret".repeat(8), "trial", t0 + 71 * H).ok);
  const r = A.authorize(s, cookie, DEV1, "secret".repeat(8), "trial", t0 + 72 * H + 1);
  assert.equal(r.ok, false);
  assert.equal(r.http, 423);
  assert.equal(account.status, "expired");
  // re-entering the same link (cookie cleared, new browser) stays blocked
  const again = A.enterAccount(s, A.findByToken(s, token), DEV2, {}, t0 + 100 * H);
  assert.equal(again.code, "expired");
});

test("trial: device limit stops link sharing", () => {
  const s = tmpStore();
  const { account } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  assert.ok(A.enterAccount(s, account, DEV1).ok);
  assert.ok(A.enterAccount(s, account, DEV2).ok);
  assert.equal(A.enterAccount(s, account, DEV3).code, "device_limit");
  assert.ok(A.enterAccount(s, account, DEV1).ok, "known device can come back");
});

test("sessions: forged or tampered cookies are rejected", () => {
  const s = tmpStore();
  const { account } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  A.enterAccount(s, account, DEV1);
  const secret = "k".repeat(40);
  const c = A.createSession(s, account.id, DEV1, secret);
  assert.ok(A.authorize(s, c, DEV1, secret, "trial").ok);
  assert.equal(A.authorize(s, c + "x", DEV1, secret, "trial").ok, false);
  assert.equal(A.authorize(s, c, DEV1, "z".repeat(40), "trial").ok, false);
  assert.equal(A.authorize(s, c, DEV2, secret, "trial").code, "device_mismatch");
});

test("editions are isolated: a trial session is refused by the full server", () => {
  const s = tmpStore();
  const { account } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  A.enterAccount(s, account, DEV1);
  const secret = "k".repeat(40);
  const c = A.createSession(s, account.id, DEV1, secret);
  assert.equal(A.authorize(s, c, DEV1, secret, "full").code, "wrong_edition");
});

test("license keys: normalized lookup, no expiry", () => {
  const s = tmpStore();
  const { key, account } = A.createLicense(s, { label: "y", maxDevices: 3 });
  assert.match(key, /^SA-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}$/);
  assert.equal(A.findByKey(s, key.toLowerCase().replaceAll("-", " ")).id, account.id);
  assert.ok(A.enterAccount(s, account, DEV1).ok);
  assert.equal(account.expiresAt, null);
  assert.equal(A.refreshStatus(account, Date.now() + 10000 * H), "active");
});

test("tokens are stored only as hashes", () => {
  const s = tmpStore();
  const { token } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  s.flush();
  assert.ok(!fs.readFileSync(s.file, "utf8").includes(token));
});

test("trial daily quota", () => {
  const s = tmpStore();
  const { account } = A.createTrial(s, { label: "x", hours: 72, maxDevices: 2 });
  const now = Date.now();
  assert.ok(A.takeQuota(account, "ads", 2, "Asia/Baku", now));
  assert.ok(A.takeQuota(account, "ads", 2, "Asia/Baku", now));
  assert.equal(A.takeQuota(account, "ads", 2, "Asia/Baku", now), false);
});

test("duplicate filter catches reworded repeats", () => {
  assert.ok(similarity("POV: ayaq günüdür və pilləkən var", "POV: ayaq günündən sonra pilləkən") > 0.3);
  assert.ok(isDuplicate("60 saniyədə maksimum şınaq çağırışı", ["60 saniyədə maksimum şınaq"]));
  assert.equal(isDuplicate("Ana: bir az da ye", ["60 saniyədə maksimum şınaq"]), false);
});

test("slots follow Asia/Baku time (UTC+4)", () => {
  const slots = ["09:00", "13:00", "19:00"];
  const at = (utc) => Date.parse(`2026-11-20T${utc}:00Z`);
  assert.deepEqual(dueSlots(slots, "Asia/Baku", at("04:30")), []); // 08:30 Baku
  assert.deepEqual(dueSlots(slots, "Asia/Baku", at("05:00")), [0]); // 09:00
  assert.deepEqual(dueSlots(slots, "Asia/Baku", at("16:00")), [0, 1, 2]); // 20:00
  assert.deepEqual(nextSlot(slots, "Asia/Baku", at("16:00")), { index: 0, time: "09:00", tomorrow: true });
});

test("pillar rotation drops pillars the user keeps skipping", () => {
  const acc = { pillarCursor: 0 };
  const ideas = Array.from({ length: 4 }, () => ({ pillarId: "qa", status: "skipped" }));
  const picked = [...pickPillars(acc, 3, ideas), ...pickPillars(acc, 3, ideas), ...pickPillars(acc, 3, ideas)];
  assert.ok(!picked.some((p) => p.id === "qa"));
});

test("offline generator is persona-aware and respects exclusions", () => {
  const ideas = offlineIdeas({ profile: { sport: "boks" }, pillars: PILLARS.slice(0, 3), seed: 7 });
  assert.equal(ideas.length, 3);
  for (const i of ideas) {
    assert.ok(i.hook.text && i.shots.length >= 3 && i.caption);
    assert.equal(i.shots[0].t, "0-3s");
  }
  const again = offlineIdeas({ profile: {}, pillars: [PILLARS[0]], seed: 7, exclude: () => true });
  assert.equal(again.length, 0);
});

test("proq: pricing and contract tools suggested from brief", () => {
  const s = suggestForAd({ transcript: "Brend müqavilə göndərəcək, ödəniş 500 manat, 25 noyabra qədər", brief: { requirements: [] }, proqHints: [] });
  const ids = s.map((x) => x.id);
  assert.ok(ids.includes("teleprompter") && ids.includes("pricing") && ids.includes("contract") && ids.includes("calendar"));
});
