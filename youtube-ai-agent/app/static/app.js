"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");
let timer = null; // the only polling loop; cleared on every navigation

async function api(path, opts = {}) {
  const o = { method: opts.method || "GET", headers: {} };
  if (opts.body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(opts.body); }
  if (opts.form) { o.method = "POST"; o.body = opts.form; }
  const r = await fetch("/api" + path, o);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}
function toast(msg, cls = "") {
  const d = document.createElement("div"); d.className = cls; d.textContent = msg;
  $("#toast").appendChild(d); setTimeout(() => d.remove(), 6000);
}
const money = (x) => "$" + Number(x || 0).toFixed(2);

function route() {
  clearInterval(timer); timer = null;
  const page = location.hash.split("/")[1] || "studio";
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  (page === "settings" ? viewSettings : viewStudio)().catch((e) => { view.innerHTML = `<p class="err">${esc(e.message)}</p>`; });
}
window.addEventListener("hashchange", route);

// ---------------- Studio ----------------
const STEPS = [["plan", "Plan"], ["images", "Kadrlar"], ["animate", "Hərəkət"], ["voice", "Səs"], ["render_long", "Uzun video"],
  ["short_images", "Shorts kadrları"], ["render_short", "Shorts"], ["thumbnail", "Thumbnail"], ["upload", "Yükləmə"]];

async function viewStudio() {
  const [chans, s] = await Promise.all([api("/channels"), api("/settings")]);
  const missing = ["deepseek", "openai", "fish"].filter((k) => !s.keys[k]);
  const last = localStorage.getItem("lastChannel");
  view.innerHTML = `<h1>Studio</h1>
  ${missing.length || !chans.length ? `<div class="card warn">Başlamaq üçün <a href="#/settings" class="warn">Ayarlar</a>-da ${[
    missing.length ? "API açarlarını (" + missing.join(", ") + ")" : "", !chans.length ? "YouTube kanalını" : ""].filter(Boolean).join(" və ")} əlavə edin.</div>` : ""}
  <div class="card">
    <label>Ssenari (paraqraflar boş sətirlə ayrılır)</label>
    <textarea id="script" placeholder="Hazır ssenarini bura yapışdırın..."></textarea>
    <div class="grid">
      <div><label>Başlıq ideyası (könüllü, AI yaxşılaşdıracaq)</label><input id="hint"></div>
      <div><label>Kanal</label><select id="chan">${chans.map((c) => `<option value="${esc(c.id)}" ${c.id === last ? "selected" : ""}>${esc(c.name)}${c.connected ? "" : " (giriş lazımdır)"}</option>`).join("") || "<option value=''>— kanal yoxdur —</option>"}</select></div>
    </div>
    <div class="row" style="margin-top:12px">
      <label style="margin:0"><input type="checkbox" id="long" checked>Uzun video (16:9)</label>
      <label style="margin:0"><input type="checkbox" id="short" checked>Shorts (9:16)</label>
      <span style="flex:1"></span>
      <span class="muted" id="chars"></span>
      <button class="primary" id="start">▶ Başla</button>
    </div>
  </div>
  <div class="row" style="justify-content:space-between;margin:18px 0 8px"><h2 style="margin:0">Növbə</h2><button class="small" id="folder">Videolar qovluğu</button></div>
  <div id="queue"></div>`;
  const chanName = Object.fromEntries(chans.map((c) => [c.id, c.name]));
  $("#script").oninput = () => {
    const n = $("#script").value.length;
    $("#chars").textContent = n ? `≈ ${Math.max(1, Math.round(n / 15 / 60))} dəq video` : "";
  };
  $("#folder").onclick = () => api("/open-output", { method: "POST" }).then((r) => toast("Qovluq: " + r.folder));
  $("#start").onclick = async () => {
    const body = { script: $("#script").value, channel_id: $("#chan").value, title_hint: $("#hint").value,
      make_long: $("#long").checked, make_short: $("#short").checked };
    try {
      await api("/jobs", { method: "POST", body });
      localStorage.setItem("lastChannel", body.channel_id);
      $("#script").value = ""; $("#hint").value = ""; $("#chars").textContent = "";
      toast("Növbəyə əlavə olundu", "ok"); refresh();
    } catch (e) { toast(e.message, "err"); }
  };
  const refresh = async () => {
    const list = await api("/jobs").catch(() => null);
    if (!list || !$("#queue")) return;
    $("#queue").innerHTML = list.map((j) => jobCard(j, chanName)).join("") || `<p class="muted">Hələ iş yoxdur. Ssenarini yapışdırıb Başla basın.</p>`;
    $("#queue").querySelectorAll("[data-act]").forEach((b) => b.onclick = () => act(b.dataset.act, b.dataset.id).then(refresh));
  };
  await refresh();
  timer = setInterval(refresh, 2000);
}

