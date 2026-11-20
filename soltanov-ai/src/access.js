import crypto from "node:crypto";

// Access control for both editions.
//  trial: link token -> activated on first open -> expires after N hours (server clock only)
//  full : license key -> no expiry unless admin sets one
// Tokens/keys are stored only as SHA-256 hashes.

export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const b64url = (buf) => buf.toString("base64url");

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function newAccount(kind, label, extra) {
  return {
    id: "acc_" + b64url(crypto.randomBytes(9)),
    kind,
    label: String(label || "").slice(0, 80) || (kind === "trial" ? "Test müştəri" : "Tam versiya"),
    status: "pending", // pending -> active -> expired | revoked
    createdAt: new Date().toISOString(),
    activatedAt: null,
    expiresAt: null,
    devices: {},
    profile: null,
    usage: { ideasGenerated: 0, ideasOpened: 0, adRequests: 0, transcriptions: 0, daily: {} },
    telegramChatId: null,
    ...extra,
  };
}

export function createTrial(store, { label, hours, maxDevices }) {
  const token = b64url(crypto.randomBytes(24));
  const acc = newAccount("trial", label, {
    tokenHash: sha256(token),
    tokenHint: token.slice(0, 4),
    trialHours: hours,
    maxDevices,
  });
  store.data.accounts[acc.id] = acc;
  store.log("trial.created", { accountId: acc.id, label: acc.label });
  store.save();
  return { account: acc, token };
}

export function createLicense(store, { label, maxDevices, expiresAt = null }) {
  const raw = crypto.randomBytes(10).toString("hex").toUpperCase(); // 20 hex chars
  const key = "SA-" + raw.match(/.{1,5}/g).join("-");
  const acc = newAccount("full", label, {
    keyHash: sha256(normalizeKey(key)),
    keyHint: key.slice(-5),
    maxDevices,
    expiresAt,
  });
  store.data.accounts[acc.id] = acc;
  store.log("license.created", { accountId: acc.id, label: acc.label });
  store.save();
  return { account: acc, key };
}

export const normalizeKey = (k) => String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function findByToken(store, token) {
  const h = sha256(token);
  return Object.values(store.data.accounts).find((a) => a.kind === "trial" && a.tokenHash && safeEqual(a.tokenHash, h)) || null;
}

export function findByKey(store, key) {
  const h = sha256(normalizeKey(key));
  return Object.values(store.data.accounts).find((a) => a.kind === "full" && a.keyHash && safeEqual(a.keyHash, h)) || null;
}

/** Re-evaluate status from the server clock. Returns the (possibly updated) status. */
export function refreshStatus(acc, now = Date.now()) {
  if (acc.status === "revoked") return acc.status;
  if (acc.status === "active" && acc.expiresAt && now >= Date.parse(acc.expiresAt)) acc.status = "expired";
  return acc.status;
}

export function remainingMs(acc, now = Date.now()) {
  if (!acc.expiresAt) return null;
  return Math.max(0, Date.parse(acc.expiresAt) - now);
}

/**
 * Activate (first open) or re-enter with an account from a given device.
 * Returns { ok, code, message }.
 */
export function enterAccount(store, acc, deviceId, meta = {}, now = Date.now()) {
  if (!acc) return { ok: false, code: "not_found", message: "Link və ya açar etibarsızdır." };
  if (!deviceId || !/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) return { ok: false, code: "bad_device", message: "Cihaz identifikatoru səhvdir." };

  const status = refreshStatus(acc, now);
  if (status === "revoked") return { ok: false, code: "revoked", message: "Giriş dayandırılıb." };
  if (status === "expired") return { ok: false, code: "expired", message: "Test müddəti bitib." };

  if (!acc.devices[deviceId]) {
    if (Object.keys(acc.devices).length >= acc.maxDevices) {
      store.log("access.device_limit", { accountId: acc.id });
      return { ok: false, code: "device_limit", message: `Bu giriş artıq ${acc.maxDevices} cihazda istifadə olunur.` };
    }
    acc.devices[deviceId] = { firstSeen: new Date(now).toISOString(), ua: String(meta.ua || "").slice(0, 160) };
  }
  acc.devices[deviceId].lastSeen = new Date(now).toISOString();

  if (acc.status === "pending") {
    acc.status = "active";
    acc.activatedAt = new Date(now).toISOString();
    if (acc.kind === "trial") acc.expiresAt = new Date(now + acc.trialHours * 3600_000).toISOString();
    store.log("access.activated", { accountId: acc.id, kind: acc.kind });
  }
  store.save();
  return { ok: true };
}

// ---- Sessions: signed cookie + server-side record (revocable) ----

export function createSession(store, accountId, deviceId, secret) {
  const sid = b64url(crypto.randomBytes(18));
  store.data.sessions[sid] = { sid, accountId, deviceId, createdAt: new Date().toISOString(), lastSeen: Date.now(), revoked: false };
  store.save();
  return signCookie(sid, secret);
}

export function signCookie(sid, secret) {
  const mac = crypto.createHmac("sha256", secret).update(sid).digest("base64url");
  return `${sid}.${mac}`;
}

export function verifyCookie(value, secret) {
  if (!value || typeof value !== "string") return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const sid = value.slice(0, i);
  const expected = signCookie(sid, secret);
  return safeEqual(expected, value) ? sid : null;
}

/** Resolve the request to an account. Returns { ok, account?, session?, code, http }. */
export function authorize(store, cookieValue, deviceId, secret, edition, now = Date.now()) {
  const sid = verifyCookie(cookieValue, secret);
  const session = sid && store.data.sessions[sid];
  if (!session || session.revoked) return { ok: false, code: "no_session", http: 401 };
  if (deviceId && session.deviceId !== deviceId) return { ok: false, code: "device_mismatch", http: 401 };
  const acc = store.account(session.accountId);
  if (!acc) return { ok: false, code: "no_session", http: 401 };
  if ((edition === "trial") !== (acc.kind === "trial")) return { ok: false, code: "wrong_edition", http: 403 };
  const status = refreshStatus(acc, now);
  if (status !== "active") return { ok: false, code: status, http: 423, account: acc };
  if (!acc.devices[session.deviceId]) return { ok: false, code: "device_removed", http: 401 };
  session.lastSeen = now;
  return { ok: true, account: acc, session };
}

// ---- Daily quotas (trial cost control) ----

export function dayKey(tz, now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function takeQuota(acc, kind, limit, tz, now = Date.now()) {
  if (acc.kind !== "trial") return true;
  const d = dayKey(tz, now);
  const day = (acc.usage.daily[d] ||= {});
  if ((day[kind] || 0) >= limit) return false;
  day[kind] = (day[kind] || 0) + 1;
  return true;
}
