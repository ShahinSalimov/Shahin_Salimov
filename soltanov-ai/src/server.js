import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config, ROOT, assertProductionConfig } from "./config.js";
import { Store } from "./db.js";
import * as A from "./access.js";
import { ensureToday, generateSlot, generateCustom, localClock, nextSlot, dueSlots } from "./ideas.js";
import { routeCommand, slotIndexOf, addWish } from "./voice.js";
import { createAdScripts, transcribe } from "./ads.js";
import { suggestForAd, suggestForDashboard } from "./proq.js";
import { startScheduler, startTelegramLinker } from "./scheduler.js";
import { aiEnabled } from "./ai/claude.js";
import { DEFAULT_PROFILE } from "./ai/prompts.js";

const PUBLIC = path.join(ROOT, "public");
const COOKIE = "rp_s";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

// ---------------- helpers ----------------

class HttpError extends Error {
  constructor(http, message, extra = {}) {
    super(message);
    this.http = http;
    this.extra = extra;
  }
}

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Fayl çox böyükdür"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJSON(req) {
  const buf = await readBody(req, 64 * 1024);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON səhvdir");
  }
}

const clientIp = (req) => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

// Fixed-window rate limiter per IP+bucket.
const hits = new Map();
function rateLimit(req, bucket, max, windowMs = 60_000) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.start > windowMs) return void hits.set(key, { start: now, n: 1 });
  if (++h.n > max) throw new HttpError(429, "Çox sorğu. Bir az gözləyin.");
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 120_000) hits.delete(k);
}, 120_000).unref();

