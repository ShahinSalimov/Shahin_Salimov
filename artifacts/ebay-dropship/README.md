# eBay Dropship: avtomatlaşdırma sistemi

eBay.com (US) + CJdropshipping üçün avtomatik dropshipping sistemi. Öz kompüterində işləyir və brauzerdən idarə olunur (`http://localhost:3000`).

## Sistem nə edir

| Mərhələ | Nə baş verir | Kim edir |
|---|---|---|
| 1. Məhsul araşdırması | Ayarlardakı açar sözlərlə CJ kataloqunu axtarır, brend və qadağan məhsulları atır, stok və çatdırılma müddətini yoxlayır, eBay-də rəqib qiymətlərinə baxır, hər məhsula 0–100 bal verir | Sistem (12 saatdan bir) |
| 2. Qiymət | Maya + çatdırılma + eBay komissiyası + hədəf mənfəət əsasında qiymət hesablayır (x.99) | Sistem |
| 3. Elan | Kateqoriya seçir, Claude AI ilə title (80 simvol), description və item specifics yazır, eBay-ə yükləyir | Sistem (bal ≥ 70 olanlar avtomatik) |
| 4. Stok/qiymət sync | CJ-də stok bitəndə elanı 0-a endirir, qiymət dəyişəndə eBay qiymətini yeniləyir | Sistem (3 saatdan bir) |
| 5. Sifariş | eBay-də ödənilmiş sifarişi görür, CJ-də müştərinin ünvanına sifariş yaradır, CJ balansından ödəyir | Sistem (15 dəqiqədən bir) |
| 6. Tracking | CJ tracking nömrəsi verəndə eBay-ə yükləyir, sifariş "shipped" olur | Sistem (saatda bir) |
| 7. Bildiriş | Yeni sifariş, problem, stok bitməsi barədə Telegram mesajı | Sistem |
| Müştəri mesajları | Panelin "AI cavab" bölməsində mesajı yapışdırırsan, AI cavab hazırlayır, sən eBay-də göndərirsən | Sən + AI |
| Return, dispute, ləğv | Sistem xəbər verir, qərarı sən verirsən | Sən |
| CJ balansını artırmaq | CJ wallet-ə pul yükləmək | Sən |

---

## 1. Quraşdırma (bir dəfəlik, təxminən 30–40 dəqiqə)

