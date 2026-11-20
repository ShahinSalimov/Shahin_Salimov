import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no dependency). Existing env vars win.
function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

export const config = {
  edition: env.EDITION === "full" ? "full" : "trial",
  port: int(env.PORT, 5000),
  dataDir: path.resolve(ROOT, env.DATA_DIR || "data"),
  publicUrl: (env.PUBLIC_URL || "").replace(/\/$/, ""),
  sessionSecret: env.SESSION_SECRET || "",
  adminToken: env.ADMIN_TOKEN || "",
  trialHours: int(env.TRIAL_HOURS, 72),
  trialMaxDevices: int(env.TRIAL_MAX_DEVICES, 2),
  trialDailyAdLimit: int(env.TRIAL_DAILY_AD_LIMIT, 10),
  trialDailyRefreshLimit: int(env.TRIAL_DAILY_REFRESH_LIMIT, 6),
  fullMaxDevices: int(env.FULL_MAX_DEVICES, 3),
  timezone: env.TIMEZONE || "Asia/Baku",
  slots: (env.IDEA_SLOTS || "09:00,13:00,19:00").split(",").map((s) => s.trim()).filter(Boolean),
  ideasPerSlot: Math.min(5, Math.max(1, int(env.IDEAS_PER_SLOT, 3))),
  anthropicKey: env.ANTHROPIC_API_KEY || "",
  claudeModel: env.CLAUDE_MODEL || "claude-opus-5-5",
  claudeEffort: env.CLAUDE_EFFORT || "medium",
  openaiKey: env.OPENAI_API_KEY || "",
  transcribeModel: env.TRANSCRIBE_MODEL || "whisper-1",
  telegramBotToken: env.TELEGRAM_BOT_TOKEN || "",
  telegramBotUsername: env.TELEGRAM_BOT_USERNAME || "",
  ownerContactUrl: env.OWNER_CONTACT_URL || "",
  ownerName: env.OWNER_NAME || "Soltanov AI",
  disableScheduler: env.DISABLE_SCHEDULER === "1",
};

export function assertProductionConfig() {
  const problems = [];
  if (config.sessionSecret.length < 32) problems.push("SESSION_SECRET ən azı 32 simvol olmalıdır");
  if (config.adminToken.length < 16) problems.push("ADMIN_TOKEN ən azı 16 simvol olmalıdır");
  return problems;
}
