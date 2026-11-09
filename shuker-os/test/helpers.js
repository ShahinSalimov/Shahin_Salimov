import { openDb } from '../src/db.js';
import { makeTime } from '../src/time.js';
import { readConfig } from '../src/config.js';

export const silent = { log() {}, warn() {}, error() {} };

export function setup(env = {}) {
  const config = readConfig({
    OWNER_TELEGRAM_ID: '100', MANAGER_TELEGRAM_IDS: '200', MEMBER_TELEGRAM_IDS: '300', TEAM_CHAT_ID: '-900',
    PANEL_OWNER_PASSWORD: 'owner-pass', PANEL_TEAM_PASSWORD: 'team-pass',
    META_APP_SECRET: 'secret', META_VERIFY_TOKEN: 'verify-me', IG_USER_ID: 'IG1', META_ACCESS_TOKEN: 'tok',
    ...env,
  });
  const db = openDb(':memory:');
  const time = makeTime(config);
  return { config, db, time };
}

export function fakeNotify() {
  const log = [];
  return {
    log,
    owner: async (text, extra) => { log.push({ to: 'owner', text, extra }); return true; },
    team: async (text, extra) => { log.push({ to: 'team', text, extra }); return true; },
    chat: async (chatId, text) => { log.push({ to: String(chatId), text }); return true; },
    audio: async (chatId) => { log.push({ to: String(chatId), audio: true }); },
  };
}

// Claude müştərisinin saxtası: əvvəlcədən yazılmış cavabları növbə ilə qaytarır və sorğuları yadda saxlayır
export function fakeClaude(responses) {
  const requests = [];
  const create = async (params) => {
    requests.push(structuredClone(params));
    const r = responses.shift();
    if (!r) throw new Error('Gözlənilməyən Claude sorğusu');
    return r;
  };
  return { requests, messages: { create }, beta: { messages: { create } } };
}

export const toolUse = (id, name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
export const text = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
