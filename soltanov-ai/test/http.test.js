// End-to-end HTTP flow against the real handler (offline AI mode).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ANTHROPIC_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.EDITION = "trial";
const { createApp } = await import("../src/server.js");
const { Store } = await import("../src/db.js");
const A = await import("../src/access.js");

const SECRET = "s".repeat(40);
const ADMIN = "admin-token-123456";

async function setup() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "rp-http-")));
  const server = http.createServer(createApp({ store, secret: SECRET, adminToken: ADMIN }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { "content-type": "application/json", "x-device-id": "device_aaaaaaaaaaaaaaaa", cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { store, server, call };
}

test("full trial lifecycle: admin link -> enter -> ideas -> ad scripts -> lock", async () => {
  const { store, server, call } = await setup();
  try {
    assert.equal((await call("GET", "/api/admin/accounts")).status, 401);
    const created = await call("POST", "/api/admin/trials", { label: "Test idmançı", hours: 72 }, { authorization: "Bearer " + ADMIN });
    assert.equal(created.status, 200);
    const token = created.json.link.split("/t/")[1];

    assert.equal((await call("GET", "/api/state")).status, 401);
    const enter = await call("POST", "/api/enter", { token, deviceId: "device_aaaaaaaaaaaaaaaa" });
    assert.equal(enter.status, 200);
    assert.equal(enter.json.account.status, "active");

    const prof = await call("PUT", "/api/profile", { sport: "boks", name: "Test" });
    assert.equal(prof.json.account.profileDone, true);

    const ideas = await call("GET", "/api/ideas");
    assert.equal(ideas.status, 200);
    assert.ok(ideas.json.ideas.length >= 3, "fresh trial is never empty");
    const id = ideas.json.ideas[0].id;
    assert.equal((await call("POST", `/api/ideas/${id}/status`, { status: "shot" })).json.idea.status, "shot");

    const ad = await call("POST", "/api/ads", { transcript: "Salam, FitBar brendi protein barı üçün 1 Reels istəyir, ödəniş 300 manat" });
    assert.equal(ad.status, 200);
    assert.equal(ad.json.ad.scripts.length, 5);
    assert.ok(ad.json.proq.some((p) => p.id === "pricing"));

    // Simulate time passing: force expiry on the server side.
    const acc = Object.values(store.data.accounts)[0];
    acc.expiresAt = new Date(Date.now() - 1000).toISOString();
    const locked = await call("GET", "/api/ideas");
    assert.equal(locked.status, 423);
    assert.equal(locked.json.locked, true);
    assert.ok(locked.json.stats.ideas >= 3);
    // A new browser / cleared cookies with the same link is still locked.
    const reenter = await call("POST", "/api/enter", { token, deviceId: "device_zzzzzzzzzzzzzzzz" }, { cookie: "" });
    assert.equal(reenter.status, 423);

    // Owner extends -> works again
    const ext = await call("POST", `/api/admin/accounts/${acc.id}/extend`, { hours: 24 }, { authorization: "Bearer " + ADMIN });
    assert.equal(ext.json.account.status, "active");
    assert.equal((await call("GET", "/api/ideas")).status, 200);
  } finally {
    server.close();
  }
});

test("static files: path traversal is blocked, /t/<token> serves the app", async () => {
  const { server, call } = await setup();
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base + "/t/abcdefghijklmnopqrstuvwxyz");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Soltanov AI/);
    const bad = await fetch(base + "/..%2f..%2fpackage.json");
    assert.notEqual(bad.status, 200);
    void call;
    void A;
  } finally {
    server.close();
  }
});
