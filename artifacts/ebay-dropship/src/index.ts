import { ListingWriter } from "./ai/listing.ts";
import { loadConfig } from "./config.ts";
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

const host = process.env.HOST?.trim() || "127.0.0.1";
const app = createApp({ cfg, engine, ops, scheduler });
const server = app.listen(cfg.port, host, () => {
  log(db, "info", "app", `started on http://${host === "0.0.0.0" ? "localhost" : host}:${cfg.port} (${cfg.dryRun ? "DRY_RUN" : "LIVE"}, supplier=${supplier.name}, ebay=${cfg.ebay.env})`);
  scheduler.start();
});

function shutdown() {
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
