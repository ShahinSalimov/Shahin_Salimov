# Soltanov AI — Plan və Arxitektura

## 1. Problem və həll

| Ağrı nöqtəsi | Həll |
|---|---|
| Hər gün Reels üçün mövzu tapmaq çətindir | Gündə 3 slot (səhər / günorta / axşam), hər slotda 3 çəkilməyə hazır ideya |
| İdeyalar təkrarlanır | Server tərəfində təkrar filtri: son 120 ideya ilə söz oxşarlığı (Jaccard) + AI-a "bunları təkrarlama" siyahısı |
| Reklam təklifi gələndə ssenari yazmağa vaxt yoxdur | Səs yazısı → mətn → 5 fərqli konsept və saniyə-saniyə ssenari |
| Əlavə alətlərə ehtiyac (qiymət, təqvim, teleprompter) | "Proq" mühərriki: kontekstə görə uyğun aləti təklif edir, alətlər sistemin içində işləyir |
| Satışdan əvvəl məhsulu göstərmək lazımdır | 3 günlük link (trial edition), sonra server tərəfində avtomatik blok |
| Tam versiya satılana qədər sahibdə qalmalıdır | Ayrı `full` edition paketi + lisenziya açarı, yalnız sahibin admin paneli yarada bilər |

## 2. Ümumi sxem

```
 Telefon / brauzer (PWA)                 Node.js server (src/server.js)                Xarici xidmətlər
 ┌───────────────────────┐   HTTPS     ┌───────────────────────────────────┐
 │ public/index.html      │──────────▶ │ access.js  — trial/lisenziya,      │
 │  • Bu gün (ideyalar)   │  cookie    │              sessiya, cihaz limiti │
 │  • Reklam (səs)        │◀────────── │ ideas.js   — slotlar, təkrar filtri │──▶ Claude API (ideya, ssenari)
 │  • Proq (alətlər)      │            │ ads.js     — 5 ssenari axını        │──▶ OpenAI Whisper (səs→mətn, opsional)
 │  • Təqvim / Profil     │            │ proq.js    — alət təklif mühərriki  │──▶ Telegram Bot (bildiriş, opsional)
 └───────────────────────┘            │ scheduler.js — 09:00/13:00/19:00    │
 public/admin.html (sahib) ─────────▶ │ db.js      — JSON fayl bazası       │
                                       └───────────────────────────────────┘
```

Asılılıq minimumdur: yalnız `@anthropic-ai/sdk`. HTTP server, kriptoqrafiya, fayl bazası Node.js standart kitabxanası ilə yazılıb — deploy sadədir (Replit, VPS, Render).

## 3. İki edition

| | Link forması (`EDITION=trial`) | Tətbiq forması (`EDITION=full`) |
|---|---|---|
| Kimdə | Sifarişçiyə link göndərilir | Sahibdə qalır (`npm run package:app` → `dist/SoltanovAI-Full`) |
| Giriş | `https://domen/t/<token>` | Lisenziya açarı `SA-XXXX-XXXX-XXXX-XXXX` |
| Müddət | İlk açılışdan 72 saat | Limitsiz (və ya admin təyin etdiyi tarix) |
| Quraşdırma | Yükləmə yoxdur, birbaşa link | PWA — telefona "Ana ekrana əlavə et" ilə tətbiq kimi |
| Limit | Gündəlik reklam generasiyası (default 10) | Limitsiz |

Trial server lisenziya açarını **qəbul etmir**, full server trial linkini qəbul etmir. Yəni trial deploy-dan tam versiyaya keçmək texniki olaraq mümkün deyil.

## 4. 3 günlük test və bloklama məntiqi

1. Sahib admin paneldən link yaradır. Token 192-bit təsadüfi, bazada yalnız SHA-256 hash saxlanılır.
2. Link ilk dəfə açılanda server `activatedAt = server vaxtı`, `expiresAt = activatedAt + 72 saat` yazır. Saat yalnız serverdədir — telefonun saatını dəyişmək heç nə vermir.
3. Sessiya cookie: `HttpOnly`, `SameSite=Lax`, HMAC-SHA256 imzalı. Serverdə sessiya qeydi var, admin ləğv edə bilir.
4. Cihaz limiti: hər link maksimum 2 cihaz. Linki başqasına ötürmək 3-cü cihazda bloklanır.
5. Hər API sorğusunda yoxlanır: token statusu, `expiresAt`, sessiya, cihaz. Vaxt bitəndə bütün endpoint-lər `423 Locked` qaytarır.
6. Bitmiş link yenidən aktivləşmir. Cookie silmək, gizli pəncərə, başqa brauzer — hamısı eyni token-ə bağlıdır və bloklanır.
7. Blok ekranında sahibin əlaqə düyməsi (WhatsApp) və istifadə statistikası var: "3 gündə 27 ideya, 4 reklam ssenarisi" — satış söhbəti üçün arqument.
8. Bloklananda klient brauzer keşini və yerli məlumatı təmizləyir; generasiya serverdə olduğu üçün klientdə "açılacaq" heç nə qalmır.
9. Admin: müddəti +24 saat uzatmaq, dərhal ləğv etmək, istifadəni görmək.

