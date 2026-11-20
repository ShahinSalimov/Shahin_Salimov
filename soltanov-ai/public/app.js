// Soltanov AI — client (vanilla JS, no build step)
const $ = (s, el = document) => el.querySelector(s);
const root = $("#root");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function deviceId() {
  let id = LS.get("rp_device");
  if (!id) {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    id = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    LS.set("rp_device", id);
  }
  return id;
}

class ApiError extends Error {
  constructor(status, body) { super(body?.error || "Xəta"); this.status = status; this.body = body; }
}

async function api(method, url, body, raw) {
  const headers = { "x-device-id": deviceId() };
  let payload;
  if (raw) { headers["content-type"] = raw.type || "application/octet-stream"; payload = raw; }
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload, credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (res.status === 423) { showLocked(json); throw new ApiError(423, json); }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

function toast(msg, ms = 2200) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Kopyalandı"); }
  catch { toast("Kopyalamaq alınmadı"); }
}

const icons = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  ad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>',
  proq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  lock: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
};

const SLOT_NAMES = ["Səhər", "Günorta", "Axşam", "Gecə", "Əlavə"];
const STATUS = { new: "Yeni", saved: "Saxlanılıb", shot: "Çəkilib", posted: "Paylaşılıb", skipped: "Keçildi" };

async function loadState() {
  const s = await api("GET", "/api/state");
  s._clientAt = Date.now();
  state.me = s;
  return s;
}

const state = { me: null, tab: "today", ideas: [], archive: [], proq: [], ads: [], lastAd: null, timer: null };

// ---------------- boot ----------------

async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const m = location.pathname.match(/^\/t\/([A-Za-z0-9_-]{20,64})$/);
  if (m) {
    LS.set("rp_token", m[1]);
    history.replaceState(null, "", "/app");
  }
  try {
    await loadState();
  } catch (e) {
    if (e.status === 423) return;
    if (e.status === 401 || e.status === 403) return enterFlow();
    return fatal("Serverə qoşulmaq alınmadı. İnterneti yoxlayıb yenidən açın.");
  }
  start();
}

async function enterFlow() {
  const token = LS.get("rp_token");
  // Try trial token first; full edition answers 400 and we fall back to license form.
  if (token) {
    try {
      await api("POST", "/api/enter", { token, deviceId: deviceId() });
      await loadState();
      return start();
    } catch (e) {
      if (e.status === 423) return;
      if (e.body?.code === "device_limit") return fatal(e.body.error + " Əlavə cihaz üçün sahiblə əlaqə saxlayın.");
    }
  }
  renderLicense();
}

function renderLicense() {
  root.innerHTML = `
  <div class="screen"><div class="box">
    <div class="brand" style="justify-content:center;margin-bottom:18px"><div class="brand-mark">S</div>Soltanov AI</div>
    <h1>Giriş</h1>
    <p class="sub">Test linki ilə daxil olursunuzsa, göndərilən linki birbaşa açın. Tam versiya üçün lisenziya açarını daxil edin.</p>
    <label class="field"><span>Lisenziya açarı</span><input type="text" id="key" placeholder="SA-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" /></label>
    <button class="btn primary big" id="go">Daxil ol</button>
    <p class="note" id="err" style="color:var(--hot)"></p>
  </div></div>`;
  $("#go").onclick = async () => {
    try {
      await api("POST", "/api/enter", { key: $("#key").value, deviceId: deviceId() });
      await loadState();
      start();
    } catch (e) {
      if (e.status !== 423) $("#err").textContent = e.body?.error || "Açar qəbul olunmadı.";
    }
  };
}

function fatal(msg) {
  root.innerHTML = `<div class="screen"><div class="box"><div class="lock-ico">${icons.lock}</div><h1>Giriş mümkün deyil</h1><p class="sub">${esc(msg)}</p></div></div>`;
}

function showLocked(p) {
  clearInterval(state.timer);
  // Wipe locally cached content — the trial leaves nothing usable behind.
  const keep = LS.get("rp_device");
  try { localStorage.clear(); } catch {}
  LS.set("rp_device", keep);
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  const title = p.code === "revoked" ? "Giriş dayandırılıb" : "Test müddəti bitdi";
  root.innerHTML = `
  <div class="screen"><div class="box">
    <div class="lock-ico">${icons.lock}</div>
    <h1>${title}</h1>
    <p class="sub">3 günlük test başa çatdı. Sistemi tam versiya ilə istifadə etməyə davam etmək üçün ${esc(p.ownerName || "sahib")} ilə əlaqə saxlayın.</p>
    <div class="stats">
      <div><b>${Number(p.stats?.ideas || 0)}</b><span>Reels ideyası alındı</span></div>
      <div><b>${Number(p.stats?.ads || 0)}</b><span>reklam ssenari paketi</span></div>
    </div>
    ${p.contactUrl ? `<a class="btn primary big" style="display:block;text-decoration:none" href="${esc(p.contactUrl)}" target="_blank" rel="noopener">Tam versiyanı əldə et</a>` : ""}
    <p class="note" style="margin-top:14px">Tam versiyada: limitsiz ideya, limitsiz reklam ssenarisi, telefona tətbiq kimi quraşdırma.</p>
  </div></div>`;
}

