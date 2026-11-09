import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, fakeNotify, fakeClaude, toolUse, text, silent } from './helpers.js';
import { makeAssistant, systemPrompt } from '../src/ai.js';
import { makeInstagram, extractPhone, findCampaign, verifySignature } from '../src/instagram.js';
import { makeScheduler } from '../src/scheduler.js';
import { makeBot } from '../src/bot.js';
import { makeFakeTelegram } from '../src/telegram.js';

const owner = { id: '100', name: 'Şükran', role: 'owner' };

// ---------------- AI köməkçi ----------------
test('AI: səsli əmr → reklam yenilənir, təqvimə yazılır, cavab qayıdır', async () => {
  const { db, time, config } = setup();
  const deal = db.createDeal({ brand: 'Chaidan Baku', category: 'Restoran', stage: 'muqavile' });
  const claude = fakeClaude([
    toolUse('t1', 'list_deals', { search: 'Chaidan' }),
    { stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: 't2', name: 'update_deal', input: { id: deal.id, stage: 'cekilis', price: 2500, deliverables: '2 story + 1 reels' } },
      { type: 'tool_use', id: 't3', name: 'add_event', input: { title: 'Chaidan · çəkiliş', start_local: '2026-11-11 16:00', deal_id: deal.id } },
    ] },
    text('Oldu. Chaidan çəkilişi çərşənbə 16:00-a qoyuldu, reklam "Çəkiliş" mərhələsindədir.'),
  ]);
  const ai = makeAssistant({ db, time, config, client: claude, logger: silent });
  const reply = await ai.handle('100', owner, 'Chaidan-la çərşənbə saat 4-də çəkiliş qoy, 2 story bir reels, 2500');

  assert.match(reply, /Chaidan/);
  assert.equal(db.getDeal(deal.id).stage, 'cekilis');
  assert.equal(db.getDeal(deal.id).price, 2500);
  const evs = db.listEvents('2026-11-11T00:00:00.000Z', '2026-11-12T00:00:00.000Z');
  assert.equal(evs[0].title, 'Chaidan · çəkiliş');
  assert.equal(evs[0].deal_id, deal.id);

  // Sorğu formatı: model, fallback, effort, keşlənən sistem promptu, tool nəticələri bir mesajda
  const req = claude.requests[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.output_config, { effort: 'medium' });
  assert.equal(req.system[0].cache_control.type, 'ephemeral');
  assert.ok(req.tools.some((t) => t.name === 'finance_summary'));
  const third = claude.requests[2].messages;
  const results = third[third.length - 1].content;
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.type === 'tool_result' && !r.is_error));

  // Tarixçəyə yalnız mətn yazılır
  const h = db.getHistory('100', 10);
  assert.deepEqual(h.map((x) => x.role), ['user', 'assistant']);
});

test('AI: tool xətası Claude-a is_error ilə qaytarılır, imtina (refusal) idarə olunur', async () => {
  const { db, time, config } = setup();
  const claude = fakeClaude([toolUse('t1', 'update_deal', { id: 42 }), text('Belə reklam tapılmadı.')]);
  const ai = makeAssistant({ db, time, config, client: claude, logger: silent });
  assert.equal(await ai.handle('100', owner, 'x'), 'Belə reklam tapılmadı.');
  const res = claude.requests[1].messages.at(-1).content[0];
  assert.equal(res.is_error, true);
  assert.match(res.content, /tapılmadı/);

  const c2 = fakeClaude([{ stop_reason: 'refusal', content: [] }]);
  const ai2 = makeAssistant({ db, time, config, client: c2, logger: silent });
  assert.match(await ai2.handle('100', owner, 'y'), /icra edə bilmədim/);
});

test('AI: fallback dəstəklənməyən modeldə adi messages.create istifadə olunur; üzv maliyyə tool-unu almır', async () => {
  const { db, time, config } = setup({ ANTHROPIC_MODEL: 'claude-haiku-5-5' });
  let usedBeta = false;
  const claude = fakeClaude([text('ok')]);
  claude.beta.messages.create = async () => { usedBeta = true; return text('beta'); };
  const ai = makeAssistant({ db, time, config, client: claude, logger: silent });
  await ai.handle('300', { id: '300', name: 'Üzv', role: 'member' }, 'salam');
  assert.equal(usedBeta, false);
  assert.ok(!claude.requests[0].tools.some((t) => t.name === 'finance_summary'));
  assert.equal(claude.requests[0].betas, undefined);
  assert.match(systemPrompt('Şükran'), /Şükran/);
});

// ---------------- Instagram ----------------
test('Instagram: telefon nömrəsi tanınır', () => {
  assert.equal(extractPhone('Əli 050 123 45 67'), '+994501234567');
  assert.equal(extractPhone('+994 (55) 123-45-67'), '+994551234567');
  assert.equal(extractPhone('0701234567'), '+994701234567');
  assert.equal(extractPhone('maraqlıdır, qiymət?'), null);
  assert.equal(extractPhone('2025-ci il'), null);
});