## 5. Gündəlik 3 slot axını

- Slotlar: `IDEA_SLOTS=09:00,13:00,19:00`, saat qurşağı `Asia/Baku`.
- `scheduler.js` hər dəqiqə aktiv hesabları yoxlayır, vaxtı çatmış slotu generasiya edir, Telegram bildirişi göndərir (qoşulubsa).
- Server yatmış olsa belə (autoscale), istifadəçi tətbiqi açanda çatışmayan slot dərhal yaradılır (lazy catch-up).
- Hər ideya: başlıq, kontent sütunu, format, **ilk 3 saniyəlik hook** (söz + vizual), saniyə-saniyə kadr planı (kamera bucağı, ekran yazısı), səs/musiqi tövsiyəsi, "niyə işləyir".
- Platformalar: **Instagram Reels** (caption, 5–8 hashtag, paylaşım qeydi) və **TikTok** (ayrıca qısa caption, 3–5 hashtag, TikTok paylaşım qeydi). Reklam ssenarilərində də TikTok caption ayrıca yazılır.
- Kontent sütunları növbə ilə dəyişir (məşq, qidalanma, motivasiya, kulis, trend, sual-cavab, çağırış, şəxsi hekayə) — monotonluğun qarşısı.
- Statuslar: yeni → saxlanılıb → çəkilib → paylaşılıb / keçildi. Bu, həm təqvim, həm də AI üçün siqnaldır (keçilən ideyaların tərzi azaldılır).

## 6. Səs → 5 reklam ssenarisi

1. Brauzerdə `MediaRecorder` ilə səs yazılır (maks. 3 dəq).
2. Server OpenAI transkripsiyasına göndərir (açar varsa). Açar yoxdursa, brauzerin daxili nitq tanıması və ya əl ilə mətn.
3. Transkript redaktə oluna bilir → "5 ssenari yarat".
4. Claude strukturlaşdırılmış JSON qaytarır: brend xülasəsi, 5 fərqli bucaq (problem-həll, gündəlik həyat, çağırış, test/nəticə, yumor/trend), hər biri üçün saniyə-saniyə timeline (vizual, voiceover, ekran yazısı), CTA, caption, `#reklam` işarələnməsi.
5. Hər ssenari bir toxunuşla kopyalanır və ya Teleprompter-də açılır.

## 7. "Proq" mühərriki

Qayda əsaslı + AI təklifi. Daxili alətlər real işləyir:

| Alət | Nə vaxt təklif olunur |
|---|---|
| Teleprompter | Ssenari hazır olanda |
| Reklam qiymət kalkulyatoru | Brifdə qiymət/büdcə/ödəniş sözləri |
| Brend müqavilə checklist | Brifdə müqavilə, şərt, eksklüziv, tarix |
| Kontent təqvimi | Brifdə son tarix və ya çəkilmiş, amma paylaşılmamış ideyalar ≥3 |
| Profil tənzimləmə | Son 7 gündə ≥5 ideya keçilib |
| Telegram bildirişi | Bildiriş qoşulmayıb |

## 7.1 Səsli əmrlər (bütün funksiyalar üçün)

- Hər ekranda üzən "Səslə istə" düyməsi və bölmə daxilində kontekst düymələri.
- Axın: səs → mətn (redaktə olunur) → `voice.js` niyyəti təyin edir (Claude JSON schema, offline açar söz router) → icra.
- Niyyətlər: `ideas` (mövzu üzrə sifariş ideyaları), `ad` (5 ssenari), `refresh` (slotu dəyiş), `profile` (daimi istək → `profile.wishes`, hər prompt-a əlavə olunur), `tool` (Proq aləti).
- Trial-da sifariş ideyaları üçün ayrıca gündəlik limit (`TRIAL_DAILY_CUSTOM_LIMIT`).

## 8. Təhlükəsizlik

- Admin endpoint-ləri `ADMIN_TOKEN` ilə (sabit vaxtlı müqayisə).
- IP əsaslı rate limit, JSON body limiti 64KB, səs limiti 12MB.
- CSP, `X-Frame-Options`, `nosniff` başlıqları; statik fayllarda path traversal qorunması.
- Sirlər yalnız mühit dəyişənlərində; repoda yoxdur.

## 9. AI qatı

- Model: `claude-opus-5-5` (`CLAUDE_MODEL` ilə dəyişilir), strukturlaşdırılmış çıxış (`output_config.format` JSON schema), `refusal` üçün server tərəfli fallback.
- `ANTHROPIC_API_KEY` yoxdursa sistem **offline şablon generatoru** ilə işləyir (demo üçün; keyfiyyəti AI-dan aşağıdır, admin paneldə göstərilir).

## 10. Deploy

```
cd soltanov-ai && npm install
cp .env.example .env    # açarları doldur
EDITION=trial npm start  # link forması
npm run admin -- create-trial "Müştəri adı"
```