// ---------------- shell ----------------

function start() {
  if (!state.me.account.profileDone) return renderOnboarding(true);
  renderShell();
  go(state.tab);
  clearInterval(state.timer);
  state.timer = setInterval(updateCountdown, 30_000);
}

function renderShell() {
  const tabs = [["today", "Bu gün"], ["ad", "Reklam"], ["proq", "Proq"], ["archive", "Arxiv"], ["me", "Profil"]];
  root.innerHTML = `
  <header class="topbar"><div class="wrap">
    <div class="brand"><div class="brand-mark">S</div><div>Soltanov AI<br><small>${state.me.edition === "trial" ? "Test versiyası" : "Tam versiya"}</small></div></div>
    <div class="spacer"></div><span id="countdown"></span>
  </div></header>
  <main class="wrap" id="view"></main>
  <nav class="tabs"><div class="wrap">
    ${tabs.map(([id, n]) => `<button class="tab" data-tab="${id}">${icons[id]}${n}</button>`).join("")}
  </div></nav>`;
  root.querySelectorAll(".tab").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  updateCountdown();
}

function updateCountdown() {
  const el = $("#countdown");
  const a = state.me?.account;
  if (!el || !a) return;
  if (a.kind !== "trial" || !a.expiresAt) { el.innerHTML = ""; return; }
  // Remaining time comes from the server clock; locally we only subtract elapsed time.
  const ms = Math.max(0, a.remainingMs - (Date.now() - state.me._clientAt));
  if (ms <= 0) { loadState().catch(() => {}); return; }
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  el.innerHTML = `<span class="pill ${ms < 864e5 ? "warn" : "trial"}">Test: ${d ? d + "g " : ""}${h}s ${m}d</span>`;
}

function go(tab) {
  state.tab = tab;
  root.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  window.scrollTo(0, 0);
  ({ today: viewToday, ad: viewAd, proq: viewProq, archive: viewArchive, me: viewMe })[tab]();
}

const loader = (t = "Hazırlanır…") => `<div class="loader"><div class="spin"></div>${esc(t)}</div>`;

// ---------------- Bu gün ----------------

async function viewToday() {
  const v = $("#view");
  v.innerHTML = `<h1>Bugünkü Reels ideyaları</h1><p class="sub" id="slotinfo"></p><div id="proqbox"></div><div id="ideas">${loader("İdeyalar hazırlanır… (ilk dəfə 20–40 saniyə çəkə bilər)")}</div>`;
  const n = state.me.nextSlot;
  $("#slotinfo").textContent = `Gündə 3 dəfə yeni ideyalar: ${state.me.slots.join(" · ")}. Növbəti: ${n.tomorrow ? "sabah " : ""}${n.time}.`;
  try {
    const r = await api("GET", "/api/ideas");
    Object.assign(state, { ideas: r.ideas, archive: r.archive, proq: r.proq });
    renderProq($("#proqbox"), r.proq);
    renderTodayIdeas();
  } catch (e) {
    if (e.status !== 423) $("#ideas").innerHTML = `<div class="empty">${esc(e.body?.error || "İdeyaları yükləmək alınmadı.")}</div>`;
  }
}

function renderTodayIdeas() {
  const box = $("#ideas");
  if (!box) return;
  const bySlot = {};
  for (const i of state.ideas) (bySlot[i.slotIndex] ||= []).push(i);
  const slots = Object.keys(bySlot).map(Number).sort((a, b) => b - a);
  if (!slots.length) { box.innerHTML = `<div class="empty">İlk ideyalar ${esc(state.me.slots[0])}-da gələcək.</div>`; return; }
  box.innerHTML = slots.map((s) => `
    <div class="slot-head"><span class="time">${esc(state.me.slots[s])}</span><span class="name">${SLOT_NAMES[s] || ""}</span><span class="spacer"></span>
      <button class="btn small ghost" data-refresh="${s}">Başqa ideyalar</button></div>
    ${bySlot[s].map(ideaCard).join("")}`).join("");
  bindIdeaCards(box);
  box.querySelectorAll("[data-refresh]").forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = "Hazırlanır…";
    try {
      const r = await api("POST", "/api/ideas/refresh", { slotIndex: Number(b.dataset.refresh) });
      state.ideas = state.ideas.filter((i) => i.slotIndex !== Number(b.dataset.refresh)).concat(r.ideas);
      renderTodayIdeas();
    } catch (e) { if (e.status !== 423) toast(e.body?.error || "Alınmadı"); b.disabled = false; b.textContent = "Başqa ideyalar"; }
  }));
}

