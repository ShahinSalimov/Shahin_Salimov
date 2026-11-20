#!/usr/bin/env node
// Owner CLI — works directly on the data file (server may be running; restart not required
// for reads, but run create commands while the server is stopped OR use the /admin panel).
//
//   npm run admin -- create-trial "Ramin (boksçu)" [hours] [maxDevices]
//   npm run admin -- create-license "Ramin (boksçu)" [maxDevices]
//   npm run admin -- list
//   npm run admin -- secrets         (generate SESSION_SECRET / ADMIN_TOKEN)
import crypto from "node:crypto";
import { config } from "../src/config.js";
import { Store } from "../src/db.js";
import { createTrial, createLicense, refreshStatus, remainingMs } from "../src/access.js";

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "secrets") {
  console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString("base64url")}`);
  console.log(`ADMIN_TOKEN=${crypto.randomBytes(24).toString("base64url")}`);
  process.exit(0);
}

const edition = cmd === "create-license" ? "full" : cmd === "create-trial" ? "trial" : config.edition;
const store = new Store(config.dataDir, `db-${edition}.json`);
const base = config.publicUrl || `http://localhost:${config.port}`;

if (cmd === "create-trial") {
  const { token, account } = createTrial(store, { label: args[0], hours: Number(args[1]) || config.trialHours, maxDevices: Number(args[2]) || config.trialMaxDevices });
  store.flush();
  console.log(`Trial yaradıldı: ${account.label} (${account.trialHours} saat, ${account.maxDevices} cihaz)\nLink: ${base}/t/${token}\nQeyd: link yalnız indi göstərilir.`);
} else if (cmd === "create-license") {
  const { key, account } = createLicense(store, { label: args[0], maxDevices: Number(args[1]) || config.fullMaxDevices });
  store.flush();
  console.log(`Lisenziya yaradıldı: ${account.label}\nAçar: ${key}\nQeyd: açar yalnız indi göstərilir.`);
} else if (cmd === "list") {
  for (const a of Object.values(store.data.accounts)) {
    refreshStatus(a);
    const ms = remainingMs(a);
    console.log(`${a.id}  ${a.kind.padEnd(5)}  ${a.status.padEnd(8)}  ${ms == null ? "limitsiz" : Math.round(ms / 36e5) + " saat"}  ${a.label}  (${a.usage.ideasGenerated} ideya, ${a.usage.adRequests} reklam)`);
  }
} else {
  console.log("Komandalar: create-trial <ad> [saat] [cihaz] | create-license <ad> [cihaz] | list | secrets");
}
