# Soltanov AI

Kişi idmançı-bloqer üçün şəxsi AI kontent prodüseri: gündə 3 dəfə onun xarakterinə uyğun, çəkilməyə hazır Instagram Reels ideyaları, səsli reklam brifindən 5 ssenari və iş axınına görə "proq" alətləri.

Plan və arxitektura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Təqdimat: [presentation/SoltanovAI-Teqdimat.pdf](presentation/SoltanovAI-Teqdimat.pdf)

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
| `TRIAL_HOURS`, `TRIAL_MAX_DEVICES`, `TRIAL_DAILY_AD_LIMIT` | Test şərtləri |
| `OWNER_NAME`, `OWNER_CONTACT_URL` | Blok ekranındakı "Tam versiyanı əldə et" düyməsi |

## Əmrlər

```bash
npm test                 # 15 test: trial blok, cihaz limiti, sessiya, slotlar, təkrar filtri, HTTP axını
npm run package:app      # tam versiya təhvil paketi
npm run pdf              # təqdimat PDF-ini yenidən yarat (Chromium lazımdır)
```

## Məlumat

Bütün məlumat `data/db-<edition>.json` faylındadır (yedəkləmək üçün bu faylı kopyalamaq kifayətdir). Link token-ləri və lisenziya açarları yalnız SHA-256 hash kimi saxlanılır.
