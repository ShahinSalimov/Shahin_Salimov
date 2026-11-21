# Vexora AI

AI ilə şəkil və video yaratma platforması: Explore, Generator və endirimli Pricing. 7 dil dəstəyi (default: English).

## İşə salma

```bash
pnpm install
pnpm --filter @workspace/vexora-ai run dev        # http://localhost:5173
pnpm --filter @workspace/vexora-ai run build
```

## Struktur

| Qovluq | Məzmun |
|---|---|
| `src/styles/theme.css` | Tailwind v4 `@theme` tokenləri (qırmızı / qara / sarı), şriftlər, animasiyalar |
| `src/i18n/` | Dil sistemi: `config.ts` (dillər), `locales/en.ts` (mənbə lüğət), `locales/*.ts` (tərcümələr), `useI18n()` hook |
| `src/types/` | Bütün domen tipləri |
| `src/data/` | Kateqoriyalar, modellər, sintetik kataloq, **qiymət konfiqi** (`pricing.ts`) |
| `src/services/ai/` | `AIProvider` interfeysi + mock və HTTP adapter. `VITE_AI_API_URL` verilsə HTTP-yə keçir |
| `src/services/payments/` | `PaymentGateway` interfeysi + mock gateway |
| `src/store/AppStore.tsx` | Route, kredit, plan, kitabxana, checkout state |
| `src/components/{explore,generator,pricing,layout,ui,media}` | Modul-modul UI |

## Dillər (i18n)

Dəstəklənən dillər: `en` (default), `az`, `tr`, `ru`, `de`, `es`, `fr`.

- Dilin təyini (prioritet sırası): `?lang=` URL parametri → istifadəçinin menyudan seçdiyi dil (yadda saxlanır) → brauzer dili (`de-AT` → `de`) → English.
- Dəstəklənməyən brauzer dili (məs. `ja`, `it`) English-ə düşür.
- Yeni mətn əlavə etmək: əvvəl `locales/en.ts`-ə açar yaz, sonra qalan dillərə. Hər hansı dildə açar çatışmırsa, `typecheck` xəta verir.
- Yeni dil əlavə etmək: `config.ts`-ə dil kodunu, `locales/`-a fayl, `locales/index.ts`-ə import əlavə et.
- Rus dili üçün şriftlər avtomatik Unbounded + Manrope-a keçir (Syne və Plus Jakarta Sans əsas kiril hərflərini dəstəkləmir).
- Kataloqdakı iş adları və prompt-lar istifadəçi kontenti sayılır və ingiliscə qalır.

## Qeydlər

- Bütün önizləmə vizualları `GenerativeArt` komponenti ilə seed-dən prosedur yolla çəkilir (üçüncü tərəf media yoxdur).
- `data/pricing.ts` içində `REFERENCE_PRICES` boşdur: rəqib qiymətləri yoxlanandan sonra doldurun — dev rejimdə bizim qiymət daha ucuz deyilsə konsolda xəbərdarlıq çıxır.
- Real ödəniş üçün `services/payments/` altında yeni adapter yazıb `index.ts`-də dəyişin. Kart məlumatı yalnız gateway-in hosted form-u ilə toplanmalıdır.
- Real AI üçün vendor açarlarını brauzerə qoymayın: öz backend-iniz `httpProvider`-in gözlədiyi API-ni təqdim etsin.
