// Telegram Bot API üçün sadə müştəri (fetch ilə)
export function makeTelegram(token, { fetchImpl = fetch } = {}) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method, body = {}) {
    const res = await fetchImpl(`${base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
    return data.result;
  }

  // Telegram mesaj limiti 4096 simvoldur, uzun mətn hissələrə bölünür
  async function sendMessage(chatId, text, extra = {}) {
    const chunks = [];
    let rest = String(text || '').trim() || '—';
    while (rest.length > 4000) {
      const cut = rest.lastIndexOf('\n', 4000) > 1000 ? rest.lastIndexOf('\n', 4000) : 4000;
      chunks.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }
    chunks.push(rest);
    let last;
    for (let i = 0; i < chunks.length; i++) {
      last = await call('sendMessage', { chat_id: chatId, text: chunks[i], ...(i === chunks.length - 1 ? extra : {}) });
    }
    return last;
  }

  async function sendAudio(chatId, buffer, { filename = 'brifinq.mp3', caption = '' } = {}) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption.slice(0, 1000));
    form.append('audio', new Blob([buffer], { type: 'audio/mpeg' }), filename);
    const res = await fetchImpl(`${base}/sendAudio`, { method: 'POST', body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendAudio: ${data.description}`);
    return data.result;
  }

  async function downloadFile(fileId) {
    const file = await call('getFile', { file_id: fileId });
    const res = await fetchImpl(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`Fayl yüklənmədi: ${res.status}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), path: file.file_path };
  }

  return {
    call,
    sendMessage,
    sendAudio,
    downloadFile,
    getUpdates: (offset, timeout = 30) => call('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }),
    answerCallback: (id, text = '') => call('answerCallbackQuery', { callback_query_id: id, text }),
    editMarkup: (chatId, messageId) => call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    setCommands: (commands) => call('setMyCommands', { commands }),
  };
}

// Sınaq və ya token olmayanda: mesajları yaddaşda saxlayan saxta müştəri
export function makeFakeTelegram() {
  const sent = [];
  return {
    sent,
    call: async () => ({}),
    sendMessage: async (chatId, text, extra = {}) => { sent.push({ chatId: String(chatId), text, extra }); return { message_id: sent.length }; },
    sendAudio: async (chatId, buffer, opts = {}) => { sent.push({ chatId: String(chatId), audio: buffer.length, caption: opts.caption }); return {}; },
    downloadFile: async () => ({ buffer: Buffer.from('fake'), path: 'voice.oga' }),
    getUpdates: async () => [],
    answerCallback: async () => ({}),
    editMarkup: async () => ({}),
    setCommands: async () => ({}),
  };
}