function ideaText(i) {
  const shots = (i.shots || []).map((s) => `${s.t} — ${s.shot} [${s.camera}]${s.onScreenText ? ` | Ekran: ${s.onScreenText}` : ""}`).join("\n");
  return `${i.title}\n\nHOOK (0-3s): ${i.hook?.text}\nVizual: ${i.hook?.visual}\n\nKADR PLANI:\n${shots}\n\nCAPTION:\n${i.caption}\n${(i.hashtags || []).join(" ")}\n\nSəs: ${i.audio}\nPaylaşım: ${i.postingNote}`;
}

function ideaCard(i) {
  return `
  <article class="card idea" data-id="${esc(i.id)}">
    <div class="tags"><span class="tag volt">${esc(i.pillar)}</span><span class="tag">${esc(i.format)}</span><span class="tag">${Number(i.durationSec) || "?"} san</span>
      ${i.status !== "new" ? `<span class="tag status-${esc(i.status)}">${STATUS[i.status] || ""}</span>` : ""}</div>
    <h3>${esc(i.title)}</h3>
    <div class="hook"><b>İlk 3 saniyə</b><div class="say">“${esc(i.hook?.text)}”</div><div class="see">${esc(i.hook?.visual)}</div></div>
    <details><summary>Kadr planı, caption, paylaşım qeydi</summary>
      <table class="shots"><thead><tr><th>Vaxt</th><th>Kadr</th><th>Kamera</th></tr></thead><tbody>
        ${(i.shots || []).map((s) => `<tr><td>${esc(s.t)}</td><td>${esc(s.shot)}${s.onScreenText ? `<div class="note">Ekran: ${esc(s.onScreenText)}</div>` : ""}</td><td>${esc(s.camera)}</td></tr>`).join("")}
      </tbody></table>
      <div class="kv"><b>Caption</b><div class="copybox">${esc(i.caption)}\n${esc((i.hashtags || []).join(" "))}<button class="btn small" data-copy-caption>Kopyala</button></div></div>
      <div class="kv"><b>Səs / musiqi</b>${esc(i.audio)}</div>
      <div class="kv"><b>Paylaşım qeydi</b>${esc(i.postingNote)}</div>
      <div class="kv"><b>Niyə işləyir</b>${esc(i.whyItWorks)}</div>
    </details>
    <div class="actions">
      <button class="btn small ${i.status === "saved" ? "on" : ""}" data-st="saved">Saxla</button>
      <button class="btn small ${i.status === "shot" ? "on" : ""}" data-st="shot">Çəkdim</button>
      <button class="btn small ${i.status === "posted" ? "on" : ""}" data-st="posted">Paylaşdım</button>
      <button class="btn small ghost" data-st="skipped">Keç</button>
      <span class="spacer"></span>
      <button class="btn small ghost" data-copy-all>Hamısını kopyala</button>
    </div>
  </article>`;
}

function findIdea(id) { return state.ideas.find((i) => i.id === id) || state.archive.find((i) => i.id === id); }

function bindIdeaCards(scope) {
  scope.querySelectorAll(".idea").forEach((card) => {
    const i = findIdea(card.dataset.id);
    if (!i) return;
    card.querySelector("[data-copy-all]").onclick = () => copy(ideaText(i));
    const cc = card.querySelector("[data-copy-caption]");
    if (cc) cc.onclick = () => copy(`${i.caption}\n${(i.hashtags || []).join(" ")}`);
    card.querySelectorAll("[data-st]").forEach((b) => (b.onclick = async () => {
      const status = i.status === b.dataset.st ? "new" : b.dataset.st;
      try {
        await api("POST", `/api/ideas/${i.id}/status`, { status });
        i.status = status;
        card.outerHTML = ideaCard(i);
        bindIdeaCards(scope);
        if (status === "skipped") toast("Qeyd edildi — bu tip ideyalar azalacaq");
      } catch (e) { if (e.status !== 423) toast("Alınmadı"); }
    }));
  });
}

function renderProq(box, list) {
  if (!box || !list?.length) return;
  box.innerHTML = `<h2>Proq təklifi</h2>` + list.map((p) => `
    <div class="proq"><div class="ico">P</div><div style="flex:1"><b>${esc(p.name)}</b><p>${esc(p.reason || p.desc)}</p></div>
    ${TOOLS[p.id] ? `<button class="btn small" data-tool="${esc(p.id)}">Aç</button>` : ""}</div>`).join("");
  box.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => TOOLS[b.dataset.tool].open()));
}

// ---------------- Reklam (voice -> 5 scripts) ----------------

const rec = { media: null, chunks: [], start: 0, tick: null, speech: null, speechText: "" };

