import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, fakeNotify, silent } from './helpers.js';
import { makeServer } from '../src/server.js';
import { makeInstagram } from '../src/instagram.js';

let srv; let base; let ctx; const webhookBodies = [];

before(async () => {
  ctx = setup();
  const notify = fakeNotify();
  const instagram = makeInstagram({ db: ctx.db, config: ctx.config, notify, logger: silent });
  instagram.handleWebhook = async (b) => { webhookBodies.push(b); return []; };
  srv = makeServer({ ...ctx, instagram, notifyTeam: notify.team, onOfferCreated: async () => {}, logger: silent });
  await new Promise((r) => srv.listen(0, r));
  base = `http://127.0.0.1:${srv.address().port}`;
  const d = ctx.db.createDeal({ brand: '<script>alert(1)</script>', category: 'Əmlak', price: 9000, stage: 'hesabat' });
  ctx.db.updateDeal(d.id, { paid: 1 });
});
after(() => srv.close());

async function login(password) {
  const r = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ password }) });
  const data = await r.json();
  return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], data };
}
const get = (path, cookie) => fetch(base + path, { headers: { cookie } });

test('Panel: girişsiz API bağlıdır, səhv şifrə 401', async () => {
  assert.equal((await fetch(`${base}/api/summary`)).status, 401);
  assert.equal((await login('yox')).status, 401);
  const panel = await fetch(`${base}/panel`);
  assert.equal(panel.status, 200);
  assert.match(await panel.text(), /Shuker OS/);
});

test('Panel: sahib maliyyəni görür, komanda görmür', async () => {
  const o = await login('owner-pass');
  assert.equal(o.status, 200);
  assert.match(o.cookie, /^sos=[a-f0-9]{64}$/);
  const fin = await get('/api/finance', o.cookie);
  assert.equal(fin.status, 200);
  assert.equal((await fin.json()).paid.total, 9000);

  const t = await login('team-pass');
  assert.equal((await get('/api/finance', t.cookie)).status, 403);
  const deals = await (await get('/api/deals', t.cookie)).json();
  assert.equal(deals.deals[0].price, undefined);
  const sum = await (await get('/api/summary', t.cookie)).json();
  assert.equal(sum.finance, null);
});

test('Panel: hadisə əlavə etmək və üst-üstə düşmə; səhv məlumat 400', async () => {
  const o = await login('owner-pass');
  const post = (body) => fetch(`${base}/api/events`, { method: 'POST', headers: { cookie: o.cookie }, body: JSON.stringify(body) });
  assert.equal((await post({ title: 'A', start_local: '2026-11-11 12:00' })).status, 200);
  const second = await (await post({ title: 'B', start_local: '2026-11-11 12:30' })).json();
  assert.equal(second.conflicts[0].title, 'A');
  assert.equal((await post({ title: 'C', start_local: 'sabah' })).status, 400);
  assert.equal((await post({ start_local: '2026-11-11 12:30' })).status, 400);
});

test('Media Kit: HTML təhlükəsiz göstərilir', async () => {
  const html = await (await fetch(`${base}/mediakit`)).text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('Instagram webhook: doğrulama və imza yoxlaması', async () => {
  const ok = await fetch(`${base}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123`);
  assert.equal(await ok.text(), '123');
  assert.equal((await fetch(`${base}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=yox&hub.challenge=1`)).status, 403);

  const body = JSON.stringify({ entry: [{ changes: [] }] });
  const bad = await fetch(`${base}/webhooks/instagram`, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } });
  assert.equal(bad.status, 401);
  const sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  const good = await fetch(`${base}/webhooks/instagram`, { method: 'POST', body, headers: { 'x-hub-signature-256': sig } });
  assert.equal(good.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(webhookBodies.length, 1);
});
