// Bütün ayarlar mühit dəyişənlərindən (.env) oxunur. Siyahı: .env.example
import fs from 'node:fs';
import path from 'node:path';

// Sadə .env oxuyucu (əlavə paket olmadan)
export function loadEnvFile(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
    dbPath: env.DB_PATH || './data/shuker.db',
    timezone: env.TIMEZONE || 'Asia/Baku',
    tzOffset: env.TZ_OFFSET || '+04:00',
    ownerName: env.OWNER_NAME || 'Şükran',
    // Maliyyəni kim görür: none = yalnız sahib, manager = sahib + menecerlər
    financeAccess: env.TEAM_FINANCE_ACCESS === 'manager' ? 'manager' : 'none',

    telegram: {
      token: env.TELEGRAM_BOT_TOKEN || '',
      ownerId: env.OWNER_TELEGRAM_ID || '',
      managerIds: list(env.MANAGER_TELEGRAM_IDS),
      memberIds: list(env.MEMBER_TELEGRAM_IDS),
      teamChatId: env.TEAM_CHAT_ID || '',
    },

    ai: {
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      effort: env.ANTHROPIC_EFFORT || 'medium',
      historyTurns: Number(env.AI_HISTORY_TURNS || 12),
      fallbacks: bool(env.AI_FALLBACKS, true),
    },

    voice: {
      openaiKey: env.OPENAI_API_KEY || '',
      sttModel: env.STT_MODEL || 'whisper-1',
      ttsModel: env.TTS_MODEL || 'tts-1',
      ttsVoice: env.TTS_VOICE || 'onyx',
      briefAsVoice: bool(env.BRIEF_AS_VOICE, false),
    },

    schedule: {
      briefTime: env.BRIEF_TIME || '09:00',
      eventReminderMinutes: Number(env.EVENT_REMINDER_MINUTES || 60),
      reportAfterHours: Number(env.REPORT_AFTER_HOURS || 48),
    },

    meta: {
      graphHost: env.META_GRAPH_HOST || 'graph.facebook.com',
      graphVersion: env.META_GRAPH_VERSION || 'v21.0',
      igUserId: env.IG_USER_ID || '',
      accessToken: env.META_ACCESS_TOKEN || '',
      appSecret: env.META_APP_SECRET || '',
      verifyToken: env.META_VERIFY_TOKEN || '',
      insightMetrics: env.META_INSIGHT_METRICS || 'reach,likes,comments,shares,saved',
    },

    panel: {
      ownerPassword: env.PANEL_OWNER_PASSWORD || '',
      teamPassword: env.PANEL_TEAM_PASSWORD || '',
    },
  };
}
