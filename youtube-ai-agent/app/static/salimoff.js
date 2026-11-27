/* SALIMOFF AI YOUTUBE — control panel (vanilla JS, works on desktop and phone). */
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const ago = (t) => { if (!t) return "—"; const s = Date.now() / 1000 - t; return s < 60 ? "indicə" : s < 3600 ? `${Math.round(s / 60)} dəq əvvəl` : s < 86400 ? `${Math.round(s / 3600)} saat əvvəl` : `${Math.round(s / 86400)} gün əvvəl`; };
const dt = (iso) => (iso ? new Date(iso).toLocaleString("az-AZ", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const STATUS = { idea: "ideya", approved: "təsdiqli", producing: "istehsalda", ready: "hazır", uploading: "yüklənir", scheduled: "planlı", published: "dərc olunub", failed: "alınmadı", rejected: "rədd" };
let timers = [];

async function api(path, o = {}) {
  const opt = { method: o.method || "GET", headers: {} };
  if (o.body !== undefined) { opt.body = JSON.stringify(o.body); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch(path.startsWith("/api") ? path : "/api/salimoff" + path, opt);
  if (r.status === 401) { location.href = "/login"; throw new Error("auth"); }
  const data = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) { const m = data?.detail || data || r.statusText; toast(m, "err"); throw new Error(m); }
  return data;
}
function toast(msg, cls = "") { const d = document.createElement("div"); d.className = cls; d.textContent = msg; $("#toast").appendChild(d); setTimeout(() => d.remove(), 5000); }
function every(ms, fn) { const h = setInterval(fn, ms); timers.push(h); }
function bar(p) { return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`; }
function delta(x) { return x == null ? "" : `<small class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : ""}${x}%</small>`; }

async function waitJob(key, el, done) {
  const tick = async () => {
    const j = await api(`/jobs/${key}`);
    if (el) el.innerHTML = `<div class="row"><b>${esc(j.message || "")}</b> <span class="muted">${j.progress ?? 0}%</span></div>${bar(j.progress || 0)}${j.error ? `<p class="err">${esc(j.error)}</p>` : ""}`;
    if (j.status === "done") { clearInterval(h); done && done(j); }
    if (j.status === "error") { clearInterval(h); toast(j.error || "Xəta", "err"); }
  };
  const h = setInterval(tick, 1200); timers.push(h); tick();
}

// ------------------------------------------------------------------ router
async function route() {
  timers.forEach(clearInterval); timers = [];
  const [, page = "", id, tab] = location.hash.split("/");
  document.querySelectorAll("nav a[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  try {
    if (page === "") await viewDashboard();
    else if (page === "launch") await viewLaunch();
    else if (page === "research") id ? await viewResearch(id) : await viewResearchList();
    else if (page === "channel") await viewChannel(id, tab || "overview");
    else if (page === "system") await viewSystem();
  } catch (e) { if (e.message !== "auth") view.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
window.addEventListener("hashchange", route);

// ------------------------------------------------------------------ dashboard
const FLOW = [["1. Analiz", "YouTube datası, rəqabət, RPM"], ["2. Qərar", "Şəffaf bal formulu"], ["3. Kanal", "Ad, brend, stil, profillər"],
  ["4. İstehsal", "Long + Shorts, avtomatik"], ["5. Upload", "Planlı dərc, thumbnail"], ["6. Hesabat", "Hər 3 gün + öyrənmə"]];

async function viewDashboard() {
  const o = await api("/overview");
  $("#demoBadge").classList.toggle("hidden", !o.demo_mode);
  $("#schedState").textContent = o.system.scheduler_enabled ? "Autopilot dövrü: aktiv" : "Autopilot dövrü: söndürülüb";
  const r = o.ready;
  const chip = (ok, label) => `<span class="chip ${ok ? "on" : "off"}">${label}</span>`;
  view.innerHTML = `<div class="row" style="justify-content:space-between"><h1>SALIMOFF AI YOUTUBE</h1>
      <a href="#/launch"><button class="primary">Yeni kanal başlat</button></a></div>
    <div class="flow">${FLOW.map(([a, b]) => `<div><b>${a}</b>${b}</div>`).join("")}</div>
    <div class="chips">${o.demo_mode ? '<span class="chip off">Demo rejimi: real API çağırılmır</span>' : ""}
      ${chip(r.llm, "AI (ssenari/analiz)")}${chip(r.images, "Şəkillər")}${chip(r.voice, "Səs")}
      ${chip(r.youtube_api_key, "YouTube Data API")}${chip(r.oauth, "Google OAuth")}
      <a href="#/system" class="chip">Ayarla</a></div>
    <h2>Kanallar</h2>
    <div class="chcards">${o.channels.map(chCard).join("") || `<div class="card muted">Hələ kanal yoxdur. "Yeni kanal başlat" düyməsi ilə sistem bazarı analiz edib kanalı özü quracaq.</div>`}</div>
    <h2>Son analizlər</h2>
    <div class="card tablewrap"><table><tr><th>Tarix</th><th>Dil / region</th><th>Qərar</th><th></th></tr>
      ${o.research.map((x) => `<tr><td>${ago(x.created)}</td><td>${esc(x.input.language)} / ${esc(x.input.region)}</td><td>${esc(x.decision || x.status)}</td>
        <td><a href="#/research/${x.id}"><button class="small">Aç</button></a></td></tr>`).join("") || '<tr><td colspan=4 class="muted">yoxdur</td></tr>'}</table></div>`;
  view.querySelectorAll(".chcard").forEach((c) => (c.onclick = () => (location.hash = `#/channel/${c.dataset.id}`)));
  every(10000, async () => { if (location.hash === "" || location.hash === "#/") viewDashboard(); });
}

function chCard(c) {
  const k = c.last_report?.kpis, d = c.last_report?.deltas || {};
  const ap = c.autopilot;
  return `<div class="card chcard" data-id="${c.id}">
    <div class="chhead">${c.logo ? `<img src="/api/salimoff/channels/${c.id}/asset/logo" alt="">` : '<div class="ph"></div>'}
      <div><b>${esc(c.name)}</b><div class="muted">${esc(c.niche)} · ${esc(c.language)}</div></div></div>
    <div class="row"><span class="st ${ap.enabled ? "ready" : ""}">${ap.enabled ? "Autopilot: " + (ap.mode === "full" ? "tam avtomatik" : "təsdiqlə") : "Autopilot söndürülüb"}</span>
      <span class="st ${c.youtube.connected ? "published" : "failed"}">${c.youtube.connected ? "YouTube qoşulub" : "YouTube qoşulmayıb"}</span></div>
    <div class="counts">${Object.entries(c.counts).filter(([, v]) => v).map(([s, v]) => `<span>${STATUS[s]} <b>${v}</b></span>`).join("") || '<span>plan boşdur</span>'}</div>
    ${k ? `<div class="kpis"><div class="kpi"><span>Baxış (${c.autopilot.report_every_days} gün)</span><b>${fmt(k.views)}</b>${delta(d.views)}</div>
      <div class="kpi"><span>Abunəçi (net)</span><b>${fmt(k.subs_net)}</b>${delta(d.subs_net)}</div>
      <div class="kpi"><span>İzlənmə saatı</span><b>${fmt(k.watch_hours)}</b>${delta(d.watch_hours)}</div></div>` : '<div class="muted">Hesabat hələ yoxdur</div>'}
    <div class="muted" style="font-size:12px">${esc(c.log.at(-1)?.msg || "")}</div></div>`;
}

// ------------------------------------------------------------------ launch
async function viewLaunch() {
  view.innerHTML = `<h1>Yeni kanal: analiz → qərar → kanal</h1>
   <div class="card"><div class="grid">
     <div><label>Kanalın dili</label><input id="language" value="English"></div>
     <div><label>Hədəf region (ISO kod: US, GB, DE, TR, AZ...)</label><input id="region" value="US"></div>
     <div><label>Vizual üslub</label><input id="style" value="realistic cinematic"></div>
     <div><label>Məqsəd</label><select id="goal"><option value="monetization">Tez monetizasiya</option><option value="authority">Brend / ekspert kanalı</option><option value="traffic">Maksimum trafik (Shorts)</option></select></div>
     <div><label>Long video üçün büdcə ($)</label><input id="budget" type="number" value="5"></div>
     <div><label>Neçə niş müqayisə olunsun</label><input id="cands" type="number" value="8" min="3" max="12"></div>
     <div style="grid-column:1/-1"><label>Maraq sahələri (könüllü)</label><input id="interests" placeholder="məs. tarix, kosmos, biznes, psixologiya"></div>
     <div style="grid-column:1/-1"><label>Konkret nişlər (könüllü, vergüllə). Boş qalsa AI özü təklif edir</label><input id="niches" placeholder="məs. Ancient Rome stories, Luxury cars facts"></div>
     <div style="grid-column:1/-1"><label>Autopilot rejimi</label><select id="mode">
       <option value="approve">Təsdiqlə — sistem planlayır, istehsala ideyanı siz təsdiqləyirsiniz (tövsiyə olunur)</option>
       <option value="full">Tam avtomatik — sistem özü seçir, istehsal edir və yükləyir</option></select></div>
   </div>
   <div class="row" style="margin-top:14px"><button class="primary" id="go">Hamısını sistem etsin</button><button id="only">Yalnız analiz et</button></div>
   <p class="muted">"Hamısını sistem etsin": bazar analizi, niş qərarı, kanal strategiyası, loqo/banner, Long və Shorts profilləri, ilk kontent planı, sonra autopilot.</p>
   <div id="prog"></div></div>`;
  const inp = () => ({ language: $("#language").value.trim(), region: $("#region").value.trim().toUpperCase(), style: $("#style").value.trim(),
    goal: $("#goal").value, budget_per_long_usd: +$("#budget").value, candidates: +$("#cands").value, interests: $("#interests").value.trim(),
    niches: $("#niches").value.split(",").map((s) => s.trim()).filter(Boolean) });
  $("#go").onclick = async () => {
    $("#go").disabled = $("#only").disabled = true;
    const r = await api("/launch", { method: "POST", body: { input: inp(), mode: $("#mode").value } });
    waitJob(r.job, $("#prog"), (j) => { toast("Kanal hazırdır", "ok"); location.hash = `#/channel/${j.result.channel_id}`; });
  };
  $("#only").onclick = async () => { const r = await api("/research", { method: "POST", body: inp() }); location.hash = `#/research/${r.id}`; };
}

// ------------------------------------------------------------------ research
async function viewResearchList() {
  const list = await api("/research");
  view.innerHTML = `<h1>Analizlər</h1><div class="card tablewrap"><table><tr><th>Tarix</th><th>Dil / region</th><th>Maraq</th><th>Qərar</th><th></th></tr>
   ${list.map((x) => `<tr><td>${ago(x.created)}</td><td>${esc(x.input.language)} / ${esc(x.input.region)}</td><td>${esc(x.input.interests)}</td><td>${esc(x.decision || x.status)}</td>
     <td><a href="#/research/${x.id}"><button class="small">Aç</button></a></td></tr>`).join("") || '<tr><td colspan=5 class="muted">yoxdur</td></tr>'}</table></div>`;
}

async function viewResearch(id) {
  const r = await api(`/research/${id}`);
  if (r.status !== "done") {
    view.innerHTML = `<h1>Analiz gedir</h1><div class="card" id="prog"></div>${r.status === "error" ? `<div class="card err">${esc(r.error)}</div>` : ""}`;
    if (r.job.status === "running") waitJob(`research:${id}`, $("#prog"), () => route());
    return;
  }
  const d = r.decision, p = r.patterns || {};
  const src = { youtube_data: "real YouTube məlumatı", ai_estimate: "AI təxmini (YouTube API açarı yoxdur)", demo: "demo məlumat" }[r.data_source] || r.data_source;
  view.innerHTML = `<h1>Analiz nəticəsi</h1>
   <div class="card win"><h3>Sistemin qərarı: ${esc(d.niche)} <span class="muted">· ${d.score}/100 · etibarlılıq: ${d.confidence}</span></h3>
     <p>${esc(d.reason)}</p><p class="muted">Məlumat mənbəyi: ${src}. Alternativlər: ${d.alternatives.map(esc).join(", ")}</p>
     <div class="row"><button class="primary" id="build">Bu nişdə kanal yarat</button></div><div id="prog"></div></div>
   <h2>Nişlərin müqayisəsi</h2>
   <div class="card tablewrap"><table><tr><th>#</th><th>Niş</th><th>Bal</th><th>Göstəricilər</th><th>Data</th><th></th></tr>
   ${r.candidates.map((c, i) => `<tr><td>${i + 1}</td><td><b>${esc(c.name)}</b><div class="muted">${esc(c.description)}</div>
       <div class="muted" style="font-size:12px">Niyə: ${esc(c.why)}<br>Risk: ${esc(c.risks)}</div></td>
     <td><b style="font-size:18px">${c.score.total}</b></td>
     <td><div class="parts">${Object.entries(c.score.parts).map(([k, v]) => `<span>${esc(r.labels[k])}</span>${bar(v)}<span>${v}</span>`).join("")}</div></td>
     <td style="font-size:12px">${c.metrics ? `Median baxış: ${fmt(c.metrics.median_views)}<br>Kiçik kanal uğuru: ${Math.round(c.metrics.small_win_share * 100)}%<br>Yeni kanallar: ${Math.round(c.metrics.new_channel_share * 100)}%<br>Shorts payı: ${Math.round(c.metrics.shorts_share * 100)}%` : "AI təxmini"}<br>RPM ≈ $${c.rpm_usd}</td>
     <td>${c.name === d.niche ? '<span class="st ready">seçilib</span>' : `<button class="small" data-choose="${esc(c.name)}">Bunu seç</button>`}</td></tr>`).join("")}</table></div>
   <h2>Uğurlu videolardan çıxarılan nümunələr</h2>
   <div class="card grid">
     <div><h3>Başlıq formulları</h3><ul class="tight">${(p.title_formulas || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
     <div><h3>Hook nümunələri</h3><ul class="tight">${(p.hook_patterns || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
     <div><h3>Thumbnail</h3><ul class="tight">${(p.thumbnail_patterns || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
     <div><h3>Qaçın</h3><ul class="tight">${(p.avoid || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
     <div style="grid-column:1/-1"><p>${esc(p.summary || "")}</p><p class="muted">İdeal long: ${p.ideal_long_minutes} dəq · ideal Short: ${p.ideal_short_seconds} san · ${esc(p.posting || "")}</p></div></div>`;
  view.querySelectorAll("[data-choose]").forEach((b) => (b.onclick = async () => { await api(`/research/${id}/choose`, { method: "POST", body: { niche: b.dataset.choose } }); route(); }));
  $("#build").onclick = async () => {
    $("#build").disabled = true;
    const j = await api(`/research/${id}/build-channel`, { method: "POST", body: {} });
    waitJob(j.job, $("#prog"), (x) => (location.hash = `#/channel/${x.result}`));
  };
}

// ------------------------------------------------------------------ channel
const TABS = { overview: "Ümumi", plan: "Kontent planı", videos: "Videolar", reports: "Hesabatlar", brand: "Brend və strategiya", settings: "Autopilot və YouTube" };

async function viewChannel(id, tab) {
  const ch = await api(`/channels/${id}`);
  view.innerHTML = `<div class="chhead" style="margin-bottom:12px">${ch.assets.logo ? `<img src="/api/salimoff/channels/${id}/asset/logo" alt="">` : ""}
     <div><h1 style="margin:0">${esc(ch.name)}</h1><div class="muted">${esc(ch.niche)} · ${esc(ch.language)} · ${esc(ch.blueprint.handle || "")}</div></div></div>
   <div class="tabs">${Object.entries(TABS).map(([k, v]) => `<a href="#/channel/${id}/${k}"><button class="${k === tab ? "on" : ""}">${v}</button></a>`).join("")}</div>
   <div id="tab"></div>`;
  const el = $("#tab");
  ({ overview: tabOverview, plan: tabPlan, videos: tabVideos, reports: tabReports, brand: tabBrand, settings: tabSettings })[tab](el, ch);
}

function tabOverview(el, ch) {
  const ap = ch.autopilot, rep = ch.reports.at(-1);
  const c = (s) => ch.ideas.filter((i) => i.status === s).length;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between">
      <div><b>Autopilot: ${ap.enabled ? (ap.mode === "full" ? "tam avtomatik" : "təsdiq rejimi") : "söndürülüb"}</b>
        <div class="muted">Həftədə ${ap.long_per_week} long + ${ap.shorts_per_week} Shorts · hesabat hər ${ap.report_every_days} gün · bu gün xərc: $${ch.spent_today} / $${ap.daily_budget_usd}</div></div>
      <div class="row"><button id="toggle" class="${ap.enabled ? "" : "primary"}">${ap.enabled ? "Dayandır" : "Autopilotu işə sal"}</button><button id="tick">İndi addım at</button></div></div></div>
    <div class="kpis" style="margin-bottom:14px">${[["idea", "İdeya"], ["approved", "Təsdiqli"], ["producing", "İstehsalda"], ["ready", "Hazır"], ["scheduled", "Planlı"], ["published", "Dərc olunub"]]
      .map(([s, l]) => `<div class="kpi"><span>${l}</span><b>${c(s)}</b></div>`).join("")}</div>
    ${rep ? `<div class="card"><h3>Son hesabat (${ago(rep.created)})</h3><p>${esc(rep.insights.summary)}</p>
      <ol class="tight">${(rep.insights.actions || []).slice(0, 3).map((a) => `<li>${esc(a.action)}</li>`).join("")}</ol>
      <a href="#/channel/${ch.id}/reports"><button class="small">Bütün hesabat</button></a></div>` : ""}
    <div class="grid"><div class="card"><h3>Növbəti dərc vaxtları</h3>
      <p class="muted">Long</p>${ch.upcoming_slots.long.slice(0, 3).map((t) => `<div>${dt(t)}</div>`).join("") || "—"}
      <p class="muted">Shorts</p>${ch.upcoming_slots.short.slice(0, 4).map((t) => `<div>${dt(t)}</div>`).join("") || "—"}</div>
    <div class="card"><h3>Öyrənilənlər (sistem bunları növbəti ideyalarda istifadə edir)</h3>
      <ul class="tight">${ch.learnings.slice(-8).reverse().map((l) => `<li>${esc(l.text)} <span class="muted">· ${l.source}</span></li>`).join("") || "<li class=muted>hələ yoxdur</li>"}</ul></div></div>
    <div class="card"><h3>Fəaliyyət jurnalı</h3><div class="log">${ch.log.slice().reverse().map((l) => `<div class="${l.level}"><span class="muted">${ago(l.t)}</span> · ${esc(l.msg)}</div>`).join("")}</div></div>`;
  $("#toggle").onclick = async () => { await api(`/channels/${ch.id}`, { method: "PUT", body: { autopilot: { enabled: !ap.enabled } } }); route(); };
  $("#tick").onclick = async () => { const r = await api(`/channels/${ch.id}/tick`, { method: "POST" }); toast(r.did.length ? "Qərarlar: " + r.did.join(", ") : "Hazırda görüləcək iş yoxdur", "ok"); setTimeout(route, 800); };
  every(8000, () => route());
}

function tabPlan(el, ch) {
  const order = { producing: 0, approved: 1, idea: 2, ready: 3, uploading: 3, scheduled: 4, failed: 5, published: 6, rejected: 7 };
  const ideas = ch.ideas.slice().sort((a, b) => order[a.status] - order[b.status] || b.priority - a.priority);
  el.innerHTML = `<div class="card"><div class="row"><button class="primary" id="gen">AI ilə yeni ideyalar</button>
      <select id="flt" style="width:auto"><option value="">hamısı</option><option value="long">yalnız long</option><option value="short">yalnız Shorts</option></select>
      <span class="muted">Prioritet = AI proqnozu × pillar çəkisi (hesabatlardan)</span></div><div id="prog"></div></div>
    <div class="card tablewrap"><table id="tbl" class="stack"><tr><th>Növ</th><th>Başlıq</th><th>Pillar</th><th>Prioritet</th><th>Status</th><th></th></tr>
    ${ideas.map((i) => `<tr data-kind="${i.kind}"><td>${i.kind === "long" ? "Long" : "Short"}</td>
      <td><b>${esc(i.title)}</b><div class="muted" style="font-size:12px">${esc(i.hook)}</div>${i.error ? `<div class="err" style="font-size:12px">${esc(i.error.slice(0, 200))}</div>` : ""}</td>
      <td>${esc(i.pillar)}</td><td>${i.priority}</td><td><span class="st ${i.status}">${STATUS[i.status]}</span></td>
      <td class="row">${actions(i)}</td></tr>`).join("")}</table></div>
    <div class="card"><h3>Öz ideyanı əlavə et</h3><div class="grid">
      <div><label>Növ</label><select id="nk"><option value="long">Long</option><option value="short">Short</option></select></div>
      <div style="grid-column:span 2"><label>Başlıq</label><input id="nt"></div>
      <div style="grid-column:1/-1"><label>Qısa məzmun</label><textarea id="nb"></textarea></div></div>
      <button id="add" style="margin-top:10px">Əlavə et (təsdiqli)</button></div>`;
  $("#flt").onchange = () => el.querySelectorAll("#tbl tr[data-kind]").forEach((r) => (r.style.display = !$("#flt").value || r.dataset.kind === $("#flt").value ? "" : "none"));
  $("#gen").onclick = async () => { const j = await api(`/channels/${ch.id}/ideas/generate`, { method: "POST", body: {} }); waitJob(j.job, $("#prog"), () => route()); };
  $("#add").onclick = async () => { await api(`/channels/${ch.id}/ideas`, { method: "POST", body: { kind: $("#nk").value, title: $("#nt").value, brief: $("#nb").value } }); route(); };
  el.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const [act, iid] = b.dataset.act.split(":");
    if (act === "produce") { await api(`/channels/${ch.id}/ideas/${iid}/produce`, { method: "POST" }); toast("İstehsal başladı", "ok"); }
    else if (act === "upload") { await api(`/channels/${ch.id}/ideas/${iid}/upload`, { method: "POST", body: {} }); toast("Yükləmə başladı", "ok"); }
    else await api(`/channels/${ch.id}/ideas/${iid}`, { method: "PUT", body: { status: act } });
    setTimeout(route, 500);
  }));
}

function actions(i) {
  const b = (act, label, cls = "small") => `<button class="${cls}" data-act="${act}:${i.id}">${label}</button>`;
  const studio = i.project_id ? `<a href="studio.html#/project/${i.project_id}"><button class="small">Studio-da aç</button></a>` : "";
  if (i.status === "idea") return b("approved", "Təsdiqlə", "small primary") + b("rejected", "Rədd et") + b("produce", "İndi istehsal et");
  if (i.status === "approved") return b("produce", "İndi istehsal et", "small primary") + b("idea", "Geri al");
  if (i.status === "failed") return b("approved", "Yenidən cəhd") + studio;
  if (i.status === "ready") return b("upload", "YouTube-a yüklə", "small primary") + studio;
  if (i.status === "rejected") return b("idea", "Bərpa et");
  return studio + (i.yt_url ? `<a href="${esc(i.yt_url)}" target="_blank"><button class="small">YouTube</button></a>` : "");
}

function tabVideos(el, ch) {
  const vids = ch.ideas.filter((i) => ["ready", "uploading", "scheduled", "published"].includes(i.status)).sort((a, b) => (b.publish_at || "").localeCompare(a.publish_at || ""));
  el.innerHTML = `<div class="card tablewrap"><table class="stack"><tr><th>Növ</th><th>Başlıq</th><th>Status</th><th>Dərc vaxtı</th><th>Müddət</th><th>Xərc</th><th></th></tr>
   ${vids.map((i) => `<tr><td>${i.kind === "long" ? "Long" : "Short"}</td><td><b>${esc(i.title)}</b>${i.thumbnail_error ? `<div class="warn" style="font-size:12px">Thumbnail: ${esc(i.thumbnail_error.slice(0, 120))}</div>` : ""}</td>
     <td><span class="st ${i.status}">${STATUS[i.status]}</span></td><td>${dt(i.publish_at)}</td><td>${i.duration ? Math.round(i.duration) + " san" : "—"}</td><td>${i.cost != null ? "$" + i.cost : "—"}</td>
     <td class="row"><a href="/api/projects/${i.project_id}/output" target="_blank"><button class="small">MP4</button></a>${actions(i)}</td></tr>`).join("") || '<tr><td colspan=7 class="muted">Hələ hazır video yoxdur</td></tr>'}</table>
   <p class="muted">Ümumi xərc (bu kanal): $${ch.total_cost}</p></div>`;
  el.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const [act, iid] = b.dataset.act.split(":");
    if (act === "upload") await api(`/channels/${ch.id}/ideas/${iid}/upload`, { method: "POST", body: {} });
    toast("Yükləmə başladı", "ok"); setTimeout(route, 800);
  }));
}

async function tabReports(el, ch) {
  const last = ch.reports.at(-1);
  el.innerHTML = `<div class="card"><div class="row"><button class="primary" id="now">İndi hesabat hazırla</button>
      <span class="muted">Avtomatik: hər ${ch.autopilot.report_every_days} gündən bir (ən azı bir video yükləndikdən sonra)</span></div><div id="prog"></div></div>
    <div id="rep"></div>
    <div class="card tablewrap"><h3>Bütün hesabatlar</h3><table>${ch.reports.slice().reverse().map((r) => `<tr><td>${esc(r.period[0])} → ${esc(r.period[1])}${r.demo ? " (demo)" : ""}</td>
      <td>${fmt(r.kpis.views)} baxış</td><td>${fmt(r.kpis.subs_net)} abunəçi</td><td class="row"><button class="small" data-r="${r.id}">Bax</button>
      <a href="/api/salimoff/channels/${ch.id}/reports/${r.id}?format=html" target="_blank"><button class="small">HTML (müştəriyə göndərmək üçün)</button></a></td></tr>`).join("") || '<tr><td class="muted">yoxdur</td></tr>'}</table></div>`;
  $("#now").onclick = async () => { const j = await api(`/channels/${ch.id}/reports`, { method: "POST" }); waitJob(j.job, $("#prog"), () => route()); };
  const show = async (rid) => {
    const r = await api(`/channels/${ch.id}/reports/${rid}`);
    const k = r.kpis, d = r.deltas, y = r.ypp.current, ins = r.insights;
    const names = { views: "Baxış", watch_hours: "İzlənmə saatı", subs_net: "Abunəçi (net)", avd_sec: "Orta izlənmə (san)", avp: "Orta izlənmə %", engagement: "Engagement" };
    const ypp = (t) => `<div style="margin:6px 0"><b>${t === "early" ? "Erkən YPP" : "Tam YPP"}</b> <span class="muted">· təxmini ${r.ypp.eta_days[t] ?? "—"} gün</span>
      <div class="parts"><span>Abunəçi ${fmt(y.subs)}/${fmt(r.ypp.targets[t].subs)}</span>${bar(100 * y.subs / r.ypp.targets[t].subs)}<span></span>
      <span>Long saat ${fmt(y.hours)}/${fmt(r.ypp.targets[t].hours)}</span>${bar(100 * y.hours / r.ypp.targets[t].hours)}<span></span>
      <span>Shorts baxış ${fmt(y.shorts_views)}/${fmt(r.ypp.targets[t].shorts_views)}</span>${bar(100 * y.shorts_views / r.ypp.targets[t].shorts_views)}<span></span></div></div>`;
    $("#rep").innerHTML = `<div class="card"><h3>Hesabat ${esc(r.period[0])} → ${esc(r.period[1])}${r.demo ? " · DEMO məlumat" : ""}</h3>
      <div class="kpis">${Object.keys(names).map((n) => `<div class="kpi"><span>${names[n]}</span><b>${fmt(k[n])}</b>${delta(d[n])}</div>`).join("")}</div>
      <p>${esc(ins.summary)}</p>
      <div class="grid"><div><h3>Nə işlədi</h3><ul class="tight">${(ins.what_worked || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><h3>Nə işləmədi</h3><ul class="tight">${(ins.what_failed || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
      <h3>Növbəti addımlar</h3><ol class="tight">${(ins.actions || []).map((a) => `<li><b>[${esc(a.impact)}]</b> ${esc(a.action)} <span class="muted">— ${esc(a.why)}</span></li>`).join("")}</ol>
      ${r.applied?.length ? `<p class="ok">Avtomatik tətbiq olundu: ${r.applied.map(esc).join(", ")}</p>` : ""}
      <h3>Long vs Shorts</h3><p>Long: ${r.by_kind.long.count} video, orta ${fmt(r.by_kind.long.avg_views)} baxış · Shorts: ${r.by_kind.short.count} video, orta ${fmt(r.by_kind.short.avg_views)} baxış</p>
      <h3>Monetizasiya yolu</h3>${ypp("early")}${ypp("full")}${y.approx ? '<p class="muted">Bəzi rəqəmlər təxminidir.</p>' : ""}
      <h3>Videolar</h3><div class="tablewrap"><table><tr><th>Başlıq</th><th>Növ</th><th>Baxış</th><th>AVD</th><th>AVP</th></tr>
      ${r.videos.slice(0, 15).map((v) => `<tr><td>${esc(v.title)}</td><td>${v.kind}</td><td>${fmt(v.views)}</td><td>${v.avd}s</td><td>${v.avp}%</td></tr>`).join("")}</table></div></div>`;
  };
  el.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => show(b.dataset.r)));
  if (last) show(last.id);
}

function tabBrand(el, ch) {
  const bp = ch.blueprint;
  el.innerHTML = `<div class="card assets">
      <div>${ch.assets.logo ? `<img src="/api/salimoff/channels/${ch.id}/asset/logo?${ch.updated}" alt="logo">` : ""}<p class="muted">Profil şəkli (YouTube Studio-da əl ilə yüklənir)</p></div>
      <div>${ch.assets.banner ? `<img src="/api/salimoff/channels/${ch.id}/asset/banner?${ch.updated}" alt="banner">` : ""}<p class="muted">Banner (API ilə avtomatik yazılır)</p></div></div>
    <div class="card"><h3>Ad variantları</h3>${(bp.names || []).map((n) => `<div><b>${esc(n.name)}</b> <span class="muted">${esc(n.handle)} — ${esc(n.why)}</span></div>`).join("")}
      <label>Seçilmiş ad</label><input id="bname" value="${esc(ch.name)}">
      <label>Tagline</label><input id="btag" value="${esc(bp.tagline)}">
      <label>Kanal təsviri (About)</label><textarea id="bdesc">${esc(bp.description)}</textarea>
      <label>Açar sözlər (vergüllə)</label><input id="bkw" value="${esc((bp.keywords || []).join(", "))}">
      <div class="row" style="margin-top:10px"><button class="primary" id="bsave">Yadda saxla</button>
        <button id="remat">Profilləri, loqo və banneri yenidən yarat</button><button id="push" ${ch.youtube.connected ? "" : "disabled"}>Brendinqi YouTube-a yaz</button></div><div id="prog"></div></div>
    <div class="grid"><div class="card"><h3>Kontent pillar-ları</h3>${(bp.pillars || []).map((p) => `<div><b>${esc(p.name)}</b> <span class="muted">${p.share}% · çəki ${ch.pillar_weights[p.name] ?? 1}</span><div class="muted">${esc(p.description)}</div></div>`).join("")}</div>
      <div class="card"><h3>Formatlar</h3><p><b>Long:</b> ${bp.long?.minutes} dəq — ${esc(bp.long?.structure)}</p><p><b>Short:</b> ${bp.short?.seconds} san — ${esc(bp.short?.structure)}</p>
        <p><b>Ton:</b> ${esc(bp.tone)}</p><p><b>Səs:</b> ${esc(bp.voice_direction)} <span class="muted">(Video Studio → Ayarlar → Səsləndirmə-də uyğun voice ID seçin)</span></p></div>
      <div class="card"><h3>Vizual stil</h3><p>${esc(bp.visual_style?.prefix)} ${esc(bp.visual_style?.prompt)}</p><p class="muted">Thumbnail: ${esc(bp.thumbnail_style)}</p></div>
      <div class="card"><h3>Monetizasiya planı</h3><ol class="tight">${(bp.monetization_plan || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div></div>
    <div class="card checklist"><h3>Kanalı açma checklist-i (API ilə edilə bilməyən addımlar)</h3>
      ${(ch.checklist || []).map((c, i) => `<label><input type="checkbox" data-c="${i}" ${c.done ? "checked" : ""}> ${esc(c.text)}</label>`).join("")}</div>`;
  $("#bsave").onclick = async () => {
    await api(`/channels/${ch.id}`, { method: "PUT", body: { name: $("#bname").value, blueprint: { tagline: $("#btag").value, description: $("#bdesc").value,
      keywords: $("#bkw").value.split(",").map((s) => s.trim()).filter(Boolean) } } }); toast("Yadda saxlanıldı", "ok");
  };
  $("#remat").onclick = async () => { const j = await api(`/channels/${ch.id}/rematerialize`, { method: "POST" }); waitJob(j.job, $("#prog"), () => route()); };
  $("#push").onclick = async () => { const j = await api(`/channels/${ch.id}/branding`, { method: "POST" }); waitJob(j.job, $("#prog"), (x) => toast(x.result, "ok")); };
  el.querySelectorAll("[data-c]").forEach((cb) => (cb.onchange = async () => {
    const list = ch.checklist.map((c, i) => ({ ...c, done: i == cb.dataset.c ? cb.checked : c.done })); ch.checklist = list;
    await api(`/channels/${ch.id}`, { method: "PUT", body: { checklist: list } });
  }));
}

function tabSettings(el, ch) {
  const ap = ch.autopilot;
  const F = [["enabled", "Autopilot aktivdir", "bool"], ["mode", "Rejim", "select", [["approve", "Təsdiqlə (istehsal üçün ideyanı siz təsdiqləyirsiniz)"], ["full", "Tam avtomatik"]]],
    ["long_per_week", "Long video / həftə", "number"], ["shorts_per_week", "Shorts / həftə (max 14)", "number"],
    ["publish_hour_long", "Long dərc saatı (0-23)", "number"], ["publish_hour_short", "Shorts dərc saatı (0-23)", "number"],
    ["timezone", "Saat qurşağı", "text"], ["buffer_long", "Hazır saxlanılan long sayı", "number"], ["buffer_short", "Hazır saxlanılan Shorts sayı", "number"],
    ["daily_budget_usd", "Gündəlik büdcə limiti ($)", "number"], ["report_every_days", "Hesabat intervalı (gün)", "number"],
    ["auto_upload", "Hazır videoları avtomatik yüklə", "bool"], ["privacy", "Dərcdən sonra görünmə", "select", [["public", "public"], ["unlisted", "unlisted"], ["private", "private"]]]];
  el.innerHTML = `<div class="card"><h3>YouTube bağlantısı</h3>
     ${ch.youtube.connected ? `<p class="ok">Qoşulub: ${esc(ch.youtube.title)} (${esc(ch.youtube.channel_id)})</p><button id="disc">Bağlantını kəs</button>`
       : `<p class="muted">Upload, banner və analytics üçün kanalın Google hesabı ilə icazə verin. OAuth qoşulması proqramın işlədiyi kompüterin brauzerindən edilməlidir.</p><button class="primary" id="conn">YouTube-a qoş</button>`}</div>
   <div class="card"><h3>Autopilot</h3><div class="grid">${F.map(([k, l, t, o]) => t === "bool" ? `<div><label><input type="checkbox" data-k="${k}" ${ap[k] ? "checked" : ""}> ${l}</label></div>`
       : t === "select" ? `<div><label>${l}</label><select data-k="${k}">${o.map(([v, n]) => `<option value="${v}" ${ap[k] == v ? "selected" : ""}>${n}</option>`).join("")}</select></div>`
       : `<div><label>${l}</label><input data-k="${k}" type="${t}" value="${esc(ap[k])}"></div>`).join("")}</div>
     <button class="primary" id="save" style="margin-top:12px">Yadda saxla</button></div>
   <div class="card"><h3>Video profilləri</h3><p class="muted">Səs, keyfiyyət, musiqi kimi detallar Video Studio-dakı profillərdədir: "${esc(ch.name)} · Long" və "${esc(ch.name)} · Shorts". Profili Studio-da seçib dəyişin və "Profili yenilə" basın.</p>
     <a href="studio.html#/settings/voice"><button>Video Studio ayarları</button></a></div>
   <div class="card"><button id="del" class="small">Kanalı sistemdən sil</button> <span class="muted">YouTube-dakı kanala toxunmur.</span></div>`;
  $("#save").onclick = async () => {
    const body = {};
    el.querySelectorAll("[data-k]").forEach((i) => (body[i.dataset.k] = i.type === "checkbox" ? i.checked : i.type === "number" ? +i.value : i.value));
    await api(`/channels/${ch.id}`, { method: "PUT", body: { autopilot: body } }); toast("Yadda saxlanıldı", "ok");
  };
  const conn = $("#conn"); if (conn) conn.onclick = async () => { const r = await api(`/channels/${ch.id}/connect`, { method: "POST", body: {} }); if (r.auth_url) location.href = r.auth_url; else route(); };
  const disc = $("#disc"); if (disc) disc.onclick = async () => { await api(`/channels/${ch.id}/disconnect`, { method: "POST" }); route(); };
  $("#del").onclick = async () => { if (confirm("Kanal sistemdən silinsin?")) { await api(`/channels/${ch.id}`, { method: "DELETE" }); location.hash = "#/"; } };
}

// ------------------------------------------------------------------ system
async function viewSystem() {
  const [{ settings, keys }, o] = await Promise.all([api("/api/settings"), api("/overview")]);
  const rows = [["deepseek", "DeepSeek (analiz, plan, ssenari)"], ["anthropic", "Anthropic / Claude (alternativ)"], ["openai", "OpenAI (şəkillər, thumbnail, loqo)"],
    ["fish", "Fish Audio (səs)"], ["kie", "Kie.ai (səhnə animasiyası, könüllü)"],
    ["youtube_api_key", "YouTube Data API key (bazar analizi)"], ["google_client_id", "Google OAuth Client ID (upload, analytics)"], ["google_client_secret", "Google OAuth Client Secret"]];
  view.innerHTML = `<h1>Sistem ayarları</h1>
   <div class="card"><label><input type="checkbox" id="demo" ${settings.demo_mode ? "checked" : ""}> <b>Demo rejimi</b> — bütün sistem API-siz, pulsuz sınaq rejimində işləyir</label>
     <label><input type="checkbox" id="sched" ${o.system.scheduler_enabled ? "checked" : ""}> Autopilot dövrü (fon prosesi) aktivdir</label>
     <label>AI provider (analiz və ssenari üçün)</label><select id="prov" style="max-width:300px">${["deepseek", "anthropic", "openai"].map((p) => `<option ${settings.script.llm_provider === p ? "selected" : ""}>${p}</option>`).join("")}</select>
     <label>Model</label><input id="model" value="${esc(settings.script.llm_model)}" style="max-width:300px"></div>
   <div class="card"><h3>API açarları</h3>${rows.map(([k, l]) => `<label>${l}</label><div class="row"><input data-key="${k}" value="${esc(keys[k])}" style="flex:1">
     <button class="small" data-save="${k}">Yadda saxla</button><button class="small" data-test="${k}">Yoxla</button><span class="muted" data-res="${k}"></span></div>`).join("")}</div>
   <div class="card"><h3>Google Cloud qurulması (bir dəfə)</h3><ol class="tight">
     <li>console.cloud.google.com → yeni layihə → APIs &amp; Services → Library: <b>YouTube Data API v3</b> və <b>YouTube Analytics API</b>-ni Enable edin.</li>
     <li>Credentials → Create credentials → <b>API key</b> → yuxarıdakı "YouTube Data API key" xanasına.</li>
     <li>OAuth consent screen → External → Test users-ə öz Gmail-inizi əlavə edin.</li>
     <li>Credentials → Create credentials → <b>OAuth client ID</b> → Application type: <b>Desktop app</b> → Client ID və Secret-i yuxarıya yazın.</li>
     <li>Redirect ünvanı: <code>${esc(o.system.oauth_redirect)}</code></li>
     <li>Vacib: yoxlanılmamış (unverified) Google layihəsindən yüklənən videolar YouTube tərəfindən <b>private</b> rejimdə kilidlənir. Public dərc üçün Google-un "YouTube API Services audit" formunu doldurun. O vaxta qədər videolar yüklənir, amma Studio-da əl ilə public etmək lazım gəlir.</li>
     <li>Gündəlik kvota 10,000 vahiddir: bir upload ≈ 1,600, bir axtarış 100 vahiddir. Bu, gündə təxminən 6 upload deməkdir.</li></ol></div>`;
  $("#demo").onchange = async () => { await api("/api/settings", { method: "PUT", body: { demo_mode: $("#demo").checked } }); toast("Yadda saxlanıldı", "ok"); };
  $("#sched").onchange = async () => { await api("/system", { method: "PUT", body: { scheduler_enabled: $("#sched").checked } }); toast("Yadda saxlanıldı", "ok"); };
  const saveLLM = async () => { await api("/api/settings", { method: "PUT", body: { script: { llm_provider: $("#prov").value, llm_model: $("#model").value } } }); toast("Yadda saxlanıldı", "ok"); };
  $("#prov").onchange = () => { $("#model").value = { deepseek: "deepseek-reasoner", anthropic: "claude-sonnet-5-5", openai: "gpt-5" }[$("#prov").value]; saveLLM(); };
  $("#model").onchange = saveLLM;
  view.querySelectorAll("[data-save]").forEach((b) => (b.onclick = async () => {
    const k = b.dataset.save; await api("/api/keys", { method: "PUT", body: { [k]: $(`[data-key="${k}"]`).value } }); toast("Yadda saxlanıldı", "ok");
  }));
  view.querySelectorAll("[data-test]").forEach((b) => (b.onclick = async () => {
    const k = b.dataset.test, r = await api(`/api/keys/${k}/test`, { method: "POST" });
    const el = $(`[data-res="${k}"]`); el.textContent = r.message; el.className = r.ok ? "ok" : "err";
  }));
}

if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(() => {});
route();