function jobCard(j, chanName) {
  const label = { queued: "növbədə", running: "işləyir", done: "hazır", error: "xəta", stopped: "dayandı" }[j.status];
  const doneIdx = STEPS.findIndex(([k]) => k === j.step);
  const steps = STEPS.filter(([k]) => (j.make_long || !["render_long", "thumbnail"].includes(k)) && (j.make_short || !["short_images", "render_short"].includes(k)))
    .map(([k, t]) => {
      const i = STEPS.findIndex(([x]) => x === k);
      const cls = j.status === "done" || (doneIdx > -1 && i < doneIdx) ? "d" : k === j.step && j.status === "running" ? "c" : "";
      return `<span class="${cls}">${t}</span>`;
    }).join("");
  const links = [
    j.long?.studio ? `<a class="btn small" href="${esc(j.long.studio)}" target="_blank">Uzun video · YouTube Studio</a>` : "",
    j.short?.studio ? `<a class="btn small" href="${esc(j.short.studio)}" target="_blank">Shorts · YouTube Studio</a>` : "",
    j.long?.path ? `<a class="btn small" href="/api/jobs/${j.id}/file/long">MP4</a>` : "",
    j.short?.path ? `<a class="btn small" href="/api/jobs/${j.id}/file/short">Shorts MP4</a>` : "",
  ].join("");
  return `<div class="job">
    <div class="top"><span class="title">${esc(j.title)}</span>
      <span class="row"><span class="muted">${esc(chanName[j.channel_id] || "")} · ${j.scenes || "—"} səhnə · ${money(j.cost)}${j.estimate ? " / təxmini " + money(j.estimate) : ""}</span>
      <span class="pill ${j.status}">${label}</span></span></div>
    <div class="muted" style="margin-top:4px">${esc(j.message)}</div>
    ${j.status === "running" ? `<div class="progress"><div style="width:${Math.round(j.progress || 0)}%"></div></div>` : ""}
    ${j.error ? `<div class="err" style="margin-top:6px">${esc(j.error)}</div>` : ""}
    ${j.warnings?.length ? `<ul class="warn">${j.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    <div class="steps">${steps}</div>
    <div class="row" style="margin-top:10px">${links}
      ${["error", "stopped"].includes(j.status) ? `<button class="small primary" data-act="retry" data-id="${j.id}">Yenidən cəhd et</button>` : ""}
      ${["running", "queued"].includes(j.status) ? `<button class="small" data-act="stop" data-id="${j.id}">Dayandır</button>` : ""}
      ${j.status !== "running" ? `<button class="small" data-act="delete" data-id="${j.id}">Sil</button>` : ""}</div>
  </div>`;
}

async function act(what, id) {
  try {
    if (what === "delete") { if (!confirm("İş silinsin? (Hazır MP4 faylları qovluqda qalır)")) return; await api(`/jobs/${id}`, { method: "DELETE" }); }
    else await api(`/jobs/${id}/${what}`, { method: "POST" });
  } catch (e) { toast(e.message, "err"); }
}

// ---------------- Settings ----------------
async function viewSettings() {
  const [s, chans] = await Promise.all([api("/settings"), api("/channels")]);
  const keyRows = [["deepseek", "DeepSeek", "planlaşdırma, başlıq, təsvir"], ["openai", "OpenAI", "kadrlar"],
    ["fish", "Fish Audio", "səsləndirmə"], ["kie", "Kie.ai (könüllü)", "səhnələri hərəkətə gətirmək"]];
  view.innerHTML = `<h1>Ayarlar</h1>
  <div class="card"><h2>API açarları</h2>
    ${keyRows.map(([k, name, what]) => `<label>${name} <span class="muted">· ${what}</span></label>
      <div class="row"><input data-key="${k}" value="${esc(s.keys[k])}" placeholder="açarı yapışdırın" style="flex:1">
      <button class="small" data-save="${k}">Yadda saxla</button><button class="small" data-test="${k}">Yoxla</button><span data-res="${k}" class="muted"></span></div>`).join("")}
  </div>
  <div class="card"><h2>YouTube kanalları</h2>
    <p class="muted">1) Google Cloud-dan <b>client_secret.json</b> faylını bir dəfə əlavə edin (README-də addım-addım). 2) <b>Kanal əlavə et</b> basın: Google girişi açılacaq, orada kanalı seçin. Hər kanal üçün təkrarlayın.</p>
    <div class="row"><span>client_secret.json: ${s.client_secret ? '<span class="ok">əlavə olunub</span>' : '<span class="warn">yoxdur</span>'}</span>
      <input type="file" id="cs" accept=".json" style="width:auto"></div>
    <div style="margin-top:12px" id="chans">${chans.map(chanCard).join("") || '<p class="muted">Hələ kanal qoşulmayıb.</p>'}</div>
    <button class="primary" id="addch" ${s.client_secret ? "" : "disabled"}>+ Kanal əlavə et</button>
  </div>
  <div class="card"><h2>Ümumi</h2><div class="grid">
    <div><label>Büdcə limiti hər video üçün ($)</label><input data-set="budget_cap" type="number" step="0.5" value="${s.settings.budget_cap}"></div>
    <div><label>Hərəkətli səhnə sayı (Kie.ai)</label><input data-set="max_animated" type="number" min="0" max="8" value="${s.settings.max_animated}"></div>
    <div><label>Fish Audio modeli</label><input data-set="fish_model" value="${esc(s.settings.fish_model)}"></div>
    <div><label>Danışıq sürəti</label><input data-set="voice_speed" type="number" step="0.05" value="${s.settings.voice_speed}"></div>
  </div><p class="muted" id="saved"></p></div>`;

  view.querySelectorAll("[data-save]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.save; const r = await api("/keys", { method: "PUT", body: { [k]: $(`[data-key=${k}]`).value } });
    $(`[data-key=${k}]`).value = r.keys[k]; toast("Açar saxlanıldı", "ok");
  });
  view.querySelectorAll("[data-test]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.test; const out = $(`[data-res=${k}]`); out.textContent = "yoxlanılır..."; out.className = "muted";
    const r = await api(`/keys/${k}/test`, { method: "POST" }); out.textContent = r.message; out.className = r.ok ? "ok" : "err";
  });
  view.querySelectorAll("[data-set]").forEach((inp) => inp.onchange = async () => {
    const v = inp.type === "number" ? parseFloat(inp.value) : inp.value;
    try { await api("/settings", { method: "PUT", body: { [inp.dataset.set]: v } }); $("#saved").textContent = "Yadda saxlanıldı"; }
    catch (e) { toast(e.message, "err"); }
  });
  $("#cs").onchange = async (e) => {
    const fd = new FormData(); fd.append("file", e.target.files[0]);
    try { await api("/youtube/client-secret", { form: fd }); toast("client_secret.json əlavə olundu", "ok"); route(); } catch (er) { toast(er.message, "err"); }
  };
  const connect = async (body) => {
    toast("Brauzerdə Google girişi açılır. Kanalı seçib icazə verin...");
    try { const ch = await api("/channels/connect", { method: "POST", body }); toast(`Kanal qoşuldu: ${ch.name}`, "ok"); route(); }
    catch (e) { toast(e.message, "err"); }
  };
  $("#addch").onclick = () => connect({});
  view.querySelectorAll("[data-reconnect]").forEach((b) => b.onclick = () => connect({ channel_id: b.dataset.reconnect }));
  view.querySelectorAll("[data-ch]").forEach((inp) => inp.onchange = async () => {
    try { await api(`/channels/${inp.dataset.ch}`, { method: "PUT", body: { [inp.dataset.f]: inp.value } }); toast("Kanal ayarı saxlanıldı", "ok"); }
    catch (e) { toast(e.message, "err"); }
  });
  view.querySelectorAll("[data-delch]").forEach((b) => b.onclick = async () => {
    if (!confirm("Kanal proqramdan silinsin? (YouTube-dakı kanala heç nə olmur)")) return;
    await api(`/channels/${b.dataset.delch}`, { method: "DELETE" }); route();
  });
}

function chanCard(c) {
  const f = (k, label, ph = "") => `<div><label>${label}</label><input data-ch="${c.id}" data-f="${k}" value="${esc(c[k])}" placeholder="${esc(ph)}"></div>`;
  return `<div class="chan"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b>
    <span class="row">${c.connected ? '<span class="ok">qoşulub</span>' : '<span class="warn">giriş lazımdır</span>'}
    <button class="small" data-reconnect="${c.id}">Yenidən qoş</button><button class="small" data-delch="${c.id}">Sil</button></span></div>
    <div class="grid">${f("name", "Ad")}${f("voice_id", "Voice ID (Fish Audio)", "32 simvollu ID")}${f("language", "Dil", "English")}${f("category_id", "YouTube kateqoriya ID", "2 = Autos & Vehicles")}</div></div>`;
}

route();
