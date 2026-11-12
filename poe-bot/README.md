# AdReel Director: Poe və GPT Store üçün AI reklam botu

## Seçilən məkan: Poe (poe.com)

Niyə Poe:
- Syntax AI kimi aggregator-dur: Claude, GPT, Gemini və minlərlə üçüncü tərəf bot bir yerdədir, istifadəçi bazası böyükdür.
- Bot sahiblərinə pul ödəyir: hər mesaja görə qiymət təyin etmək (price per message) və bot sayəsində abunə olan istifadəçiyə görə bonus.
- Prompt bot yaratmaq üçün kod lazım deyil, bir gündə buraxmaq olar.

Bot linki: https://poe.com/AdReel-Director (base model: Claude Haiku 5.5)

İkinci məkan: ChatGPT GPT Store. Eyni prompt ilə Custom GPT yaradılır. Orada birbaşa ödəniş zəmanətli deyil, ona görə funnel (müştəri cəlbi) kimi işlədilir.

Diqqət: Poe-nun ödəniş proqramı əvvəlcə yalnız ABŞ yaradıcıları üçün idi, sonradan genişləndiyi bildirilir. Azərbaycandan qoşulmanın mümkün olub-olmadığını hesab açanda yoxla: Creator / Monetization bölməsi. Proqram əlçatan olmasa da, bot funnel kimi işləyəcək.

## Məhsul

**AdReel Director** — istifadəçi məhsulunu yazır, bot ona bunları hazırlayır:
1. Konsept
2. Saniyə-saniyə ssenari cədvəli
3. Hər səhnə üçün şəkil prompt-u (ingiliscə)
4. Hər səhnə üçün video prompt-u (Kling, Veo, Runway, Sora)
5. Voiceover, musiqi istiqaməti və musiqi prompt-u
6. Caption və hashtag-lar
7. Sonda sənin sifariş linkin

Gəlir 3 yerdən gəlir:
1. Poe mesaj başına ödənişi
2. Abunə bonusu
3. Peşəkar video sifarişi üçün sənə yazan müştərilər. Ən böyük gəlir buradan gələcək.

## Fayllar
- `system-prompt.md` — botun beyni, Prompt sahəsinə kopyala
- `listing.md` — ad, açıqlama, greeting, starter mesajlar, avatar prompt-u, təqdimat postu

## Poe-da yaratmaq: addım-addım
1. poe.com-da hesab aç.
2. Sol menyuda **Create bot** seç, sonra **Prompt bot** tipini seç.
3. **Base bot:** Claude modeli seç (uzun, strukturlu cavablarda güclüdür). Daha ucuz model seçsən, istifadəçiyə mesaj qiyməti aşağı düşər.
4. **Name:** `AdReel-Director`, **Description:** `listing.md`-dən götür.
5. **Prompt:** `system-prompt.md`-dəki blokun içini kopyala. `[YOUR_CONTACT_LINK]` yerinə öz linkini yaz.
6. **Greeting message** və starter mesajları `listing.md`-dən götür.
7. Avatar: `listing.md`-dəki prompt ilə şəkil yarat və yüklə.
8. Botu public et, sonra özün 3–4 fərqli məhsulla test et.
9. Monetization bölməsini aç və mesaj qiymətini təyin et (əgər sənin regionda əlçatandırsa).

Bu interfeys adları (sahələrin adları) dəyişmiş ola bilər. Mənası eyni qalacaq.

## GPT Store-da yaratmaq
1. ChatGPT, sonra **Explore GPTs**, sonra **Create**.
2. **Configure** tabında: Name, Description (listing.md), Instructions (system-prompt.md), Conversation starters.
3. Capabilities: Image generation-ı aç (istifadəçi keyframe-ləri dərhal görə bilsin).
4. **Publish**, sonra **Everyone**. Builder profilini təsdiqlə (domen və ya ad).

## Digər fayllar
- `example-output.md`: botun verəcəyi nümunə cavab. Test zamanı müqayisə üçün və demo video üçün istifadə olunur
- `launch-content.md`: botu tanıtmaq üçün 3 Reels/TikTok ssenarisi və bio mətni
- `avatar.png` / `avatar.svg`: botun avatarı (1024x1024)
- `../site/index.html`: sifariş saytı. Bot cavablarındakı `[YOUR_CONTACT_LINK]` bu sayta aparacaq

## Sifariş saytını yayımlamaq
1. `site/index.html`-in sonundakı `CONFIG` hissəsində WhatsApp nömrəni, Instagram, TikTok və bot linkini yaz.
2. Pulsuz yayımlamağın ən asan yolu: app.netlify.com/drop saytına `site` qovluğunu sürüklə, sənə link verəcək.
3. Sonra həmin linki `system-prompt.md`-də `[YOUR_CONTACT_LINK]` yerinə yaz.

## Qiymət planı (təklif)
| Nə | Qiymət |
|---|---|
| Poe mesaj qiyməti | Aşağı başla, ilk həftələrdə istifadəçi və rəy toplamaq vacibdir. Rəqəmi Poe-nun göstərdiyi tövsiyə aralığına görə seç |
| Video xidməti | Müddətə görə 3 paket: 15s, 30s, 60s. Qiymətləri öz bazarına görə sən təyin et |

Konkret AZN qiymətləri yazmadım, çünki sənin bazar qiymətlərini bilmirəm.

## İlk 30 gün planı
| Həftə | İş |
|---|---|
| 1 | Botu Poe və GPT Store-da buraxmaq, 10 test, prompt-u düzəltmək |
| 2 | Botla hazırlanmış 3 nümunə reklam videosu çəkib Instagram/TikTok-da paylaşmaq, bioda bot linki |
| 3 | "Pulsuz AI reklam ssenarisi" kampaniyası: hər videoda bot linki, DM-lərə cavab |
| 4 | Statistikaya baxmaq (mesaj sayı, sifarişlər), qiyməti və prompt-u yeniləmək |

Sources:
- https://tech.co/news/how-to-make-money-with-poe-ai
- https://techcrunch.com/2023/10/31/quoras-poe-introduces-an-ai-chatbot-creator-economy/amp
- https://www.geeksforgeeks.org/?p=1216322
- https://community.openai.com/t/chatgpt-app-monetization-apps-sdk/1372343.md
