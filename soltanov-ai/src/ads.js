import crypto from "node:crypto";
import { config } from "./config.js";
import { SYSTEM_ADS, AD_SCHEMA, adUserPrompt } from "./ai/prompts.js";
import { offlineAdScripts } from "./ai/fallback.js";
import { aiEnabled, generateJSON } from "./ai/claude.js";

export async function createAdScripts(store, acc, { transcript, extra }) {
  const text = String(transcript || "").trim().slice(0, 6000);
  if (text.length < 10) {
    const e = new Error("Brif çox qısadır — reklam haqqında bir az ətraflı danışın.");
    e.http = 400;
    throw e;
  }
  let result = null;
  let source = "offline";
  if (aiEnabled()) {
    try {
      const { data } = await generateJSON({
        system: SYSTEM_ADS,
        user: adUserPrompt({ profile: acc.profile, transcript: text, extra: String(extra || "").slice(0, 500) }),
        schema: AD_SCHEMA,
      });
      result = data;
      source = "ai";
    } catch (e) {
      store.log("ai.error", { accountId: acc.id, scope: "ads", message: String(e.message).slice(0, 200) });
    }
  }
  if (!result || !Array.isArray(result.scripts) || result.scripts.length < 5) result = offlineAdScripts({ transcript: text });

  const record = {
    id: "ad_" + crypto.randomBytes(6).toString("base64url"),
    createdAt: new Date().toISOString(),
    transcript: text,
    source,
    brief: result.brief,
    scripts: result.scripts.slice(0, 5),
    proqHints: result.proqHints || [],
  };
  const list = store.adsOf(acc.id);
  list.push(record);
  if (list.length > 200) list.splice(0, list.length - 200);
  acc.usage.adRequests++;
  store.log("ads.generated", { accountId: acc.id, source });
  store.save();
  return record;
}

/** Speech-to-text via OpenAI (optional). Returns null when not configured. */
export async function transcribe(audioBuffer, mime) {
  if (!config.openaiKey) return null;
  const ext = /mp4|m4a|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : /wav/.test(mime) ? "wav" : /mpeg|mp3/.test(mime) ? "mp3" : "webm";
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mime || "audio/webm" }), `brief.${ext}`);
  form.append("model", config.transcribeModel);
  form.append("language", "az");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transkripsiya xətası (${res.status})`);
  const json = await res.json();
  return String(json.text || "").trim();
}