function viewAd() {
  const v = $("#view");
  const f = state.me.features;
  v.innerHTML = `
    <h1>Reklam təklifi → 5 ssenari</h1>
    <p class="sub">Reklamı səslə danış: brend, məhsul, nə istəyirlər, son tarix. Sistem 5 fərqli konsept və saniyə-saniyə ssenari hazırlayacaq.</p>
    <div class="card">
      <div class="rec"><button class="rec-btn" id="recbtn">Yaz</button><div class="rec-time" id="rectime">0:00</div>
      <p class="rec-hint" id="rechint">${f.transcribe ? "Danışıb bitirəndə yenidən bas — səs avtomatik mətnə çevriləcək." : "Danışıb bitirəndə yenidən bas. Brauzer dəstəkləyirsə nitq mətnə yazılacaq, yoxdursa aşağıya əl ilə yazın."}</p></div>
      <label class="field"><span>Brif mətni</span><textarea id="brief" placeholder="Məs: Salam, X idman qidaları brendi yeni protein barını reklam etmək istəyir. 1 Reels, 30 saniyə, məşqdən sonra istifadə göstərilsin, 25 noyabra qədər..."></textarea><em>Səsdən çıxan mətni burada düzəldə bilərsiniz.</em></label>
      <label class="field"><span>Əlavə qeyd (opsional)</span><input type="text" id="extra" placeholder="məs: mütləq yumorlu olsun, dostum da kadrda olacaq" /></label>
      <button class="btn primary big" id="genbtn">5 ssenari yarat</button>
    </div>
    <div id="adresult"></div>
    <h2>Əvvəlki reklamlar</h2><div id="adhistory">${loader()}</div>`;
  $("#recbtn").onclick = toggleRec;
  $("#genbtn").onclick = generateAd;
  loadAdHistory();
  if (state.lastAd) renderAdResult(state.lastAd.ad, state.lastAd.proq);
}

async function toggleRec() {
  const btn = $("#recbtn");
  if (rec.media && rec.media.state === "recording") return stopRec();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Bu brauzer səs yazmağı dəstəkləmir — mətni yazın");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    rec.media = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec.chunks = [];
    rec.media.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
    rec.media.onstop = onRecStop;
    rec.media.start(1000);
    rec.start = Date.now();
    btn.classList.add("live"); btn.textContent = "Dayandır";
    rec.tick = setInterval(() => {
      const s = Math.floor((Date.now() - rec.start) / 1000);
      const el = $("#rectime"); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (s >= 180) stopRec();
    }, 250);
    startSpeech();
  } catch { toast("Mikrofona icazə verilmədi"); }
}

function startSpeech() {
  if (state.me.features.transcribe) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  rec.speech = new SR();
  rec.speech.lang = "az-AZ";
  rec.speech.continuous = true;
  rec.speech.interimResults = false;
  rec.speechText = "";
  rec.speech.onresult = (e) => {
    for (let k = e.resultIndex; k < e.results.length; k++) if (e.results[k].isFinal) rec.speechText += e.results[k][0].transcript + " ";
    const b = $("#brief"); if (b) b.value = rec.speechText.trim();
  };
  try { rec.speech.start(); } catch {}
}

function stopRec() {
  clearInterval(rec.tick);
  rec.media?.stop();
  rec.media?.stream.getTracks().forEach((t) => t.stop());
  try { rec.speech?.stop(); } catch {}
  const btn = $("#recbtn"); if (btn) { btn.classList.remove("live"); btn.textContent = "Yaz"; }
}

async function onRecStop() {
  const blob = new Blob(rec.chunks, { type: rec.media.mimeType || "audio/webm" });
  if (!state.me.features.transcribe) { toast(rec.speechText ? "Mətn hazırdır — yoxlayın" : "Mətni əl ilə tamamlayın"); return; }
  $("#rechint").textContent = "Səs mətnə çevrilir…";
  try {
    const r = await api("POST", "/api/ads/transcribe", undefined, blob);
    const b = $("#brief");
    b.value = (b.value ? b.value + "\n" : "") + r.text;
    $("#rechint").textContent = "Hazırdır. Mətni yoxlayıb “5 ssenari yarat” basın.";
  } catch (e) { if (e.status !== 423) $("#rechint").textContent = e.body?.error || "Transkripsiya alınmadı — mətni əl ilə yazın."; }
}

async function generateAd() {
  const transcript = $("#brief").value.trim();
  if (transcript.length < 10) return toast("Reklam haqqında bir az ətraflı yazın");
  const btn = $("#genbtn");
  btn.disabled = true; btn.textContent = "5 ssenari hazırlanır…";
  $("#adresult").innerHTML = loader("Brif təhlil olunur, 5 konsept yazılır… (30–60 san)");
  try {
    const r = await api("POST", "/api/ads", { transcript, extra: $("#extra").value });
    state.lastAd = r;
    renderAdResult(r.ad, r.proq);
    loadAdHistory();
  } catch (e) {
    if (e.status !== 423) $("#adresult").innerHTML = `<div class="empty">${esc(e.body?.error || "Alınmadı")}</div>`;
  } finally { btn.disabled = false; btn.textContent = "5 ssenari yarat"; }
}

