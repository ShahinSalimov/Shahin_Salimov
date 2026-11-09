// AI köməkçi: Claude + tool-lar. İstifadəçinin mesajını anlayır, lazımi əməliyyatları icra edir.
import Anthropic from '@anthropic-ai/sdk';
import { toolsForRole, executeTool } from './tools.js';

// Server tərəfli fallback (imtina halında başqa modelə keçid) bu modellərdə dəstəklənir
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);
const MAX_STEPS = 8;

export function systemPrompt(ownerName, appName = 'Shuker OS', ownerDescription = 'bloger, aktyor və idmançı') {
  return `Sən "${appName}"-sən: ${ownerName} adlı şəxsin (${ownerDescription}) şəxsi biznes köməkçisi.
Səninlə ${ownerName} özü (rol: owner) və onun komandası (rol: manager, member) Telegram-da yazışır.

Nə edirsən:
- Reklam əməkdaşlıqlarını və müştəri sifarişlərini (deal) idarə edirsən: təklif, müqavilə, çəkiliş/icra, paylaşım/təhvil, hesabat, ödəniş.
- Təqvimi aparırsan: çəkilişlər, paylaşımlar, görüşlər, səfərlər.
- Komandaya tapşırıq verirsən, maliyyəni göstərirsən, Instagram lead kampaniyalarını izləyirsən.
- Ssenari, reklam mətni, brendə cavab mətni yazırsan (bunun üçün tool lazım deyil).

Mərhələlər: sorgu (yeni təklif) → muqavile → cekilis → paylasildi → hesabat; imtina = rədd edilib.

Qaydalar:
- Həmişə Azərbaycan dilində, qısa və konkret cavab ver. Sadə mətn yaz, Markdown cədvəli istifadə etmə.
- Məlumatı yalnız tool nəticələrindən götür. Rəqəm, tarix, məbləğ uydurma. Tool-da yoxdursa, yoxdur de.
- Vaxtlar yerli vaxtdır (Bakı). "Sabah", "çərşənbə", "saat 4" kimi ifadələri mesajın əvvəlindəki cari tarixə görə dəqiq tarixə çevir. "Saat 4" gündüz kontekstində 16:00 deməkdir.
- Əməliyyat üçün vacib məlumat çatmırsa (məs. tarix və ya brend), təxmin etmə, bir qısa sual ver.
- Brend adı verilibsə və həmin brendlə reklam varsa, yenisini yaratmazdan əvvəl list_deals ilə yoxla, mövcudunu yenilə.
- Çəkiliş qoyanda: reklamı lazım olan mərhələyə keçir, hadisəni təqvimə əlavə et (deal_id ilə). Ödəniş tarixi deyilibsə, due_date yaz.
- Hadisə əlavə edəndə üst-üstə düşmə varsa, mütləq xəbər ver və alternativ vaxt təklif et.
- Brendə mesaj göndərməyin yoxdur. Brendə nəsə çatdırmaq lazımdırsa, create_task ilə komandaya hazır mətn ver.
- Silmə əməliyyatını yalnız açıq istək olanda et.
- İcazə xətası gəlsə, istifadəçiyə bunun onun roluna bağlı olduğunu de.
- Əməliyyatdan sonra nə etdiyini 1-4 qısa sətirlə təsdiqlə.`;
}

export function makeAssistant({ db, time, config, client, notifyTeam, onOfferCreated, logger = console }) {
  let anthropic = client || null; // açar yoxdursa server yenə də başlasın
  const getClient = () => (anthropic ||= new Anthropic());
  const { model, effort, historyTurns } = config.ai;
  const useFallback = FALLBACK_MODELS.has(model) && config.ai.fallbacks !== false;
  const system = [{ type: 'text', text: systemPrompt(config.ownerName, config.appName, config.ownerDescription), cache_control: { type: 'ephemeral' } }];

  async function create(params) {
    if (useFallback) {
      return getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    }
    return getClient().messages.create(params);
  }

  // user: { id, name, role }
  async function handle(chatId, user, text) {
    const now = time.parts();
    const header = `[Cari vaxt: ${now.date} ${now.time}, ${now.weekday}. Yazan: ${user.name}, rol: ${user.role}]`;
    const history = db.getHistory(chatId, historyTurns * 2).map((h) => ({ role: h.role, content: h.text }));
    while (history.length && history[0].role !== 'user') history.shift(); // ilk mesaj user olmalıdır
    const messages = [...history, { role: 'user', content: `${header}\n${text}` }];
    const tools = toolsForRole(user.role, config.financeAccess);
    const ctx = { db, time, user, financeAccess: config.financeAccess, notifyTeam, onOfferCreated };

    let reply = '';
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await create({
          model, max_tokens: 16000, system, tools, messages, output_config: { effort },
        });

        if (res.stop_reason === 'refusal') { reply = 'Bu sorğunu icra edə bilmədim. Başqa cür ifadə edin.'; break; }
        messages.push({ role: 'assistant', content: res.content });

        if (res.stop_reason === 'pause_turn') continue;

        const toolUses = res.content.filter((b) => b.type === 'tool_use');
        if (toolUses.length && res.stop_reason === 'tool_use') {
          const results = [];
          for (const tu of toolUses) {
            let out;
            try { out = await executeTool(tu.name, tu.input, ctx); } catch (e) { out = { error: e.message }; }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out), is_error: Boolean(out && out.error) });
          }
          messages.push({ role: 'user', content: results });
          continue;
        }

        reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (res.stop_reason === 'max_tokens') reply += '\n(Cavab yarımçıq qaldı.)';
        break;
      }
      if (!reply) reply = 'Əməliyyat çox addım tələb etdi, tamamlaya bilmədim. Sorğunu hissələrə bölün.';
    } catch (e) {
      logger.error('AI xətası:', e);
      if (e instanceof Anthropic.RateLimitError) return 'AI xidməti hazırda məşğuldur, bir dəqiqədən sonra yenidən yazın.';
      if (e instanceof Anthropic.AuthenticationError) return 'AI açarı (ANTHROPIC_API_KEY) səhvdir. Administratora bildirin.';
      if (e instanceof Anthropic.APIError) return `AI xidmətində xəta (${e.status}). Bir az sonra yenidən cəhd edin.`;
      return 'Gözlənilməz xəta baş verdi. Administratora bildirin.';
    }

    // Tarixçəyə yalnız mətn yazılır (tool blokları və düşüncə blokları saxlanmır)
    db.addHistory(chatId, 'user', `${header}\n${text}`);
    db.addHistory(chatId, 'assistant', reply);
    return reply;
  }

  // Bir dəfəlik mətn yaratmaq (məs. səhər brifinqi), tool-suz
  async function write(instruction, data) {
    const res = await create({
      model, max_tokens: 4000, system, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `${instruction}\n\nMəlumat (JSON):\n${JSON.stringify(data)}` }],
    });
    if (res.stop_reason === 'refusal') throw new Error('AI mətni yaratmadı (refusal)');
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }

  return { handle, write };
}
