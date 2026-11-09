// Avtomatik işlər: səhər brifinqi, hadisə xatırlatmaları, ödəniş və hesabat xatırlatmaları.
import { STAGE_NAMES } from './db.js';

export function makeScheduler({ db, time, config, assistant, notify, voice, instagram, logger = console }) {
  const ownerId = config.telegram.ownerId;

  function briefData() {
    const today = time.parts().date;
    const { start, end } = time.dayRange(today);
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const events = db.listEvents(start, end).map((e) => ({ time: time.isoToLocal(e.starts_at).slice(11), title: e.title, location: e.location }));
    const overdue = db.listDeals({ unpaidOnly: true }).filter((d) => d.due_date && d.due_date < today).map((d) => ({ brand: d.brand, price: d.price, due_date: d.due_date }));
    const offers = db.listDeals({ stage: 'sorgu' }).map((d) => ({ brand: d.brand, category: d.category, deliverables: d.deliverables, price: d.price }));
    const leads = db.leadsSince(yesterday);
    const tasks = db.listTasks().length;
    return { date: today, weekday: time.parts().weekday, events, overdue_payments: overdue, new_offers: offers, leads_last_24h: { comments: leads.comments || 0, phones: leads.phones || 0 }, open_tasks: tasks };
  }

  async function sendBrief() {
    const data = briefData();
    let text;
    try {
      text = await assistant.write(
        `${config.ownerName} üçün səhər brifinqi yaz. Ona birbaşa müraciət et ("Sabahın xeyir, ${config.ownerName}."). `
        + 'Danışıq dilində, 40 saniyədə oxunacaq uzunluqda (6-9 cümlə). Sıra: bugünkü plan, gecikən ödənişlər, yeni təkliflər, lead nəticələri, açıq tapşırıqlar. '
        + 'Boş olan bölmələri qısaca qeyd et və ya ötür. Yalnız verilən məlumatdan istifadə et, rəqəm uydurma. Sonda bir cümləlik tövsiyə ver.',
        data,
      );
    } catch (e) {
      logger.error('Brifinq AI xətası:', e);
      text = fallbackBrief(data);
    }
    if (config.voice.briefAsVoice && voice?.enabled) {
      try {
        const audio = await voice.speak(text);
        await notify.audio(ownerId, audio, 'Səhər brifinqi');
      } catch (e) { logger.error('Səsli brifinq xətası:', e); }
    }
    await notify.owner(text);
    return text;
  }

  // AI işləməsə belə brifinq getsin
  function fallbackBrief(d) {
    const lines = [`Sabahın xeyir, ${config.ownerName}. ${d.weekday}, ${d.date}.`];
    lines.push(d.events.length ? `Bu gün: ${d.events.map((e) => `${e.time} ${e.title}`).join('; ')}.` : 'Bu gün təqvimdə iş yoxdur.');
    if (d.overdue_payments.length) lines.push(`Gecikən ödənişlər: ${d.overdue_payments.map((p) => p.brand).join(', ')}.`);
    if (d.new_offers.length) lines.push(`Yeni təkliflər: ${d.new_offers.map((o) => o.brand).join(', ')}.`);
    lines.push(`Son 24 saatda lead: ${d.leads_last_24h.comments} şərh, ${d.leads_last_24h.phones} nömrə.`);
    return lines.join('\n');
  }

  async function checkBrief(now = time.parts()) {
    if (now.time < config.schedule.briefTime) return false;
    if (db.getSetting('last_brief_date') === now.date) return false;
    db.setSetting('last_brief_date', now.date);
    await sendBrief();
    return true;
  }

  async function checkEventReminders(nowMs = Date.now()) {
    const from = new Date(nowMs).toISOString();
    const to = new Date(nowMs + config.schedule.eventReminderMinutes * 60000).toISOString();
    const due = db.listEvents(from, to).filter((e) => !e.reminded);
    for (const e of due) {
      db.updateEvent(e.id, { reminded: 1 });
      const msg = `Xatırlatma: ${time.isoToLocal(e.starts_at).slice(11)} · ${e.title}${e.location ? ` · ${e.location}` : ''}`;
      await notify.owner(msg);
      await notify.team(msg);
    }
    return due.length;
  }

  async function checkPayments(today = time.parts().date) {
    const overdue = db.listDeals({ unpaidOnly: true }).filter((d) => d.due_date && d.due_date < today && d.payment_reminded_on !== today);
    for (const d of overdue) {
      db.updateDeal(d.id, { payment_reminded_on: today });
      await notify.owner(`Ödəniş gecikir: ${d.brand} · ${d.price} ₼ · son tarix ${d.due_date}. Komandaya xatırlatma tapşırığı verilsin?`, {
        reply_markup: { inline_keyboard: [[{ text: 'Xatırlatma tapşırığı ver', callback_data: `remind:${d.id}` }, { text: 'Ödənilib', callback_data: `paid:${d.id}` }]] },
      });
    }
    return overdue.length;
  }

  async function checkReports(nowMs = Date.now()) {
    const limit = new Date(nowMs - config.schedule.reportAfterHours * 3600 * 1000).toISOString();
    const due = db.listDeals({ stage: 'paylasildi' }).filter((d) => d.publish_at && d.publish_at <= limit && !d.report_sent);
    for (const d of due) {
      db.updateDeal(d.id, { report_sent: 1 });
      let stats = '';
      if (d.ig_media_id && instagram?.configured) {
        try {
          const s = await instagram.mediaInsights(d.ig_media_id);
          stats = Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(', ');
        } catch (e) { logger.error('Insights xətası:', e.message); }
      }
      const text = `Hesabat vaxtıdır: ${d.brand} (${d.deliverables || 'reklam'}), paylaşımdan ${config.schedule.reportAfterHours} saat keçib.`
        + (stats ? `\nNəticələr: ${stats}` : '\nStatistikanı Instagram-dan əlavə edin.')
        + `\nHesabatı brendə göndərdikdən sonra mərhələni "${STAGE_NAMES.hesabat}" edin.`;
      await notify.team(text);
      await notify.owner(text);
    }
    return due.length;
  }

  async function refreshMediaKit() {
    if (!instagram?.configured) return;
    const today = time.parts().date;
    if (db.getSetting('mediakit_refreshed') === today) return;
    try {
      const p = await instagram.profile();
      if (p.followers_count) db.setSetting('mk_followers', p.followers_count);
      if (p.media_count) db.setSetting('mk_posts', p.media_count);
      db.setSetting('mediakit_refreshed', today);
    } catch (e) { logger.error('Media Kit yenilənmədi:', e.message); }
  }

  async function tick() {
    for (const job of [checkBrief, checkEventReminders, checkPayments, checkReports, refreshMediaKit]) {
      try { await job(); } catch (e) { logger.error(`Planlayıcı xətası (${job.name}):`, e); }
    }
  }

  let timer = null;
  return {
    sendBrief, briefData, checkBrief, checkEventReminders, checkPayments, checkReports, tick,
    start(intervalMs = 30000) { timer = setInterval(tick, intervalMs); tick(); },
    stop() { if (timer) clearInterval(timer); },
  };
}
