"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");
let state = { settings: null, keys: {}, profiles: [], active: "" };
let pollTimer = null;

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
  $("#toast").appendChild(d); setTimeout(() => d.remove(), 5000);
}
const fileUrl = (pid, rel) => rel ? `/api/projects/${pid}/file/${rel}` : "";
const money = (x) => "$" + (x || 0).toFixed(x < 1 ? 3 : 2);

async function loadSettings() {
  const d = await api("/settings");
  state.settings = d.settings; state.keys = d.keys; state.profiles = d.profiles; state.active = d.active_profile;
  const sel = $("#profileSelect");
  sel.innerHTML = `<option value="">— profil seçilməyib —</option>` +
    state.profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === state.active ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  $("#demoBadge").classList.toggle("hidden", !state.settings.demo_mode);
}
$("#profileSelect").addEventListener("change", async (e) => {
  if (!e.target.value) return;
  await api(`/profiles/${e.target.value}/apply`, { method: "POST" });
  await loadSettings(); toast("Profil aktivləşdi"); route();
});

// ---------------- router ----------------
function route() {
  clearInterval(pollTimer);
  const [, page, id] = location.hash.split("/");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === (page || "new")));
  if (page === "history") return viewHistory();
  if (page === "settings") return viewSettings(id || "api");
  if (page === "library") return viewLibrary();
  if (page === "project" && id) return viewProject(id);
  return viewNew();
}
window.addEventListener("hashchange", route);

// ---------------- new video ----------------
function viewNew() {
  const s = state.settings.script;
  view.innerHTML = `
  <h1>Video yarat</h1>
  <div class="card">
    <label>Video başlığı / mövzu</label>
    <input id="nTitle" placeholder="Angels are helping you while you are depressed">
    <label>Video nədən bəhs edir (qısa təsvir, istənilən dildə yaza bilərsiniz)</label>
    <textarea id="nBrief" placeholder="A video about how angelic powers help people while they feel depressed..."></textarea>
    <div class="grid">
      <div><label>Hədəf uzunluq (dəqiqə)</label><input id="nMin" type="number" min="0.5" step="0.5" value="${esc(s.target_minutes)}"></div>
      <div><label>Dil</label><input id="nLang" value="${esc(s.language)}"></div>
    </div>
    <p class="muted">Profil: <b>${esc((state.profiles.find((p) => p.id === state.active) || {}).name || "seçilməyib")}</b> ·
      Ssenari: ${esc(s.llm_provider)} / ${esc(s.llm_model)} · Şəkil: ${esc(state.settings.visual.image_model)} (${esc(state.settings.visual.quality)}) ·
      Səs: ${esc(state.settings.voice.provider)} ${state.settings.voice.voice_id ? "" : '<span class="warn">(voice ID yoxdur)</span>'}</p>
    <div class="row">
      <button class="primary" id="nCreate">Layihəni yarat</button>
      <button id="nAuto">Tam avtomatik: mövzu → hazır MP4</button>
    </div>
    <p class="muted">Məsləhət: yarım saatlıq video üçün ~35 dəqiqə hədəf qoyun — nəticə adətən hədəfin ±20%-i olur.</p>
  </div>`;
  const go = async (auto) => {
    const title = $("#nTitle").value.trim();
    if (!title) return toast("Başlıq yazın", "err");
    await api("/settings", { method: "PUT", body: { script: { target_minutes: parseFloat($("#nMin").value) || 2, language: $("#nLang").value } } });
    await loadSettings();
    const p = await api("/projects", { method: "POST", body: { title, brief: $("#nBrief").value, auto } });
    location.hash = `#/project/${p.id}`;
  };
  $("#nCreate").onclick = () => go(false).catch((e) => toast(e.message, "err"));
  $("#nAuto").onclick = () => go(true).catch((e) => toast(e.message, "err"));
}

// ---------------- history ----------------
async function viewHistory() {
  const list = await api("/projects");
  const stage = { script: "Ssenari", storyboard: "Səhnələr", done: "Hazır" };
  view.innerHTML = `<h1>Tarixçə</h1><div class="card"><table>
   <tr><th>Layihə</th><th>Mərhələ</th><th>Səhnə</th><th>Xərc</th><th>Yenilənib</th><th></th></tr>
   ${list.map((p) => `<tr><td>${esc(p.title)}</td><td>${stage[p.stage] || p.stage}</td><td>${p.scenes}</td><td>${money(p.cost)}</td>
     <td>${new Date(p.updated * 1000).toLocaleString()}</td>
     <td class="row"><a href="#/project/${p.id}"><button class="small">Davam et</button></a>
     ${p.output ? `<a href="/api/projects/${p.id}/output"><button class="small">MP4</button></a>` : ""}
     <button class="small" data-del="${p.id}">Sil</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Hələ layihə yoxdur</td></tr>`}
  </table></div>`;
  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("Layihə silinsin?")) return;
    await api(`/projects/${b.dataset.del}`, { method: "DELETE" }).catch((e) => toast(e.message, "err"));
    viewHistory();
  });
}

