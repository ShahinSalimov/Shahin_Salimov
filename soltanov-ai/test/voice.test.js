import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ANTHROPIC_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.EDITION = "trial";
const { routeOffline, addWish } = await import("../src/voice.js");
const { topicFrom } = await import("../src/ai/fallback.js");
const { profileBlock } = await import("../src/ai/prompts.js");
const { createApp } = await import("../src/server.js");
const { Store } = await import("../src/db.js");

test("voice router: each spoken request reaches the right feature", () => {
  const cases = [
    ["Mənə idman zalı ilə bağlı 5 reels ideyası hazırla", "ideas"],
    ["Nike brendi yeni krossovka reklamı istəyir", "ad"],
    ["Axşam ideyalarını dəyiş", "refresh"],
    ["Bundan sonra daha çox yumor olsun", "profile"],
    ["Bu reklamın qiymətini hesabla", "tool"],
    ["Teleprompteri aç", "tool"],
  ];
  for (const [text, intent] of cases) assert.equal(routeOffline(text).intent, intent, text);
  assert.equal(routeOffline("Mənə 5 ideya ver").count, 5);
  assert.equal(routeOffline("Axşam ideyalarını dəyiş").slot, "evening");
});

test("topic extraction strips filler words (Azerbaijani letters safe)", () => {
  assert.equal(topicFrom("Mənə idman zalı ilə bağlı reels ideyaları hazırla"), "idman zalı");
});

test("wishes persist into every future prompt", () => {
  const acc = { profile: { sport: "fitness" } };
  addWish(acc, "Daha çox yumor olsun");
  addWish(acc, "Daha çox yumor olsun");
  assert.equal(acc.profile.wishes, "Daha çox yumor olsun");
  assert.match(profileBlock(acc.profile), /daimi istəkləri.*Daha çox yumor/);
});

test("HTTP: voice command -> custom ideas, profile wish, tool", async () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "sa-voice-")));
  const server = http.createServer(createApp({ store, secret: "s".repeat(40), adminToken: "admin-token-123456" }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (method, url, body, extra = {}) => {
    const res = await fetch(base + url, { method, headers: { "content-type": "application/json", "x-device-id": "device_aaaaaaaaaaaaaaaa", cookie, ...extra }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try {
    const link = (await call("POST", "/api/admin/trials", { label: "Şükran" }, { authorization: "Bearer admin-token-123456" })).json.link;
    await call("POST", "/api/enter", { token: link.split("/t/")[1], deviceId: "device_aaaaaaaaaaaaaaaa" });
    await call("PUT", "/api/profile", { sport: "fitness" });

    const ideas = await call("POST", "/api/voice/command", { text: "Mənə idman zalı ilə bağlı reels ideyaları hazırla", context: "today" });
    assert.equal(ideas.status, 200);
    assert.equal(ideas.json.intent, "ideas");
    assert.ok(ideas.json.ideas.length >= 1);
    assert.ok(ideas.json.ideas.every((i) => i.slotIndex === -1 && i.request));
    const today = await call("GET", "/api/ideas");
    assert.ok(today.json.ideas.some((i) => i.slotIndex === -1), "custom ideas appear in today's list");

    const wish = await call("POST", "/api/voice/command", { text: "Bundan sonra daha çox yumor olsun" });
    assert.equal(wish.json.intent, "profile");
    assert.match(wish.json.account.profile.wishes, /yumor/);

    const tool = await call("POST", "/api/voice/command", { text: "Teleprompteri aç" });
    assert.deepEqual([tool.json.intent, tool.json.tool], ["tool", "teleprompter"]);

    const ad = await call("POST", "/api/voice/command", { text: "FitBar brendi protein barı üçün reklam istəyir, ödəniş 300 manat" });
    assert.equal(ad.json.intent, "ad");
    assert.equal(ad.json.ad.scripts.length, 5);
  } finally {
    server.close();
  }
});
