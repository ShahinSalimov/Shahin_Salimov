// Main operational pages: overview, orders (with timeline), messages,
// returns/cancellations, money, activity feed and listing management.

import type { Express, Request, Response } from "express";
import type { Config } from "../config.ts";
import type { Engine, OrderRow, ProductRow } from "../services/engine.ts";
import type { CaseRow, MessageRow, Ops } from "../services/ops.ts";
import { JOBS, type JobName, type Scheduler } from "../services/scheduler.ts";
import { saveSettings } from "../settings.ts";
import { esc, eventsTable, layout, setNavCounts, statusBadge } from "./views.ts";

type Ctx = {
  cfg: Config;
  engine: Engine;
  ops: Ops;
  scheduler: Scheduler;
  flash: (req: Request) => string | undefined;
  back: (res: Response, to: string, msg: string) => void;
};

type EventRow = { kind: string; text: string; ref: string | null; created_at: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;

const JOB_AZ: Record<JobName, string> = {
  orders: "Yeni sifarişlər",
  messages: "Alıcı mesajları",
  cases: "Return / ləğv / INR",
  tracking: "Tracking (CJ → eBay)",
  sync: "Stok və qiymət",
  finance: "Maliyyə və CJ balansı",
  research: "Məhsul araşdırması",
};

const ORDER_STATUS_AZ: Record<string, string> = {
  new: "Yeni",
  supplier_ordered: "CJ-də sifariş edilib",
  awaiting_payment: "CJ ödənişi gözləyir",
  shipped: "Göndərilib",
  needs_attention: "Diqqət tələb edir",
  cancelled: "Ləğv olunub",
};

const REFUND_REASONS: [string, string][] = [
  ["BUYER_RETURN", "Alıcı qaytarır"],
  ["ITEM_NOT_RECEIVED", "Məhsul çatmayıb"],
  ["SELLER_OUT_OF_STOCK", "Stokda yoxdur"],
  ["BUYER_CANCEL", "Alıcı ləğv etdi"],
  ["OTHER", "Digər"],
];

export function registerPages(app: Express, ctx: Ctx): void {
  const { cfg, engine, ops, scheduler, flash, back } = ctx;
  const db = engine.db;
  const count = (sql: string, ...p: (string | number)[]) => (db.prepare(sql).get(...p) as { n: number }).n;

  const waiting = () => ({
    orders: count("SELECT COUNT(*) n FROM orders WHERE status IN ('needs_attention','awaiting_payment')"),
    messages: count("SELECT COUNT(*) n FROM messages WHERE direction='in' AND status='unanswered'"),
    cases: count("SELECT COUNT(*) n FROM cases WHERE open=1"),
    candidates: 0,
  });
  setNavCounts(waiting);

  /** Order economics: real eBay fees when the Finances API has them, else estimate. */
  const economics = (o: OrderRow) => {
    const s = engine.settings();
    const sale = o.total ?? 0;
    const feesReal = o.ebay_fees !== null && o.ebay_fees !== undefined;
    const fees = feesReal ? o.ebay_fees! : sale * (s.ebayFeePercent / 100) + s.ebayFixedFee;
    const cost = o.supplier_cost ?? 0;
    const refunded = o.refunded ?? 0;
    return { sale, fees, feesReal, cost, refunded, profit: sale - fees - cost - refunded };
  };

  // ================= OVERVIEW =================
  app.get("/", (req, res) => {
    const s = engine.settings();
    const w = waiting();
    const problems = engine.setupProblems(s);
    const bal = ops.cachedBalance();

    const todo: string[] = [];
    if (w.orders) todo.push(`<a href="/orders?f=attention">${w.orders} sifariş sənin qərarını gözləyir</a>`);
    if (w.messages) todo.push(`<a href="/messages">${w.messages} cavabsız alıcı mesajı</a>`);
    if (w.cases) todo.push(`<a href="/cases">${w.cases} açıq return / ləğv / INR halı</a>`);
    if (bal.amount !== null && bal.amount < s.lowBalanceAlert) todo.push(`CJ balansı aşağıdır: ${money(bal.amount)}. CJ wallet-ə pul yüklə`);
    for (const p of problems) todo.push(`<a href="/ebay">Quraşdırma: ${esc(p)}</a>`);

    const today = (sql: string) => count(sql);
    const day = {
      orders: today("SELECT COUNT(*) n FROM orders WHERE date(created_at) = date('now')"),
      shipped: today("SELECT COUNT(*) n FROM events WHERE kind='shipped' AND date(created_at) = date('now')"),
      listed: today("SELECT COUNT(*) n FROM events WHERE kind='listing' AND text LIKE 'Elan yükləndi%' AND date(created_at) = date('now')"),
      messages: today("SELECT COUNT(*) n FROM messages WHERE direction='in' AND date(created_at) = date('now')"),
    };
    const m30 = db
      .prepare("SELECT * FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now','-30 days')")
      .all() as OrderRow[];
    const tot = m30.reduce(
      (a, o) => {
        const e = economics(o);
        return { sale: a.sale + e.sale, profit: a.profit + e.profit };
      },
      { sale: 0, profit: 0 },
    );

    const stats: [string, string | number, string?][] = [
      ["Bu gün sifariş", day.orders, "/orders"],
      ["Bu gün göndərilən", day.shipped, "/orders"],
      ["Bu gün yeni elan", day.listed, "/products?status=listed"],
      ["Bu gün mesaj", day.messages, "/messages"],
      ["Aktiv elan", count("SELECT COUNT(*) n FROM products WHERE status='listed'"), "/products?status=listed"],
      ["Satış (30 gün)", money(tot.sale), "/finance"],
      ["Xalis mənfəət (30 gün)", money(tot.profit), "/finance"],
      ["CJ balansı", bal.amount === null ? "?" : money(bal.amount), "/finance"],
    ];

    const modes = [
      cfg.dryRun ? '<span class="badge warn">DRY_RUN: real əməliyyat yoxdur</span>' : '<span class="badge ok">LIVE</span>',
      `<span class="badge">Təchizatçı: ${esc(engine.supplier.name)}</span>`,
      engine.writer.enabled ? '<span class="badge ok">AI: aktiv</span>' : '<span class="badge warn">AI: söndürülüb</span>',
      s.automationEnabled ? '<span class="badge ok">Avtomatlaşdırma: aktiv</span>' : '<span class="badge bad">Avtomatlaşdırma: dayanıb</span>',
    ].join(" ");

    const jobs = JOBS.map((name) => {
      const st = scheduler.state[name];
      return `<tr><td>${JOB_AZ[name]}</td><td>${st.running ? '<span class="warn">işləyir...</span>' : st.lastRun ? esc(st.lastRun.toLocaleString()) : "-"}</td>
        <td class="muted">${st.nextRun ? esc(st.nextRun.toLocaleTimeString()) : "-"}</td>
        <td><form class="inline" method="post" action="/jobs/${name}"><button class="ghost">İndi işlət</button></form></td></tr>`;
    }).join("");

    const events = db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 25").all() as EventRow[];

    res.send(
      layout(
        "Panel",
        "/",
        `<h1>Panel</h1><div class="row" style="margin-bottom:12px">${modes}
          <form class="inline" method="post" action="/automation"><input type="hidden" name="on" value="${s.automationEnabled ? "false" : "true"}">
          <button class="${s.automationEnabled ? "ghost" : ""}">${s.automationEnabled ? "Avtomatlaşdırmanı dayandır" : "Avtomatlaşdırmanı başlat"}</button></form></div>
        <div class="card"><h2>Səndən gözlənilənlər</h2>
          ${todo.length ? todo.map((t) => `<div class="todo"><span class="count">!</span>${t}</div>`).join("") : '<p class="ok">Hər şey qaydasındadır. Sistem işləyir, sənin müdaxilən lazım deyil.</p>'}
        </div>
        <div class="grid" style="margin-bottom:16px">${stats
          .map(([l, n, href]) => `<a class="stat" style="text-decoration:none;color:inherit" href="${href}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></a>`)
          .join("")}</div>
        <div class="two">
          <div class="card"><h2>Son hadisələr <a class="muted" style="font-size:13px;font-weight:400" href="/activity">hamısı →</a></h2>${eventsTable(events)}</div>
          <div class="card"><h2>Avtomatik işlər</h2><div class="wrap"><table><tr><th>İş</th><th>Son</th><th>Növbəti</th><th></th></tr>${jobs}</table></div>
          <p class="muted">Səhifə hər 60 saniyədə özü yenilənir.</p></div>
        </div>`,
        flash(req),
        60,
      ),
    );
  });

  app.post("/jobs/:name", (req, res) => {
    const name = String(req.params.name) as JobName;
    if (!JOBS.includes(name)) return void res.status(404).send("unknown job");
    void scheduler.run(name);
    back(res, "/", `"${JOB_AZ[name]}" işə salındı. Nəticə bir neçə saniyəyə hadisələrdə görünəcək.`);
  });

  app.post("/automation", (req, res) => {
    const on = String(req.body.on) === "true";
    saveSettings(db, { automationEnabled: on });
    back(res, "/", on ? "Avtomatlaşdırma başladı" : "Avtomatlaşdırma dayandırıldı. Elanlar eBay-də qalır, amma yeni sifariş/sync işləmir");
  });

  // ================= ACTIVITY =================
  app.get("/activity", (req, res) => {
    const kind = typeof req.query.kind === "string" ? req.query.kind : "";
    const rows = (kind
      ? db.prepare("SELECT * FROM events WHERE kind = ? ORDER BY id DESC LIMIT 500").all(kind)
      : db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 500").all()) as EventRow[];
    const filters = ["", "order", "supplier", "shipped", "message", "return", "cancel", "inquiry", "refund", "payout", "listing", "stock", "price", "attention"]
      .map((k) => `<a class="badge ${k === kind ? "ok" : ""}" href="/activity${k ? `?kind=${k}` : ""}">${k || "hamısı"}</a>`)
      .join(" ");
    res.send(layout("Hadisələr", "/activity", `<h1>Hadisələr</h1><div class="row" style="margin-bottom:12px">${filters}</div><div class="card">${eventsTable(rows)}</div>`, flash(req), 60));
  });

  // ================= ORDERS =================
  app.get("/orders", (req, res) => {
    const f = typeof req.query.f === "string" ? req.query.f : "";
    const where =
      f === "attention" ? "WHERE status IN ('needs_attention','awaiting_payment')"
      : f === "open" ? "WHERE status IN ('new','supplier_ordered','awaiting_payment','needs_attention')"
      : f === "shipped" ? "WHERE status = 'shipped'"
      : "";
    const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT 300`).all() as (OrderRow & { created_at: string })[];
    const tabs = [["", "Hamısı"], ["attention", "Diqqət"], ["open", "Açıq"], ["shipped", "Göndərilən"]]
      .map(([k, l]) => `<a class="badge ${k === f ? "ok" : ""}" href="/orders${k ? `?f=${k}` : ""}">${l}</a>`)
      .join(" ");
    const body = rows
      .map((o) => {
        const to = JSON.parse(o.ship_to);
        const items = (JSON.parse(o.line_items) as { quantity: number; title: string }[]).map((l) => `${l.quantity}× ${esc(l.title)}`).join("<br>");
        const e = economics(o);
        return `<tr><td><a href="/orders/${o.id}"><b>${esc(o.ebay_order_id)}</b></a><div class="muted">${esc(o.created_at)}</div></td><td>${items}</td>
          <td>${esc(o.buyer)}<div class="muted">${esc(to.city)}, ${esc(to.state)}</div></td>
          <td>${money(o.total)}<div class="${e.profit >= 0 ? "ok" : "bad"}">mənfəət ${money(e.profit)}${e.feesReal ? "" : "*"}</div></td>
          <td>${statusBadge(o.status)}<div class="muted">${esc(ORDER_STATUS_AZ[o.status] ?? "")}</div>${o.note ? `<div class="bad">${esc(o.note)}</div>` : ""}</td>
          <td>${o.tracking_number ? `${esc(o.carrier)}<div class="muted">${esc(o.tracking_number)}</div>` : "-"}</td>
          <td><a class="btn" href="/orders/${o.id}">Aç</a></td></tr>`;
      })
      .join("");
    res.send(
      layout(
        "Sifarişlər",
        "/orders",
        `<h1>Sifarişlər</h1><div class="row" style="margin-bottom:12px">${tabs}</div>
        <div class="card wrap"><table><tr><th>eBay sifariş</th><th>Məhsul</th><th>Alıcı</th><th>Məbləğ</th><th>Status</th><th>Tracking</th><th></th></tr>
        ${body || '<tr><td colspan="7" class="muted">Sifariş yoxdur.</td></tr>'}</table>
        <p class="muted">* eBay komissiyası təxminidir. Maliyyə sinxronlaşandan sonra real rəqəm göstərilir.</p></div>`,
        flash(req),
      ),
    );
  });

  app.get("/orders/by/:ebayId", (req, res) => {
    const o = db.prepare("SELECT id FROM orders WHERE ebay_order_id = ?").get(String(req.params.ebayId)) as { id: number } | undefined;
    res.redirect(o ? `/orders/${o.id}` : "/orders");
  });

  app.get("/orders/:id", (req, res) => {
    const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(req.params.id)) as (OrderRow & { created_at: string }) | undefined;
    if (!o) return void res.redirect("/orders");
    const to = JSON.parse(o.ship_to);
    const lines = JSON.parse(o.line_items) as { quantity: number; title: string; sku: string; price: number; itemId?: string }[];
    const e = economics(o);
    const events = db.prepare("SELECT * FROM events WHERE ref = ? ORDER BY id ASC").all(o.ebay_order_id) as EventRow[];
    const msgs = db
      .prepare("SELECT * FROM messages WHERE (direction='in' AND sender = ?) OR (direction='out' AND recipient = ?) ORDER BY COALESCE(received_at, created_at) ASC")
      .all(o.buyer ?? "", o.buyer ?? "") as MessageRow[];
    const cases = db.prepare("SELECT * FROM cases WHERE ebay_order_id = ? ORDER BY id DESC").all(o.ebay_order_id) as CaseRow[];

    const actions: string[] = [];
    if (o.status === "new" || o.status === "needs_attention") {
      actions.push(`<form class="inline" method="post" action="/orders/${o.id}/fulfill"><button>CJ-də sifariş et</button></form>`);
    }
    if (o.status === "awaiting_payment") {
      actions.push(`<form class="inline" method="post" action="/orders/${o.id}/pay"><button>CJ-də ödə (wallet)</button></form>`);
      actions.push(`<form class="inline" method="post" action="/orders/${o.id}/paid"><button class="ghost">Özüm ödədim</button></form>`);
    }

    const steps: [string, boolean][] = [
      ["eBay sifarişi", true],
      ["CJ sifarişi", !!o.supplier_order_id],
      ["CJ ödənişi", ["supplier_ordered", "shipped"].includes(o.status)],
      ["Göndərildi", o.status === "shipped"],
    ];
    const progress = o.status === "cancelled"
      ? '<span class="badge bad">Ləğv olunub</span>'
      : steps.map(([l, done]) => `<span class="badge ${done ? "ok" : "muted"}">${done ? "✓" : "○"} ${l}</span>`).join(" → ");

    res.send(
      layout(
        `Sifariş ${o.ebay_order_id}`,
        "/orders",
        `<p><a href="/orders">← Sifarişlər</a></p>
        <h1>Sifariş ${esc(o.ebay_order_id)} ${statusBadge(o.status)}</h1>
        <div class="row" style="margin-bottom:12px">${progress}</div>
        ${o.note ? `<div class="card bad">${esc(o.note)}</div>` : ""}
        ${actions.length ? `<div class="card row">${actions.join(" ")}</div>` : ""}
        <div class="two">
          <div>
            <div class="card"><h2>Məhsullar</h2><table>${lines
              .map((l) => {
                const p = db.prepare("SELECT id FROM products WHERE sku = ?").get(l.sku) as { id: number } | undefined;
                return `<tr><td>${l.quantity}×</td><td>${p ? `<a href="/products/${p.id}">${esc(l.title)}</a>` : esc(l.title)}<div class="muted">${esc(l.sku)}</div></td><td>${money(l.price)}</td></tr>`;
              })
              .join("")}</table></div>
            <div class="card"><h2>Tarixçə</h2>${eventsTable(events, false)}</div>
            <div class="card"><h2>Alıcı ilə yazışma</h2>
              ${msgs.map((m) => `<div class="msg ${m.direction}"><div class="muted">${m.direction === "in" ? esc(m.sender) : "Sən"} · ${esc(m.received_at ?? m.created_at)}</div><pre>${esc(m.body)}</pre></div>`).join("") || '<p class="muted">Yazışma yoxdur.</p>'}
              <form method="post" action="/orders/${o.id}/message">
                <label><span>Mövzu</span><input name="subject" value="About your order" required></label>
                <label><span>Mesaj (ingilis dilində)</span><textarea name="body" rows="4" required></textarea></label>
                <button>Alıcıya göndər</button></form>
            </div>
          </div>
          <div>
            <div class="card"><h2>Pul</h2><dl>
              <dt>Satış</dt><dd>${money(e.sale)}</dd>
              <dt>eBay komissiyası</dt><dd>−${money(e.fees)}${e.feesReal ? "" : " (təxmini)"}</dd>
              <dt>CJ maya</dt><dd>−${money(e.cost)}${o.supplier_cost === null ? " (hələ yoxdur)" : ""}</dd>
              ${e.refunded ? `<dt>Geri qaytarılıb</dt><dd class="bad">−${money(e.refunded)}</dd>` : ""}
              <dt><b>Xalis mənfəət</b></dt><dd><b class="${e.profit >= 0 ? "ok" : "bad"}">${money(e.profit)}</b></dd></dl></div>
            <div class="card"><h2>Çatdırılma</h2><dl>
              <dt>Alıcı</dt><dd>${esc(o.buyer)}</dd><dt>Ad</dt><dd>${esc(to.name)}</dd>
              <dt>Ünvan</dt><dd>${esc(to.address1)} ${esc(to.address2)}<br>${esc(to.city)}, ${esc(to.state)} ${esc(to.zip)}, ${esc(to.countryCode)}</dd>
              <dt>CJ sifariş</dt><dd>${esc(o.supplier_order_id ?? "-")}</dd><dt>CJ status</dt><dd>${esc(o.supplier_status ?? "-")}</dd>
              <dt>Tracking</dt><dd>${o.tracking_number ? `${esc(o.carrier)} ${esc(o.tracking_number)}` : "-"}</dd></dl></div>
            ${cases.length ? `<div class="card"><h2>Problemlər</h2>${cases.map((c) => `<p><span class="badge ${c.open ? "warn" : "muted"}">${c.open ? "açıq" : "bağlı"}</span> ${esc(c.kind)}: ${esc(c.reason)}<br><span class="muted">${esc(c.handled ?? "")}</span></p>`).join("")}<a href="/cases">Problemlərə keç →</a></div>` : ""}
            <div class="card"><h2>Pulu qaytar</h2>
              <form method="post" action="/orders/${o.id}/refund" onsubmit="return confirm('Pulu alıcıya qaytarmaq istədiyinə əminsən?')">
                <label><span>Məbləğ (maks. ${money(o.total)})</span><input name="amount" value="${(o.total ?? 0).toFixed(2)}" inputmode="decimal"></label>
                <label><span>Səbəb</span><select name="reason">${REFUND_REASONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
                <button class="bad">Pulu qaytar</button></form></div>
          </div>
        </div>`,
        flash(req),
      ),
    );
  });

  app.post("/orders/:id/fulfill", async (req, res) => {
    const id = Number(req.params.id);
    db.prepare("UPDATE orders SET status='new', note=NULL WHERE id=? AND status='needs_attention'").run(id);
    const ok = await engine.fulfill(id);
    back(res, `/orders/${id}`, ok ? "CJ sifarişi yaradıldı" : cfg.dryRun ? "DRY_RUN rejimidir, real sifariş yaradılmadı" : "Alınmadı, qeydə bax");
  });
  app.post("/orders/:id/pay", async (req, res) => {
    const id = Number(req.params.id);
    const err = await engine.payNow(id);
    back(res, `/orders/${id}`, err ?? "CJ sifarişi wallet-dən ödənildi");
  });
  app.post("/orders/:id/paid", (req, res) => {
    engine.markPaid(Number(req.params.id));
    back(res, `/orders/${req.params.id}`, "Qeyd edildi. Tracking avtomatik izlənəcək.");
  });
  app.post("/orders/:id/message", async (req, res) => {
    try {
      await ops.messageBuyer(Number(req.params.id), String(req.body.subject ?? ""), String(req.body.body ?? ""));
      back(res, `/orders/${req.params.id}`, cfg.dryRun ? "DRY_RUN: mesaj saxlandı, eBay-ə göndərilmədi" : "Mesaj göndərildi");
    } catch (err) {
      back(res, `/orders/${req.params.id}`, `Göndərilmədi: ${errMsg(err)}`);
    }
  });
  app.post("/orders/:id/refund", async (req, res) => {
    try {
      await ops.refund(Number(req.params.id), Number(req.body.amount), String(req.body.reason ?? "OTHER"));
      back(res, `/orders/${req.params.id}`, cfg.dryRun ? "DRY_RUN: geri ödəmə qeyd edildi, real pul qaytarılmadı" : "Pul qaytarıldı");
    } catch (err) {
      back(res, `/orders/${req.params.id}`, `Alınmadı: ${errMsg(err)}`);
    }
  });

  // ================= MESSAGES =================
  app.get("/messages", (req, res) => {
    const unanswered = db.prepare("SELECT * FROM messages WHERE direction='in' AND status='unanswered' ORDER BY id ASC").all() as MessageRow[];
    const history = db.prepare("SELECT * FROM messages WHERE NOT (direction='in' AND status='unanswered') ORDER BY id DESC LIMIT 100").all() as MessageRow[];
    const card = (m: MessageRow) => {
      const order = ops.findOrder({ buyer: m.sender ?? "" });
      return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(m.sender)}</b>
        <span class="muted">${esc(m.received_at ?? m.created_at)}${order ? ` · <a href="/orders/${order.id}">sifariş ${esc(order.ebay_order_id)}</a>` : ""}${m.item_title ? ` · ${esc(m.item_title)}` : ""}</span></div>
        ${m.subject ? `<div class="muted">${esc(m.subject)}</div>` : ""}<div class="msg"><pre>${esc(m.body)}</pre></div>
        <form method="post" action="/messages/${m.id}/reply">
          <label><span>Cavab ${m.ai_draft ? "(AI hazırladı, istəsən dəyiş)" : ""}</span><textarea name="body" rows="5" required>${esc(m.ai_draft ?? "")}</textarea></label>
          <button>Göndər</button></form>
        <div class="row" style="margin-top:8px">
          <form class="inline" method="post" action="/messages/${m.id}/draft"><button class="ghost">AI ilə ${m.ai_draft ? "yenidən " : ""}yaz</button></form>
          <form class="inline" method="post" action="/messages/${m.id}/done"><button class="ghost">Cavab lazım deyil</button></form></div>
      </div>`;
    };
    res.send(
      layout(
        "Mesajlar",
        "/messages",
        `<h1>Mesajlar</h1>
        <div class="row" style="margin-bottom:12px"><form class="inline" method="post" action="/jobs/messages"><button class="ghost">eBay-dən indi yoxla</button></form>
        <a class="btn" href="/assistant" style="background:transparent;color:var(--ink);border:1px solid var(--line)">Əl ilə mətn üçün AI köməkçi</a></div>
        <h2>Cavab gözləyənlər (${unanswered.length})</h2>
        ${unanswered.map(card).join("") || '<div class="card ok">Cavabsız mesaj yoxdur.</div>'}
        <h2>Tarixçə</h2><div class="card">${history
          .map((m) => `<div class="msg ${m.direction}"><div class="muted">${m.direction === "in" ? esc(m.sender) : `Sən → ${esc(m.recipient)}`} · ${esc(m.received_at ?? m.created_at)} · ${esc(m.status)}</div><pre>${esc(m.body)}</pre></div>`)
          .join("") || '<p class="muted">Boşdur.</p>'}</div>`,
        flash(req),
      ),
    );
  });
  app.post("/messages/:id/reply", async (req, res) => {
    try {
      await ops.reply(Number(req.params.id), String(req.body.body ?? "").trim());
      back(res, "/messages", cfg.dryRun ? "DRY_RUN: cavab saxlandı, eBay-ə göndərilmədi" : "Cavab göndərildi");
    } catch (err) {
      back(res, "/messages", `Göndərilmədi: ${errMsg(err)}`);
    }
  });
  app.post("/messages/:id/draft", async (req, res) => {
    try {
      await ops.draft(Number(req.params.id));
      back(res, "/messages", "AI cavab hazırladı");
    } catch (err) {
      back(res, "/messages", `AI xətası: ${errMsg(err)}`);
    }
  });
  app.post("/messages/:id/done", (req, res) => {
    db.prepare("UPDATE messages SET status='answered' WHERE id = ?").run(Number(req.params.id));
    back(res, "/messages", "Cavablandırılmış kimi qeyd edildi");
  });

  // ================= CASES =================
  app.get("/cases", (req, res) => {
    const open = db.prepare("SELECT * FROM cases WHERE open = 1 ORDER BY id DESC").all() as CaseRow[];
    const closed = db.prepare("SELECT * FROM cases WHERE open = 0 ORDER BY id DESC LIMIT 100").all() as CaseRow[];
    const KIND: Record<string, string> = { return: "Return", cancel: "Ləğv sorğusu", inquiry: "Item not received" };
    const row = (c: CaseRow, withActions: boolean) => {
      const order = ops.findOrder({ orderId: c.ebay_order_id ?? "", buyer: c.buyer ?? "" });
      const acts: string[] = [];
      if (withActions && c.kind === "cancel") acts.push(`<form class="inline" method="post" action="/cases/${c.id}/approve-cancel"><button>Ləğvi təsdiqlə</button></form>`);
      if (withActions && c.kind === "return") acts.push(`<form class="inline" method="post" action="/cases/${c.id}/accept-return"><button class="ghost">Return-u qəbul et</button></form>`);
      if (withActions && order && c.kind !== "cancel") {
        acts.push(`<form class="inline" method="post" action="/cases/${c.id}/refund" onsubmit="return confirm('${money(order.total)} alıcıya qaytarılsın?')"><button class="bad">Tam pulu qaytar (məhsul alıcıda qalsın)</button></form>`);
      }
      if (withActions) acts.push(`<form class="inline" method="post" action="/cases/${c.id}/close"><button class="ghost">Bağlı kimi qeyd et</button></form>`);
      return `<tr><td><b>${esc(KIND[c.kind] ?? c.kind)}</b><div class="muted">${esc(c.opened_at ?? "")}</div></td>
        <td>${esc(c.buyer)}${order ? `<div><a href="/orders/${order.id}">${esc(order.ebay_order_id)}</a></div>` : `<div class="muted">${esc(c.ebay_order_id ?? "")}</div>`}</td>
        <td>${esc(c.reason)}${c.comment ? `<div class="muted">"${esc(c.comment)}"</div>` : ""}</td>
        <td>${c.amount ? money(c.amount) : "-"}</td><td class="muted">${esc(c.state)}</td>
        <td>${esc(c.handled ?? "")}</td><td style="min-width:220px">${acts.join(" ")}</td></tr>`;
    };
    res.send(
      layout(
        "Problemlər",
        "/cases",
        `<h1>Return, ləğv və "item not received"</h1>
        <div class="card muted">Sistem avtomatik: ləğv sorğusunu məhsul göndərilməyibsə təsdiqləyir (CJ sifarişini də ləğv edir), "item not received" halına tracking göndərir. Return-də qərar səndədir. Ucuz məhsullarda adətən "pulu qaytar, məhsul alıcıda qalsın" daha sərfəlidir, çünki geri göndərmə xərci çox vaxt məhsulun qiymətindən baha olur.</div>
        <div class="row" style="margin-bottom:12px"><form class="inline" method="post" action="/jobs/cases"><button class="ghost">eBay-dən indi yoxla</button></form></div>
        <div class="card wrap"><h2>Açıq (${open.length})</h2><table><tr><th>Növ</th><th>Alıcı / sifariş</th><th>Səbəb</th><th>Məbləğ</th><th>eBay status</th><th>Sistem nə etdi</th><th></th></tr>
          ${open.map((c) => row(c, true)).join("") || '<tr><td colspan="7" class="ok">Açıq problem yoxdur.</td></tr>'}</table></div>
        <div class="card wrap"><h2>Bağlanmış</h2><table>${closed.map((c) => row(c, false)).join("") || '<tr><td class="muted">Boşdur.</td></tr>'}</table></div>`,
        flash(req),
      ),
    );
  });
  const caseAction = (path: string, fn: (id: number) => Promise<string | null | void>, okMsg: string) =>
    app.post(`/cases/:id/${path}`, async (req, res) => {
      try {
        const r = await fn(Number(req.params.id));
        back(res, "/cases", typeof r === "string" ? r : cfg.dryRun ? `DRY_RUN: ${okMsg} (real əməliyyat yoxdur)` : okMsg);
      } catch (err) {
        back(res, "/cases", `Alınmadı: ${errMsg(err)}`);
      }
    });
  caseAction("approve-cancel", (id) => ops.approveCancel(id), "Ləğv təsdiqləndi");
  caseAction("accept-return", (id) => ops.acceptReturn(id), "Return qəbul edildi");
  caseAction(
    "refund",
    async (id) => {
      const c = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow;
      const o = ops.findOrder({ orderId: c.ebay_order_id ?? "", buyer: c.buyer ?? "" });
      if (!o) return "Sifariş tapılmadı";
      await ops.refund(o.id, o.total ?? 0, c.kind === "inquiry" ? "ITEM_NOT_RECEIVED" : "BUYER_RETURN", id);
      return null;
    },
    "Pul qaytarıldı",
  );
  caseAction(
    "close",
    async (id) => {
      db.prepare("UPDATE cases SET open = 0, handled = COALESCE(handled || '; ', '') || 'əllə bağlandı' WHERE id = ?").run(id);
    },
    "Bağlandı",
  );

  // ================= FINANCE =================
  app.get("/finance", (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const orders = db
      .prepare(`SELECT * FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now', ?) ORDER BY id DESC`)
      .all(`-${days} days`) as (OrderRow & { created_at: string })[];
    const t = orders.reduce(
      (a, o) => {
        const e = economics(o);
        return { sale: a.sale + e.sale, fees: a.fees + e.fees, cost: a.cost + e.cost, refunded: a.refunded + e.refunded, profit: a.profit + e.profit, est: a.est || !e.feesReal };
      },
      { sale: 0, fees: 0, cost: 0, refunded: 0, profit: 0, est: false },
    );
    const payouts = db.prepare("SELECT * FROM payouts ORDER BY payout_date DESC LIMIT 20").all() as { payout_id: string; status: string; amount: number; payout_date: string }[];
    const bal = ops.cachedBalance();
    const best = db
      .prepare(
        `SELECT p.id, COALESCE(p.ebay_title, p.title) t, COUNT(*) n, SUM(o.total) s FROM orders o, json_each(o.line_items) li
         JOIN products p ON p.sku = json_extract(li.value, '$.sku')
         WHERE o.status != 'cancelled' AND o.created_at >= datetime('now', ?) GROUP BY p.id ORDER BY n DESC LIMIT 10`,
      )
      .all(`-${days} days`) as { id: number; t: string; n: number; s: number }[];
    const tabs = [7, 30, 90, 365].map((d) => `<a class="badge ${d === days ? "ok" : ""}" href="/finance?days=${d}">${d} gün</a>`).join(" ");
    const stats: [string, string, string?][] = [
      ["Satış", money(t.sale)],
      ["eBay komissiyası", `−${money(t.fees)}`, t.est ? "qismən təxmini" : "real"],
      ["CJ xərci", `−${money(t.cost)}`],
      ["Geri qaytarılan", `−${money(t.refunded)}`],
      ["Xalis mənfəət", money(t.profit)],
      ["Sifariş sayı", String(orders.length)],
      ["Orta mənfəət / sifariş", money(orders.length ? t.profit / orders.length : 0)],
      ["CJ balansı", bal.amount === null ? "?" : money(bal.amount), bal.at ? `yoxlandı: ${new Date(bal.at).toLocaleString()}` : ""],
    ];
    res.send(
      layout(
        "Maliyyə",
        "/finance",
        `<h1>Maliyyə</h1><div class="row" style="margin-bottom:12px">${tabs}
          <form class="inline" method="post" action="/jobs/finance"><button class="ghost">eBay və CJ-dən indi yenilə</button></form></div>
        <div class="grid" style="margin-bottom:16px">${stats.map(([l, n, sub]) => `<div class="stat"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${sub ? `<div class="muted" style="font-size:12px">${esc(sub)}</div>` : ""}</div>`).join("")}</div>
        <div class="two">
          <div class="card wrap"><h2>Sifarişlər üzrə</h2><table><tr><th>Sifariş</th><th>Satış</th><th>eBay</th><th>CJ</th><th>Mənfəət</th></tr>
            ${orders.map((o) => { const e = economics(o); return `<tr><td><a href="/orders/${o.id}">${esc(o.ebay_order_id)}</a><div class="muted">${esc(o.created_at)}</div></td><td>${money(e.sale)}</td><td>${money(e.fees)}${e.feesReal ? "" : "*"}</td><td>${money(e.cost)}</td><td class="${e.profit >= 0 ? "ok" : "bad"}">${money(e.profit)}</td></tr>`; }).join("") || '<tr><td colspan="5" class="muted">Sifariş yoxdur.</td></tr>'}
          </table><p class="muted">* təxmini komissiya</p></div>
          <div>
            <div class="card"><h2>Ən çox satanlar</h2>${best.map((b) => `<div class="todo"><b>${b.n}×</b><a href="/products/${b.id}">${esc(b.t)}</a><span class="muted">${money(b.s)}</span></div>`).join("") || '<p class="muted">Hələ satış yoxdur.</p>'}</div>
            <div class="card"><h2>eBay payout-ları (bank hesabına)</h2><table>${payouts.map((p) => `<tr><td>${esc(p.payout_date?.slice(0, 10))}</td><td>${money(p.amount)}</td><td class="muted">${esc(p.status)}</td></tr>`).join("") || '<tr><td class="muted">Hələ məlumat yoxdur.</td></tr>'}</table></div>
          </div>
        </div>`,
        flash(req),
      ),
    );
  });

  // ================= PRODUCT MANAGEMENT =================
  app.get("/products/:id", (req, res) => {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id)) as ProductRow | undefined;
    if (!p) return void res.redirect("/products");
    const images = JSON.parse(p.images) as string[];
    const sales = db
      .prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND line_items LIKE ?")
      .get(`%"sku":"${p.sku}"%`) as { n: number; s: number };
    const events = db.prepare("SELECT * FROM events WHERE ref = ? ORDER BY id DESC LIMIT 30").all(p.sku) as EventRow[];
    const aspects = p.ebay_aspects ? (JSON.parse(p.ebay_aspects) as Record<string, string[]>) : {};
    const live = p.status === "listed" || p.status === "paused";
    res.send(
      layout(
        p.ebay_title ?? p.title,
        "/products",
        `<p><a href="/products?status=${live ? "listed" : p.status}">← Elanlar</a></p>
        <h1>${esc(p.ebay_title ?? p.title)} ${statusBadge(p.status)}</h1>
        <div class="row" style="margin-bottom:12px">${images.slice(0, 6).map((i) => `<img class="thumb" style="width:90px;height:90px" src="${esc(i)}">`).join("")}</div>
        <div class="two">
          <div>
            ${live ? `<div class="card"><h2>Redaktə</h2><form method="post" action="/products/${p.id}/edit">
              <label><span>eBay title (max 80)</span><input name="title" maxlength="80" value="${esc(p.ebay_title ?? p.title)}"></label>
              <label><span>Qiymət, $ (əl ilə dəyişsən, qiymət avtomatik "sabit" rejiminə keçir)</span><input name="price" value="${p.price.toFixed(2)}" inputmode="decimal"></label>
              <label><span>Qiymət rejimi</span><select name="lock"><option value="auto" ${p.price_locked ? "" : "selected"}>Avtomatik (CJ mayasına görə)</option><option value="lock" ${p.price_locked ? "selected" : ""}>Sabit (mənim qiymətim)</option></select></label>
              <button>Yadda saxla və eBay-də yenilə</button></form></div>
            <div class="card row">
              ${p.status === "paused"
                ? `<form class="inline" method="post" action="/products/${p.id}/resume"><button>Elanı aktivləşdir</button></form>`
                : `<form class="inline" method="post" action="/products/${p.id}/pause"><button class="ghost">Dayandır (say 0)</button></form>`}
              <form class="inline" method="post" action="/products/${p.id}/end" onsubmit="return confirm('Elan eBay-dən tam silinsin?')"><button class="bad">Elanı bitir</button></form>
              ${p.ebay_listing_id && !p.ebay_listing_id.startsWith("DRY") ? `<a class="btn" style="background:transparent;color:var(--ink);border:1px solid var(--line)" target="_blank" href="https://www.ebay.com/itm/${esc(p.ebay_listing_id)}">eBay-də bax</a>` : ""}
            </div>` : ""}
            <div class="card"><h2>Tarixçə</h2>${eventsTable(events, false)}</div>
            ${p.ebay_description ? `<div class="card"><h2>Description</h2><div style="max-height:400px;overflow:auto">${p.ebay_description}</div></div>` : ""}
          </div>
          <div>
            <div class="card"><h2>Rəqəmlər</h2><dl>
              <dt>Satış qiyməti</dt><dd><b>${money(p.price)}</b>${p.price_locked ? " (sabit)" : ""}</dd>
              <dt>CJ maya</dt><dd>${money(p.cost)}</dd><dt>Çatdırılma</dt><dd>${money(p.shipping_cost)} · ${esc(p.shipping_days ?? "?")} gün</dd>
              <dt>Mənfəət / satış</dt><dd class="${p.profit >= 0 ? "ok" : "bad"}">${money(p.profit)}</dd>
              <dt>CJ stok</dt><dd>${p.stock}</dd><dt>Bazar medianı</dt><dd>${p.competitor_median ? money(p.competitor_median) : "-"}</dd>
              <dt>Bal</dt><dd>${p.score}</dd><dt>Satılıb</dt><dd>${sales.n} dəfə, ${money(sales.s)}</dd>
              <dt>SKU</dt><dd>${esc(p.sku)}</dd><dt>Anbar / xətt</dt><dd>${esc((p.logistic_name ?? "").replace("|", " / "))}</dd>
              <dt>Son sync</dt><dd>${esc((p as ProductRow & { last_synced_at?: string }).last_synced_at ?? "-")}</dd></dl></div>
            ${Object.keys(aspects).length ? `<div class="card"><h2>Item specifics</h2><dl>${Object.entries(aspects).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v.join(", "))}</dd>`).join("")}</dl></div>` : ""}
            ${p.last_error ? `<div class="card bad">${esc(p.last_error)}</div>` : ""}
          </div>
        </div>`,
        flash(req),
      ),
    );
  });

  const productAction = (path: string, fn: (id: number, req: Request) => Promise<void>, okMsg: string) =>
    app.post(`/products/:id/${path}`, async (req, res) => {
      const id = Number(req.params.id);
      try {
        await fn(id, req);
        back(res, `/products/${id}`, cfg.dryRun ? `${okMsg} (DRY_RUN: eBay dəyişmədi)` : okMsg);
      } catch (err) {
        back(res, `/products/${id}`, `Alınmadı: ${errMsg(err)}`);
      }
    });
  productAction(
    "edit",
    (id, req) => ops.editListing(id, { title: String(req.body.title ?? ""), price: Number(req.body.price), mode: req.body.lock === "lock" ? "lock" : "auto" }),
    "Yadda saxlanıldı",
  );
  productAction("pause", (id) => ops.pauseListing(id), "Elan dayandırıldı");
  productAction("resume", (id) => ops.resumeListing(id), "Elan aktivdir");
}
