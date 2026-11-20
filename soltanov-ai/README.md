# Soltanov AI

Şükran Soltanov üçün şəxsi AI kontent prodüseri: gündə 3 dəfə onun xarakterinə uyğun, çəkilməyə hazır Instagram Reels ideyaları, səsli reklam brifindən 5 ssenari, iş axınına görə "proq" alətləri. Bütün funksiyalara səslə istək göndərmək olur ("mənə bu mövzuda Reels ideyaları hazırla").

Deploy: [docs/DEPLOY.md](docs/DEPLOY.md) · Plan və arxitektura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Təqdimat: [presentation/SoltanovAI-Teqdimat.pdf](presentation/SoltanovAI-Teqdimat.pdf)

## Sürətli başlanğıc

```bash
cd soltanov-ai
npm install
cp .env.example .env
npm run admin -- secrets        # SESSION_SECRET və ADMIN_TOKEN yaradır → .env-ə köçür
# .env-də ANTHROPIC_API_KEY, OWNER_CONTACT_URL, PUBLIC_URL doldur
npm run start:trial             # link forması (3 günlük test)
```

Admin panel: `https://domen/admin` (ADMIN_TOKEN ilə). Orada "Link yarat" → link + müştəriyə hazır mesaj.

CLI ilə: `npm run admin -- create-trial "Ramin — boksçu"`.

## İki forma

| Forma | Necə işə salınır | Kimdə |
|---|---|---|
| Link (3 gün test) | `EDITION=trial npm start` — ayrıca deploy, link `/t/<token>` | Müştəriyə göndərilir |
| Tətbiq (tam versiya) | `npm run package:app` → `dist/SoltanovAI-Full.tar.gz` | Satışa qədər sizdə qalır |

Tam versiyanı satanda: paketi müştərinin serverinə (və ya öz serverinizə) qurun, `/admin` → "Açar yarat", açarı müştəriyə verin. Müştəri saytı telefonda açır, açarı daxil edir, "Ana ekrana əlavə et" ilə tətbiq kimi quraşdırır (PWA).

## Mühit dəyişənləri

| Dəyişən | Təyinat |
|---|---|
| `EDITION` | `trial` və ya `full` |
| `SESSION_SECRET`, `ADMIN_TOKEN` | Məcburi sirlər |
| `ANTHROPIC_API_KEY` | Claude AI. Boşdursa offline şablon rejimi |
| `OPENAI_API_KEY` | Səs → mətn (opsional) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | 09:00/13:00/19:00 bildirişləri (opsional) |
| `IDEA_SLOTS`, `IDEAS_PER_SLOT`, `TIMEZONE` | Slot vaxtları və sayı |
| `TRIAL_HOURS`, `TRIAL_MAX_DEVICES`, `TRIAL_DAILY_AD_LIMIT`, `TRIAL_DAILY_CUSTOM_LIMIT` | Test şərtləri |
| `OWNER_NAME`, `OWNER_CONTACT_URL` | Blok ekranındakı "Tam versiyanı əldə et" düyməsi |

## Əmrlər

```bash
npm test                 # 19 test: trial blok, cihaz limiti, sessiya, slotlar, təkrar filtri, səsli əmrlər, HTTP axını
npm run package:app      # tam versiya təhvil paketi
npm run pdf              # təqdimat PDF-ini yenidən yarat (Chromium lazımdır)
```

## Məlumat

Bütün məlumat `data/db-<edition>.json` faylındadır (yedəkləmək üçün bu faylı kopyalamaq kifayətdir). Link token-ləri və lisenziya açarları yalnız SHA-256 hash kimi saxlanılır.

## Səsli əmrlər

Hər ekranda "Səslə istə" düyməsi var. Səs mətnə çevrilir (`/api/voice/transcribe`), sonra `/api/voice/command` istəyi uyğun funksiyaya yönləndirir:

| Deyir | Nəticə |
|---|---|
| "Mənə zal mövzusunda Reels ideyaları hazırla" | Həmin mövzuda ideyalar ("Səsli sifariş" etiketi ilə "Bu gün" bölməsində) |
| "X brendi reklam istəyir…" | 5 reklam ssenarisi |
| "Axşam ideyalarını dəyiş" | Slot yenilənir |
| "Bundan sonra daha çox yumor olsun" | Daimi istək kimi profilə yazılır, bütün gələcək ideyalarda nəzərə alınır |
| "Qiyməti hesabla", "teleprompteri aç" | Proq aləti açılır |

Yönləndirmə Claude ilə edilir; AI açarı yoxdursa açar sözlərə əsaslanan router işləyir.

## Brend

Loqo Şükran Soltanovun video kadrından hazırlanıb (Instagram interfeysi və play işarəsi təmizlənib, üz dəyişdirilməyib): `brand/logo-1024.png`, tətbiq ikonları `public/icon-*.png`, `public/logo.png`.
