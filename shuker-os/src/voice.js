// Səs: Telegram səsli mesajını mətnə çevirmək (STT) və brifinqi səsə çevirmək (TTS).
// OpenAI audio API istifadə olunur. OPENAI_API_KEY yoxdursa, səs funksiyaları söndürülür.
export function makeVoice({ openaiKey, sttModel, ttsModel, ttsVoice }, { fetchImpl = fetch } = {}) {
  const enabled = Boolean(openaiKey);

  async function transcribe(buffer, filename = 'voice.ogg') {
    if (!enabled) throw new Error('Səsli mesajlar üçün OPENAI_API_KEY lazımdır');
    const form = new FormData();
    form.append('model', sttModel);
    form.append('language', 'az');
    form.append('file', new Blob([buffer]), filename.replace(/\.oga$/, '.ogg'));
    const res = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { authorization: `Bearer ${openaiKey}` }, body: form,
    });
    if (!res.ok) throw new Error(`Səs mətnə çevrilmədi: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return String(data.text || '').trim();
  }

  async function speak(text) {
    if (!enabled) throw new Error('Səsli brifinq üçün OPENAI_API_KEY lazımdır');
    const res = await fetchImpl('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: ttsModel, voice: ttsVoice, input: text.slice(0, 4000), response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`Səs yaradılmadı: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  return { enabled, transcribe, speak };
}