function scriptText(s) {
  return `${s.title} (${s.angle}, ${s.durationSec} san)\nHOOK: ${s.hook}\n\n${(s.timeline || []).map((t) => `${t.t}\n  Vizual: ${t.visual}\n  Səs: ${t.voiceover}${t.onScreenText ? `\n  Ekran: ${t.onScreenText}` : ""}`).join("\n")}\n\nCTA: ${s.cta}\n\nCAPTION:\n${s.caption}\n${(s.hashtags || []).join(" ")}`;
}

function renderAdResult(ad, proq) {
  const box = $("#adresult");
  if (!box) return;
  const b = ad.brief || {};
  box.innerHTML = `
    <h2>Brif xülasəsi</h2>
    <div class="card"><div class="kv"><b>Brend</b>${esc(b.brand)}</div><div class="kv"><b>Məhsul</b>${esc(b.product)}</div>
      <div class="kv"><b>Əsas mesaj</b>${esc(b.keyMessage)}</div>
      ${(b.requirements || []).length ? `<div class="kv"><b>Tələblər</b>${b.requirements.map((x) => "• " + esc(x)).join("<br>")}</div>` : ""}
      ${b.deadline ? `<div class="kv"><b>Son tarix</b>${esc(b.deadline)}</div>` : ""}</div>
    <div id="adproq"></div>
    <h2>5 ssenari</h2>
    ${ad.scripts.map((s, n) => `
      <article class="card" data-script="${n}">
        <div class="tags"><span class="tag volt">${n + 1}. ${esc(s.angle)}</span><span class="tag">${Number(s.durationSec) || "?"} san</span></div>
        <h3>${esc(s.title)}</h3>
        <div class="hook"><b>Hook</b><div class="say">“${esc(s.hook)}”</div></div>
        <details ${n === 0 ? "open" : ""}><summary>Saniyə-saniyə ssenari</summary>
          <table class="shots"><thead><tr><th>Vaxt</th><th>Vizual</th><th>Səs / dialoq</th></tr></thead><tbody>
          ${(s.timeline || []).map((t) => `<tr><td>${esc(t.t)}</td><td>${esc(t.visual)}${t.onScreenText ? `<div class="note">Ekran: ${esc(t.onScreenText)}</div>` : ""}</td><td>${esc(t.voiceover)}</td></tr>`).join("")}
          </tbody></table>
          <div class="kv"><b>CTA</b>${esc(s.cta)}</div>
          <div class="kv"><b>Caption</b><div class="copybox">${esc(s.caption)}\n${esc((s.hashtags || []).join(" "))}</div></div>
        </details>
        <div class="actions"><button class="btn small" data-copy>Kopyala</button><button class="btn small primary" data-prompt>Teleprompter</button></div>
      </article>`).join("")}`;
  box.querySelectorAll("[data-script]").forEach((card) => {
    const s = ad.scripts[Number(card.dataset.script)];
    card.querySelector("[data-copy]").onclick = () => copy(scriptText(s));
    card.querySelector("[data-prompt]").onclick = () => openPrompter((s.timeline || []).map((t) => t.voiceover).filter(Boolean).join("\n\n"));
  });
  renderProq($("#adproq"), proq);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadAdHistory() {
  try {
    const r = await api("GET", "/api/ads");
    state.ads = r.ads;
    const box = $("#adhistory");
    if (!box) return;
    box.innerHTML = r.ads.length ? r.ads.map((a, n) => `<div class="card" style="cursor:pointer" data-ad="${n}"><b>${esc(a.brief?.brand || "Reklam")}</b> — ${esc(a.brief?.product || "")}<div class="note">${new Date(a.createdAt).toLocaleString("az")}</div></div>`).join("") : `<div class="empty">Hələ reklam ssenarisi yoxdur.</div>`;
    box.querySelectorAll("[data-ad]").forEach((c) => (c.onclick = () => {
      const ad = state.ads[Number(c.dataset.ad)];
      renderAdResult(ad, []);
    }));
  } catch {}
}

// ---------------- Proq tools ----------------

function sheet(title, html) {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="sheet"><div class="sheet-head"><h2 style="margin:0">${esc(title)}</h2><span class="spacer" style="flex:1"></span><button class="btn small" data-close>Bağla</button></div>${html}</div>`;
  o.onclick = (e) => { if (e.target === o || e.target.dataset.close !== undefined) o.remove(); };
  document.body.appendChild(o);
  return o;
}

function openPrompter(text) {
  const p = document.createElement("div");
  p.className = "prompter";
  p.innerHTML = `<div class="prompter-text"><div class="prompter-guide"></div><div class="prompter-inner">${esc(text || "Mətn yoxdur")}</div></div>
    <div class="prompter-bar"><button class="btn primary" data-play>Başla</button>
    <label class="note" style="flex:1">Sürət <input type="range" min="10" max="120" value="40" data-speed style="width:100%"></label>
    <button class="btn small" data-mirror>Güzgü</button><button class="btn small" data-close>Bağla</button></div>`;
  document.body.appendChild(p);
  const inner = $(".prompter-inner", p);
  let y = 0, playing = false, last = 0;
  const frame = (t) => {
    if (!playing) return;
    const dt = last ? (t - last) / 1000 : 0; last = t;
    y += dt * Number($("[data-speed]", p).value);
    inner.style.top = -y + "px";
    if (y < inner.scrollHeight) requestAnimationFrame(frame); else playing = false;
  };
  $("[data-play]", p).onclick = (e) => { playing = !playing; last = 0; e.target.textContent = playing ? "Pauza" : "Davam"; if (playing) requestAnimationFrame(frame); };
  $("[data-mirror]", p).onclick = () => p.classList.toggle("mirror");
  $("[data-close]", p).onclick = () => { playing = false; p.remove(); };
}

const CHECKLIST = [
  "Brendin tam adı, məhsul və kampaniya məqsədi yazılı təsdiqlənib",
  "Format və say: neçə Reels, neçə Story, müddət",
  "Çəkiliş və paylaşım tarixi, ssenari təsdiqi üçün son tarix",
  "Neçə düzəliş (revision) daxildir",
  "Ödəniş məbləği, valyuta, avans faizi və ödəniş tarixi",
  "Eksklüzivlik: rəqib brendlərlə neçə gün işləməmək",
  "İstifadə hüququ: brend videonu reklamda (ads) işlədəcəkmi, nə qədər müddətə",
  "Videonun profildə qalma müddəti (silinməmə şərti)",
  "Reklam işarəsi (#reklam / əməkdaşlıq etiketi) razılaşdırılıb",
  "Statistika hesabatı tələbi (reach, views, saves) və vaxtı",
  "Məhsulun çatdırılması / geri qaytarılması",
  "Ləğv şərtləri və gecikmə halında cərimə",
];

const TOOLS = {
  teleprompter: { name: "Teleprompter", desc: "Ssenarini kameraya baxaraq oxu.", open() {
    const o = sheet("Teleprompter", `<label class="field"><span>Mətn</span><textarea id="tp">${esc(state.lastAd ? (state.lastAd.ad.scripts[0].timeline || []).map((t) => t.voiceover).join("\n\n") : "")}</textarea></label><button class="btn primary big" id="tpgo">Başla</button>`);
    $("#tpgo", o).onclick = () => { const t = $("#tp", o).value; o.remove(); openPrompter(t); };
  } },
  pricing: { name: "Reklam qiymət kalkulyatoru", desc: "Statistikaya görə qiymət aralığı.", open() {
    const saved = LS.get("rp_pricing", { followers: 50000, views: 20000, er: 4, cpm: 10 });
    const o = sheet("Reklam qiymət kalkulyatoru", `
      <p class="note">Hesablama təxminidir. "1000 baxış üçün qiymət" (CPM) dəyərini öz bazar təcrübənizə görə yazın — sistem onu yadda saxlayır.</p>
      <label class="field"><span>İzləyici sayı</span><input type="number" id="pf" value="${saved.followers}"></label>
      <label class="field"><span>Reels üzrə orta baxış</span><input type="number" id="pv" value="${saved.views}"></label>
      <label class="field"><span>Engagement rate, %</span><input type="number" id="pe" step="0.1" value="${saved.er}"></label>
      <label class="field"><span>1000 baxış üçün qiymət, AZN</span><input type="number" id="pc" value="${saved.cpm}"></label>
      <label class="field"><span>Format</span><select id="pfm"><option value="1">1 Reels</option><option value="0.4">1 Story</option><option value="1.8">Paket: 1 Reels + 3 Story</option><option value="3">Aylıq paket: 3 Reels</option></select></label>
      <label class="check"><input type="checkbox" id="px"><span>Eksklüzivlik (+30%)</span></label>
      <label class="check"><input type="checkbox" id="pu"><span>Brendə videonu reklamda işlətmək hüququ (+50%)</span></label>
      <label class="check"><input type="checkbox" id="pr"><span>Təcili, 48 saat ərzində (+25%)</span></label>
      <div class="card" style="margin-top:14px"><div class="note">Tövsiyə olunan aralıq</div><div class="result-price" id="pout">—</div><div class="note" id="pnote"></div></div>`);
    const calc = () => {
      const f = +$("#pf", o).value || 0, v = +$("#pv", o).value || 0, er = +$("#pe", o).value || 0, cpm = +$("#pc", o).value || 0;
      LS.set("rp_pricing", { followers: f, views: v, er, cpm });
      let base = (v / 1000) * cpm * Number($("#pfm", o).value);
      if (er >= 5) base *= 1.15;
      if ($("#px", o).checked) base *= 1.3;
      if ($("#pu", o).checked) base *= 1.5;
      if ($("#pr", o).checked) base *= 1.25;
      const lo = Math.round(base * 0.9 / 10) * 10, hi = Math.round(base * 1.2 / 10) * 10;
      $("#pout", o).textContent = base ? `${lo} – ${hi} AZN` : "—";
      $("#pnote", o).textContent = er >= 5 ? "Yüksək ER (5%+) üçün +15% əlavə edildi." : "";
    };
    o.querySelectorAll("input,select").forEach((el) => (el.oninput = calc));
    calc();
  } },
  contract: { name: "Brend müqavilə checklist", desc: "Razılaşmadan əvvəl 12 bənd.", open() {
    const done = LS.get("rp_check", []);
    const o = sheet("Brend müqavilə checklist", CHECKLIST.map((c, n) => `<label class="check"><input type="checkbox" data-n="${n}" ${done.includes(n) ? "checked" : ""}><span>${esc(c)}</span></label>`).join("") + `<button class="btn big" style="margin-top:14px" id="cr">Sıfırla</button>`);
    o.querySelectorAll("[data-n]").forEach((cb) => (cb.onchange = () => LS.set("rp_check", [...o.querySelectorAll("[data-n]:checked")].map((x) => +x.dataset.n))));
    $("#cr", o).onclick = () => { LS.del("rp_check"); o.querySelectorAll("[data-n]").forEach((x) => (x.checked = false)); };
  } },
  calendar: { name: "Kontent təqvimi", desc: "Saxlanılan → çəkilən → paylaşılan.", async open() {
    const o = sheet("Kontent təqvimi", loader());
    try {
      const r = await api("GET", "/api/ideas");
      const all = [...r.ideas, ...r.archive];
      const col = (st, title) => `<div class="col"><h4>${title} (${all.filter((i) => i.status === st).length})</h4>${all.filter((i) => i.status === st).slice(0, 30).map((i) => `<div class="item">${esc(i.title)}<div class="note">${esc(i.date)} · ${esc(i.slotTime)}</div></div>`).join("") || '<div class="note">Boşdur</div>'}</div>`;
      $(".sheet", o).lastElementChild.outerHTML = `<p class="note">İdeya kartlarında “Saxla / Çəkdim / Paylaşdım” düymələri ilə idarə olunur.</p><div class="kanban">${col("saved", "Çəkiləcək")}${col("shot", "Paylaşılacaq")}${col("posted", "Paylaşılıb")}</div>`;
    } catch {}
  } },
  profile: { name: "Profil tənzimləmə", desc: "İdeyalar xarakterinə uyğunlaşsın.", open() { renderOnboarding(false); } },
  telegram: { name: "Telegram bildirişi", desc: "İdeyalar vaxtında telefona gəlsin.", async open() {
    if (!state.me.features.telegram) return sheet("Telegram bildirişi", `<p class="sub">Bu serverdə Telegram bot qoşulmayıb. Sahib .env faylında TELEGRAM_BOT_TOKEN və TELEGRAM_BOT_USERNAME təyin etdikdən sonra aktiv olacaq.</p>`);
    try { const r = await api("POST", "/api/telegram/link"); window.open(r.url, "_blank", "noopener"); toast("Telegram-da START basın"); }
    catch (e) { if (e.status !== 423) toast(e.body?.error || "Alınmadı"); }
  } },
};

function viewProq() {
  $("#view").innerHTML = `<h1>Proq — köməkçi alətlər</h1><p class="sub">İş axınında ehtiyac yarananda sistem bu alətləri özü təklif edir. İstənilən vaxt buradan da açmaq olar.</p>
    <div id="proqsug"></div>
    <div class="grid">${Object.entries(TOOLS).map(([id, t]) => `<button class="card tool" data-tool="${id}"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></button>`).join("")}</div>`;
  $("#view").querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => TOOLS[b.dataset.tool].open()));
  renderProq($("#proqsug"), state.proq);
}

// ---------------- Arxiv ----------------

async function viewArchive() {
  const v = $("#view");
  v.innerHTML = `<h1>Arxiv</h1><p class="sub">Bütün keçmiş ideyalar. Statusa və ya sözə görə süz.</p>
    <div class="actions search"><input type="text" id="q" placeholder="Axtar…" style="flex:1"><select id="fs" style="width:auto"><option value="">Hamısı</option>${Object.entries(STATUS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
    <div id="arch">${loader()}</div>`;
  try {
    const r = await api("GET", "/api/ideas");
    Object.assign(state, { ideas: r.ideas, archive: r.archive });
  } catch (e) { if (e.status === 423) return; }
  const draw = () => {
    const q = $("#q").value.toLocaleLowerCase("az"), fs = $("#fs").value;
    const list = [...state.ideas, ...state.archive].filter((i) => (!fs || i.status === fs) && (!q || (i.title + " " + i.hook?.text).toLocaleLowerCase("az").includes(q)));
    $("#arch").innerHTML = list.length ? list.slice(0, 60).map(ideaCard).join("") : `<div class="empty">Heç nə tapılmadı.</div>`;
    bindIdeaCards($("#arch"));
  };
  $("#q").oninput = draw; $("#fs").onchange = draw;
  draw();
}

// ---------------- Profil / onboarding ----------------

const PROFILE_FIELDS = [
  ["name", "Adınız (videolarda necə çağırılırsınız)", "məs: Şükran"],
  ["sport", "İdman növü", "məs: boks, fitness, futbol, crossfit"],
  ["personality", "Xarakteriniz", "aktiv, zarafatcıl, özünə gülə bilən…"],
  ["contentStyle", "Video tərziniz", "skeç, çağırış, POV, məşq + zarafat…"],
  ["humor", "Yumor tərzi", "situasiya yumoru, özünə ironiya…"],
  ["locations", "Çəkiliş məkanları", "zal, ev, küçə, maşın…"],
  ["recurringCast", "Videolarda kimlər olur", "məşq yoldaşı, qardaş, dostlar…"],
  ["audience", "Auditoriya", "Azərbaycan, 16–35 yaş…"],
  ["avoid", "Heç vaxt etmədiyiniz şeylər", "siyasət, vulqar söz, təhlükəli trük…"],
];

function renderOnboarding(first) {
  const p = state.me.account.profile;
  const html = `
    <h1>${first ? "Sizi tanıyaq" : "Profil"}</h1>
    <p class="sub">İdeyalar yalnız sizin xarakterinizə və tərzinizə görə hazırlanır. Nə qədər dəqiq yazsanız, ideyalar o qədər “sizin kimi” olacaq. Hazır dəyərlər aktiv, əyləncəli idmançı üçün nümunədir — dəyişin.</p>
    ${PROFILE_FIELDS.map(([k, label, ph]) => `<label class="field"><span>${label}</span><input type="text" data-k="${k}" value="${esc(first && k === "sport" ? "" : p[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}
    <button class="btn primary big" id="psave">${first ? "Başla — ilk ideyaları al" : "Yadda saxla"}</button>`;
  if (first) {
    root.innerHTML = `<main class="wrap" style="padding-bottom:30px">${html}</main>`;
  } else {
    const o = sheet("Profil tənzimləmə", html);
    o.querySelector("h1").remove();
  }
  $("#psave").onclick = async () => {
    const body = {};
    document.querySelectorAll("[data-k]").forEach((i) => (body[i.dataset.k] = i.value));
    if (!body.sport.trim()) return toast("İdman növünü yazın");
    try {
      const r = await api("PUT", "/api/profile", body);
      state.me.account = { ...state.me.account, ...r.account };
      document.querySelector(".overlay")?.remove();
      toast("Profil yadda saxlanıldı");
      if (first) start(); else if (state.tab === "me") viewMe();
    } catch (e) { if (e.status !== 423) toast("Alınmadı"); }
  };
}

function viewMe() {
  const a = state.me.account;
  const p = a.profile;
  $("#view").innerHTML = `
    <h1>${esc(p.name || "Profil")}</h1>
    <p class="sub">${esc(p.sport)} · ${esc(p.personality)}</p>
    <div class="card">
      <div class="kv"><b>Versiya</b>${state.me.edition === "trial" ? "Test (3 gün)" : "Tam versiya"}${a.expiresAt ? ` · bitmə: ${new Date(a.expiresAt).toLocaleString("az")}` : ""}</div>
      <div class="kv"><b>İstifadə</b>${a.usage.ideasGenerated} ideya · ${a.usage.adRequests} reklam paketi</div>
      <div class="kv"><b>Telegram bildirişi</b>${a.telegramLinked ? "Qoşulub" : "Qoşulmayıb"}</div>
      <div class="kv"><b>AI rejimi</b>${state.me.features.ai ? "Claude AI" : "Offline şablon rejimi"}</div>
    </div>
    <div class="actions">
      <button class="btn primary" id="edit">Profili dəyiş</button>
      <button class="btn" id="tg">Telegram qoş</button>
      <button class="btn ghost" id="install">Telefona quraşdır</button>
    </div>
    <h2>Kontent tərzim</h2>
    <div class="card">${PROFILE_FIELDS.slice(3).map(([k, l]) => `<div class="kv"><b>${l}</b>${esc(p[k])}</div>`).join("")}</div>`;
  $("#edit").onclick = () => renderOnboarding(false);
  $("#tg").onclick = () => TOOLS.telegram.open();
  $("#install").onclick = () => {
    if (window._installPrompt) { window._installPrompt.prompt(); return; }
    sheet("Telefona quraşdırma", `<p class="sub"><b>iPhone (Safari):</b> Paylaş düyməsi → “Ana ekrana əlavə et”.<br><br><b>Android (Chrome):</b> ⋮ menyu → “Tətbiqi quraşdır” və ya “Ana ekrana əlavə et”.</p>`);
  };
}

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window._installPrompt = e; });

boot().catch((e) => { console.error(e); fatal("Gözlənilməz xəta. Səhifəni yeniləyin."); });
