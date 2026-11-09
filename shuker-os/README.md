# Shuker OS

Bloger və influenserlər üçün şəxsi biznes idarəetmə sistemi: Telegram AI köməkçi, reklam paneli, təqvim, maliyyə, səhər brifinqi, Instagram lead botu və Canlı Media Kit.

Bu, işləyən sistemdir, demo deyil. Kod hazırdır və testlərdən keçib. İşə salmaq üçün yalnız hesabları qoşmaq lazımdır (aşağıda: "Qoşulma").

## Nə edir

| Modul | Necə işləyir |
|---|---|
| **AI köməkçi (Telegram)** | Yazılı və ya səsli mesajı anlayır: "Chaidan-la çərşənbə 4-də çəkiliş qoy, 2 story bir reels, 2500". Reklamı yeniləyir, təqvimə yazır, komandaya tapşırıq verir, sual cavablandırır, ssenari yazır |
| **Reklamlar** | Təklif → Müqavilə → Çəkiliş → Paylaşıldı → Hesabat. Komanda təklif əlavə edəndə Şükrana kart gəlir: keçmiş qiymətlərlə müqayisə + "Qəbul et / İmtina" düymələri |
| **Təqvim** | Çəkiliş, paylaşım, görüş, səfər. Üst-üstə düşməni tapır. Başlamazdan 60 dəqiqə əvvəl xatırladır |
| **Maliyyə** | Aylıq gəlir, sahələr üzrə bölgü, gözlənilən və gecikən ödənişlər. Yalnız sahib görür (ayarla dəyişmək olar) |
| **Səhər brifinqi** | Hər gün saat 09:00-da Telegram-a: günün planı, gecikən ödənişlər, yeni təkliflər, lead-lər. İstəyə görə səsli fayl kimi |
| **Ödəniş xatırlatması** | Son tarix keçəndə Şükrana xəbər + düymə: "Xatırlatma tapşırığı ver" (komandaya brendə yazmaq üçün hazır mətn gedir) |
| **Hesabat xatırlatması** | Paylaşımdan 48 saat sonra komandaya: "hesabat vaxtıdır" + Instagram statistikası (media ID verilibsə) |
| **Instagram lead botu** | Postda "şərhə RIVIERA yazın". Yazan hər kəsə DM gedir, ad və nömrəsi toplanır, developerin Telegram çatına ötürülür. Paneldə nəticə və CSV |
| **Canlı Media Kit** | `/mediakit` səhifəsi: izləyici, baxış, brendlər. İzləyici sayı Instagram-dan gündəlik yenilənir |
| **Veb panel** | `/panel`, telefon üçün. İki giriş: sahib (hər şey) və komanda (maliyyəsiz) |

## Rollar

| Rol | Kimdir | Nə edə bilər |
|---|---|---|
| owner | Şükran | Hər şey: maliyyə, təkliflərə qərar, brifinq |
| manager | Komanda rəhbəri | Reklamlar, təqvim, tapşırıqlar, kampaniyalar. Maliyyə: `TEAM_FINANCE_ACCESS=manager` olsa |
| member | Komanda üzvü | Təklif əlavə etmək, təqvim, tapşırıqlar. Qiymətləri görmür |

AI köməkçi Telegram-da yalnız şəxsi yazışmada işləyir. Komanda qrupuna bildirişlər və tapşırıqlar gedir.

## Qoşulma: Şükrandan nə lazımdır

| # | Nə | Haradan |
|---|---|---|
| 1 | Telegram ID-si | Bot qoşulandan sonra botda `/id` yazır |
| 2 | Komanda üzvlərinin Telegram ID-ləri və rolları | Hər biri botda `/id` yazır |
| 3 | Komanda qrupu | Botu qrupa əlavə edin, qrupda `/id` yazın |
| 4 | Instagram Business və ya Creator hesab + bağlı Facebook Page | Instagram ayarları |
| 5 | Meta Business-də admin rolu (sizə) | business.facebook.com |
| 6 | Cari reklamlar və qiymət siyahısı | Komanda (ilk məlumatı paneldən daxil edin) |
| 7 | Birdəfəlik satışda: ödəniş kartı | Server, Anthropic, OpenAI hesabları onun adına |

## Quraşdırma (server)

Tələb: Node.js 22.13+ (və ya Docker), HTTPS domen (Instagram webhook üçün mütləqdir).

```bash
git clone <repo> /opt/shuker-os && cd /opt/shuker-os/shuker-os
npm ci --omit=dev
cp .env.example .env      # doldurun
npm test                  # testlər
npm start                 # http://localhost:3000/panel
```

Daimi işləmək üçün `shuker-os.service` faylını `/etc/systemd/system/`-ə kopyalayın (yolları uyğunlaşdırın):

```bash
sudo systemctl enable --now shuker-os
sudo journalctl -u shuker-os -f   # loglar
```

Docker ilə:

```bash
docker build -t shuker-os .
docker run -d --name shuker-os --env-file .env -p 3000:3000 -v shuker-data:/app/data --restart always shuker-os
```

HTTPS üçün ən sadə yol Caddy-dir: `os.example.com { reverse_proxy localhost:3000 }`.

