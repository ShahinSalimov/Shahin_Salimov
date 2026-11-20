#!/usr/bin/env node
// Builds the sale-ready FULL edition bundle that stays with the owner until handover:
//   dist/SoltanovAI-Full/         (code + EDITION=full config, no data, no secrets)
//   dist/SoltanovAI-Full.tar.gz
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../src/config.js";

const out = path.join(ROOT, "dist", "SoltanovAI-Full");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ["src", "public", "scripts", "package.json", "package-lock.json", "README.md", "docs"]) {
  const from = path.join(ROOT, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(out, item), { recursive: true });
}
const env = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8").replace(/^EDITION=.*$/m, "EDITION=full");
fs.writeFileSync(path.join(out, ".env.example"), env);
const pkg = JSON.parse(fs.readFileSync(path.join(out, "package.json"), "utf8"));
pkg.scripts.start = "EDITION=full node src/server.js";
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
fs.writeFileSync(
  path.join(out, "TEHVIL.md"),
  `# Soltanov AI — Tam versiya (təhvil paketi)

1. \`npm install\`
2. \`cp .env.example .env\` və dəyərləri doldurun (\`npm run admin -- secrets\` sirləri yaradır)
3. \`npm start\` → \`/admin\` panelində lisenziya açarı yaradın
4. Müştəri saytı telefonda açır, açarı daxil edir, "Ana ekrana əlavə et" ilə tətbiq kimi quraşdırır.
`,
);
execFileSync("tar", ["-czf", "SoltanovAI-Full.tar.gz", "SoltanovAI-Full"], { cwd: path.dirname(out) });
console.log("Hazırdır:", out + ".tar.gz");
