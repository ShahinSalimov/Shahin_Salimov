// Shuker OS — başlanğıc nöqtəsi. İşə salmaq: npm start
import { loadEnvFile, readConfig } from './config.js';
import { openDb } from './db.js';
import { makeTime } from './time.js';
import { makeTelegram, makeFakeTelegram } from './telegram.js';
import { makeVoice } from './voice.js';
import { makeAssistant } from './ai.js';
import { makeInstagram } from './instagram.js';
import { makeScheduler } from './scheduler.js';
import { makeBot } from './bot.js';
import { makeServer } from './server.js';

loadEnvFile();
const config = readConfig();
const logger = console;

// Başlamazdan əvvəl vacib ayarları yoxla
const problems = [];
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) problems.push('ANTHROPIC_API_KEY yoxdur: AI köməkçi işləməyəcək');
if (!config.telegram.token) problems.push('TELEGRAM_BOT_TOKEN yoxdur: bot söndürülüb, yalnız panel işləyir');
if (!config.telegram.ownerId) problems.push('OWNER_TELEGRAM_ID yoxdur: brifinq və bildirişlər heç kimə getməyəcək');
if (!config.panel.ownerPassword) problems.push('PANEL_OWNER_PASSWORD yoxdur: panelə giriş mümkün deyil');
if (!config.meta.igUserId || !config.meta.accessToken) problems.push('Instagram (IG_USER_ID, META_ACCESS_TOKEN) qoşulmayıb: lead botu və statistika söndürülüb');
if (!config.voice.openaiKey) problems.push('OPENAI_API_KEY yoxdur: səsli mesajlar və səsli brifinq söndürülüb');
for (const p of problems) logger.warn('XƏBƏRDARLIQ:', p);

const db = openDb(config.dbPath);
const time = makeTime(config);
const tg = config.telegram.token ? makeTelegram(config.telegram.token) : makeFakeTelegram();
const voice = makeVoice(config.voice);

const safeSend = async (chatId, text, extra) => {
  if (!chatId) return false;
  try { await tg.sendMessage(chatId, text, extra); return true; } catch (e) { logger.error('Telegram göndərmə xətası:', e.message); return false; }
};
const notify = {
  owner: (text, extra) => safeSend(config.telegram.ownerId, text, extra),
  team: (text, extra) => safeSend(config.telegram.teamChatId, text, extra),
  chat: (chatId, text, extra) => safeSend(chatId, text, extra),
  audio: async (chatId, buffer, caption) => { if (chatId) await tg.sendAudio(chatId, buffer, { caption }); },
};

let bot; // assistant və bot bir-birinə istinad edir
const onOfferCreated = (deal, user) => bot.onOfferCreated(deal, user);
const assistant = makeAssistant({ db, time, config, notifyTeam: notify.team, onOfferCreated, logger });
const instagram = makeInstagram({ db, config, notify, logger });
const scheduler = makeScheduler({ db, time, config, assistant, notify, voice, instagram, logger });
bot = makeBot({ db, time, config, tg, assistant, voice, scheduler, notify, logger });
const server = makeServer({ db, time, config, instagram, notifyTeam: notify.team, onOfferCreated, logger });

server.listen(config.port, () => logger.log(`${config.appName} işləyir: http://localhost:${config.port}/panel`));
// İlk quraşdırma gündüz olsa, brifinq dərhal yox, növbəti səhər getsin
if (!db.getSetting('last_brief_date') && time.parts().time >= config.schedule.briefTime) db.setSetting('last_brief_date', time.parts().date);
scheduler.start();
if (config.telegram.token) {
  tg.setCommands([
    { command: 'bugun', description: 'Bugünkü plan' },
    { command: 'teklifler', description: 'Cavab gözləyən təkliflər' },
    { command: 'brif', description: 'Səhər brifinqi indi' },
    { command: 'yeni', description: 'Söhbəti sıfırla' },
    { command: 'komek', description: 'Kömək' },
  ]).catch((e) => logger.error('Əmrlər qeyd olunmadı:', e.message));
  bot.start();
}

const shutdown = () => { logger.log('Dayandırılır...'); bot.stop(); scheduler.stop(); server.close(); db.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
