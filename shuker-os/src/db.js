// SQLite baza (Node.js daxili node:sqlite). Bir fayl: data/shuker.db
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const STAGES = ['sorgu', 'muqavile', 'cekilis', 'paylasildi', 'hesabat', 'imtina'];
export const STAGE_NAMES = {
  sorgu: 'Sorğu', muqavile: 'Müqavilə', cekilis: 'Çəkiliş',
  paylasildi: 'Paylaşıldı', hesabat: 'Hesabat göndərildi', imtina: 'İmtina',
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Digər',
  business TEXT NOT NULL DEFAULT 'Reklam',
  stage TEXT NOT NULL DEFAULT 'sorgu',
  price REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  deliverables TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  publish_at TEXT,
  ig_media_id TEXT,
  report_sent INTEGER NOT NULL DEFAULT 0,
  payment_reminded_on TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  location TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  deal_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  reminded INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  assignee TEXT NOT NULL DEFAULT '',
  deal_id INTEGER,
  due_at TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  deal_id INTEGER,
  dm_text TEXT NOT NULL,
  ask_phone_text TEXT NOT NULL DEFAULT 'Sizinlə əlaqə saxlamağımız üçün adınızı və telefon nömrənizi yazın.',
  thanks_text TEXT NOT NULL DEFAULT 'Təşəkkür edirik! Satış komandası tezliklə sizinlə əlaqə saxlayacaq.',
  forward_chat_id TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  ig_user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  comment_id TEXT NOT NULL DEFAULT '',
  comment_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'commented',
  asked_again INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(campaign_id, ig_user_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_history_chat ON chat_history(chat_id, id);
`;

const DEAL_FIELDS = ['brand', 'category', 'business', 'stage', 'price', 'paid', 'paid_at', 'deliverables', 'contact', 'notes', 'due_date', 'publish_at', 'ig_media_id', 'report_sent', 'payment_reminded_on', 'created_by'];
const EVENT_FIELDS = ['title', 'starts_at', 'duration_min', 'location', 'category', 'deal_id', 'notes', 'reminded', 'created_by'];
const CAMPAIGN_FIELDS = ['keyword', 'title', 'deal_id', 'dm_text', 'ask_phone_text', 'thanks_text', 'forward_chat_id', 'active'];
const LEAD_FIELDS = ['name', 'phone', 'status', 'asked_again', 'username', 'comment_text'];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = typeof obj[f] === 'boolean' ? Number(obj[f]) : obj[f];
  return out;
}

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  function insert(table, data) {
    const keys = Object.keys(data);
    const r = run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k]));
    return Number(r.lastInsertRowid);
  }
  function update(table, id, data, touch = false) {
    const keys = Object.keys(data);
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(', ') + (touch ? `, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')` : '');
    run(`UPDATE ${table} SET ${set} WHERE id = ?`, ...keys.map((k) => data[k]), id);
  }

  return {
    raw: db,
    close: () => db.close(),

    // --- reklamlar ---
    createDeal(d) {
      const data = pick(d, DEAL_FIELDS);
      if (!data.brand) throw new Error('brand tələb olunur');
      if (data.stage && !STAGES.includes(data.stage)) throw new Error(`Naməlum mərhələ: ${data.stage}`);
      return this.getDeal(insert('deals', data));
    },
    getDeal: (id) => get('SELECT * FROM deals WHERE id = ?', id),
    updateDeal(id, d) {
      const data = pick(d, DEAL_FIELDS);
      if (data.stage && !STAGES.includes(data.stage)) throw new Error(`Naməlum mərhələ: ${data.stage}`);
      if (data.paid === 1 && !data.paid_at) data.paid_at = new Date().toISOString();
      update('deals', id, data, true);
      return this.getDeal(id);
    },
    listDeals({ stage, unpaidOnly, search, limit = 200 } = {}) {
      const where = []; const args = [];
      if (stage) { where.push('stage = ?'); args.push(stage); }
      if (unpaidOnly) where.push("paid = 0 AND stage NOT IN ('sorgu','imtina')");
      if (search) { where.push('(brand LIKE ? OR notes LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
      return all(`SELECT * FROM deals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT ?`, ...args, limit);
    },
    findDealsByBrand: (brand) => all('SELECT * FROM deals WHERE brand LIKE ? ORDER BY updated_at DESC LIMIT 5', `%${brand}%`),
    categoryStats(category) {
      return get(`SELECT COUNT(*) AS count, AVG(price) AS avg_price, MAX(price) AS max_price, MIN(price) AS min_price
                  FROM deals WHERE category = ? AND stage NOT IN ('sorgu','imtina') AND price > 0`, category);
    },

    // --- təqvim ---
    createEvent(e) {
      const data = pick(e, EVENT_FIELDS);
      if (!data.title || !data.starts_at) throw new Error('title və starts_at tələb olunur');
      return this.getEvent(insert('events', data));
    },
    getEvent: (id) => get('SELECT * FROM events WHERE id = ?', id),
    updateEvent(id, e) { update('events', id, pick(e, EVENT_FIELDS)); return this.getEvent(id); },
    deleteEvent: (id) => run('DELETE FROM events WHERE id = ?', id),
    listEvents: (fromIso, toIso) => all('SELECT * FROM events WHERE starts_at >= ? AND starts_at < ? ORDER BY starts_at', fromIso, toIso),
    // Verilmiş intervalla üst-üstə düşən hadisələr
    overlapping(startIso, durationMin, excludeId = 0) {
      const end = new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString();
      return all(`SELECT * FROM events WHERE id != ? AND starts_at < ?
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+' || duration_min || ' minutes') > ?`, excludeId, end, startIso);
    },

    // --- tapşırıqlar ---
    createTask(t) { return get('SELECT * FROM tasks WHERE id = ?', insert('tasks', pick(t, ['title', 'assignee', 'deal_id', 'due_at', 'created_by']))); },
    listTasks: ({ openOnly = true } = {}) => all(`SELECT * FROM tasks ${openOnly ? 'WHERE done = 0' : ''} ORDER BY id DESC LIMIT 100`),
    completeTask: (id) => run('UPDATE tasks SET done = 1 WHERE id = ?', id),

    // --- kampaniyalar və lead-lər ---
    createCampaign(c) {
      const data = pick({ ...c, keyword: String(c.keyword || '').trim().toUpperCase() }, CAMPAIGN_FIELDS);
      if (!data.keyword || !data.dm_text) throw new Error('keyword və dm_text tələb olunur');
      return this.getCampaign(insert('campaigns', data));
    },
    getCampaign: (id) => get('SELECT * FROM campaigns WHERE id = ?', id),
    updateCampaign(id, c) {
      const data = pick(c, CAMPAIGN_FIELDS);
      if (data.keyword) data.keyword = String(data.keyword).trim().toUpperCase();
      update('campaigns', id, data);
      return this.getCampaign(id);
    },
    listCampaigns: () => all(`SELECT c.*,
        (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) AS comments,
        (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status != 'commented') AS dms,
        (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.phone != '') AS phones
      FROM campaigns c ORDER BY c.id DESC`),
    activeCampaigns: () => all('SELECT * FROM campaigns WHERE active = 1'),
    upsertLead(l) {
      const existing = get('SELECT * FROM leads WHERE campaign_id = ? AND ig_user_id = ?', l.campaign_id, l.ig_user_id);
      if (existing) return { lead: existing, created: false };
      const id = insert('leads', pick(l, [...LEAD_FIELDS, 'campaign_id', 'ig_user_id', 'comment_id']));
      return { lead: get('SELECT * FROM leads WHERE id = ?', id), created: true };
    },
    updateLead(id, l) { update('leads', id, pick(l, LEAD_FIELDS), true); return get('SELECT * FROM leads WHERE id = ?', id); },
    // Bu istifadəçinin nömrə gözlənilən son lead-i
    pendingLeadFor: (igUserId) => get("SELECT * FROM leads WHERE ig_user_id = ? AND status = 'dm_sent' ORDER BY id DESC LIMIT 1", igUserId),
    listLeads: ({ campaignId, limit = 200 } = {}) => campaignId
      ? all('SELECT * FROM leads WHERE campaign_id = ? ORDER BY id DESC LIMIT ?', campaignId, limit)
      : all('SELECT * FROM leads ORDER BY id DESC LIMIT ?', limit),
    leadsSince: (iso) => get("SELECT COUNT(*) AS comments, SUM(phone != '') AS phones FROM leads WHERE created_at >= ?", iso),

    // --- maliyyə ---
    finance({ fromIso, toIso }) {
      const paid = get('SELECT COALESCE(SUM(price),0) AS total, COUNT(*) AS count FROM deals WHERE paid = 1 AND paid_at >= ? AND paid_at < ?', fromIso, toIso);
      const pending = get("SELECT COALESCE(SUM(price),0) AS total, COUNT(*) AS count FROM deals WHERE paid = 0 AND stage NOT IN ('sorgu','imtina')");
      const byCategory = all('SELECT category, SUM(price) AS total, COUNT(*) AS count FROM deals WHERE paid = 1 AND paid_at >= ? AND paid_at < ? GROUP BY category ORDER BY total DESC', fromIso, toIso);
      const pendingDeals = all("SELECT id, brand, price, stage, due_date FROM deals WHERE paid = 0 AND stage NOT IN ('sorgu','imtina') ORDER BY due_date IS NULL, due_date");
      return { paid, pending, byCategory, pendingDeals };
    },
    monthlyIncome(months = 6) {
      return all(`SELECT substr(paid_at,1,7) AS month, SUM(price) AS total FROM deals WHERE paid = 1 AND paid_at IS NOT NULL
                  GROUP BY month ORDER BY month DESC LIMIT ?`, months).reverse();
    },

    // --- ayarlar ---
    getSetting(key, def = null) { const r = get('SELECT value FROM settings WHERE key = ?', key); return r ? r.value : def; },
    setSetting: (key, value) => run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value)),
    allSettings: () => Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value])),

    // --- AI söhbət tarixçəsi (yalnız mətn) ---
    addHistory: (chatId, role, text) => run('INSERT INTO chat_history (chat_id, role, text) VALUES (?, ?, ?)', String(chatId), role, text),
    getHistory: (chatId, limit) => all('SELECT role, text FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT ?', String(chatId), limit).reverse(),
    clearHistory: (chatId) => run('DELETE FROM chat_history WHERE chat_id = ?', String(chatId)),

    // --- panel sessiyaları ---
    createSession: (token, role) => run('INSERT INTO sessions (token, role) VALUES (?, ?)', token, role),
    getSession: (token) => get('SELECT * FROM sessions WHERE token = ?', token),
    deleteSession: (token) => run('DELETE FROM sessions WHERE token = ?', token),
  };
}