### 1.1. Node.js
[nodejs.org](https://nodejs.org) saytından **Node.js 24 LTS** versiyasını yüklə və quraşdır. Minimum tələb: 22.18.

### 1.2. Proqramı kompüterə köçür
Bu qovluğu (`artifacts/ebay-dropship`) kompüterinə kopyala. Məsələn: `C:\ebay-dropship` və ya `~/ebay-dropship`.

### 1.3. `.env` faylı
`.env.example` faylının surətini çıxar və adını `.env` qoy. Açarları aşağıdakı addımlarla doldur. İlk işə salmada `start` skripti bunu özü də edir.

### 1.4. eBay developer açarları
1. [developer.ebay.com](https://developer.ebay.com) saytında eBay hesabınla qeydiyyatdan keç. Təsdiq bir neçə saatdan bir günə qədər çəkə bilər.
2. **Application Keys** səhifəsində **Production** keyset yarat. `App ID (Client ID)` dəyərini `EBAY_CLIENT_ID`-ə, `Cert ID (Client Secret)` dəyərini `EBAY_CLIENT_SECRET`-ə yaz.
3. Production keyset-in yanında **User Tokens** → **Get a Token from eBay via Your Application** → **Add eBay Redirect URL** düyməsini bas. Formada:
   - *Your privacy policy URL*: istənilən səhifən (məsələn, Instagram profilin).
   - *Your auth accepted URL*: standart dəyəri saxla.
   - **OAuth Enabled** seçimini işarələ.
4. Yaranan **RuName** dəyərini (`Shahin_Salim-...-...` formatında) `EBAY_RUNAME`-ə yaz.
5. eBay hesabında **Business policies** aktiv olmalıdır: Seller Hub → Account → Business policies. Orada 3 policy yarat:
   - **Shipping**: Free shipping, handling time 3 gün (ayarlardakı `Handling time` ilə eyni), Economy/Standard shipping.
   - **Payment**: standart.
   - **Return**: 30 gün, "buyer pays return shipping" və ya "free returns", seçim sənindir.

### 1.5. CJdropshipping API key
cjdropshipping.com → My CJ → Authorization → API → **API Key** yarat. Dəyəri `CJ_API_KEY`-ə yaz.
Avtomatik ödəniş üçün CJ **Wallet**-də balans saxla. Balans bitəndə sifarişlər "awaiting_payment" statusuna düşür və Telegram-a xəbər gəlir.

### 1.6. Claude API key
[console.anthropic.com](https://console.anthropic.com) → API Keys. Dəyəri `ANTHROPIC_API_KEY`-ə yaz. Açar olmasa, sistem işləyir, amma elan mətni sadə template ilə hazırlanır.
Təxmini xərc: hər elan üçün təxminən $0.02–0.03.

### 1.7. Telegram (istəyə görə, amma tövsiyə olunur)
1. Telegram-da @BotFather → `/newbot`. Verilən token-i `TELEGRAM_BOT_TOKEN`-ə yaz.
2. Yeni bota istənilən mesaj yaz.
3. Brauzerdə `https://api.telegram.org/bot<TOKEN>/getUpdates` linkini aç. `"chat":{"id":123456789` hissəsindəki rəqəmi `TELEGRAM_CHAT_ID`-ə yaz.

---

## 2. İşə salma

- **Windows:** `start.bat` faylına iki dəfə klik et.
- **Mac:** `start.command` faylına iki dəfə klik et. İlk dəfə sağ klik → Open etmək lazım ola bilər.
- **Terminal ilə:** `npm install --omit=dev`, sonra `npm start`.

Brauzer avtomatik açılır: `http://localhost:3000`. Proqram açıq qaldıqca bütün avtomatik işlər öz-özünə gedir. Kompüter sönəndə sistem də dayanır, yenidən `start` ilə aç.

### İlk işə salmada panel üzərindən:
1. **eBay qoşulma** → "eBay hesabını qoş". Yeni tabda eBay-ə daxil ol və **Agree** bas. Sonrakı səhifənin adres sətrindəki tam linki (`...code=v%5E1.1...` hissəsi ilə) kopyala, paneldəki sahəyə yapışdır və **Təsdiqlə** bas. Kod 5 dəqiqə etibarlıdır.
2. Eyni səhifədə 3 business policy-ni seç və yadda saxla.
3. **Inventory location**: göndərmə anbarının şəhərini, ştatını və poçt kodunu yaz. US anbarından göndərirsənsə, US ünvanı yaz.
4. **Ayarlar**: açar sözləri, mənfəət faizini və limitləri öz istəyinə görə dəyiş.

---

## 3. Test rejimi, sonra LIVE

`.env` faylında `DRY_RUN=true` olduqca sistem hər şeyi edir (araşdırır, qiymət hesablayır, AI ilə elan yazır), amma **eBay və CJ-də real heç nə dəyişmir**. Görəcəkləri "Loglar"da `[DRY_RUN]` qeydi ilə yazılır.

CJ olmadan sınamaq üçün `DEMO_SUPPLIER=true` qoy. Bu halda 4 test məhsulu ilə işləyir.

**LIVE-a keçməzdən əvvəl yoxlama siyahısı:**
- [ ] Panel → "Quraşdırma tamamlanmayıb" xəbərdarlığı yoxdur
- [ ] DRY_RUN-da 1–2 gün namizədlərə baxmısan, qiymət və mənfəət sənə uyğundur
- [ ] CJ wallet-də balans var
- [ ] Telegram bildirişləri gəlir
- [ ] İlk günlər üçün `Avto-elan üçün minimum bal` dəyərini yüksək saxla (məsələn, 80) və ya 0 qoyub elanları əllə təsdiqlə

Sonra `.env` faylında `DRY_RUN=false` et və proqramı yenidən başlat.

---

## 4. Gündəlik iş (səndə qalan 10–15 dəqiqə)

1. Telegram bildirişlərinə bax.
2. Panel → "Diqqət tələb edir" sayı 0 deyilsə, **Sifarişlər** səhifəsinə keç:
   - `needs_attention`: səbəb qeyddə yazılıb (ünvan natamamdır, SKU tanınmır, CJ xətası). Düzəlt, sonra "CJ-də sifariş et" düyməsini bas.
   - `awaiting_payment`: CJ-də ödənişi et, sonra "Ödədim" düyməsini bas.
3. eBay Messages-də suallara bax. Lazım olsa, "AI cavab" bölməsindən istifadə et.
4. Həftədə bir dəfə **Elanlar** səhifəsinə bax. Satmayan elanları bitir, açar sözləri yenilə.

---

## 5. Ayarlar (paneldən dəyişilir)

| Ayar | Standart | İzah |
|---|---|---|
| Hədəf mənfəət, % | 20 | Satış qiymətinin neçə faizi xalis mənfəət olsun |
| Minimum mənfəət, $ | 4 | Bundan az qazandıran məhsul satılmır |
| eBay komissiyası, % | 14.2 | 13.25% FVF satış vergisinə də tətbiq olunur. Kateqoriyana görə yoxla |
| Avto-elan üçün minimum bal | 70 | Bu bal və yuxarı olanlar avtomatik yüklənir. 0 qoysan, söndürülür |
| Maksimum aktiv elan | 100 | eBay hesabının satış limitindən çox olmasın |
| Gündəlik yeni elan limiti | 15 | Yeni hesab üçün yavaş artım daha təhlükəsizdir |
| Maksimum çatdırılma, gün | 12 | Gec çatdırılma seller performance-ı pisləşdirir |
| Anbar ölkələri | US,CN | US anbarı daha sürətli çatdırır, ona üstünlük verilir |
| Avtomatik sifariş / avto-ödəniş | Bəli | Tam avtomatik rejim |

---

## 6. Bilməli olduğun məhdudiyyətlər

- **CJ API endpoint-ləri** CJ-nin API v2 sənədinə əsasən yazılıb. Proqram hazırlanan mühitdən CJ sənəd saytına giriş bağlı olduğu üçün endpoint-lər real CJ hesabı ilə yoxlanılmayıb. Hamısı bir faylda toplanıb: `src/suppliers/cj.ts`. İlk real testi `DRY_RUN=true` ilə et. Araşdırma işləmirsə, Loglarda CJ xətasına bax.
- **Hər elan bir variantdır.** Məhsulun ən ucuz və stokda olan variantı seçilir. Çoxvariantlı elanlar (rəng/ölçü seçimi) hələ yoxdur.
- **Bazar araşdırması** eBay Browse API-nin aktiv elan məlumatına əsaslanır. "Sold" tarixçəsi (Terapeak) açıq API ilə verilmir.
- **Carrier kodları**: tracking yüklənərkən CJ-nin logistika adı eBay carrier koduna çevrilir (USPS, UPS, YunExpress və s.). Tanınmayan xətt "Other" kimi göndərilir. eBay bunu qəbul etməsə, Loglarda görünəcək.
- **Müştəri mesajları** avtomatik göndərilmir. eBay mesajlarını oxumaq üçün ayrıca, köhnə Trading API lazımdır. AI yalnız cavab layihəsi hazırlayır.
- **Ləğv olunan sifariş**: CJ sifarişi artıq yaradılıbsa, sistem xəbər verir, amma CJ-də ləğvi sən edirsən.
- **eBay qaydası**: yalnız dropshipping təchizatçısından (CJ kimi) göndər. Amazon/Walmart kimi pərakəndə saytdan alıb göndərmək qadağandır.

---

## 7. Texniki məlumat

- Node.js 24 (TypeScript birbaşa işləyir, build lazım deyil), Express 5, SQLite (`node:sqlite`), Claude API (`@anthropic-ai/sdk`).
- Məlumat bazası: `data/dropship.db`. Bu faylın ehtiyat surətini vaxtaşırı çıxar.
- Testlər: `npm test` (14 test: qiymət, filtr, bal, CJ client, tam avtomatik axın).

```
src/
  index.ts              giriş nöqtəsi
  config.ts             .env oxunması
  settings.ts           paneldən dəyişilən ayarlar
  pricing.ts            qiymət hesablaması
  research.ts           məhsul balı
  filters.ts            brend/VeRO və qadağan məhsul filtri
  suppliers/cj.ts       CJdropshipping API
  suppliers/demo.ts     test təchizatçısı
  ebay/client.ts        eBay OAuth, Inventory, Fulfillment, Browse, Taxonomy
  ai/listing.ts         Claude: elan mətni və müştəri cavabı
  services/engine.ts    bütün avtomatik işlər
  services/scheduler.ts cədvəl
  web/                  idarə paneli
```