**Ehtiyat nüsxə:** bütün məlumat bir fayldadır: `data/shuker.db`. Onu gündəlik kopyalayın.

## Hesabları qoşmaq

### 1. Claude (AI)
console.anthropic.com → API Keys → açar yaradın → `ANTHROPIC_API_KEY`. Model: `claude-opus-5-5`. İmtina halında server tərəfli ehtiyat model avtomatik işə düşür (`AI_FALLBACKS=true`).

### 2. Telegram
1. @BotFather → `/newbot` → token → `TELEGRAM_BOT_TOKEN`.
2. Sistemi işə salın, Şükran botda `/id` yazsın → `OWNER_TELEGRAM_ID`.
3. Komanda üzvləri də `/id` yazsın → `MANAGER_TELEGRAM_IDS`, `MEMBER_TELEGRAM_IDS` (vergüllə).
4. Botu komanda qrupuna əlavə edin, qrupda `/id` → `TEAM_CHAT_ID`.
5. Sistemi yenidən başladın.

### 3. Səs (istəyə görə)
platform.openai.com → API key → `OPENAI_API_KEY`. Səsli mesajlar Whisper ilə mətnə çevrilir (dil: `az`). Səsli brifinq üçün `BRIEF_AS_VOICE=true`. Səs standart AI səsidir. Şükranın öz səsinə bənzətmək üçün onun **yazılı razılığı** lazımdır və bu ayrıca işdir.

### 4. Instagram (lead botu və statistika)
1. developers.facebook.com → yeni App (Business tipli) → Instagram məhsulunu əlavə edin.
2. Instagram hesabı Facebook Page-ə bağlı olmalıdır.
3. İcazələr (adları Meta-nın cari sənədləri ilə yoxlayın): `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `instagram_manage_insights`, `pages_show_list`, `pages_manage_metadata`.
4. Uzunmüddətli access token alın → `META_ACCESS_TOKEN`. Instagram hesab ID-si → `IG_USER_ID`. App Secret → `META_APP_SECRET`.
5. Webhook: Callback URL `https://<domen>/webhooks/instagram`, Verify token = `META_VERIFY_TOKEN`. `comments` və `messages` sahələrinə abunə olun.
6. Bəzi icazələr Meta-nın yoxlamasından (App Review) keçir. Bu bir neçə gün və ya həftə çəkə bilər. App "Development" rejimində olanda yalnız app-da rolu olan hesablarla işləyir.

`META_GRAPH_VERSION` sahəsinə Meta-nın cari Graph API versiyasını yazın.

### 5. Panel
`PANEL_OWNER_PASSWORD` və `PANEL_TEAM_PASSWORD`: uzun, fərqli şifrələr. Panel: `https://<domen>/panel`.

## Lead kampaniyası necə açılır

Paneldə: Digər → Yeni kampaniya: açar söz (`RIVIERA`), DM mətni (broşür linki), developerin Telegram chat ID-si. Və ya Telegram-da AI-ya: "RIVIERA kampaniyası aç, DM mətni: ..., lead-lər bu çata getsin: -100...".

Proses: şərh → DM (bir nəfərə bir dəfə) → nömrə istənilir → nömrə gələndə təşəkkür + ötürmə. Nömrə yazmasa, bir dəfə yenidən soruşulur.

## Bilməli olduğunuz məhdudiyyətlər

- **Sistem brendlərə özü yazmır.** Brendə gedəcək mesajlar (təsdiq, ödəniş xatırlatması, imtina) komandaya hazır mətnlə tapşırıq kimi gedir. WhatsApp/e-poçt inteqrasiyası ayrıca iş kimi əlavə oluna bilər.
- **Instagram funksiyaları Meta-dan asılıdır:** icazələr, App Review, API dəyişiklikləri. Statistikanın metrik adları dəyişə bilər (`META_INSIGHT_METRICS`).
- **AI cavabları** tool-lardan gələn məlumata əsaslanır. Bazaya daxil edilməyən məlumatı bilmir.
- **Səsin tanınması** aksent və səs-küydən asılıdır. Sistem həmişə "Eşitdim: ..." deyə nəyi başa düşdüyünü göstərir.

## Struktur

```
src/
  index.js      başlanğıc, modulları birləşdirir
  config.js     .env ayarları
  db.js         SQLite baza (node:sqlite)
  ai.js         Claude köməkçi (tool-larla)
  tools.js      AI-ın əməliyyatları + rol icazələri
  bot.js        Telegram bot məntiqi
  telegram.js   Telegram API müştərisi
  voice.js      səs ↔ mətn
  scheduler.js  brifinq, xatırlatmalar
  instagram.js  lead botu, statistika
  server.js     panel API, Media Kit, webhook
public/panel.html  veb panel
test/              avtomatik testlər (npm test)
```

## Xərclər (təxmini, aylıq)

Server 20–70 ₼, Claude API 35–140 ₼ (istifadədən asılı), OpenAI audio 10–40 ₼, Telegram və Instagram API pulsuzdur. Dəqiq rəqəm ilk ayda görünəcək.
