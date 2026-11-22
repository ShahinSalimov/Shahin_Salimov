import type { Config } from "./config.ts";
import type { FetchLike } from "./http.ts";

export type Notifier = (text: string) => Promise<void>;

export function telegramNotifier(cfg: Config, fetchImpl: FetchLike = fetch): Notifier {
  const { botToken, chatId } = cfg.telegram;
  if (!botToken || !chatId) return async () => {};
  return async (text: string) => {
    try {
      await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      });
    } catch (err) {
      console.error("telegram notify failed", err);
    }
  };
}
