import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { backupDb, pruneLogs } from "../src/backup.ts";
import { loadConfig, startupErrors } from "../src/config.ts";
import { log, openDb } from "../src/db.ts";

process.env.NODE_ENV = "test";

test("public host without a strong password refuses to start", () => {
  const cfg = loadConfig();
  assert.deepEqual(startupErrors({ ...cfg, host: "127.0.0.1", dashboardPassword: "" }), []);
  assert.equal(startupErrors({ ...cfg, host: "0.0.0.0", dashboardPassword: "" }).length, 1);
  assert.equal(startupErrors({ ...cfg, host: "0.0.0.0", dashboardPassword: "short" }).length, 1);
  assert.deepEqual(startupErrors({ ...cfg, host: "0.0.0.0", dashboardPassword: "a-long-password" }), []);
});

test("backup writes a readable copy and keeps only the newest N", () => {
  const dir = mkdtempSync(join(tmpdir(), "bk-"));
  const db = openDb(join(dir, "live.db"));
  log(db, "info", "t", "hello");
  const out = join(dir, "backups");
  let last = "";
  for (let i = 0; i < 5; i++) last = backupDb(db, out, 3, new Date(Date.UTC(2026, 0, 1 + i)));
  assert.equal(readdirSync(out).length, 3);
  assert.ok(existsSync(last));
  const copy = new DatabaseSync(last);
  const row = copy.prepare("SELECT message FROM logs").get() as { message: string };
  assert.equal(row.message, "hello");
  copy.close();
  db.close();
});

test("pruneLogs removes only old rows", () => {
  const db = openDb(":memory:");
  log(db, "info", "t", "new");
  db.prepare("INSERT INTO logs (level, area, message, created_at) VALUES ('info','t','old', datetime('now','-40 days'))").run();
  assert.equal(pruneLogs(db, 30), 1);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM logs").get() as { n: number }).n, 1);
});
