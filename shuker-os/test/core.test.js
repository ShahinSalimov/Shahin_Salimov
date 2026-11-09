import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { executeTool, validateInput, toolsForRole, TOOL_DEFS } from '../src/tools.js';

const owner = { id: '100', name: 'Şükran', role: 'owner' };
const manager = { id: '200', name: 'Menecer', role: 'manager' };
const member = { id: '300', name: 'Üzv', role: 'member' };

test('vaxt: yerli vaxt ↔ UTC çevrilməsi (Bakı +04:00)', () => {
  const { time } = setup();
  assert.equal(time.localToIso('2026-11-12 16:00'), '2026-11-12T12:00:00.000Z');
  assert.equal(time.isoToLocal('2026-11-12T12:00:00.000Z'), '2026-11-12 16:00');
  assert.equal(time.localToIso('12.11.2026 16:00'), null);
  assert.deepEqual(time.dayRange('2026-11-12'), { start: '2026-11-11T20:00:00.000Z', end: '2026-11-12T20:00:00.000Z' });
  assert.equal(time.addDays('2026-12-31', 1), '2027-01-01');
});

test('baza: üst-üstə düşən hadisələr tapılır', () => {
  const { db } = setup();
  db.createEvent({ title: 'A', starts_at: '2026-11-12T08:00:00.000Z', duration_min: 60 });
  db.createEvent({ title: 'B', starts_at: '2026-11-12T10:00:00.000Z', duration_min: 30 });
  assert.deepEqual(db.overlapping('2026-11-12T08:30:00.000Z', 60).map((e) => e.title), ['A']);
  assert.deepEqual(db.overlapping('2026-11-12T09:00:00.000Z', 60).map((e) => e.title), []);
  assert.deepEqual(db.overlapping('2026-11-12T09:30:00.000Z', 60).map((e) => e.title), ['B']);
});

test('tool sxemləri: hamısı obyekt, additionalProperties=false', () => {
  for (const t of TOOL_DEFS) {
    assert.equal(t.input_schema.type, 'object', t.name);
    assert.equal(t.input_schema.additionalProperties, false, t.name);
    for (const r of t.input_schema.required) assert.ok(t.input_schema.properties[r], `${t.name}.${r}`);
  }
});

test('validateInput: tələb olunan sahə, tip, enum, naməlum sahə', () => {
  const schema = TOOL_DEFS.find((t) => t.name === 'update_deal').input_schema;
  assert.match(validateInput(schema, {}), /id/);
  assert.match(validateInput(schema, { id: 1.5 }), /tam ədəd/);
  assert.match(validateInput(schema, { id: 1, stage: 'yox' }), /bunlardan biri/);
  assert.match(validateInput(schema, { id: 1, hack: true }), /naməlum/);
  assert.equal(validateInput(schema, { id: 1, stage: 'cekilis', paid: true }), null);
});

test('rollar: üzv və menecer maliyyə tool-unu görmür, sahib görür', () => {
  const names = (role, fa) => toolsForRole(role, fa).map((t) => t.name);
  assert.ok(names('owner').includes('finance_summary'));
  assert.ok(!names('manager').includes('finance_summary'));
  assert.ok(names('manager', 'manager').includes('finance_summary'));
  assert.ok(!names('member').includes('finance_summary'));
  assert.ok(!names('member').includes('delete_event'));
});

test('create_deal: komanda təklif əlavə edəndə sahibə bildiriş, üzv qiyməti görmür', async () => {
  const { db, time } = setup();
  const offers = [];
  const ctx = (user) => ({ db, time, user, financeAccess: 'none', onOfferCreated: async (d, u) => offers.push([d.brand, u.role]) });
  const out = await executeTool('create_deal', { brand: 'Avto salon', category: 'Avto', price: 6000, deliverables: '2 reels' }, ctx(member));
  assert.equal(out.created.stage, 'sorgu');
  assert.equal(out.created.price, undefined, 'üzv qiyməti görməməlidir');
  assert.equal(db.getDeal(out.created.id).price, 0, 'üzv qiymət yaza bilməz');
  assert.deepEqual(offers, [['Avto salon', 'member']]);

  const own = await executeTool('create_deal', { brand: 'Chaidan', category: 'Restoran', price: 2500, stage: 'muqavile' }, ctx(owner));
  assert.equal(own.created.price, 2500);
  assert.equal(offers.length, 1, 'müqavilə mərhələsində bildiriş getməməlidir');
});