test('Instagram: açar söz tapılır, imza yoxlanır', () => {
  const camps = [{ id: 1, keyword: 'RIVIERA' }, { id: 2, keyword: 'İPHONE' }];
  assert.equal(findCampaign(camps, 'riviera!!').id, 1);
  assert.equal(findCampaign(camps, 'iphone istəyirəm').id, 2);
  assert.equal(findCampaign(camps, 'RİVİERA').id, 1);
  assert.equal(findCampaign(camps, 'rivieraresidence'), null);
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 's').update(body).digest('hex');
  assert.equal(verifySignature(body, sig, 's'), true);
  assert.equal(verifySignature(body, sig, 'other'), false);
  assert.equal(verifySignature(body, undefined, 's'), false);
});

test('Instagram: şərh → DM → nömrə → developerə ötürülür', async () => {
  const { db, config } = setup();
  const notify = fakeNotify();
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url: String(url), body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({ message_id: 'm' }) }; };
  const ig = makeInstagram({ db, config, notify, fetchImpl, logger: silent });
  db.createCampaign({ keyword: 'riviera', dm_text: 'Broşür: https://example.com/riviera', forward_chat_id: '-555' });

  const comment = (id, from, t) => ({ entry: [{ changes: [{ field: 'comments', value: { id, text: t, from: { id: from, username: 'ali' } } }] }] });
  await ig.handleWebhook(comment('c1', 'U1', 'RIVIERA'));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /graph\.facebook\.com\/v21\.0\/IG1\/messages/);
  assert.deepEqual(calls[0].body.recipient, { comment_id: 'c1' });
  assert.match(calls[0].body.message.text, /Broşür[\s\S]*telefon/);

  await ig.handleWebhook(comment('c2', 'U1', 'riviera'));
  assert.equal(calls.length, 1, 'eyni adama ikinci DM getməməlidir');
  await ig.handleWebhook(comment('c3', 'IG1', 'RIVIERA'));
  assert.equal(calls.length, 1, 'öz şərhimizə cavab verilmir');

  const dm = (from, t) => ({ entry: [{ messaging: [{ sender: { id: from }, message: { text: t } }] }] });
  await ig.handleWebhook(dm('U1', 'bilmirəm'));
  assert.equal(calls.length, 2, 'nömrə yoxdursa bir dəfə yenidən soruşulur');
  await ig.handleWebhook(dm('U1', 'hələ fikirləşirəm'));
  assert.equal(calls.length, 2, 'ikinci dəfə soruşulmur');

  await ig.handleWebhook(dm('U1', 'Əli Məmmədov 050 123 45 67'));
  const lead = db.listLeads()[0];
  assert.equal(lead.phone, '+994501234567');
  assert.equal(lead.name, 'Əli Məmmədov');
  assert.equal(lead.status, 'forwarded');
  const fwd = notify.log.find((l) => l.to === '-555');
  assert.match(fwd.text, /Əli Məmmədov[\s\S]*\+994501234567[\s\S]*@ali/);
  assert.equal(db.listCampaigns()[0].phones, 1);
});

// ---------------- Planlayıcı ----------------
function schedulerSetup(env) {
  const s = setup(env);
  const notify = fakeNotify();
  const written = [];
  const assistant = { write: async (instr, data) => { written.push(data); return `Sabahın xeyir. Bu gün ${data.events.length} iş var.`; } };
  const sch = makeScheduler({ ...s, assistant, notify, voice: { enabled: false }, instagram: { configured: false }, logger: silent });
  return { ...s, notify, written, sch };
}

test('Planlayıcı: brifinq gündə bir dəfə, vaxtı çatanda göndərilir', async () => {
  const { sch, notify, db } = schedulerSetup();
  assert.equal(await sch.checkBrief({ date: '2026-11-09', time: '08:59', weekday: 'Bazar ertəsi' }), false);
  assert.equal(await sch.checkBrief({ date: '2026-11-09', time: '09:00', weekday: 'Bazar ertəsi' }), true);
  assert.equal(await sch.checkBrief({ date: '2026-11-09', time: '12:00', weekday: 'Bazar ertəsi' }), false);
  assert.equal(notify.log.filter((l) => l.to === 'owner').length, 1);
  assert.equal(db.getSetting('last_brief_date'), '2026-11-09');
});

test('Planlayıcı: AI işləməsə ehtiyat brifinq gedir', async () => {
  const { db, time, config } = setup();
  const notify = fakeNotify();
  const sch = makeScheduler({ db, time, config, notify, assistant: { write: async () => { throw new Error('x'); } }, voice: { enabled: false }, logger: silent });
  const t = await sch.sendBrief();
  assert.match(t, /Sabahın xeyir, Şükran/);
  assert.equal(notify.log[0].text, t);
});