// ---------------- settings ----------------
const TABS = {
  api: "API", script: "Skript", visual: "Vizual", voice: "Səsləndirmə", subtitles: "Altyazı",
  music: "Musiqi", motion: "Hərəkət", transitions: "Keçidlər", branding: "Brendinq", output: "Çıxış", costs: "Qiymətlər",
};
const FIELDS = {
  script: [
    ["language", "Dil", "text"],
    ["style", "Danışıq tərzi", "select", ["storytelling", "documentary", "motivational", "educational", "mystery"]],
    ["target_minutes", "Hədəf uzunluq (dəqiqə)", "number"],
    ["llm_provider", "Ssenari AI", "select", ["deepseek", "openai", "anthropic"]],
    ["llm_model", "Model", "text", null, "deepseek-reasoner · deepseek-chat · gpt-4.1 · claude-opus-5-5"],
    ["temperature", "Yaradıcılıq temperaturu (DeepSeek/OpenAI; reasoner nəzərə almır)", "number"],
    ["min_sentences", "Səhnədə min cümlə", "number"],
    ["max_sentences", "Səhnədə max cümlə", "number"],
    ["first_single_sentence_scenes", "İlk neçə səhnə 1 cümləlik olsun", "number"],
    ["max_scene_seconds", "Səhnə max uzunluğu (san)", "number"],
    ["hook_cta", "Hook & CTA", "textarea"],
    ["rules", "Skript yazmaq qaydaları", "textarea"],
    ["voice_rules", "AI voice-over script edition qaydaları (emosiya teqləri, durğu işarələri)", "textarea"],
    ["extra_rules", "Əlavə qaydalar / xüsusi təlimat", "textarea"],
  ],
  visual: [
    ["aspect", "Format", "select", ["16:9", "9:16", "1:1"]],
    ["image_model", "Şəkil modeli (OpenAI)", "text", null, "gpt-image-1"],
    ["quality", "Keyfiyyət (low ≈ 1.6¢, high ≈ 25¢ / şəkil)", "select", ["low", "medium", "high"]],
    ["consistency", "Stil konsistentliyi", "select", ["strong", "medium", "loose"]],
    ["style_id", "Vizual stil (Kitabxanadan)", "style"],
    ["negative", "Neqativ prompt (şəkildə nə olmasın)", "textarea"],
  ],
  voice: [
    ["provider", "Səs servisi", "select", ["fish", "elevenlabs"]],
    ["voice_id", "Aktiv voice ID", "text"],
    ["fish_model", "Fish Audio modeli", "text", null, "s1"],
    ["speed", "Danışıq sürəti (1 = normal, 1.05 = 5% tez)", "number"],
  ],
  subtitles: [["enabled", "Altyazı (.srt) yarat", "bool"], ["burn_in", "Altyazını videoya yandır", "bool"],
    ["max_lines", "Sətir sayı", "number"], ["chars_per_line", "Sətirdə hərf", "number"], ["font_size", "Şrift ölçüsü", "number"]],
  music: [["enabled", "Arxa fon musiqisi", "bool"], ["volume", "Səs səviyyəsi (0.05–0.3)", "number"], ["file", "Fayl", "upload:music"]],
  motion: [["ken_burns", "Ken Burns (avtomatik zoom/pan)", "bool"], ["zoom_percent", "Zoom intensivliyi %", "number"],
    ["fal_model", "Image-to-video modeli (fal.ai)", "text", null, "fal-ai/kling-video/v2.1/standard/image-to-video"],
    ["clip_seconds", "Klip uzunluğu (san)", "number"]],
  transitions: [["mode", "Keçid rejimi", "select", ["crossfade", "fade", "cut"]], ["duration", "Keçid müddəti (san)", "number"],
    ["types", "Crossfade növləri (vergüllə)", "list", null, "fade, dissolve, smoothleft, smoothright, circleopen, wipeleft, fadeblack, radial"]],
  branding: [["logo", "Loqo (PNG, şəffaf fon)", "upload:logo"], ["logo_width_percent", "Loqo eni (% video eni)", "number"],
    ["position", "Mövqe", "select", ["top-left", "top-right", "bottom-left", "bottom-right"]]],
  output: [["fps", "FPS", "number"], ["crf", "Keyfiyyət CRF (18 = yüksək, 23 = orta)", "number"], ["audio_bitrate", "Audio bitrate", "text"]],
  costs: [["image_low", "Şəkil low $", "number"], ["image_medium", "Şəkil medium $", "number"], ["image_high", "Şəkil high $", "number"],
    ["tts_per_million_chars", "Səs: $ / 1M simvol", "number"], ["animate_per_clip", "Animasiya: $ / klip", "number"],
    ["deepseek_in_per_m", "DeepSeek input $/1M token", "number"], ["deepseek_out_per_m", "DeepSeek output $/1M token", "number"],
    ["openai_in_per_m", "OpenAI LLM input $/1M", "number"], ["openai_out_per_m", "OpenAI LLM output $/1M", "number"],
    ["anthropic_in_per_m", "Claude input $/1M", "number"], ["anthropic_out_per_m", "Claude output $/1M", "number"]],
};

