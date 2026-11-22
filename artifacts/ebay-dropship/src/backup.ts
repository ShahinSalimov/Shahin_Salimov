// Daily SQLite snapshots (VACUUM INTO gives a consistent copy while the app runs)
// plus pruning of old technical logs so the database does not grow forever.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { log, type DB } from "./db.ts";

const PREFIX = "dropship-";

export function backupDb(db: DB, dir: string, keep: number, now = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join(dir, `${PREFIX}${stamp}.db`);
  rmSync(file, { force: true });
  db.prepare("VACUUM INTO ?").run(file);

  const old = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(".db"))
    .sort()
    .reverse()
    .slice(Math.max(1, keep));
  for (const f of old) rmSync(join(dir, f), { force: true });
  return file;
}

export function pruneLogs(db: DB, days = 30): number {
  const r = db.prepare("DELETE FROM logs WHERE created_at < datetime('now', ?)").run(`-${days} days`);
  return Number(r.changes);
}

/** Runs a backup now and then every 24 hours. Returns a stop function. */
export function startDailyBackup(db: DB, dir: string, keep: number): () => void {
  const run = () => {
    try {
      const removed = pruneLogs(db);
      const file = backupDb(db, dir, keep);
      log(db, "info", "backup", `ehtiyat surəti: ${file}${removed ? `, ${removed} köhnə log silindi` : ""}`);
    } catch (e) {
      log(db, "error", "backup", `ehtiyat surəti alınmadı: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, 24 * 60 * 60_000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