function cookieHeader(value, req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || config.publicUrl.startsWith("https") ? "; Secure" : "";
  const maxAge = 60 * 60 * 24 * 365;
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------------- views ----------------

function accountView(acc, now = Date.now()) {
  return {
    kind: acc.kind,
    label: acc.label,
    status: acc.status,
    activatedAt: acc.activatedAt,
    expiresAt: acc.expiresAt,
    remainingMs: A.remainingMs(acc, now),
    profile: { ...DEFAULT_PROFILE, ...(acc.profile || {}) },
    profileDone: Boolean(acc.profile?.sport),
    telegramLinked: Boolean(acc.telegramChatId),
    usage: { ideasGenerated: acc.usage.ideasGenerated, adRequests: acc.usage.adRequests },
  };
}

function lockedPayload(acc, code) {
  const ideas = acc ? acc.usage.ideasGenerated : 0;
  const ads = acc ? acc.usage.adRequests : 0;
  return {
    locked: true,
    code,
    ownerName: config.ownerName,
    contactUrl: config.ownerContactUrl,
    stats: { ideas, ads, activatedAt: acc?.activatedAt || null },
  };
}

function adminView(store, acc, now = Date.now()) {
  A.refreshStatus(acc, now);
  const ideas = store.ideasOf(acc.id);
  return {
    id: acc.id,
    kind: acc.kind,
    label: acc.label,
    status: acc.status,
    hint: acc.kind === "trial" ? acc.tokenHint + "…" : "…" + acc.keyHint,
    createdAt: acc.createdAt,
    activatedAt: acc.activatedAt,
    expiresAt: acc.expiresAt,
    remainingMs: A.remainingMs(acc, now),
    devices: Object.keys(acc.devices).length,
    maxDevices: acc.maxDevices,
    usage: acc.usage.ideasGenerated + " ideya / " + acc.usage.adRequests + " reklam",
    ideasUsed: ideas.filter((i) => ["saved", "shot", "posted"].includes(i.status)).length,
    lastSeen: Object.values(acc.devices).map((d) => d.lastSeen).sort().pop() || null,
    profileDone: Boolean(acc.profile?.sport),
  };
}

// ---------------- app ----------------

export function createApp({ store, secret = config.sessionSecret, adminToken = config.adminToken } = {}) {
  const auth = (req) => {
    const deviceId = String(req.headers["x-device-id"] || "");
    const r = A.authorize(store, parseCookies(req)[COOKIE], deviceId, secret, config.edition);
    if (!r.ok) {
      if (r.http === 423) {
        store.save();
        throw new HttpError(423, "Giriş bağlıdır", lockedPayload(r.account, r.code));
      }
      throw new HttpError(r.http, "Giriş tələb olunur", { code: r.code });
    }
    return r.account;
  };

  const requireAdmin = (req) => {
    const h = String(req.headers.authorization || "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!adminToken || !token || !A.safeEqual(token, adminToken)) throw new HttpError(401, "Admin icazəsi yoxdur");
  };

  const linkFor = (req, token) => {
    const base = config.publicUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    return `${base}/t/${token}`;
  };

  const routes = [
    // ----- client -----
    ["POST", /^\/api\/enter$/, async (req, res) => {
      rateLimit(req, "enter", 10);
      const body = await readJSON(req);
      const acc = config.edition === "trial" ? (body.token ? A.findByToken(store, body.token) : null) : body.key ? A.findByKey(store, body.key) : null;
      const r = A.enterAccount(store, acc, body.deviceId, { ua: req.headers["user-agent"] });
      if (!r.ok) {
        if (r.code === "expired" || r.code === "revoked") throw new HttpError(423, r.message, lockedPayload(acc, r.code));
        throw new HttpError(r.code === "device_limit" ? 403 : 400, r.message, { code: r.code });
      }
      const cookie = A.createSession(store, acc.id, body.deviceId, secret);
      send(res, 200, { ok: true, account: accountView(acc) }, { "set-cookie": cookieHeader(cookie, req) });
    }],
    ["GET", /^\/api\/state$/, async (req, res) => {
      const acc = auth(req);
      const n = nextSlot(config.slots, config.timezone);
      send(res, 200, {
        edition: config.edition,
        account: accountView(acc),
        slots: config.slots,
        nextSlot: n,
        today: localClock(config.timezone).date,
        features: { ai: aiEnabled(), transcribe: Boolean(config.openaiKey), telegram: Boolean(config.telegramBotToken) },
        serverNow: Date.now(),
      });
    }],
    ["PUT", /^\/api\/profile$/, async (req, res) => {
      const acc = auth(req);
      const body = await readJSON(req);
      const clean = {};
      for (const k of Object.keys(DEFAULT_PROFILE)) if (typeof body[k] === "string") clean[k] = body[k].trim().slice(0, k === "wishes" ? 1500 : 300);
      acc.profile = { ...(acc.profile || {}), ...clean };
      store.log("profile.updated", { accountId: acc.id });
      store.save();
      send(res, 200, { ok: true, account: accountView(acc) });
    }],
    ["GET", /^\/api\/ideas$/, async (req, res) => {
      const acc = auth(req);
      const { date } = await ensureToday(store, acc);
      const all = store.ideasOf(acc.id).filter((i) => !i.replaced);
      acc.usage.ideasOpened++;
      store.save();
      send(res, 200, {
        today: date,
        ideas: all.filter((i) => i.date === date),
        archive: all.filter((i) => i.date !== date).slice(-150).reverse(),
        proq: suggestForDashboard(acc, all),
      });
    }],
    ["POST", /^\/api\/ideas\/refresh$/, async (req, res) => {
      const acc = auth(req);
      rateLimit(req, "refresh", 5);
      if (!A.takeQuota(acc, "refresh", config.trialDailyRefreshLimit, config.timezone)) throw new HttpError(429, "Test versiyasında gündəlik yeniləmə limiti doldu.");
      const body = await readJSON(req);
      const slotIndex = Number(body.slotIndex);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= config.slots.length) throw new HttpError(400, "Slot səhvdir");
      const { date } = localClock(config.timezone);
      const ideas = await generateSlot(store, acc, { date, slotIndex, force: true });
      send(res, 200, { ideas });
    }],
    ["POST", /^\/api\/ideas\/custom$/, async (req, res) => {
      const acc = auth(req);
      rateLimit(req, "custom", 6);
      const body = await readJSON(req);
      if (String(body.request || "").trim().length < 3) throw new HttpError(400, "İstəyi bir az ətraflı deyin.");
      if (!A.takeQuota(acc, "custom", config.trialDailyCustomLimit, config.timezone)) throw new HttpError(429, "Test versiyasında gündəlik sifariş limiti doldu.");
      send(res, 200, { ideas: await generateCustom(store, acc, { request: body.request, count: body.count }) });
    }],
    ["POST", /^\/api\/voice\/command$/, async (req, res) => {
      const acc = auth(req);
      rateLimit(req, "voice", 8);
      const body = await readJSON(req);
      const text = String(body.text || "").trim().slice(0, 6000);
      if (text.length < 3) throw new HttpError(400, "Səs mətni boşdur — yenidən danışın və ya yazın.");
      const route = await routeCommand(text, String(body.context || ""), store, acc);
      store.log("voice.command", { accountId: acc.id, message: route.intent });
      const quota = (kind, limit, msg) => {
        if (!A.takeQuota(acc, kind, limit, config.timezone)) throw new HttpError(429, msg);
      };
      if (route.intent === "ad") {
        quota("ads", config.trialDailyAdLimit, "Test versiyasında gündəlik reklam limiti doldu.");
        const ad = await createAdScripts(store, acc, { transcript: text });
        return send(res, 200, { intent: "ad", text, ad, proq: suggestForAd(ad) });
      }
      if (route.intent === "refresh") {
        quota("refresh", config.trialDailyRefreshLimit, "Test versiyasında gündəlik yeniləmə limiti doldu.");
        const due = dueSlots(config.slots, config.timezone);
        const slotIndex = slotIndexOf(route.slot, due.length ? due[due.length - 1] : 0);
        const { date } = localClock(config.timezone);
        return send(res, 200, { intent: "refresh", text, slotIndex, ideas: await generateSlot(store, acc, { date, slotIndex, force: true }) });
      }
      if (route.intent === "profile") {
        const wishes = addWish(acc, route.wish || text);
        store.save();
        return send(res, 200, { intent: "profile", text, wishes, account: accountView(acc) });
      }
      if (route.intent === "tool" && route.tool && route.tool !== "none") return send(res, 200, { intent: "tool", text, tool: route.tool });
      quota("custom", config.trialDailyCustomLimit, "Test versiyasında gündəlik sifariş limiti doldu.");
      const ideas = await generateCustom(store, acc, { request: route.request || text, count: route.count });
      return send(res, 200, { intent: "ideas", text, request: route.request || text, ideas });
    }],
    ["POST", /^\/api\/ideas\/([\w-]+)\/status$/, async (req, res, m) => {
      const acc = auth(req);
      const { status } = await readJSON(req);
      if (!["new", "saved", "shot", "posted", "skipped"].includes(status)) throw new HttpError(400, "Status səhvdir");
      const idea = store.ideasOf(acc.id).find((i) => i.id === m[1]);
      if (!idea) throw new HttpError(404, "İdeya tapılmadı");
      idea.status = status;
      idea.statusAt = new Date().toISOString();
      store.save();
      send(res, 200, { ok: true, idea });
    }],
    ["POST", /^\/api\/(?:ads|voice)\/transcribe$/, async (req, res) => {
      const acc = auth(req);
      rateLimit(req, "transcribe", 10);
      if (!config.openaiKey) throw new HttpError(501, "Server transkripsiyası qoşulmayıb", { code: "no_transcribe" });
      const buf = await readBody(req, 12 * 1024 * 1024);
      if (buf.length < 1000) throw new HttpError(400, "Səs yazısı çox qısadır");
      const text = await transcribe(buf, String(req.headers["content-type"] || ""));
      acc.usage.transcriptions++;
      store.save();
      send(res, 200, { text });
    }],
    ["POST", /^\/api\/ads$/, async (req, res) => {
      const acc = auth(req);
      rateLimit(req, "ads", 6);
      if (!A.takeQuota(acc, "ads", config.trialDailyAdLimit, config.timezone)) throw new HttpError(429, "Test versiyasında gündəlik reklam limiti doldu.");
      const body = await readJSON(req);
      const record = await createAdScripts(store, acc, body);
      send(res, 200, { ad: record, proq: suggestForAd(record) });
    }],
    ["GET", /^\/api\/ads$/, async (req, res) => {
      const acc = auth(req);
      send(res, 200, { ads: store.adsOf(acc.id).slice(-30).reverse() });
    }],
    ["POST", /^\/api\/telegram\/link$/, async (req, res) => {
      const acc = auth(req);
      if (!config.telegramBotToken || !config.telegramBotUsername) throw new HttpError(501, "Telegram qoşulmayıb");
      acc.telegramLinkCode = crypto.randomBytes(9).toString("base64url");
      store.save();
      send(res, 200, { url: `https://t.me/${config.telegramBotUsername}?start=${acc.telegramLinkCode}` });
    }],
    ["POST", /^\/api\/logout$/, async (req, res) => {
      const sid = A.verifyCookie(parseCookies(req)[COOKIE], secret);
      if (sid && store.data.sessions[sid]) store.data.sessions[sid].revoked = true;
      store.save();
      send(res, 200, { ok: true }, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0` });
    }],

    // ----- admin -----
    ["GET", /^\/api\/admin\/accounts$/, async (req, res) => {
      requireAdmin(req);
      const list = Object.values(store.data.accounts).map((a) => adminView(store, a)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      send(res, 200, { edition: config.edition, ai: aiEnabled(), transcribe: Boolean(config.openaiKey), accounts: list, events: store.data.events.slice(-40).reverse() });
    }],
    ["POST", /^\/api\/admin\/trials$/, async (req, res) => {
      requireAdmin(req);
      if (config.edition !== "trial") throw new HttpError(400, "Trial linkləri yalnız EDITION=trial serverində yaradılır");
      const b = await readJSON(req);
      const { account, token } = A.createTrial(store, {
        label: b.label,
        hours: Math.min(24 * 14, Math.max(1, Number(b.hours) || config.trialHours)),
        maxDevices: Math.min(5, Math.max(1, Number(b.maxDevices) || config.trialMaxDevices)),
      });
      send(res, 200, { link: linkFor(req, token), account: adminView(store, account) });
    }],
    ["POST", /^\/api\/admin\/licenses$/, async (req, res) => {
      requireAdmin(req);
      if (config.edition !== "full") throw new HttpError(400, "Lisenziyalar yalnız EDITION=full serverində yaradılır");
      const b = await readJSON(req);
      const { account, key } = A.createLicense(store, { label: b.label, maxDevices: Math.min(10, Math.max(1, Number(b.maxDevices) || config.fullMaxDevices)) });
      send(res, 200, { key, account: adminView(store, account) });
    }],
    ["POST", /^\/api\/admin\/accounts\/([\w-]+)\/(extend|revoke|reset-devices)$/, async (req, res, m) => {
      requireAdmin(req);
      const acc = store.account(m[1]);
      if (!acc) throw new HttpError(404, "Tapılmadı");
      const b = await readJSON(req);
      if (m[2] === "revoke") {
        acc.status = "revoked";
        for (const s of Object.values(store.data.sessions)) if (s.accountId === acc.id) s.revoked = true;
      } else if (m[2] === "reset-devices") {
        acc.devices = {};
        for (const s of Object.values(store.data.sessions)) if (s.accountId === acc.id) s.revoked = true;
      } else {
        const hours = Math.min(24 * 30, Math.max(1, Number(b.hours) || 24));
        const base = acc.expiresAt && acc.status !== "pending" ? Math.max(Date.now(), Date.parse(acc.expiresAt)) : null;
        if (acc.kind === "trial" && acc.status === "pending") acc.trialHours += hours;
        else if (base) {
          acc.expiresAt = new Date(base + hours * 3600_000).toISOString();
          if (acc.status === "expired") acc.status = "active";
        }
      }
      store.log("admin." + m[2], { accountId: acc.id });
      store.save();
      send(res, 200, { ok: true, account: adminView(store, acc) });
    }],
    ["GET", /^\/api\/health$/, async (req, res) => send(res, 200, { ok: true, edition: config.edition, ai: aiEnabled() })],
  ];

  async function serveStatic(req, res, urlPath) {
    let rel = urlPath === "/" || urlPath.startsWith("/t/") || urlPath === "/app" ? "/index.html" : urlPath === "/admin" ? "/admin.html" : urlPath;
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden");
    let stat;
    try {
      stat = await fs.promises.stat(file);
    } catch {
      return send(res, 404, "Tapılmadı");
    }
    if (!stat.isFile()) return send(res, 404, "Tapılmadı");
    const ext = path.extname(file);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": ext === ".html" || rel === "/sw.js" ? "no-cache" : "public, max-age=3600",
      ...(rel === "/sw.js" ? { "service-worker-allowed": "/" } : {}),
    });
    fs.createReadStream(file).pipe(res);
  }

  return async function handler(req, res) {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("permissions-policy", "microphone=(self), camera=()");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname.startsWith("/api/")) {
        rateLimit(req, "api", 240);
        for (const [method, rx, fn] of routes) {
          const m = url.pathname.match(rx);
          if (m && req.method === method) return await fn(req, res, m);
        }
        throw new HttpError(404, "Endpoint tapılmadı");
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Metod dəstəklənmir");
      return await serveStatic(req, res, url.pathname);
    } catch (e) {
      const status = e.http || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? "Daxili xəta, yenidən cəhd edin." : e.message, ...(e.extra || {}) });
      else res.end();
    }
  };
}

// ---------------- boot ----------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, "src", "server.js");
if (isMain) {
  const problems = assertProductionConfig();
  if (problems.length) {
    console.error("Konfiqurasiya xətası:\n- " + problems.join("\n- ") + "\n.env.example faylına baxın.");
    process.exit(1);
  }
  const store = new Store(config.dataDir, `db-${config.edition}.json`);
  const server = http.createServer(createApp({ store }));
  server.listen(config.port, () => {
    console.log(`Soltanov AI (${config.edition}) http://localhost:${config.port}  AI: ${aiEnabled() ? config.claudeModel : "offline şablon rejimi"}`);
  });
  startScheduler(store);
  startTelegramLinker(store);
  const shutdown = () => {
    store.flush();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