async function viewSettings(tab) {
  await loadSettings();
  const lib = tab === "visual" ? await api("/library") : null;
  const st = state.settings;
  view.innerHTML = `<h1>Ayarlar</h1>
   <div class="tabs">${Object.entries(TABS).map(([k, v]) => `<a href="#/settings/${k}"><button class="${k === tab ? "on" : ""}">${v}</button></a>`).join("")}</div>
   <div class="card" id="tabBody"></div>
   <div class="card"><h3>Profil (kanal ayarları)</h3>
     <p class="muted">Bütün tabların ayarları profilə yazılır. API açarları bütün profillər üçün ortaqdır.</p>
     <div class="row"><button id="pUpdate" ${state.active ? "" : "disabled"}>Profili yenilə</button>
       <input id="pName" placeholder="Yeni profil adı (məs. English 1)" style="max-width:260px"><button id="pNew">Yeni profil yarat</button>
       <button id="pDel" ${state.active ? "" : "disabled"}>Aktiv profili sil</button> <span id="saved" class="muted"></span></div></div>`;
  const body = $("#tabBody");
  if (tab === "api") renderApiTab(body);
  else renderFields(body, tab, FIELDS[tab], st[tab], lib);
  if (tab === "voice") renderVoices(body);
  $("#pUpdate").onclick = async () => { await api("/profiles", { method: "POST", body: { id: state.active } }); toast("Profil yeniləndi", "ok"); };
  $("#pNew").onclick = async () => {
    const name = $("#pName").value.trim(); if (!name) return toast("Profil adı yazın", "err");
    await api("/profiles", { method: "POST", body: { name } }); await loadSettings(); toast("Profil yaradıldı", "ok"); viewSettings(tab);
  };
  $("#pDel").onclick = async () => { if (!confirm("Profil silinsin?")) return; await api(`/profiles/${state.active}`, { method: "DELETE" }); await loadSettings(); viewSettings(tab); };
}

let saveTimer;
function saveSection(section, patch) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const r = await api("/settings", { method: "PUT", body: { [section]: patch } });
    state.settings = r.settings; $("#saved") && ($("#saved").textContent = "Yadda saxlanıldı " + r.saved_at);
    $("#demoBadge").classList.toggle("hidden", !state.settings.demo_mode);
  }, 400);
}