test('update_deal: ödəniş qeydi, paylaşım vaxtı çevrilir, menecer ödəniş dəyişə bilmir', async () => {
  const { db, time } = setup();
  const d = db.createDeal({ brand: 'Harbour', category: 'Əmlak', price: 8500, stage: 'paylasildi' });
  const ctx = (user) => ({ db, time, user, financeAccess: 'none' });
  await executeTool('update_deal', { id: d.id, paid: true }, ctx(manager));
  assert.equal(db.getDeal(d.id).paid, 0);
  const r = await executeTool('update_deal', { id: d.id, paid: true, publish_at: '2026-11-10 20:00' }, ctx(owner));
  assert.equal(r.updated.paid, 1);
  assert.ok(db.getDeal(d.id).paid_at);
  assert.equal(db.getDeal(d.id).publish_at, '2026-11-10T16:00:00.000Z');
  assert.match((await executeTool('update_deal', { id: 999 }, ctx(owner))).error, /tapılmadı/);
});

test('add_event və update_event: üst-üstə düşmə xəbərdarlığı', async () => {
  const { db, time } = setup();
  const ctx = { db, time, user: owner, financeAccess: 'none' };
  const a = await executeTool('add_event', { title: 'Harbour story', start_local: '2026-11-11 12:00' }, ctx);
  assert.deepEqual(a.conflicts, []);
  const b = await executeTool('add_event', { title: 'Telekom görüşü', start_local: '2026-11-11 12:30' }, ctx);
  assert.equal(b.conflicts[0].title, 'Harbour story');
  const moved = await executeTool('update_event', { id: b.created.id, start_local: '2026-11-11 15:00' }, ctx);
  assert.deepEqual(moved.conflicts, []);
  assert.equal(moved.updated.start_local, '2026-11-11 15:00');
  assert.match((await executeTool('add_event', { title: 'X', start_local: 'sabah' }, ctx)).error, /format/);
});

test('finance_summary: ay üzrə gəlir və gözlənilən ödənişlər', async () => {
  const { db, time } = setup();
  const a = db.createDeal({ brand: 'A', category: 'Əmlak', price: 9000, stage: 'hesabat' });
  db.updateDeal(a.id, { paid: 1, paid_at: '2026-11-05T10:00:00.000Z' });
  db.createDeal({ brand: 'B', category: 'Market', price: 7000, stage: 'cekilis' });
  db.createDeal({ brand: 'C', category: 'Avto', price: 5000, stage: 'sorgu' });
  const out = await executeTool('finance_summary', { month: '2026-11' }, { db, time, user: owner, financeAccess: 'none' });
  assert.equal(out.paid.total, 9000);
  assert.equal(out.pending.total, 7000, 'sorğu mərhələsi gözlənilən ödənişə daxil deyil');
  assert.deepEqual(out.byCategory.map((c) => c.category), ['Əmlak']);
  const denied = await executeTool('finance_summary', {}, { db, time, user: member, financeAccess: 'none' });
  assert.match(denied.error, /icazə/);
});

test('create_task komanda çatına göndərilir; evaluate_offer kateqoriya statistikası verir', async () => {
  const { db, time } = setup();
  const sent = [];
  const ctx = { db, time, user: owner, financeAccess: 'none', notifyTeam: async (t) => { sent.push(t); return true; } };
  const t = await executeTool('create_task', { title: 'Müqaviləni göndər', due_local: '2026-11-12 18:00' }, ctx);
  assert.equal(t.sent_to_team_chat, true);
  assert.match(sent[0], /Müqaviləni göndər[\s\S]*2026-11-12 18:00/);

  db.createDeal({ brand: 'Old1', category: 'Avto', price: 6000, stage: 'hesabat' });
  db.createDeal({ brand: 'Old2', category: 'Avto', price: 8000, stage: 'hesabat' });
  const offer = db.createDeal({ brand: 'Yeni Avto', category: 'Avto', price: 5000 });
  const ev = await executeTool('evaluate_offer', { id: offer.id }, ctx);
  assert.equal(ev.category_history.count, 2);
  assert.equal(ev.category_history.avg_price, 7000);
});
