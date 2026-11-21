# Salimofff Aİ

AI ilə şəkil və video yaratma platforması: Kəşf et (Explore), Yaratma studiyası (Generator) və endirimli Qiymətlər.

## İşə salma

```bash
pnpm install
pnpm --filter @workspace/salimofff-ai run dev        # http://localhost:5173
pnpm --filter @workspace/salimofff-ai run build
```

## Struktur

| Qovluq | Məzmun |
|---|---|
| `src/styles/theme.css` | Tailwind v4 `@theme` tokenləri (qırmızı / qara / sarı), şriftlər, animasiyalar |
| `src/types/` | Bütün domen tipləri |
| `src/data/` | Kateqoriyalar, modellər, sintetik kataloq, **qiymət konfiqi** (`pricing.ts`) |
| `src/services/ai/` | `AIProvider` interfeysi + mock və HTTP adapter. `VITE_AI_API_URL` verilsə HTTP-yə keçir |
| `src/services/payments/` | `PaymentGateway` interfeysi + mock gateway |
| `src/store/AppStore.tsx` | Route, kredit, plan, kitabxana, checkout state |
| `src/components/{explore,generator,pricing,layout,ui,media}` | Modul-modul UI |

## Qeydlər

- Bütün önizləmə vizualları `GenerativeArt` komponenti ilə seed-dən prosedur yolla çəkilir (üçüncü tərəf media yoxdur).
- `data/pricing.ts` içində `REFERENCE_PRICES` boşdur: rəqib qiymətləri yoxlanandan sonra doldurun — dev rejimdə bizim qiymət daha ucuz deyilsə konsolda xəbərdarlıq çıxır.
- Real ödəniş üçün `services/payments/` altında yeni adapter yazıb `index.ts`-də dəyişin. Kart məlumatı yalnız gateway-in hosted form-u ilə toplanmalıdır.
- Real AI üçün vendor açarlarını brauzerə qoymayın: öz backend-iniz `httpProvider`-in gözlədiyi API-ni təqdim etsin.
