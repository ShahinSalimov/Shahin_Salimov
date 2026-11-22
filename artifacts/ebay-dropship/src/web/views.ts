// Server-rendered HTML for the dashboard (Azerbaijani UI).

export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const NAV: [string, string, string?][] = [
  ["/", "Panel"],
  ["/orders", "Sifarişlər", "orders"],
  ["/messages", "Mesajlar", "messages"],
  ["/cases", "Problemlər", "cases"],
  ["/products?status=listed", "Elanlar"],
  ["/products?status=candidate", "Namizədlər", "candidates"],
  ["/finance", "Maliyyə"],
  ["/activity", "Hadisələr"],
  ["/settings", "Ayarlar"],
  ["/ebay", "Qoşulma"],
  ["/logs", "Loglar"],
];

export type NavCounts = Partial<Record<"orders" | "messages" | "cases" | "candidates", number>>;
let navCounts: () => NavCounts = () => ({});
/** Red badges in the menu: things waiting for you. */
export function setNavCounts(fn: () => NavCounts): void {
  navCounts = fn;
}

export const EVENT_LABELS: Record<string, [string, string]> = {
  order: ["Sifariş", "ok"],
  supplier: ["CJ", "muted"],
  shipped: ["Göndərildi", "ok"],
  message: ["Mesaj", "accent"],
  return: ["Return", "warn"],
  cancel: ["Ləğv", "warn"],
  inquiry: ["INR", "warn"],
  refund: ["Geri ödəmə", "warn"],
  payout: ["Payout", "ok"],
  listing: ["Elan", "muted"],
  stock: ["Stok", "muted"],
  price: ["Qiymət", "muted"],
  research: ["Araşdırma", "muted"],
  balance: ["Balans", "bad"],
  attention: ["Diqqət", "bad"],
};