test('Planlayıcı: hadisə xatırlatması bir dəfə, gecikən ödəniş düymələrlə, 48 saatdan sonra hesabat', async () => {
  const { sch, notify, db } = schedulerSetup();
  const now = Date.parse('2026-11-09T10:00:00.000Z');
  db.createEvent({ title: 'Araz çəkilişi', starts_at: '2026-11-09T10:30:00.000Z' });
  db.createEvent({ title: 'Uzaq', starts_at: '2026-11-09T15:00:00.000Z' });
  assert.equal(await sch.checkEventReminders(now), 1);
  assert.equal(await sch.checkEventReminders(now), 0);
  assert.ok(notify.log.some((l) => l.to === 'team' && /Araz çəkilişi/.test(l.text)));

  db.createDeal({ brand: 'Harbour', category: 'Əmlak', price: 8500, stage: 'paylasildi', due_date: '2026-11-01' });
  assert.equal(await sch.checkPayments('2026-11-09'), 1);
  assert.equal(await sch.checkPayments('2026-11-09'), 0, 'eyni gün təkrar xatırlatma yoxdur');
  const pay = notify.log.find((l) => /Ödəniş gecikir/.test(l.text));
  assert.deepEqual(pay.extra.reply_markup.inline_keyboard[0].map((b) => b.callback_data.split(':')[0]), ['remind', 'paid']);

  db.createDeal({ brand: 'Hünkar', category: 'Restoran', stage: 'paylasildi', publish_at: '2026-11-07T09:00:00.000Z' });
  db.createDeal({ brand: 'Təzə', category: 'Restoran', stage: 'paylasildi', publish_at: '2026-11-08T20:00:00.000Z' });
  assert.equal(await sch.checkReports(now), 1);
  assert.ok(notify.log.some((l) => /Hesabat vaxtıdır: Hünkar/.test(l.text)));
});

// ---------------- Telegram bot ----------------
function botSetup() {
  const s = setup();
  const tg = makeFakeTelegram();
  const notify = fakeNotify();
  const handled = [];
  const assistant = { handle: async (chatId, user, t) => { handled.push({ chatId, user, t }); return `cavab: ${t}`; } };
  const voice = { enabled: true, transcribe: async () => 'Bu gün nə işim var?' };
  const bot = makeBot({ ...s, tg, assistant, voice, scheduler: { sendBrief: async () => {} }, notify, logger: silent });
  const msg = (from, t, extra = {}) => ({ message: { chat: { id: from, type: 'private' }, from: { id: from, first_name: 'X' }, text: t, ...extra } });
  return { ...s, tg, notify, handled, bot, msg };
}

test('Bot: tanınmayan istifadəçi ID-sini alır, sahibin mesajı AI-ya gedir, səs mətnə çevrilir', async () => {
  const { bot, tg, handled, msg } = botSetup();
  await bot.handleUpdate(msg(555, 'salam'));
  assert.match(tg.sent.at(-1).text, /icazəniz yoxdur[\s\S]*555/);
  assert.equal(handled.length, 0);

  await bot.handleUpdate(msg(100, 'Bu ay nə qədər qazandım?'));
  assert.equal(handled[0].user.role, 'owner');
  assert.equal(tg.sent.at(-1).text, 'cavab: Bu ay nə qədər qazandım?');

  await bot.handleUpdate(msg(300, '', { text: undefined, voice: { file_id: 'f1' } }));
  assert.ok(tg.sent.some((s) => /Eşitdim: «Bu gün nə işim var\?»/.test(s.text)));
  assert.equal(handled.at(-1).user.role, 'member');

  await bot.handleUpdate({ message: { chat: { id: -900, type: 'group' }, from: { id: 100 }, text: '/id' } });
  assert.match(tg.sent.at(-1).text, /Chat ID: -900/);
});

test('Bot: təklif kartı → Qəbul et düyməsi → müqavilə mərhələsi və komandaya tapşırıq; üzvə icazə yoxdur', async () => {
  const { bot, db, notify, tg } = botSetup();
  const deal = db.createDeal({ brand: 'Avto salon', category: 'Avto', price: 6000 });
  await bot.onOfferCreated(deal, { role: 'member' });
  const card = notify.log.find((l) => l.to === 'owner');
  assert.match(card.text, /Yeni reklam təklifi[\s\S]*Avto salon/);

  await bot.handleUpdate({ callback_query: { id: 'q0', from: { id: 300 }, data: `accept:${deal.id}` } });
  assert.equal(db.getDeal(deal.id).stage, 'sorgu', 'üzv qəbul edə bilməz');

  await bot.handleUpdate({ callback_query: { id: 'q1', from: { id: 100 }, data: `accept:${deal.id}`, message: { chat: { id: 100 }, message_id: 1 } } });
  assert.equal(db.getDeal(deal.id).stage, 'muqavile');
  assert.ok(notify.log.some((l) => l.to === 'team' && /Avto salon təklifi qəbul edildi/.test(l.text)));
  assert.match(tg.sent.at(-1).text, /qəbul edildi/);

  await bot.handleUpdate({ callback_query: { id: 'q2', from: { id: 100 }, data: `paid:${deal.id}`, message: { chat: { id: 100 }, message_id: 2 } } });
  assert.equal(db.getDeal(deal.id).paid, 1);
});
