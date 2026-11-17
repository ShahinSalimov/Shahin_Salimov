# AdScript Studio

Xarici (ingilisdilli) bazar üçün AI veb tətbiqi. İstifadəçi məhsulunu təsvir edir (istəyə görə şəkil yükləyir) və TikTok / Instagram Reels / YouTube Shorts üçün hazır reklam paketi alır:

- 3 fərqli hook
- Saniyə-saniyə ssenari (visual, camera, on-screen text, voiceover)
- Hər səhnə üçün hazır **image prompt** və **video prompt**
- Caption, hashtag-lər, CTA, musiqi tövsiyəsi

**Gəlir modeli:** kredit paketləri Gumroad-da satılır. 1 generasiya = 1 kredit. Yeni hesab 3 pulsuz kredit alır. Refund olunan alışların kreditləri avtomatik geri götürülür.

## Necə işləyir

```
İstifadəçi ──> Landing (/) ──> Google / email ilə giriş ──> /dashboard
                                                              │
       Gumroad-da paket alır ──> email-ə license key gəlir ──> "Redeem" ──> /api/redeem
                                                              │                 │
                                                              │     Gumroad API ilə yoxlanır,
                                                              │     açar bir dəfə istifadə olunur
                                                              ▼
                                         Forma ──> /api/generate ──> 1 kredit çıxılır ──> Claude
                                                                       (xəta olarsa kredit geri qaytarılır)
```

| Hissə | Alət |
|---|---|
| Veb tətbiq | Next.js 16 (App Router), Tailwind CSS 4 |
| AI | Claude API (`@anthropic-ai/sdk`), structured outputs ilə dəqiq JSON |
| Giriş və baza | Supabase (Auth + Postgres) |
| Ödəniş | Gumroad (license key) |
| Hostinq | Vercel (tövsiyə) |

## Quraşdırma (addım-addım)

### 1. Supabase
1. [supabase.com](https://supabase.com)-da yeni layihə yarat.
2. **SQL Editor**-də `supabase/schema.sql` faylının məzmununu yapışdır və **Run** et. Bu, cədvəlləri və kredit funksiyalarını yaradır.
3. **Authentication → Providers**: Email aktivdir. Google-u aktiv et (Google Cloud Console-da OAuth Client yaratmaq lazımdır, Supabase səhifəsi addımları göstərir).
4. **Authentication → URL Configuration**: Site URL = sənin domenin; Redirect URLs-ə `https://SƏNİN-DOMENİN/auth/callback` və `http://localhost:3000/auth/callback` əlavə et.
5. **Project Settings → API**: `URL`, `anon key` və `service_role key`-i götür.

### 2. Gumroad (kredit paketləri)
Tam təlimat və hazır mətnlər: **[docs/GUMROAD.md](docs/GUMROAD.md)**. Orada bunlar var:
- 3 məhsulun (Starter, Creator, Agency) addım-addım yaradılması və license key ayarı
- kopyala-yapışdır üçün ingiliscə məhsul adı, summary, description və alışdan sonrakı mesaj
- refund webhook-unun qoşulması
- test alışı qaydası
- cover və thumbnail şəkilləri üçün prompt-lar

### 3. Anthropic API açarı
[platform.claude.com](https://platform.claude.com)-da API key yarat və balans əlavə et.

### 4. Mühit dəyişənləri
```bash
cp .env.example .env.local
```
`.env.local`-ı doldur. `GUMROAD_PRODUCTS`-da hər paket üçün `productId`, `name`, `credits`, `price`, `url` yaz. Qiymətdə `$` işarəsini `\$5` kimi yaz, yoxsa Next.js onu dəyişən kimi oxuyur.

### 5. Lokal işə salmaq
```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit testlər
npm run build    # production build yoxlaması
```

### 6. Vercel-ə yükləmək
1. Repozitoriyanı Vercel-ə qoş, **Root Directory** = `adscript-studio`.
2. `.env.local`-dakı bütün dəyişənləri Vercel → Settings → Environment Variables-a əlavə et. `NEXT_PUBLIC_SITE_URL`-i real domenə dəyiş.
3. Supabase Redirect URLs-ə production domenini əlavə et.

## Xərc və qiymət hesabı (təxmini)

- Default model `claude-opus-5-5`-dir ($4 / 1M input, $20 / 1M output token). Bir generasiya təxminən 2–4K input və 3–6K output token işlədir, yəni **təxminən $0.07–0.14**. Dəqiq rəqəmi ilk 20–30 generasiyadan sonra Anthropic Console → Usage-də yoxla.
- Xərci azaltmaq üçün `.env`-də `CLAUDE_MODEL=claude-sonnet-5-5` qoya bilərsən ($2 / $10, təxminən yarı qiymət). Keyfiyyəti müqayisə edib özün qərar ver.
- Nümunə: $5 = 20 kredit → bir kredit $0.25. Gumroad komissiyası çıxılandan sonra da marja qalır. Qiyməti öz xərc ölçmələrinə görə dəqiqləşdir.

## Fayl strukturu

```
src/
  app/
    page.tsx              landing + qiymətlər
    login/                Google / magic link giriş
    dashboard/            generator, nəticə, kredit, redeem, tarixçə
    api/generate/         kredit çıx → Claude → nəticəni saxla (xətada geri qaytar)
    api/redeem/           Gumroad license key → kredit
    api/gumroad/webhook/  refund/dispute → kreditlər geri götürülür
    auth/callback/        Supabase giriş callback
    privacy/, terms/      hüquqi səhifələr ([PLACEHOLDER]-ləri doldur)
  lib/
    prompt.ts             Claude system prompt (ssenarinin keyfiyyəti buradan idarə olunur)
    schema.ts             forma və nəticə sxemləri
    claude.ts             Claude çağırışı
    gumroad.ts            license key yoxlaması
    refunds.ts            refund bildirişinin emalı
  proxy.ts                sessiya yenilənməsi, /dashboard qoruması
supabase/schema.sql       cədvəllər, RLS, kredit funksiyaları
docs/GUMROAD.md           Gumroad quraşdırması və hazır satış mətnləri
```

## Təhlükəsizlik qeydləri

- Kredit balansı yalnız serverdə dəyişir (`service_role` + `security definer` funksiyalar). İstifadəçi brauzerdən balansı dəyişə bilməz.
- Hər license key bazada bir dəfə qeyd olunur, ikinci istifadə rədd edilir.
- Refund olunmuş və ya mübahisəli (dispute) alışlar redeem zamanı qəbul edilmir.
- Kredit əlavə edildikdən **sonra** refund və ya dispute olsa, Gumroad webhook-u (`/api/gumroad/webhook`) kreditləri avtomatik geri götürür. Balans 0-dan aşağı düşmür. Webhook bildirişinə kor-koranə inanılmır: tətbiq hər dəfə Gumroad API-dan alışın vəziyyətini özü yoxlayır. URL gizli token ilə qorunur.
- `SUPABASE_SERVICE_ROLE_KEY` və `ANTHROPIC_API_KEY` heç vaxt brauzerə getmir.

## Launch-dan əvvəl

- [ ] `privacy` və `terms` səhifələrindəki `[...]` yerləri doldur
- [ ] [docs/GUMROAD.md](docs/GUMROAD.md)-dəki yoxlama siyahısını tamamla (məhsullar, webhook, test alışı)
- [ ] 5–10 real məhsulla generasiya edib `src/lib/prompt.ts`-i öz üslubuna görə tənzimlə
- [ ] Öz Instagram/TikTok səhifəndə tətbiqin çıxardığı ssenari ilə AI video paylaş (əsas marketinq kanalı)
