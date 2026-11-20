import { config } from "./config.js";
import { refreshStatus } from "./access.js";
import { ensureToday } from "./ideas.js";

// Telegram is optional: owner creates a bot, client sends /start <code> to it.
export async function sendTelegram(chatId, text) {
  if (!config.telegramBotToken || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

export function formatSlotMessage(ideas, link) {
  const head = `<b>Yeni Reels ideyaları — ${esc(ideas[0]?.slotTime || "")}</b>\n`;
  const body = ideas.map((i, n) => `\n${n + 1}. <b>${esc(i.title)}</b>\nHook: ${esc(i.hook?.text || "")}`).join("\n");
  return head + body + (link ? `\n\nƏtraflı: ${link}` : "");
}

/** One tick: generate due slots for every active account and notify. */
export async function tick(store, now = Date.now()) {
  for (const acc of Object.values(store.data.accounts)) {
    if (refreshStatus(acc, now) !== "active") continue;
    try {
      const { fresh } = await ensureToday(store, acc, now);
      if (fresh.length && acc.telegramChatId) await sendTelegram(acc.telegramChatId, formatSlotMessage(fresh, config.publicUrl));
    } catch (e) {
      store.log("scheduler.error", { accountId: acc.id, message: String(e.message).slice(0, 200) });
    }
  }
  store.save();
}

export function startScheduler(store) {
  if (config.disableScheduler) return null;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(store);
    } finally {
      running = false;
    }
  };
  const t = setInterval(run, 60_000);
  t.unref();
  setTimeout(run, 3_000).unref();
  return t;
}

// Telegram long-polling for "/start <code>" linking (only if a bot token is configured).
export function startTelegramLinker(store) {
  if (!config.telegramBotToken) return;
  let offset = 0;
  const poll = async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getUpdates?timeout=25&offset=${offset}`);
      const json = await res.json();
      for (const u of json.result || []) {
        offset = u.update_id + 1;
        const m = u.message;
        const code = m?.text?.match(/^\/start\s+([A-Za-z0-9_-]{6,40})/)?.[1];
        if (!code) continue;
        const acc = Object.values(store.data.accounts).find((a) => a.telegramLinkCode === code);
        if (acc) {
          acc.telegramChatId = m.chat.id;
          acc.telegramLinkCode = null;
          store.save();
          await sendTelegram(m.chat.id, "Soltanov AI qoşuldu. İdeyalar 09:00, 13:00 və 19:00-da buraya gələcək.");
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
    setTimeout(poll, 500).unref();
  };
  poll();
}
