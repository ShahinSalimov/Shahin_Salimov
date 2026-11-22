import { randomBytes, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Config } from "../config.ts";
import { log } from "../db.ts";
import type { Policies } from "../ebay/client.ts";
import type { Engine, OrderRow, ProductRow } from "../services/engine.ts";
import type { Ops } from "../services/ops.ts";
import type { Scheduler } from "../services/scheduler.ts";
import { registerPages } from "./pages.ts";
import { DEFAULT_SETTINGS, saveSettings, type SettingKey } from "../settings.ts";
import { esc, layout, SETTING_LABELS, statusBadge } from "./views.ts";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createApp(opts: { cfg: Config; engine: Engine; ops: Ops; scheduler: Scheduler }) {
  const { cfg, engine, ops, scheduler } = opts;
  const db = engine.db;
  const app = express();
  app.use(express.urlencoded({ extended: false, limit: "200kb" }));

  // Health check for Docker / hosting platforms: no auth, no data.
  app.get("/health", (_req, res) => void res.json({ ok: true }));

  // ---- auth (optional basic auth) + same-origin check for POST ----
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/ebay/callback" && !cfg.dashboardPassword) return next();
    if (cfg.dashboardPassword) {
      const hdr = req.headers.authorization ?? "";
      const given = Buffer.from(Buffer.from(hdr.replace(/^Basic /, ""), "base64").toString().split(":").slice(1).join(":"));
      const want = Buffer.from(cfg.dashboardPassword);
      if (given.length !== want.length || !timingSafeEqual(given, want)) {
        res.set("WWW-Authenticate", 'Basic realm="dropship"').status(401).send("Auth required");
        return;
      }
    }
    if (req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) {
        res.status(403).send("Bad origin");
        return;
      }
    }
    next();
  });

  const flash = (req: Request) => (typeof req.query.msg === "string" ? req.query.msg : undefined);
  const back = (res: Response, to: string, msg: string) => res.redirect(`${to}${to.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);

  registerPages(app, { cfg, engine, ops, scheduler, flash, back });

  // ================= PRODUCTS =================
  app.get("/products", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "candidate";
    const rows = db
      .prepare(
        status === "listed"
          ? "SELECT * FROM products WHERE status IN ('listed','paused','approved') ORDER BY updated_at DESC LIMIT 300"
          : "SELECT * FROM products WHERE status = ? ORDER BY score DESC, id DESC LIMIT 300",
      )
      .all(...(status === "listed" ? [] : [status])) as ProductRow[];
    const tabs = ["candidate", "listed", "error", "rejected", "ended"]
      .map((t) => `<a class="badge ${t === status ? "ok" : ""}" href="/products?status=${t}">${t}</a>`)
      .join(" ");
    const body = rows
      .map((p) => {
        const img = (JSON.parse(p.images) as string[])[0];
        const actions =
          p.status === "candidate" || p.status === "error" || p.status === "rejected"
            ? `<form class="inline" method="post" action="/products/${p.id}/publish"><button>eBay-ə yüklə</button></form>
               ${p.status !== "rejected" ? `<form class="inline" method="post" action="/products/${p.id}/reject"><button class="ghost">Rədd et</button></form>` : ""}`
            : p.status === "listed" || p.status === "paused"
              ? `<a class="btn" href="/products/${p.id}">İdarə et</a>`
              : "";
        return `<tr><td>${img ? `<img class="thumb" src="${esc(img)}" loading="lazy">` : ""}</td>
          <td><b>${esc(p.ebay_title ?? p.title)}</b><div class="muted">${esc(p.sku)} · ${esc(p.keyword)} · ${esc((p.logistic_name ?? "").replace("|", " / "))}</div>
          ${p.last_error ? `<div class="bad">${esc(p.last_error)}</div>` : ""}
          ${p.ebay_listing_id && !p.ebay_listing_id.startsWith("DRY") ? `<a href="https://www.ebay.com/itm/${esc(p.ebay_listing_id)}" target="_blank">eBay-də bax</a>` : ""}</td>
          <td>$${p.cost.toFixed(2)}<div class="muted">+$${p.shipping_cost.toFixed(2)} çatd.</div></td>
          <td><b>$${p.price.toFixed(2)}</b><div class="muted">median ${p.competitor_median ? "$" + p.competitor_median.toFixed(2) : "-"}</div></td>
          <td class="${p.profit >= 5 ? "ok" : ""}">$${p.profit.toFixed(2)}</td>
          <td><b>${p.score}</b><div class="muted" style="max-width:220px">${esc(p.score_notes)}</div></td>
          <td>${p.stock}<div class="muted">${esc(p.shipping_days ?? "?")} gün</div></td>
          <td>${statusBadge(p.status)}${p.price_locked ? '<div class="muted">sabit qiymət</div>' : ""}${p.paused_manual ? '<div class="warn">əllə dayandırılıb</div>' : ""}</td><td style="white-space:nowrap">${actions}</td></tr>`;
      })
      .join("");
    res.send(
      layout("Məhsullar", req.originalUrl, `
      <h1>Məhsullar</h1>
      <div class="card"><form method="post" action="/research" class="row">
        <input name="keyword" placeholder="Açar söz, məs. silicone kitchen utensils" style="max-width:420px" required>
        <button>Bu açar sözlə araşdır</button><span class="muted">Ayarlardakı bütün sözlər üçün: Panel → research → İndi işlət</span>
      </form></div>
      <div class="row" style="margin-bottom:12px">${tabs}</div>
      <div class="card wrap"><table><tr><th></th><th>Məhsul</th><th>Maya</th><th>Qiymət</th><th>Mənfəət</th><th>Bal</th><th>Stok</th><th>Status</th><th></th></tr>
      ${body || '<tr><td colspan="9" class="muted">Hələ heç nə yoxdur.</td></tr>'}</table></div>`, flash(req)),
    );
  });

  app.post("/research", (req, res) => {
    const kw = String(req.body.keyword ?? "").trim();
    if (!kw) return back(res, "/products", "Açar söz boşdur");
    void engine.exclusive(`research:${kw}`, async () => {
      const n = await engine.researchKeyword(kw);
      log(db, "info", "research", `"${kw}": ${n} new candidates`);
    });
    back(res, "/products?status=candidate", `"${kw}" araşdırılır. Bir neçə dəqiqəyə namizədlər burada görünəcək (səhifəni yenilə).`);
  });

  app.post("/products/:id/publish", async (req, res) => {
    const ok = await engine.publish(Number(req.params.id));
    back(res, "/products?status=" + (ok ? "listed" : "error"), ok ? "Elan yükləndi" : "Yükləmə alınmadı, xətaya bax");
  });
  app.post("/products/:id/reject", (req, res) => {
    engine.reject(Number(req.params.id));
    back(res, "/products?status=candidate", "Rədd edildi");
  });
  app.post("/products/:id/end", async (req, res) => {
    try {
      await engine.endListing(Number(req.params.id));
      back(res, "/products?status=listed", "Elan bitirildi");
    } catch (err) {
      back(res, "/products?status=listed", `Xəta: ${errMsg(err)}`);
    }
  });

  // ================= EBAY SETUP =================
  let oauthState = "";
  app.get("/ebay", async (req, res) => {
    const s = engine.settings();
    const connected = engine.ebay.isConnected();
    const missingKeys = !cfg.ebay.clientId || !cfg.ebay.clientSecret || !cfg.ebay.ruName;
    let policies: Policies | null = null;
    let policyErr = "";
    if (connected) {
      try {
        policies = await engine.ebay.getPolicies();
      } catch (err) {
        policyErr = errMsg(err);
      }
    }
    const sel = (name: SettingKey, list: { id: string; name: string }[]) =>
      `<select name="${name}"><option value="">-- seç --</option>${list
        .map((p) => `<option value="${esc(p.id)}" ${s[name] === p.id ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`)
        .join("")}</select>`;
    res.send(
      layout("eBay qoşulma", "/ebay", `
      <h1>eBay qoşulma</h1>
      <div class="card"><h2>1. Hesabı qoş</h2>
        ${missingKeys ? `<p class="bad">.env faylında EBAY_CLIENT_ID, EBAY_CLIENT_SECRET və EBAY_RUNAME doldurulmalıdır (README-də addım-addım).</p>` : ""}
        <p>Status: ${connected ? '<b class="ok">Qoşulub</b>' : '<b class="warn">Qoşulmayıb</b>'} · Mühit: ${esc(cfg.ebay.env)} · Bazar: ${esc(cfg.ebay.marketplaceId)}</p>
        ${missingKeys ? "" : `<a class="btn" href="/ebay/connect" target="_blank">${connected ? "Yenidən qoş" : "eBay hesabını qoş"}</a>
        <p class="muted">eBay-də "Agree" basandan sonra brauzer "Auth accepted URL" səhifəsinə keçəcək. Həmin səhifənin ünvanını (adres sətrindəki tam linki) kopyala və aşağıya yapışdır.</p>
        <form method="post" action="/ebay/code" class="row"><input name="url" placeholder="https://...?code=v%5E1.1%23...&expires_in=299" required style="max-width:640px"><button>Təsdiqlə</button></form>`}
      </div>
      <div class="card"><h2>2. Business policies</h2>
        <p class="muted">eBay Seller Hub → Account → Business policies bölməsində əvvəlcə 3 policy yarat: Shipping (free shipping, handling ${s.handlingDays} gün), Payment, Return (30 gün).</p>
        ${policyErr ? `<p class="bad">${esc(policyErr)}</p>` : ""}
        ${policies ? `<form method="post" action="/settings?to=/ebay">
          <label><span>Shipping (fulfillment) policy</span>${sel("fulfillmentPolicyId", policies.fulfillment)}</label>
          <label><span>Payment policy</span>${sel("paymentPolicyId", policies.payment)}</label>
          <label><span>Return policy</span>${sel("returnPolicyId", policies.return)}</label>
          <button>Yadda saxla</button></form>` : `<p class="muted">Hesab qoşulandan sonra burada seçim görünəcək.</p>`}
      </div>
      <div class="card"><h2>3. Inventory location</h2>
        <p class="muted">eBay hər elan üçün "item location" tələb edir. Əsas göndərmə anbarının şəhərini yaz (US anbarı istifadə edirsənsə, US ünvanı).</p>
        <p>Hazırkı: <b>${esc(s.merchantLocationKey || "-")}</b></p>
        <form method="post" action="/ebay/location">
          <div class="grid"><label><span>Key</span><input name="key" value="${esc(s.merchantLocationKey || "main-warehouse")}"></label>
          <label><span>Şəhər</span><input name="city" required></label><label><span>Ştat / region</span><input name="state" required></label>
          <label><span>Poçt kodu</span><input name="zip" required></label><label><span>Ölkə kodu</span><input name="country" value="US"></label></div>
          <button>Location yarat</button></form>
      </div>`, flash(req)),
    );
  });

  app.get("/ebay/connect", (_req, res) => {
    oauthState = randomBytes(16).toString("hex");
    res.redirect(engine.ebay.consentUrl(oauthState));
  });

  app.get("/ebay/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code) return back(res, "/ebay", "eBay icazə vermədi: " + String(req.query.error ?? "kod yoxdur"));
    if (oauthState && state !== oauthState) return back(res, "/ebay", "State uyğun gəlmir, yenidən cəhd et");
    try {
      await engine.ebay.exchangeCode(code);
      log(db, "info", "ebay", "account connected");
      back(res, "/ebay", "eBay hesabı qoşuldu");
    } catch (err) {
      back(res, "/ebay", `Qoşulma alınmadı: ${errMsg(err)}`);
    }
  });

  app.post("/ebay/code", async (req, res) => {
    const raw = String((req.body as Record<string, string>).url ?? "").trim();
    let code = raw;
    try {
      code = new URL(raw).searchParams.get("code") ?? raw;
    } catch {
      // not a URL: treat as the bare code (may still be percent-encoded)
      if (/%[0-9A-F]{2}/i.test(raw)) code = decodeURIComponent(raw);
    }
    if (!code) return back(res, "/ebay", "Kod tapılmadı");
    try {
      await engine.ebay.exchangeCode(code);
      log(db, "info", "ebay", "account connected");
      back(res, "/ebay", "eBay hesabı qoşuldu");
    } catch (err) {
      back(res, "/ebay", `Qoşulma alınmadı (kod 5 dəqiqə etibarlıdır, yenidən cəhd et): ${errMsg(err).slice(0, 300)}`);
    }
  });

  app.post("/ebay/location", async (req, res) => {
    const b = req.body as Record<string, string>;
    const key = (b.key || "main-warehouse").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36);
    try {
      await engine.ebay.createLocation(key, { city: b.city ?? "", state: b.state ?? "", zip: b.zip ?? "", country: (b.country || "US").toUpperCase() });
      saveSettings(db, { merchantLocationKey: key });
      back(res, "/ebay", `Location "${key}" yaradıldı`);
    } catch (err) {
      // Location may already exist; still save the key.
      saveSettings(db, { merchantLocationKey: key });
      back(res, "/ebay", `Key saxlanıldı. eBay cavabı: ${errMsg(err).slice(0, 300)}`);
    }
  });

  // ================= SETTINGS =================
  app.get("/settings", (req, res) => {
    const s = engine.settings();
    const fields = (Object.keys(DEFAULT_SETTINGS) as SettingKey[])
      .map((k) => {
        const [label, help] = SETTING_LABELS[k] ?? [k, ""];
        const v = s[k];
        const input =
          typeof v === "boolean"
            ? `<select name="${k}"><option value="true" ${v ? "selected" : ""}>Bəli</option><option value="false" ${!v ? "selected" : ""}>Xeyr</option></select>`
            : k === "keywords"
              ? `<textarea name="${k}" rows="3">${esc(v)}</textarea>`
              : `<input name="${k}" value="${esc(v)}" ${typeof v === "number" ? 'inputmode="decimal"' : ""}>`;
        return `<label><span><b>${esc(label)}</b>${help ? ` — ${esc(help)}` : ""}</span>${input}</label>`;
      })
      .join("");
    res.send(
      layout("Ayarlar", "/settings", `
      <h1>Ayarlar</h1>
      <div class="card"><form method="post" action="/settings"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${fields}</div>
      <button>Yadda saxla</button></form></div>`, flash(req)),
    );
  });

  app.post("/settings", (req, res) => {
    saveSettings(db, req.body as Record<string, unknown>);
    const to = typeof req.query.to === "string" && req.query.to.startsWith("/") ? req.query.to : "/settings";
    back(res, to, "Yadda saxlanıldı");
  });

  // ================= AI ASSISTANT =================
  app.get("/assistant", (req, res) => {
    res.send(
      layout("AI cavab", "/assistant", `
      <h1>Alıcı mesajına AI cavab</h1>
      <div class="card"><form method="post" action="/assistant">
        <label><span>Alıcının mesajı</span><textarea name="message" rows="6" required>${esc(req.query.m ?? "")}</textarea></label>
        <label><span>Sifariş məlumatı (istəyə görə: sifariş nömrəsi, tracking, status)</span><input name="order"></label>
        <button>Cavab hazırla</button></form></div>`, flash(req)),
    );
  });
  app.post("/assistant", async (req, res) => {
    const b = req.body as Record<string, string>;
    let reply: string;
    try {
      reply = await engine.writer.draftReply({ buyerMessage: b.message ?? "", orderInfo: b.order ?? "" });
    } catch (err) {
      reply = `Xəta: ${errMsg(err)}`;
    }
    res.send(
      layout("AI cavab", "/assistant", `
      <h1>Hazır cavab</h1>
      <div class="card"><pre>${esc(reply)}</pre></div>
      <div class="card muted">Mətni kopyala və eBay Messages-də göndər.</div>
      <a class="btn" href="/assistant">Yeni mesaj</a>`),
    );
  });

  // ================= LOGS =================
  app.get("/logs", (req, res) => {
    const level = typeof req.query.level === "string" ? req.query.level : "";
    const rows = (level
      ? db.prepare("SELECT * FROM logs WHERE level = ? ORDER BY id DESC LIMIT 500").all(level)
      : db.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 500").all()) as { level: string; area: string; message: string; created_at: string }[];
    res.send(
      layout("Loglar", "/logs", `
      <h1>Loglar</h1><div class="row" style="margin-bottom:12px"><a class="badge" href="/logs">hamısı</a><a class="badge warn" href="/logs?level=warn">warn</a><a class="badge bad" href="/logs?level=error">error</a></div>
      <div class="card wrap"><table>${rows.map((l) => `<tr><td class="muted" style="white-space:nowrap">${esc(l.created_at)}</td><td class="${l.level === "error" ? "bad" : l.level === "warn" ? "warn" : ""}">${esc(l.level)}</td><td>${esc(l.area)}</td><td>${esc(l.message)}</td></tr>`).join("")}</table></div>`),
    );
  });

  return app;
}
