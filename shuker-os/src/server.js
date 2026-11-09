// HTTP server: veb panel, panel API, Media Kit səhifəsi, Instagram webhook.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { executeTool, canSeeFinance, sanitizeDeal } from './tools.js';
import { verifySignature } from './instagram.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../public');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function makeServer({ db, time, config, instagram, notifyTeam, onOfferCreated, logger = console }) {
  const loginAttempts = new Map();

  function send(res, status, body, headers = {}) {
    const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(status, {
      'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin',
      ...headers,
    });
    res.end(isObj ? JSON.stringify(body) : body);
  }

  function readBody(req, limit = 1_000_000) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async function json(req) {
    const raw = await readBody(req);
    if (!raw.length) return {};
    try { return JSON.parse(raw.toString('utf8')); } catch { throw Object.assign(new Error('Səhv JSON'), { status: 400 }); }
  }

  function session(req) {
    const cookie = req.headers.cookie || '';
    const m = cookie.match(/(?:^|;\s*)sos=([a-f0-9]{64})/);
    const token = m?.[1] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const s = db.getSession(token);
    return s ? { token, role: s.role } : null;
  }

  // Panel rolları: owner → owner, team → manager
  const panelUser = (s) => ({ id: `panel-${s.role}`, name: s.role === 'owner' ? config.ownerName : 'Komanda (panel)', role: s.role === 'owner' ? 'owner' : 'manager' });

  async function tool(name, input, s) {
    const out = await executeTool(name, input, { db, time, user: panelUser(s), financeAccess: config.financeAccess, notifyTeam, onOfferCreated });
    return out;
  }
  const toolStatus = (out) => (out?.error ? (/icazə/.test(out.error) ? 403 : /tapılmadı/.test(out.error) ? 404 : 400) : 200);

  function mediaKitHtml() {
    const s = db.allSettings();
    const brands = [...new Set(db.listDeals({ limit: 500 }).filter((d) => ['paylasildi', 'hesabat'].includes(d.stage)).map((d) => d.brand))].slice(0, 30);
    const stat = (label, key) => (s[key] ? `<div class="stat"><span>${esc(label)}</span><b>${esc(s[key])}</b></div>` : '');
    return `<!doctype html><html lang="az"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.mk_name || config.ownerName)} · Media Kit</title>
<style>:root{--bg:#0b0b0d;--card:#17171a;--line:#2a2a30;--text:#f4f4f5;--muted:#a1a1aa;--gold:#e7b54a}
*{box-sizing:border-box;margin:0}body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px;display:flex;justify-content:center}
main{max-width:640px;width:100%}h1{font-size:32px;margin:8px 0 4px}p.t{color:var(--muted);margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
.stat span{display:block;color:var(--muted);font-size:13px}.stat b{font-size:22px}h2{font-size:16px;margin:18px 0 8px}
.brands{display:flex;flex-wrap:wrap;gap:6px}.brands span{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:13px}
.eyebrow{color:var(--gold);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}footer{color:var(--muted);font-size:12px;margin-top:28px}</style></head>
<body><main><p class="eyebrow">Media Kit</p><h1>${esc(s.mk_name || config.ownerName)}</h1><p class="t">${esc(s.mk_tagline || '')}</p>
<div class="grid">${stat('İzləyici', 'mk_followers')}${stat('Orta reels baxışı', 'mk_avg_views')}${stat('Engagement', 'mk_engagement')}${stat('Auditoriya', 'mk_audience')}${stat('Post sayı', 'mk_posts')}${stat('Güclü sahələr', 'mk_categories')}</div>
${brands.length ? `<h2>Əməkdaşlıq etdiyimiz brendlər</h2><div class="brands">${brands.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
${s.mk_contact ? `<h2>Əlaqə</h2><p>${esc(s.mk_contact)}</p>` : ''}
<footer>Son yenilənmə: ${esc(time.parts().date)}</footer></main></body></html>`;
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method;

    if (p === '/health') return send(res, 200, { ok: true });
    if (p === '/') return send(res, 302, '', { location: '/panel' });
    if (p === '/panel' && method === 'GET') {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'panel.html')), { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    }
    if (p === '/mediakit' && method === 'GET') return send(res, 200, mediaKitHtml(), { 'content-type': 'text/html; charset=utf-8' });

    // --- Instagram webhook ---
    if (p === '/webhooks/instagram') {
      if (method === 'GET') {
        const ok = url.searchParams.get('hub.mode') === 'subscribe' && config.meta.verifyToken
          && safeEqual(url.searchParams.get('hub.verify_token') || '', config.meta.verifyToken);
        return ok ? send(res, 200, url.searchParams.get('hub.challenge') || '') : send(res, 403, 'forbidden');
      }
      if (method === 'POST') {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers['x-hub-signature-256'], config.meta.appSecret)) return send(res, 401, 'bad signature');
        send(res, 200, 'EVENT_RECEIVED');
        let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return undefined; }
        instagram.handleWebhook(body).catch((e) => logger.error('Webhook xətası:', e));
        return undefined;
      }
    }

    if (!p.startsWith('/api/')) return send(res, 404, { error: 'Tapılmadı' });

    // --- giriş ---
    if (p === '/api/login' && method === 'POST') {
      const ip = req.socket.remoteAddress || '';
      const a = loginAttempts.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 15 * 60000) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 10) return send(res, 429, { error: 'Çox cəhd. 15 dəqiqə sonra yenidən yoxlayın.' });
      const { password } = await json(req);
      let role = null;
      if (config.panel.ownerPassword && safeEqual(password || '', config.panel.ownerPassword)) role = 'owner';
      else if (config.panel.teamPassword && safeEqual(password || '', config.panel.teamPassword)) role = 'team';
      if (!role) { a.n++; loginAttempts.set(ip, a); return send(res, 401, { error: 'Şifrə səhvdir' }); }
      const token = crypto.randomBytes(32).toString('hex');
      db.createSession(token, role);
      const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
      return send(res, 200, { role, token }, { 'set-cookie': `sos=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}` });
    }

    const s = session(req);
    if (!s) return send(res, 401, { error: 'Giriş tələb olunur' });
    const user = panelUser(s);
    const fin = canSeeFinance(user.role, config.financeAccess);

    if (p === '/api/logout' && method === 'POST') { db.deleteSession(s.token); return send(res, 200, { ok: true }, { 'set-cookie': 'sos=; Path=/; Max-Age=0' }); }
    if (p === '/api/me') return send(res, 200, { role: s.role, finance: fin, ownerName: config.ownerName });

    if (p === '/api/summary' && method === 'GET') {
      const today = time.parts();
      const range = time.dayRange(today.date);
      const month = await tool('finance_summary', {}, s);
      const leads = db.leadsSince(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      return send(res, 200, {
        today, events: db.listEvents(range.start, range.end).map((e) => ({ ...e, start_local: time.isoToLocal(e.starts_at) })),
        offers: db.listDeals({ stage: 'sorgu' }).map((d) => sanitizeDeal(d, user.role, config.financeAccess)),
        active: db.listDeals({ limit: 500 }).filter((d) => !['sorgu', 'imtina', 'hesabat'].includes(d.stage)).length,
        finance: month.error ? null : { paid: month.paid, pending: month.pending },
        leads24h: { comments: leads.comments || 0, phones: leads.phones || 0 },
        campaigns: db.listCampaigns().filter((c) => c.active),
        tasks: db.listTasks().slice(0, 10),
      });
    }

    // --- reklamlar ---
    if (p === '/api/deals' && method === 'GET') {
      return send(res, 200, { deals: db.listDeals({ stage: url.searchParams.get('stage') || undefined, search: url.searchParams.get('q') || undefined, limit: 500 }).map((d) => sanitizeDeal(d, user.role, config.financeAccess)) });
    }
    if (p === '/api/deals' && method === 'POST') { const out = await tool('create_deal', await json(req), s); return send(res, toolStatus(out), out); }
    let m = p.match(/^\/api\/deals\/(\d+)$/);
    if (m && method === 'PATCH') { const out = await tool('update_deal', { ...(await json(req)), id: Number(m[1]) }, s); return send(res, toolStatus(out), out); }

    // --- təqvim ---
    if (p === '/api/events' && method === 'GET') {
      const from = url.searchParams.get('from') || time.parts().date;
      const to = url.searchParams.get('to') || time.addDays(from, 6);
      const out = await tool('list_events', { from_date: from, to_date: to }, s);
      return send(res, toolStatus(out), out);
    }
    if (p === '/api/events' && method === 'POST') { const out = await tool('add_event', await json(req), s); return send(res, toolStatus(out), out); }
    m = p.match(/^\/api\/events\/(\d+)$/);
    if (m && method === 'PATCH') { const out = await tool('update_event', { ...(await json(req)), id: Number(m[1]) }, s); return send(res, toolStatus(out), out); }
    if (m && method === 'DELETE') { const out = await tool('delete_event', { id: Number(m[1]) }, s); return send(res, toolStatus(out), out); }

    // --- tapşırıqlar ---
    if (p === '/api/tasks' && method === 'GET') return send(res, 200, await tool('list_tasks', {}, s));
    if (p === '/api/tasks' && method === 'POST') { const out = await tool('create_task', await json(req), s); return send(res, toolStatus(out), out); }
    m = p.match(/^\/api\/tasks\/(\d+)\/done$/);
    if (m && method === 'POST') return send(res, 200, await tool('complete_task', { id: Number(m[1]) }, s));

    // --- maliyyə ---
    if (p === '/api/finance' && method === 'GET') {
      if (!fin) return send(res, 403, { error: 'İcazəniz yoxdur' });
      const out = await tool('finance_summary', url.searchParams.get('month') ? { month: url.searchParams.get('month') } : {}, s);
      return send(res, toolStatus(out), { ...out, monthly: db.monthlyIncome(6) });
    }

    // --- kampaniyalar və lead-lər ---
    if (p === '/api/campaigns' && method === 'GET') return send(res, 200, { campaigns: db.listCampaigns() });
    if (p === '/api/campaigns' && method === 'POST') { const out = await tool('create_campaign', await json(req), s); return send(res, toolStatus(out), out); }
    m = p.match(/^\/api\/campaigns\/(\d+)$/);
    if (m && method === 'PATCH') {
      const body = await json(req);
      const patch = {};
      for (const k of ['active', 'dm_text', 'ask_phone_text', 'thanks_text', 'forward_chat_id', 'title']) if (body[k] !== undefined) patch[k] = k === 'active' ? Number(Boolean(body[k])) : String(body[k]);
      return send(res, 200, { updated: db.updateCampaign(Number(m[1]), patch) });
    }
    if (p === '/api/leads' && method === 'GET') {
      const cid = Number(url.searchParams.get('campaign')) || undefined;
      return send(res, 200, { leads: db.listLeads({ campaignId: cid, limit: 500 }) });
    }
    if (p === '/api/leads.csv' && method === 'GET') {
      const cid = Number(url.searchParams.get('campaign')) || undefined;
      const rows = db.listLeads({ campaignId: cid, limit: 10000 });
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = ['tarix,ad,telefon,instagram,şərh,status', ...rows.map((r) => [time.isoToLocal(r.created_at), r.name, r.phone, r.username, r.comment_text, r.status].map(q).join(','))].join('\n');
      return send(res, 200, '﻿' + csv, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="leads.csv"' });
    }

    // --- ayarlar (Media Kit) ---
    if (p === '/api/settings' && method === 'GET') {
      const all = db.allSettings();
      return send(res, 200, { settings: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('mk_'))) });
    }
    if (p === '/api/settings' && method === 'PUT') {
      if (s.role !== 'owner') return send(res, 403, { error: 'Yalnız sahib dəyişə bilər' });
      const body = await json(req);
      for (const [k, v] of Object.entries(body)) if (/^mk_[a-z_]+$/.test(k)) db.setSetting(k, String(v).slice(0, 300));
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Tapılmadı' });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      logger.error('HTTP xətası:', e);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server xətası' });
    });
  });
  return server;
}
