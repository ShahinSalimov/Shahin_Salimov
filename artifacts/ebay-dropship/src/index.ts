import { ListingWriter } from "./ai/listing.ts";
import { startDailyBackup } from "./backup.ts";
import { loadConfig, startupErrors } from "./config.ts";
import { log, openDb } from "./db.ts";
import { EbayClient } from "./ebay/client.ts";
import { telegramNotifier } from "./notify.ts";
import { Engine } from "./services/engine.ts";
import { Ops } from "./services/ops.ts";
import { Scheduler } from "./services/scheduler.ts";
import { CjSupplier } from "./suppliers/cj.ts";
import { DemoSupplier } from "./suppliers/demo.ts";
import type { Supplier } from "./suppliers/types.ts";
import { createApp } from "./web/server.ts";

const cfg = loadConfig();
const problems = startupErrors(cfg);
if (problems.length) {
  for (const p of problems) console.error(`XƏTA: ${p}`);
  process.exit(1);
}
const db = openDb(cfg.dbPath);

if (!cfg.demoSupplier && !cfg.cj.apiKey) {
  console.warn("CJ_API_KEY is empty. Set it in .env or use DEMO_SUPPLIER=true to try the system.");
}

const supplier: Supplier = cfg.demoSupplier ? new DemoSupplier() : new CjSupplier({ db, apiKey: cfg.cj.apiKey, baseUrl: cfg.cj.baseUrl });
const ebay = new EbayClient({ cfg, db });
const writer = new ListingWriter({ apiKey: cfg.anthropic.apiKey, model: cfg.anthropic.model });
const engine = new Engine({ db, supplier, ebay, writer, notify: telegramNotifier(cfg) });
const ops = new Ops(engine);
const scheduler = new Scheduler(engine, ops);

const host = cfg.host;
const app = createApp({ cfg, engine, ops, scheduler });
const server = app.listen(cfg.port, host, () => {
  log(db, "info", "app", `started on http://${host === "0.0.0.0" ? "localhost" : host}:${cfg.port} (${cfg.dryRun ? "DRY_RUN" : "LIVE"}, supplier=${supplier.name}, ebay=${cfg.ebay.env})`);
  scheduler.start();
});
const stopBackup = startDailyBackup(db, cfg.backupDir, cfg.backupKeep);

function shutdown() {
  scheduler.stop();
  stopBackup();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
