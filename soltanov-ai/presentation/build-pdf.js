#!/usr/bin/env node
// Renders presentation/slides.html (16:9, 1920x1080 per slide) to SoltanovAI-Teqdimat.pdf
// Requires Playwright + Chromium: `npm i -D playwright && npx playwright install chromium`
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright tapılmadı: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, "slides.html")).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const out = path.join(here, "SoltanovAI-Teqdimat.pdf");
await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("PDF hazırdır:", out);
