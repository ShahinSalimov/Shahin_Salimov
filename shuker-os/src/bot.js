// Telegram bot məntiqi: əmrlər, mətn və səsli mesajlar, düymələr.
import { STAGE_NAMES } from './db.js';

const helpText = (appName) => `${appName} köməkçisi. Mənə adi dildə yazın və ya səsli mesaj göndərin. Nümunələr:
• Chaidan-la çərşənbə saat 4-də çəkiliş qoy, 2 story bir reels, 2500
• Bu gün nə işim var?
• Bu ay nə qədər qazandım?
• Harbour Residence ödədi
• Market üçün 30 saniyəlik sketç ssenarisi yaz
• RIVIERA kampaniyasının nəticəsi necədir?

Əmrlər:
/bugun — bugünkü plan
/teklifler — cavab gözləyən təkliflər
/brif — səhər brifinqi indi
/yeni — söhbəti sıfırla
/id — Telegram ID-niz`;

export function makeBot({ db, time, config, tg, assistant, voice, scheduler, notify, logger = console }) {
  const { ownerId, managerIds, memberIds } = config.telegram;

  function roleOf(userId) {
    const id = String(userId);
    if (ownerId && id === String(ownerId)) return 'owner';
    if (managerIds.includes(id)) return 'manager';
    if (memberIds.includes(id)) return 'member';
    return null;
  }

  function offerCard(deal) {
    const stats = db.categoryStats(deal.category);
    const lines = [
      `Yeni reklam təklifi #${deal.id}`,
      `Brend: ${deal.brand} (${deal.category})`,
      deal.deliverables ? `Format: ${deal.deliverables}` : null,
      deal.price ? `Təklif olunan: ${deal.price} ₼` : null,
      deal.notes ? `Qeyd: ${deal.notes}` : null,
      stats.count
        ? `Bu sahədə əvvəlki ${stats.count} reklamın ortası: ${Math.round(stats.avg_price)} ₼ (min ${stats.min_price}, max ${stats.max_price})`
        : 'Bu sahədə əvvəlki reklam məlumatı yoxdur.',
    ];
    if (stats.count && deal.price && deal.price < stats.avg_price * 0.85) lines.push('Diqqət: təklif ortalamadan xeyli aşağıdır.');
    return lines.filter(Boolean).join('\n');
  }

  const offerButtons = (id) => ({ inline_keyboard: [[{ text: 'Qəbul et', callback_data: `accept:${id}` }, { text: 'İmtina', callback_data: `reject:${id}` }]] });

  // Komanda təklif əlavə edəndə Şükrana kart göndərilir
  async function onOfferCreated(deal, user) {
    if (user?.role === 'owner') return;
    await notify.owner(offerCard(deal), { reply_markup: offerButtons(deal.id) });
  }

  async function todayText() {
    const p = time.parts();
    const { start, end } = time.dayRange(p.date);
    const evs = db.listEvents(start, end);
    if (!evs.length) return `${p.weekday}, ${p.date}: təqvimdə iş yoxdur.`;
    return `${p.weekday}, ${p.date}:\n` + evs.map((e) => `${time.isoToLocal(e.starts_at).slice(11)} · ${e.title}${e.location ? ` · ${e.location}` : ''}`).join('\n');
  }

  async function handleCommand(chatId, user, cmd) {
    switch (cmd) {
      case '/start': return tg.sendMessage(chatId, `Salam, ${user.name}. ${helpText(config.appName)}`);
      case '/komek': case '/help': return tg.sendMessage(chatId, helpText(config.appName));
      case '/id': return tg.sendMessage(chatId, `Telegram ID: ${user.id}`);
      case '/bugun': return tg.sendMessage(chatId, await todayText());
      case '/yeni': db.clearHistory(chatId); return tg.sendMessage(chatId, 'Söhbət sıfırlandı.');
      case '/brif':
        if (user.role !== 'owner') return tg.sendMessage(chatId, 'Brifinq yalnız sahib üçündür.');
        return scheduler.sendBrief();
      case '/teklifler': {
        if (user.role === 'member') return tg.sendMessage(chatId, 'Bu bölmə rəhbərlik üçündür.');
        const offers = db.listDeals({ stage: 'sorgu' });
        if (!offers.length) return tg.sendMessage(chatId, 'Cavab gözləyən təklif yoxdur.');
        for (const d of offers.slice(0, 10)) await tg.sendMessage(chatId, offerCard(d), { reply_markup: offerButtons(d.id) });
        return null;
      }
      default: return null;
    }
  }

  async function handleCallback(cq) {
    const user = { id: String(cq.from.id), name: cq.from.first_name || 'İstifadəçi', role: roleOf(cq.from.id) };
    const [action, idStr] = String(cq.data || '').split(':');
    const deal = db.getDeal(Number(idStr));
    const done = async (text) => {
      await tg.answerCallback(cq.id, text).catch(() => {});
      if (cq.message) await tg.editMarkup(cq.message.chat.id, cq.message.message_id).catch(() => {});
      if (cq.message) await tg.sendMessage(cq.message.chat.id, text);
    };
    if (!user.role || user.role === 'member') return tg.answerCallback(cq.id, 'İcazəniz yoxdur');
    if (!deal) return tg.answerCallback(cq.id, 'Reklam tapılmadı');

    if (action === 'accept') {
      db.updateDeal(deal.id, { stage: 'muqavile' });
      const task = db.createTask({ title: `${deal.brand} təklifi qəbul edildi. Müqaviləni göndərin və çəkiliş tarixini razılaşdırın.`, deal_id: deal.id, created_by: user.name });
      await notify.team(`Tapşırıq #${task.id}: ${task.title}`);
      return done(`${deal.brand}: qəbul edildi, komandaya tapşırıq getdi.`);
    }
    if (action === 'reject') {
      db.updateDeal(deal.id, { stage: 'imtina' });
      const task = db.createTask({ title: `${deal.brand} təklifinə nəzakətli imtina cavabı göndərin.`, deal_id: deal.id, created_by: user.name });
      await notify.team(`Tapşırıq #${task.id}: ${task.title}`);
      return done(`${deal.brand}: imtina edildi, komanda brendə cavab yazacaq.`);
    }
    if (action === 'remind') {
      const text = `Salam! ${deal.deliverables || 'Reklam'} üzrə ${deal.price} ₼ məbləğində ödənişin son tarixi ${deal.due_date} idi. Ödənişin vəziyyəti barədə məlumat verə bilərsiniz? Təşəkkürlər.`;
      const task = db.createTask({ title: `${deal.brand} brendinə ödəniş xatırlatması göndərin. Hazır mətn:\n${text}`, deal_id: deal.id, created_by: user.name });
      await notify.team(`Tapşırıq #${task.id}: ${task.title}`);
      return done(`${deal.brand}: xatırlatma tapşırığı komandaya göndərildi.`);
    }
    if (action === 'paid') {
      if (user.role !== 'owner') return tg.answerCallback(cq.id, 'Yalnız sahib');
      db.updateDeal(deal.id, { paid: 1 });
      return done(`${deal.brand}: ödənilib kimi qeyd edildi.`);
    }
    return tg.answerCallback(cq.id, '');
  }

  async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const role = roleOf(msg.from?.id);
    const user = { id: String(msg.from?.id), name: msg.from?.first_name || 'İstifadəçi', role };
    const text = (msg.text || '').trim();

    // Qruplarda yalnız /id işləyir (AI şəxsi yazışmada işləyir)
    if (msg.chat.type !== 'private') {
      if (/^\/id\b/.test(text)) return tg.sendMessage(chatId, `Chat ID: ${chatId}`);
      return null;
    }
    if (!role) return tg.sendMessage(chatId, `Bu sistemə giriş icazəniz yoxdur.\nTelegram ID: ${user.id}\nBunu administratora göndərin.`);

    if (text.startsWith('/')) return handleCommand(chatId, user, text.split(/[\s@]/)[0].toLowerCase());

    let input = text;
    const media = msg.voice || msg.audio;
    if (media) {
      if (!voice.enabled) return tg.sendMessage(chatId, 'Səsli mesajlar hələ qoşulmayıb (OPENAI_API_KEY). Mətnlə yazın.');
      try {
        const file = await tg.downloadFile(media.file_id);
        input = await voice.transcribe(file.buffer, file.path.split('/').pop());
      } catch (e) {
        logger.error('Səs xətası:', e);
        return tg.sendMessage(chatId, 'Səsli mesajı anlaya bilmədim, yenidən cəhd edin və ya yazın.');
      }
      if (!input) return tg.sendMessage(chatId, 'Səsli mesaj boş görünür.');
      await tg.sendMessage(chatId, `Eşitdim: «${input}»`);
    }
    if (!input) return null;

    await tg.call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const reply = await assistant.handle(chatId, user, input);
    return tg.sendMessage(chatId, reply);
  }

  async function handleUpdate(update) {
    try {
      if (update.callback_query) return await handleCallback(update.callback_query);
      if (update.message) return await handleMessage(update.message);
    } catch (e) {
      logger.error('Bot xətası:', e);
    }
    return null;
  }

  let running = false;
  let badTokenLogged = false;
  async function poll() {
    running = true;
    let offset = Number(db.getSetting('tg_offset', 0));
    while (running) {
      try {
        const updates = await tg.getUpdates(offset, 30);
        for (const u of updates) {
          offset = u.update_id + 1;
          db.setSetting('tg_offset', offset);
          await handleUpdate(u);
        }
      } catch (e) {
        // Səhv token: Telegram "Not Found" və ya "Unauthorized" qaytarır
        if (/Not Found|Unauthorized/i.test(e.message)) {
          if (!badTokenLogged) {
            logger.error('TELEGRAM_BOT_TOKEN səhvdir. .env faylında tokeni yoxlayın: format 123456789:ABC..., boşluq, dırnaq və nümunə mətn olmamalıdır. Düzəltdikdən sonra sistemi yenidən başladın.');
            badTokenLogged = true;
          }
          await new Promise((r) => setTimeout(r, 60000));
          continue;
        }
        logger.error('Telegram bağlantı xətası:', e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  return {
    roleOf, offerCard, onOfferCreated, handleUpdate, handleMessage, handleCallback,
    start: () => { poll(); },
    stop: () => { running = false; },
    STAGE_NAMES,
  };
}