function renderFields(el, section, fields, values, lib) {
  el.innerHTML = `<div class="grid">${fields.map(([k, label, type, opts, ph]) => {
    const v = values[k];
    if (type === "textarea") return `<div style="grid-column:1/-1"><label>${label}</label><textarea data-k="${k}">${esc(v)}</textarea></div>`;
    if (type === "select") return `<div><label>${label}</label><select data-k="${k}">${opts.map((o) => `<option ${o == v ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
    if (type === "style") return `<div><label>${label}</label><select data-k="${k}"><option value="">— stil yoxdur —</option>${lib.styles.map((s) => `<option value="${esc(s.id)}" ${s.id === v ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>`;
    if (type === "bool") return `<div><label><input type="checkbox" data-k="${k}" ${v ? "checked" : ""}> ${label}</label></div>`;
    if (type === "list") return `<div style="grid-column:1/-1"><label>${label}</label><input data-k="${k}" data-list="1" value="${esc((v || []).join(", "))}" placeholder="${esc(ph || "")}"></div>`;
    if (type.startsWith("upload:")) return `<div><label>${label}</label><div class="muted">${esc(v || "yüklənməyib")}</div><input type="file" data-up="${type.split(":")[1]}"></div>`;
    return `<div><label>${label}</label><input data-k="${k}" type="${type === "number" ? "number" : "text"}" step="any" value="${esc(v)}" placeholder="${esc(ph || "")}"></div>`;
  }).join("")}</div>`;
  el.querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener(inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : "input", () => {
    let val = inp.type === "checkbox" ? inp.checked : inp.value;
    if (inp.type === "number") val = parseFloat(inp.value);
    if (inp.dataset.list) val = inp.value.split(",").map((x) => x.trim()).filter(Boolean);
    saveSection(section, { [inp.dataset.k]: val });
  }));
  el.querySelectorAll("[data-up]").forEach((inp) => inp.onchange = async () => {
    const fd = new FormData(); fd.append("file", inp.files[0]);
    try { await api(`/upload/${inp.dataset.up}`, { form: fd }); toast("Fayl yükləndi", "ok"); route(); } catch (e) { toast(e.message, "err"); }
  });
}

function renderApiTab(el) {
  const rows = [["deepseek", "DeepSeek (ssenari, prompt-lar)", "platform.deepseek.com → API keys"],
    ["openai", "OpenAI (şəkillər: gpt-image-1)", "platform.openai.com → API keys"],
    ["anthropic", "Anthropic / Claude (ssenari üçün alternativ)", "console.anthropic.com → API keys"],
    ["fish", "Fish Audio (səsləndirmə, emosiyalar)", "fish.audio → Developers → API keys"],
    ["elevenlabs", "ElevenLabs (alternativ səs)", "elevenlabs.io → Profile → API key"],
    ["fal", "fal.ai (səhnəni hərəkətə gətirmək)", "fal.ai → Dashboard → Keys"]];
  el.innerHTML = `<label><input type="checkbox" id="demo" ${state.settings.demo_mode ? "checked" : ""}> <b>Demo rejimi</b> — API-siz test: şəkillər, səs və ssenari süni yaradılır, xərc 0. Real video üçün söndürün.</label>
   ${rows.map(([k, label, hint]) => `<label>${label} <span class="muted">· ${hint}</span></label>
     <div class="row"><input data-key="${k}" placeholder="API açarı" value="${esc(state.keys[k])}" style="flex:1">
     <button class="small" data-save="${k}">Yadda saxla</button><button class="small" data-test="${k}">Bağlantını yoxla</button>
     <span data-res="${k}" class="muted"></span></div>`).join("")}`;
  $("#demo").onchange = (e) => api("/settings", { method: "PUT", body: { demo_mode: e.target.checked } })
    .then(loadSettings).then(() => toast(e.target.checked ? "Demo rejimi aktivdir" : "Real API rejimi aktivdir", "ok"));
  el.querySelectorAll("[data-save]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.save; const r = await api("/keys", { method: "PUT", body: { [k]: $(`[data-key=${k}]`).value } });
    state.keys = r.keys; $(`[data-key=${k}]`).value = r.keys[k]; toast("Açar saxlanıldı", "ok");
  });
  el.querySelectorAll("[data-test]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.test; const out = $(`[data-res=${k}]`); out.textContent = "yoxlanılır...";
    const r = await api(`/keys/${k}/test`, { method: "POST" }); out.textContent = r.message; out.className = r.ok ? "ok" : "err";
  });
}

function renderVoices(el) {
  const v = state.settings.voice;
  const box = document.createElement("div");
  box.innerHTML = `<h2>Səs bazası</h2><p class="muted">Fish Audio: Discovery → səsi seçin → ⋯ → Copy model ID. ElevenLabs: Voices → ID.</p>
   <div class="grid"><div><label>Voice ID</label><input id="vId"></div><div><label>Ad</label><input id="vName"></div>
   <div><label>Dil</label><input id="vLang" placeholder="eng"></div><div><label>Cins</label><select id="vGender"><option>male</option><option>female</option></select></div></div>
   <div class="row" style="margin-top:8px"><button id="vAdd">Əlavə et</button></div>
   <div class="voice-list" style="margin-top:10px">${(v.voices || []).map((x, i) => `<button data-pick="${i}" class="${x.id === v.voice_id ? "primary" : ""}">${esc(x.name)} · ${esc(x.lang)} · ${esc(x.gender)}</button><button class="small" data-rm="${i}">×</button>`).join("") || '<span class="muted">Hələ səs əlavə olunmayıb</span>'}</div>`;
  el.appendChild(box);
  $("#vAdd").onclick = async () => {
    const id = $("#vId").value.trim(); if (!id) return toast("Voice ID yazın", "err");
    const voices = [...(v.voices || []), { id, name: $("#vName").value || id.slice(0, 8), lang: $("#vLang").value, gender: $("#vGender").value }];
    await api("/settings", { method: "PUT", body: { voice: { voices, voice_id: id } } }); viewSettings("voice");
  };
  box.querySelectorAll("[data-pick]").forEach((b) => b.onclick = async () => {
    await api("/settings", { method: "PUT", body: { voice: { voice_id: v.voices[b.dataset.pick].id } } }); viewSettings("voice");
  });
  box.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => {
    const voices = v.voices.filter((_, i) => i != b.dataset.rm);
    await api("/settings", { method: "PUT", body: { voice: { voices } } }); viewSettings("voice");
  });
}

// ---------------- library ----------------
async function viewLibrary() {
  const lib = await api("/library");
  view.innerHTML = `<h1>Kitabxana</h1>
  <div class="split">
   <div class="card"><h3>Vizual stillər</h3>
     <p class="muted">Pinterest-dən bəyəndiyiniz 1-2 şəkli Claude/ChatGPT-yə verib "bu qrafik stildə şəkillər yaratmaq üçün 5 cümləlik prompt yaz" deyin. İlk cümləni prefiksə, qalanını prompt-a qoyun.</p>
     <input type="hidden" id="sId"><label>Ad</label><input id="sName"><label>Prompt prefiks (əvvələ)</label><textarea id="sPrefix"></textarea>
     <label>Stil prompt-u (sona)</label><textarea id="sPrompt"></textarea><label>Neqativ</label><input id="sNeg" placeholder="text, logo">
     <div class="row" style="margin-top:8px"><button class="primary" id="sSave">Yadda saxla</button><button id="sClear">Təmizlə</button></div>
     <h2>Mövcud stillər</h2>${lib.styles.map((s) => `<div class="kv"><span>${esc(s.name)} ${s.builtin ? '<span class="muted">(baza)</span>' : ""}</span>
       <span>${s.builtin ? "" : `<button class="small" data-edit-s="${s.id}">Redaktə</button><button class="small" data-del-s="${s.id}">Sil</button>`}</span></div>`).join("")}
   </div>
   <div class="card"><h3>Personajlar</h3>
     <p class="muted">Personajın adı səhnə mətnində keçəndə təsviri prompt-a əlavə olunur — bütün səhnələrdə eyni görünür.</p>
     <input type="hidden" id="cId"><label>Ad (ssenaridə necə keçirsə)</label><input id="cName" placeholder="Rachel">
     <label>Xarici görünüş təsviri (ingiliscə)</label><textarea id="cDesc" placeholder="woman in her 30s, shoulder-length dark curly hair, green knitted sweater, round glasses"></textarea>
     <div class="row" style="margin-top:8px"><button class="primary" id="cSave">Yadda saxla</button></div>
     <h2>Mövcud personajlar</h2>${lib.characters.map((c) => `<div class="kv"><span>${esc(c.name)}</span><span><button class="small" data-edit-c="${c.id}">Redaktə</button><button class="small" data-del-c="${c.id}">Sil</button></span></div>`).join("") || '<span class="muted">yoxdur</span>'}
   </div></div>`;
  $("#sSave").onclick = async () => {
    if (!$("#sName").value.trim()) return toast("Ad yazın", "err");
    await api("/library/styles", { method: "POST", body: { id: $("#sId").value || undefined, name: $("#sName").value, prefix: $("#sPrefix").value, prompt: $("#sPrompt").value, negative: $("#sNeg").value } });
    toast("Stil saxlanıldı — Ayarlar → Vizual-da seçin", "ok"); viewLibrary();
  };
  $("#sClear").onclick = viewLibrary;
  $("#cSave").onclick = async () => {
    if (!$("#cName").value.trim()) return toast("Ad yazın", "err");
    await api("/library/characters", { method: "POST", body: { id: $("#cId").value || undefined, name: $("#cName").value, description: $("#cDesc").value } });
    viewLibrary();
  };
  view.querySelectorAll("[data-edit-s]").forEach((b) => b.onclick = () => {
    const s = lib.styles.find((x) => x.id === b.dataset.editS);
    $("#sId").value = s.id; $("#sName").value = s.name; $("#sPrefix").value = s.prefix; $("#sPrompt").value = s.prompt; $("#sNeg").value = s.negative || "";
  });
  view.querySelectorAll("[data-edit-c]").forEach((b) => b.onclick = () => {
    const c = lib.characters.find((x) => x.id === b.dataset.editC);
    $("#cId").value = c.id; $("#cName").value = c.name; $("#cDesc").value = c.description;
  });
  view.querySelectorAll("[data-del-s]").forEach((b) => b.onclick = async () => { await api(`/library/styles/${b.dataset.delS}`, { method: "DELETE" }); viewLibrary(); });
  view.querySelectorAll("[data-del-c]").forEach((b) => b.onclick = async () => { await api(`/library/characters/${b.dataset.delC}`, { method: "DELETE" }); viewLibrary(); });
}

// ---------------- project ----------------
let lastJobSig = "";
async function viewProject(pid) {
  let p;
  try { p = await api(`/projects/${pid}`); } catch (e) { view.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  lastJobSig = jobSig(p);
  const stage = p.output ? 3 : p.scenes.length ? (p.scenes.every((s) => s.image) ? 2 : 1) : 0;
  const steps = ["Ssenari", "Görüntülər", "Səs & montaj", "Hazır video"];
  view.innerHTML = `<h1>${esc(p.title)}</h1>
   <div class="steps">${steps.map((s, i) => `<span class="${i <= stage ? "on" : ""}">${i + 1}. ${s}</span>`).join("")}</div>
   <div id="jobbar"></div><div id="pbody"></div>`;
  renderJob(p);
  if (!p.scenes.length) renderScriptStage(p); else renderStoryboard(p);
  pollTimer = setInterval(async () => {
    const q = await api(`/projects/${pid}`).catch(() => null);
    if (!q) return;
    renderJob(q);
    const sig = jobSig(q);
    if (sig !== lastJobSig) { lastJobSig = sig; if (!q.running || q.job?.name === "frames" || q.job?.name === "voice") rerender(q); }
  }, 2000);
}
const jobSig = (p) => JSON.stringify([p.running, p.job?.status, p.script.length, p.scenes.map((s) => s.image + s.audio + s.video + s.error), p.output]);
function rerender(p) {
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT") && view.contains(active)) return; // don't clobber typing
  viewProjectSoft(p);
}
function viewProjectSoft(p) {
  const stage = p.output ? 3 : p.scenes.length ? (p.scenes.every((s) => s.image) ? 2 : 1) : 0;
  document.querySelectorAll(".steps span").forEach((s, i) => s.classList.toggle("on", i <= stage));
  if (!p.scenes.length) renderScriptStage(p); else renderStoryboard(p);
}

function renderJob(p) {
  const j = p.job; const bar = $("#jobbar"); if (!bar) return;
  if (!j) { bar.innerHTML = ""; return; }
  const cls = { running: "", done: "ok", error: "err", stopped: "warn" }[j.status] || "";
  bar.innerHTML = `<div class="jobbar"><div class="row" style="justify-content:space-between">
    <span class="${cls}"><b>${esc(j.message)}</b> ${j.error ? "— " + esc(j.error) : ""}</span>
    <span class="row"><span class="muted">Xərc: ${money(p.total_cost)}</span>${p.running ? `<button class="small" id="stopBtn">Dayandır</button>` : ""}</span></div>
    ${p.running ? `<div class="progress" style="margin-top:8px"><div style="width:${Math.round(j.progress || 0)}%"></div></div>` : ""}</div>`;
  $("#stopBtn") && ($("#stopBtn").onclick = () => api(`/projects/${p.id}/stop`, { method: "POST" }));
}

function renderScriptStage(p) {
  const s = p.settings.script;
  $("#pbody").innerHTML = `<div class="split">
   <div class="card"><h3>Ssenari</h3>
     <p class="muted">1-ci yol: AI yazsın (${esc(s.llm_provider)} / ${esc(s.llm_model)}, ~${esc(s.target_minutes)} dəq). 2-ci yol: öz mətninizi (Claude/ChatGPT-də yazdırdığınız) buraya yapışdırın.</p>
     <textarea id="scr" style="min-height:420px">${esc(p.script)}</textarea>
     <div class="row" style="margin-top:8px">
       <button id="wr" ${p.running ? "disabled" : ""}>AI ilə yaz</button>
       <button id="sv">Yadda saxla</button>
       <button class="primary" id="sp" ${p.running ? "disabled" : ""}>Səhnələrə böl</button>
       <button id="au" ${p.running ? "disabled" : ""}>Qalanını avtomatik et</button>
       <button id="rs" title="Profil dəyişdikdən sonra">Ayarları layihəyə tətbiq et</button></div>
     <p class="muted">Paraqraflar boş sətirlə ayrılır. Qısa paraqrafı növbəti ilə birləşdirmək üçün sadəcə eyni abzasa yazın.</p></div>
   <div class="card"><h3>Səhnə bölgüsü (önizləmə)</h3><div class="scene-list" id="prev"></div></div></div>`;
  const preview = () => {
    const paras = $("#scr").value.split(/\n\s*\n/).filter((x) => x.trim());
    $("#prev").innerHTML = paras.map((x, i) => `<div><b>${i + 1}.</b> ${esc(x.slice(0, 220))}${x.length > 220 ? "…" : ""}</div>`).join("") || '<span class="muted">mətn yoxdur</span>';
  };
  preview(); $("#scr").oninput = preview;
  const save = () => api(`/projects/${p.id}/script`, { method: "PUT", body: { script: $("#scr").value } });
  $("#sv").onclick = () => save().then(() => toast("Saxlanıldı", "ok"));
  $("#wr").onclick = () => api(`/projects/${p.id}/write-script`, { method: "POST" }).catch((e) => toast(e.message, "err"));
  $("#sp").onclick = async () => { await save(); await api(`/projects/${p.id}/split`, { method: "POST" }).catch((e) => toast(e.message, "err")); viewProject(p.id); };
  $("#au").onclick = async () => { await save(); await api(`/projects/${p.id}/auto`, { method: "POST" }).catch((e) => toast(e.message, "err")); };
  $("#rs").onclick = async () => { await api(`/projects/${p.id}/refresh-settings`, { method: "POST" }); toast("Aktiv ayarlar layihəyə köçürüldü", "ok"); viewProject(p.id); };
}

function renderStoryboard(p) {
  const total = p.scenes.reduce((a, s) => a + (s.duration || 0), 0);
  const allImg = p.scenes.every((s) => s.image), allAud = p.scenes.every((s) => s.audio);
  const dis = p.running ? "disabled" : "";
  const meta = p.metadata;
  $("#pbody").innerHTML = `
   ${p.output ? `<div class="card"><h3>Hazır video</h3><video src="/api/projects/${p.id}/output?t=${p.updated}" controls style="width:100%;max-height:480px;background:#000"></video>
     <div class="row" style="margin-top:8px"><a href="/api/projects/${p.id}/output"><button class="primary">MP4 yüklə</button></a>
     <a href="/api/projects/${p.id}/output?srt=true"><button>Altyazı (.srt)</button></a><button id="of">Qovluğu aç</button>
     <span class="muted">${esc(p.output)}</span></div>
     ${meta ? `<h2>YouTube üçün</h2><label>Başlıq</label><input value="${esc(meta.title)}" readonly><label>Təsvir</label><textarea readonly>${esc(meta.description)}</textarea>
       <label>Teqlər</label><input value="${esc((meta.tags || []).join(", "))}" readonly><label>Thumbnail prompt</label><textarea readonly>${esc(meta.thumbnail_prompt)}</textarea>` : `<button id="md" ${dis}>YouTube başlıq/təsvir/teq yarat</button>`}</div>` : ""}
   <div class="card"><div class="row" style="justify-content:space-between">
     <span><b>${p.scenes.length}</b> səhnə · səs: ${total ? Math.floor(total / 60) + ":" + String(Math.round(total % 60)).padStart(2, "0") : "—"} · xərc ${money(p.total_cost)}</span>
     <span class="row">
       <button id="bk" ${dis}>← Ssenariyə qayıt</button>
       <button class="${allImg ? "" : "primary"}" id="fr" ${dis}>Bütün kadrları hazırla</button>
       <button class="${allImg && !allAud ? "primary" : ""}" id="vo" ${dis}>Hamısını səsləndir</button>
       <button class="${allImg && allAud ? "primary" : ""}" id="rn" ${dis || (!allImg || !allAud ? "disabled" : "")}>Montaj et → video yarat</button>
       <button id="au" ${dis}>Qalanını avtomatik et</button></span></div>
     ${(p.voice_warnings || []).length ? `<p class="warn">Uzun səhnələr: ${esc(p.voice_warnings.join(" · "))}</p>` : ""}</div>
   <div class="scenes">${p.scenes.map((s, i) => sceneCard(p, s, i)).join("")}</div>`;
  const post = (path, body) => api(`/projects/${p.id}${path}`, { method: "POST", body }).catch((e) => toast(e.message, "err"));
  $("#bk").onclick = async () => { if (!confirm("Səhnələr (şəkil və səslər) silinəcək, ssenari qalacaq. Davam?")) return; await post("/reset-scenes"); viewProject(p.id); };
  $("#fr").onclick = () => post("/frames", {});
  $("#vo").onclick = () => post("/voice", {});
  $("#rn").onclick = () => post("/render");
  $("#au").onclick = () => post("/auto");
  $("#md") && ($("#md").onclick = () => post("/metadata"));
  $("#of") && ($("#of").onclick = async () => { const r = await post("/open-folder"); r && toast("Qovluq: " + r.folder); });
  p.scenes.forEach((s) => wireScene(p, s));
}

function sceneCard(p, s, i) {
  const media = s.video ? `<video src="${fileUrl(p.id, s.video)}" muted loop autoplay playsinline></video>`
    : s.image ? `<img src="${fileUrl(p.id, s.image)}" loading="lazy">` : (p.running && p.job?.name === "frames" ? "çəkilir..." : "şəkil yoxdur");
  const dis = p.running ? "disabled" : "";
  return `<div class="scene" id="sc-${s.id}"><div class="media">${media}</div><div class="body">
    <div class="kv"><b>Səhnə ${i + 1}</b><span>${s.duration ? s.duration.toFixed(1) + " san" : ""} ${s.error ? `<span class="err" title="${esc(s.error)}">xəta</span>` : ""}</span></div>
    <textarea data-f="text">${esc(s.text)}</textarea>
    ${s.audio ? `<audio controls preload="none" src="${fileUrl(p.id, s.audio)}"></audio>` : ""}
    <details><summary>Vizual təsvir və final prompt</summary>
      <label>Vizual təsvir</label><textarea data-f="visual">${esc(s.visual)}</textarea>
      <label>Final prompt ${s.prompt_locked ? "(əl ilə dəyişdirilib)" : ""}</label><textarea data-f="prompt">${esc(s.prompt)}</textarea>
      ${s.motion_prompt ? `<label>Hərəkət prompt-u</label><div class="muted">${esc(s.motion_prompt)}</div>` : ""}</details>
    <div class="row">
      <button class="small" data-a="save">Saxla</button>
      <button class="small" data-a="img" ${dis}>Şəkli yenidən yarat</button>
      <button class="small" data-a="voice" ${dis}>Səsləndir</button>
      <button class="small" data-a="anim" ${dis || (!s.image ? "disabled" : "")}>Kadrı hərəkətləndir</button>
      ${s.video ? `<button class="small" data-a="unvid">Videonu sil</button>` : ""}
      <button class="small" data-a="del" ${dis}>Sil</button></div></div></div>`;
}

function wireScene(p, s) {
  const el = $(`#sc-${CSS.escape(s.id)}`);
  const val = (f) => $(`[data-f=${f}]`, el).value;
  const post = (path, body) => api(`/projects/${p.id}${path}`, { method: "POST", body }).catch((e) => toast(e.message, "err"));
  const saveScene = async () => {
    const body = {};
    if (val("text") !== s.text) body.text = val("text");
    if (val("visual") !== s.visual) body.visual = val("visual");
    if (val("prompt") !== s.prompt) body.prompt = val("prompt");
    if (Object.keys(body).length) await api(`/projects/${p.id}/scenes/${s.id}`, { method: "PUT", body });
    return body;
  };
  el.querySelectorAll("[data-a]").forEach((b) => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === "save") { const ch = await saveScene(); toast(ch.text ? "Saxlanıldı — mətn dəyişdi, yenidən səsləndirin" : "Saxlanıldı", "ok"); }
    if (a === "img") { await saveScene(); await post("/frames", { scene_ids: [s.id], force: true }); }
    if (a === "voice") { await saveScene(); await post("/voice", { scene_ids: [s.id], force: true }); }
    if (a === "anim") await post(`/scenes/${s.id}/animate`);
    if (a === "unvid") { await post(`/scenes/${s.id}/clear-video`); viewProject(p.id); }
    if (a === "del") { if (!confirm("Səhnə silinsin?")) return; await api(`/projects/${p.id}/scenes/${s.id}`, { method: "DELETE" }); viewProject(p.id); }
  });
}

loadSettings().then(route).catch((e) => { view.innerHTML = `<p class="err">Server ilə əlaqə yoxdur: ${esc(e.message)}</p>`; });