export function eventsTable(rows: { kind: string; text: string; ref: string | null; created_at: string }[], linkRefs = true): string {
  if (!rows.length) return '<p class="muted">Hələ hadisə yoxdur.</p>';
  return `<div class="wrap"><table>${rows
    .map((e) => {
      const [label, cls] = EVENT_LABELS[e.kind] ?? [e.kind, "muted"];
      const ref = e.ref && linkRefs && /^\d{2}-\d{5}-\d{5}$|^\d+-\d+$/.test(e.ref) ? ` <a href="/orders/by/${esc(e.ref)}">${esc(e.ref)}</a>` : "";
      return `<tr><td class="muted" style="white-space:nowrap">${esc(e.created_at)}</td><td><span class="badge ${cls}">${esc(label)}</span></td><td>${esc(e.text)}${ref}</td></tr>`;
    })
    .join("")}</table></div>`;
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#16181d;--muted:#667085;--line:#e4e7ec;--accent:#2457d6;--ok:#12805c;--warn:#b54708;--bad:#c01048}
@media (prefers-color-scheme: dark){:root{--bg:#0f1115;--card:#171a21;--ink:#e8eaef;--muted:#98a2b3;--line:#2a2f3a;--accent:#6c95ff;--ok:#3ccb92;--warn:#f5a524;--bad:#ff6b8f}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--card);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header b{font-size:15px;margin-right:8px}header a{color:var(--muted);text-decoration:none;padding:4px 6px;border-radius:6px}
header a.on,header a:hover{color:var(--ink);background:var(--bg)}
main{max-width:1280px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:0 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.stat .n{font-size:24px;font-weight:600}.stat .l{color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500}
.wrap{overflow-x:auto}
button,.btn{background:var(--accent);color:#fff;border:0;border-radius:7px;padding:7px 12px;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}button.bad{background:var(--bad);color:#fff}
a.badge{text-decoration:none;color:var(--ink)}a.badge.ok{color:var(--ok);border-color:var(--ok)}
form.inline{display:inline}
input,select,textarea{font:inherit;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink);width:100%}
label{display:block;margin-bottom:10px}label span{display:block;color:var(--muted);font-size:12px;margin-bottom:3px}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;border:1px solid var(--line);white-space:nowrap}
.badge.accent{color:var(--accent)}.count{background:var(--bad);color:#fff;border-radius:99px;font-size:11px;padding:0 6px;margin-left:4px}
.todo{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.todo:last-child{border:0}
.msg{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px}.msg.out{background:var(--bg)}
.two{display:grid;grid-template-columns:2fr 1fr;gap:16px}@media (max-width:900px){.two{grid-template-columns:1fr}}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.muted{color:var(--muted)}
img.thumb{width:56px;height:56px;object-fit:cover;border-radius:6px;background:var(--bg)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
pre{white-space:pre-wrap;word-break:break-word;margin:0}
`;

export function layout(title: string, path: string, body: string, flash?: string, refresh = 0): string {
  let counts: NavCounts = {};
  try {
    counts = navCounts();
  } catch {
    counts = {};
  }
  const nav = NAV.map(([href, label, key]) => {
    const base = path.split("?")[0]!;
    const on = href === path || (!href.includes("?") && (href === base || (href !== "/" && base.startsWith(href + "/"))));
    const n = key ? counts[key as keyof NavCounts] ?? 0 : 0;
    return `<a href="${href}" class="${on ? "on" : ""}">${label}${n ? `<span class="count">${n}</span>` : ""}</a>`;
  }).join("");
  return `<!doctype html><html lang="az"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · eBay Dropship</title>${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ""}<style>${CSS}</style></head>
<body><header><b>eBay Dropship</b>${nav}</header><main>
${flash ? `<div class="card ok">${esc(flash)}</div>` : ""}${body}</main></body></html>`;
}

export function statusBadge(status: string): string {
  const cls =
    ["listed", "shipped", "supplier_ordered"].includes(status) ? "ok"
    : ["error", "needs_attention", "cancelled"].includes(status) ? "bad"
    : ["awaiting_payment", "paused"].includes(status) ? "warn"
    : "muted";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

export const SETTING_LABELS: Record<string, [string, string]> = {
  marginPercent: ["Hədəf mənfəət, %", "Satış qiymətinin neçə faizi xalis mənfəət olsun"],
  minProfit: ["Minimum mənfəət, $", "Bundan az qazandıran məhsul satılmır"],
  ebayFeePercent: ["eBay komissiyası, %", "Final value fee (vergi daxil effektiv)"],
  ebayFixedFee: ["eBay sabit haqq, $", "Hər sifariş üçün"],
  adRatePercent: ["Promoted listings, %", "İstifadə etmirsənsə 0"],
  maxPrice: ["Maksimum satış qiyməti, $", ""],
  minPrice: ["Minimum satış qiyməti, $", ""],
  keywords: ["Axtarış açar sözləri", "Vergüllə ayır. Sistem bunlarla CJ-də məhsul axtarır"],
  productsPerKeyword: ["Hər açar söz üçün məhsul sayı", ""],
  maxCompetitorPriceRatio: ["Rəqib qiymət limiti", "1.05 = bazar medianından 5%-dən çox baha olmasın"],
  maxShippingDays: ["Maksimum çatdırılma, gün", ""],
  shipFromCountries: ["Anbar ölkələri", "Üstünlük sırası ilə, məs. US,CN"],
  minStock: ["Minimum stok", ""],
  automationEnabled: ["Avtomatlaşdırma aktivdir", "Bütün planlı işlərin ümumi açarı"],
  autoApproveMinScore: ["Avto-elan üçün minimum bal", "Bu bal və yuxarı olan namizədlər avtomatik eBay-ə yüklənir. 0 = söndür"],
  maxActiveListings: ["Maksimum aktiv elan", "eBay satış limitini aşma"],
  dailyListingLimit: ["Gündəlik yeni elan limiti", ""],
  autoFulfill: ["Avtomatik sifariş (CJ)", "eBay sifarişi gələndə CJ-də sifariş yaradılır"],
  autoPaySupplier: ["CJ balansından avto-ödəniş", "CJ wallet-də pul olmalıdır"],
  listingQuantity: ["eBay-də göstərilən say", ""],
  handlingDays: ["Handling time, gün", "Fulfillment policy ilə eyni olsun"],
  autoApproveCancellations: ["Ləğv sorğularını avtomatik təsdiqlə", "Məhsul hələ göndərilməyibsə, sistem CJ sifarişini ləğv edib eBay-də təsdiqləyir"],
  autoProvideTracking: ["'Item not received' halına avtomatik tracking ver", ""],
  autoDraftReplies: ["Yeni mesajlara AI cavab layihəsi", "Hər yeni alıcı mesajı üçün cavab hazırlanır, sən bir kliklə göndərirsən"],
  autoSendReplies: ["AI cavabını avtomatik göndər", "Diqqət: cavablar sənin baxışın olmadan göndərilir"],
  lowBalanceAlert: ["CJ balans xəbərdarlığı, $", "Balans bundan aşağı düşəndə Telegram mesajı"],
  messagesEveryMin: ["Mesaj yoxlama intervalı, dəq", ""],
  casesEveryMin: ["Return/cancel yoxlama intervalı, dəq", ""],
  financeEveryMin: ["Maliyyə yoxlama intervalı, dəq", ""],
  researchEveryMin: ["Araşdırma intervalı, dəq", ""],
  syncEveryMin: ["Stok/qiymət sync intervalı, dəq", ""],
  ordersEveryMin: ["Sifariş yoxlama intervalı, dəq", ""],
  trackingEveryMin: ["Tracking yoxlama intervalı, dəq", ""],
  fulfillmentPolicyId: ["Fulfillment policy ID", "eBay qoşulma səhifəsindən seç"],
  paymentPolicyId: ["Payment policy ID", ""],
  returnPolicyId: ["Return policy ID", ""],
  merchantLocationKey: ["Inventory location key", ""],
};
