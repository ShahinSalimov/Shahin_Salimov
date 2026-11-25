# Park Pro — Biznes İdarəetmə Sistemi

Taksi parkı (avtomobil icarəsi), telefon/aksesuar topdan satışı və istənilən əlavə biznes üçün idarəetmə sistemi.
Kompüterdə və telefonda işləyir (PWA: telefonda "Ana ekrana əlavə et" ilə tətbiq kimi quraşdırılır).

## İşə salmaq

```bash
cd fleet-manager
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ qovluğu: istənilən statik hostinqə (Vercel, Netlify) yüklənir
```

## Modullar

| Bölmə | Nə edir |
|---|---|
| Panel | Bu günün yığımı, plan icrası, borclar, satış, anbar, xəbərdarlıqlar |
| Səhər hesabatı | Telegram mesajı şəklində xülasə, bot ilə göndərmə |
| Kassa | Gün üzrə bütün bizneslərin mədaxil/məxarici (nağd/kart) |
| Hesabatlar | Bizneslər üzrə mənfəət-zərər, avtomobil mənfəəti, top məhsul/müştəri, CSV ixracı |
| Gündəlik ödəniş | Bir toxunuşla nağd/kart qəbulu, qismən ödəniş, WhatsApp xatırlatma |
| Avtomobillər | Kart, status, sürücü təyini, yürüş, yağ dəyişmə, sığorta/texbaxış, mənfəət |
| Sürücülər | Borc, depozit, reytinq (Qızıl/Gümüş/Riskli), hesab çıxarışı, çap |
| Cərimələr | Tarix-saata görə sürücünü avtomatik tapır və borcuna yazır |
| Xərclər | Biznes və kateqoriya üzrə xərclər |
| Anbar | Telefon/aksesuar qalığı, minimum hədd, mal qəbulu (orta maya) |
| Satış | Faktura, nisyə/qismən ödəniş, IMEI, çap/PDF, WhatsApp |
| Müştərilər | Mağazalar, borc, ödənişlər, xatırlatma |
| Digər bizneslər | Ayarlardan "Yeni biznes" yaratmaq: öz gəlir/xərc səhifəsi, kateqoriyalar |
| Ayarlar | Loqo, şirkət adı, istifadəçi, Telegram, backup/bərpa, audit jurnalı |

Bütün qeydlər redaktə edilə və silinə bilir. Hər dəyişiklik audit jurnalına yazılır.

## Texniki qeydlər

- React 19 + TypeScript + Vite + Tailwind CSS 4, qrafiklər Recharts.
- Məlumatlar hazırda brauzerin `localStorage`-ında saxlanılır (`src/lib/store.ts`). Bütün dəyişikliklər `update()` funksiyasından keçir, ona görə bulud bazasına (Supabase/PostgreSQL) keçid tək bir faylda edilir.
- Gündəlik icarə hər gün aktiv icarələr üçün avtomatik borc kimi yazılır (`accrueRent`).
- Demo məlumatları: `src/lib/seed.ts`. Ayarlar → "Təmiz başla" ilə real işə keçilir.

## Növbəti mərhələ

1. Bulud verilənlər bazası və login (rollar: sahib, menecer, kassir), bütün cihazlarda sinxron.
2. Səhər hesabatının serverdən avtomatik göndərilməsi (n8n/cron).
3. WhatsApp Business API ilə avtomatik xatırlatmalar.
4. AI köməkçi ("bu ay ən çox borcu olan kimdir?").
5. GPS tracker inteqrasiyası (mövcud cihazdan asılıdır).
