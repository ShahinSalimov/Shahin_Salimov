const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const main = $("#main");
const getToken = () => { try { return sessionStorage.getItem("rp_admin") || ""; } catch { return ""; } };
const setToken = (t) => { try { t ? sessionStorage.setItem("rp_admin", t) : sessionStorage.removeItem("rp_admin"); } catch {} };

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { authorization: "Bearer " + getToken(), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(""); login("Token səhvdir"); throw new Error("401"); }
  if (!res.ok) throw new Error(json.error || "Xəta");
  return json;
}

function toast(m) { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
const fmt = (d) => (d ? new Date(d).toLocaleString("az") : "—");
const left = (ms) => (ms == null ? "limitsiz" : ms <= 0 ? "bitib" : `${Math.floor(ms / 864e5)}g ${Math.floor((ms % 864e5) / 36e5)}s`);
const STATUS = { pending: "Gözləyir (açılmayıb)", active: "Aktiv", expired: "Bitib", revoked: "Ləğv edilib" };

function login(err = "") {
  $("#logout").classList.add("hidden");
  main.innerHTML = `<div class="screen" style="min-height:70vh"><div class="box"><h1>Admin girişi</h1>
    <p class="sub">.env faylındakı ADMIN_TOKEN</p>
    <label class="field"><input type="password" id="tok" placeholder="ADMIN_TOKEN" autocomplete="off"></label>
    <button class="btn primary big" id="in">Daxil ol</button><p class="note" style="color:var(--hot)">${esc(err)}</p></div></div>`;
  $("#in").onclick = () => { setToken($("#tok").value.trim()); load(); };
}

async function load() {
  let d;
  try { d = await api("GET", "/api/admin/accounts"); } catch { return; }
  $("#logout").classList.remove("hidden");
  $("#ed").textContent = d.edition === "trial" ? "Link forması (trial)" : "Tətbiq forması (full)";
  const isTrial = d.edition === "trial";
  main.innerHTML = `
    <h1>${isTrial ? "3 günlük test linkləri" : "Tam versiya lisenziyaları"}</h1>
    <p class="sub">AI: ${d.ai ? "Claude qoşulub" : "offline şablon rejimi (ANTHROPIC_API_KEY yoxdur)"} · Səs→mətn: ${d.transcribe ? "qoşulub" : "brauzer / əl ilə"}</p>
    <div class="card">
      <div class="row">
        <label class="field" style="margin:0"><span>Müştəri</span><input type="text" id="label" placeholder="məs: Şükran Soltanov"></label>
        ${isTrial ? `<label class="field" style="margin:0"><span>Müddət (saat)</span><input type="number" id="hours" value="72"></label>` : "<div></div>"}
        <label class="field" style="margin:0"><span>Cihaz limiti</span><input type="number" id="dev" value="${isTrial ? 2 : 3}"></label>
        <button class="btn primary" id="create">${isTrial ? "Link yarat" : "Açar yarat"}</button>
      </div>
      <div id="out"></div>
    </div>
    <h2>Hesablar</h2>
    <div class="card scroll"><table class="list"><thead><tr><th>Müştəri</th><th>Status</th><th>Qalan</th><th>Aktivləşmə</th><th>Cihaz</th><th>İstifadə</th><th>Son giriş</th><th></th></tr></thead><tbody>
    ${d.accounts.map((a) => `<tr>
      <td><b>${esc(a.label)}</b><div class="note">${esc(a.hint)}${a.profileDone ? " · profil ✓" : ""}</div></td>
      <td class="st-${a.status}">${STATUS[a.status]}</td><td>${a.status === "pending" ? "açılanda başlayır" : left(a.remainingMs)}</td><td>${fmt(a.activatedAt)}</td>
      <td>${a.devices}/${a.maxDevices}</td><td>${esc(a.usage)}<div class="note">${a.ideasUsed} ideya istifadə edilib</div></td><td>${fmt(a.lastSeen)}</td>
      <td style="white-space:nowrap"><button class="btn small" data-act="extend" data-id="${a.id}">+24s</button>
        <button class="btn small" data-act="reset-devices" data-id="${a.id}">Cihazları sıfırla</button>
        ${a.status !== "revoked" ? `<button class="btn small ghost" data-act="revoke" data-id="${a.id}">Ləğv et</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="note">Hələ hesab yoxdur.</td></tr>`}
    </tbody></table></div>
    <h2>Son hadisələr</h2>
    <div class="card scroll"><table class="list"><tbody>${d.events.map((e) => `<tr><td class="note">${fmt(e.at)}</td><td>${esc(e.type)}</td><td class="note">${esc(e.message || e.label || e.source || "")}</td></tr>`).join("")}</tbody></table></div>`;

  $("#create").onclick = async () => {
    try {
      const body = { label: $("#label").value, maxDevices: +$("#dev").value, hours: isTrial ? +$("#hours").value : undefined };
      const r = await api("POST", isTrial ? "/api/admin/trials" : "/api/admin/licenses", body);
      const secret = r.link || r.key;
      const msg = isTrial
        ? `Salam! Sizin üçün xüsusi hazırladığım Soltanov AI sistemini 3 gün pulsuz test edə bilərsiniz:\n${secret}\n\nHər gün 09:00, 13:00 və 19:00-da sizə uyğun Instagram Reels və TikTok ideyaları gələcək. Reklam təklifi gələndə "Reklam" bölməsində səslə danışın — 5 hazır ssenari alacaqsınız.`
        : `Soltanov AI tam versiya lisenziya açarınız:\n${secret}`;
      $("#out").innerHTML = `<div class="kv" style="margin-top:14px"><b>${isTrial ? "Link (yalnız indi göstərilir — saxlayın)" : "Açar (yalnız indi göstərilir — saxlayın)"}</b><div class="copybox linkout">${esc(secret)}</div></div>
        <div class="kv"><b>Müştəriyə göndəriləcək mesaj</b><div class="copybox">${esc(msg)}</div></div>
        <div class="actions"><button class="btn primary" id="c1">Linki kopyala</button><button class="btn" id="c2">Mesajı kopyala</button></div>`;
      $("#c1").onclick = () => navigator.clipboard.writeText(secret).then(() => toast("Kopyalandı"));
      $("#c2").onclick = () => navigator.clipboard.writeText(msg).then(() => toast("Kopyalandı"));
      const out = $("#out").innerHTML;
      await load();
      $("#out").innerHTML = out;
      $("#c1").onclick = () => navigator.clipboard.writeText(secret).then(() => toast("Kopyalandı"));
      $("#c2").onclick = () => navigator.clipboard.writeText(msg).then(() => toast("Kopyalandı"));
    } catch (e) { toast(e.message); }
  };
  main.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.act === "revoke" && !confirm("Giriş dərhal bağlansın?")) return;
    try { await api("POST", `/api/admin/accounts/${b.dataset.id}/${b.dataset.act}`, { hours: 24 }); toast("Edildi"); load(); } catch (e) { toast(e.message); }
  }));
}

$("#logout").onclick = () => { setToken(""); login(); };
getToken() ? load() : login();
