# Ghost Flip: Haunted House Tycoon
## Oyun Dizayn Sənədi (GDD) v0.1

| | |
|---|---|
| Platforma | Android (sonra iOS) |
| Janr | Idle Tycoon + tap mini-game |
| Auditoriya | ABŞ, Böyük Britaniya, Kanada, Avstraliya. Yaş 13+, əsas hədəf 18–40 |
| Dil | İngilis (oyundakı bütün mətnlər) |
| Ekran | Portrait, 1080×1920 |
| Üslub | Cozy-spooky cartoon: qorxulu yox, sevimli və gülməli |
| Gəlir modeli | Rewarded ads (əsas) + az interstitial + in-app purchase |

---

## 1. Oyunun qısa təsviri

Oyunçu ucuz, lənətli evlər alır. İçindəki ruhları qovur, otaqları təmir edir və evi baha qiymətə satır. Evi satmaq əvəzinə kirayə də verə bilər, o zaman oyunçu oflayn olanda da pul gəlir. Hər ev əvvəlkindən böyük olur, ruhları da daha çətin və daha gülməli olur. Oyun meşədəki daxmadan başlayır və qəsrə qədər davam edir.

**Slogan (Store və reklam üçün):** *"Buy haunted. Bust ghosts. Sell big."*

---

## 2. Əsas oyun döngüsü (Core Loop)

```
BUY HOUSE → BUST GHOSTS → RENOVATE ROOMS → SELL or RENT → UNLOCK NEXT HOUSE
     ↑                                            │
     └──────────── Cash + Ectoplasm ←─────────────┘
```

**Aktiv qat (oyunçu oynayanda):**
1. **Buy:** Xəritədən ev seçilir və alınır.
2. **Bust:** Hər otaqda ruh var. Oyunçu ruha toxunaraq "Spook Meter"-i sıfıra endirir. Bəzi ruhlar xüsusi alət tələb edir.
3. **Renovate:** Ruhdan təmizlənən otaq 3 mərhələdə təmir olunur. Hər mərhələnin qiyməti və vaxtı var.
4. **Sell / Rent:** Bütün otaqlar hazır olanda ev satılır (birdəfəlik böyük pul) və ya kirayə verilir (passiv gəlir).

**Passiv qat (oyunçu oflayn olanda):**
- Kirayədəki evlər dəqiqəbaşı gəlir verir.
- İşə götürülən Crew üzvləri ruhları avtomatik qovur və təmiri sürətləndirir.
- Oflayn gəlir ilkin olaraq 2 saatla məhdudlaşır, upgrade ilə 8 saata qədər artırıla bilər.

**Oyunçunu niyə qaytaracaq:** təmir taymerləri, oflayn qazanc, növbəti evin "kilidli" görüntüsü və gündəlik hədiyyə.

---

## 3. Valyutalar

| Valyuta | Necə qazanılır | Nəyə xərclənir |
|---|---|---|
| **Cash ($)** | Ev satışı, kirayə, ruhdan düşən sikkələr | Ev almaq, təmir, Crew |
| **Ectoplasm** (yaşıl damla) | Ruh qovanda az miqdarda, gündəlik hədiyyə, rewarded ad, IAP | Alət upgrade-i, taymeri dərhal bitirmək, xüsusi dekor |
| **Reputation Stars** | Prestige (bölmə 8) | Bütün gəlirə daimi multiplier |

---

## 4. Ruh növləri (Ghost Roster)

Hər ruhun bir xasiyyəti var və bu xasiyyət mini-game-i dəyişir. MVP-də ilk 5 ruh olacaq.

| # | Ad | Xasiyyəti | Mexanika | İlk görünüş |
|---|---|---|---|---|
| 1 | **Whisper** | Utancaq, gizlənir | Ekranda yer dəyişir, onu tutmaq lazımdır | Ev 1 |
| 2 | **Poltergeist Pete** | Əşya atır | Uçan əşyalara toxunub tutmaq, sonra ruha zərbə vurmaq | Ev 2 |
| 3 | **Grumpy Grandpa** | Hər şeydən narazıdır | Kreslosu düzəldilməsə getmir. Əvvəl kiçik tapşırıq, sonra tap | Ev 3 |
| 4 | **Party Phantom** | Bitməyən party | Musiqi səsini söndürmək üçün 3 dinamiki tapmaq | Ev 4 |
| 5 | **Chef Boo** | Mətbəxi tərk etmir | Qazandakı yeməyi vaxtında qarışdırmaq (timing) | Ev 5 |
| 6 | **Selfie Specter** | Influencer ruh | Ghost Camera ilə şəklini çəkəndə zəifləyir | Ev 6 |
| 7 | **Mr. Whiskers** | Ruh pişik | Oyuncaqla diqqətini yayındırmaq. Qovulmur, "evcilləşir" və pet olur | Ev 7 |
| 8 | **The Landlord** (Boss) | Hər rayonun sonunda | 3 fazalı döyüş, müxtəlif alətlər tələb edir | Ev 5 və 10 |

**Spook Meter:** ruhun "canı". Hər tap onu alətin gücü qədər azaldır. Rəqəmlər bölmə 6-dadır.

---

## 5. Alətlər (Tools)

| Alət | Təsiri | Açılır |
|---|---|---|
| Flashlight | Əsas tap gücü | Başlanğıc |
| Ghost Vacuum | Avtomatik tap, saniyədə 2 zərbə (10 saniyə) | Ev 2 |
| Salt Line | Ruhun qaçmasını 5 saniyə dayandırır | Ev 3 |
| Ghost Camera | Selfie Specter-ə 3 qat zərbə vurur | Ev 6 |
| Holy Boombox | Bütün otaqdakı ruhlara zərbə vurur | Ev 8 |

Hər alətin 10 səviyyəsi var və səviyyə Ectoplasm ilə artırılır. Hər səviyyə gücü +15% artırır.

---

## 6. Evlər və iqtisadiyyat (ilkin balans)

> Qeyd: bu rəqəmlər başlanğıc dəyərlərdir. Playtest-dən sonra mütləq düzəldiləcək. Hədəf odur ki, ilk 3 ev 15–20 dəqiqəyə keçilsin, sonra temp yavaşlasın.

| # | Ev | Alış | Təmir (cəmi) | Satış | Kirayə ($/dəq) | Otaq | Ruh |
|---|---|---|---|---|---|---|---|
| 1 | Shack in the Woods | $500 | $700 | $2,000 | $2 | 2 | 1 |
| 2 | Creaky Cottage | $1,500 | $2,000 | $5,500 | $5 | 3 | 2 |
| 3 | Suburban Split-Level | $4,000 | $5,500 | $15,000 | $14 | 3 | 3 |
| 4 | Old Farmhouse | $11,000 | $15,000 | $40,000 | $38 | 4 | 3 |
| 5 | Victorian Townhouse | $30,000 | $40,000 | $110,000 | $105 | 4 | 4 + Boss |
| 6 | Seaside Lighthouse | $80,000 | $110,000 | $300,000 | $290 | 4 | 4 |
| 7 | Roadside Motel | $220,000 | $300,000 | $820,000 | $790 | 5 | 5 |
| 8 | Gothic Mansion | $600,000 | $800,000 | $2.2M | $2,100 | 5 | 5 |
| 9 | Old Boarding School | $1.6M | $2.2M | $6M | $5,800 | 6 | 6 |
| 10 | Castle Blackmoor | $4.5M | $6M | $16.5M | $16,000 | 6 | 6 + Boss |

**Qaydalar:**
- Başlanğıc pul: **$1,500**.
- Təmir otaq-otaq ödənir, tam məbləği əvvəlcədən ödəmək lazım deyil.
- Hər otağın 3 təmir mərhələsi var: **Clean → Repair → Style**. Qiymət paylanması 20% / 35% / 45%.
- Təmir vaxtı: Ev 1-də 10 saniyə, hər yeni evdə x1.6, Ev 10-da təxminən 7 dəqiqə. Bu taymerlər rewarded ad-ın təbii yeridir.
- Ruhdan düşən pul: evin alış qiymətinin təxminən 5%-i (bütün ruhlar cəmi).
- Spook Meter: Ev 1-də 20 tap, hər yeni evdə x1.5 artır. Alət upgrade-i bunu kompensasiya edir.
- **Satış və ya kirayə seçimi:** satış sürətli irəliləyiş verir, kirayə uzunmüddətli gəlir. Bu seçim oyuna strategiya qatır.

---

## 7. Crew (avtomatlaşdırma)

| Crew | Funksiya | Qiymət |
|---|---|---|
| Rookie Hunter | Saniyədə 1 avtomatik tap | $1,000 |
| Pro Hunter | Saniyədə 4 tap | $25,000 |
| Handyman | Təmir vaxtı -25% | $5,000 |
| Interior Designer | Satış qiyməti +15% | $60,000 |
| Property Manager | Oflayn limit +2 saat | $150,000 |

---

## 8. Prestige: "Move to a New Town"

Castle Blackmoor satılandan sonra açılır. Oyunçu bütün evlərini satır və yeni şəhərdə sıfırdan başlayır, amma **Reputation Stars** qazanır. Hər ulduz bütün gəlirə +10% əlavə edir.

Yeni şəhər yeni vizual mövzudur: **Town 1** New England payızı, **Town 2** New Orleans, **Town 3** London. Ruhlar və evlər eyni sistemdə qalır, sadəcə dəri (skin) dəyişir. Bu üsulla az iş həcmi ilə çoxlu məzmun alınır.

---

## 9. Pul qazanma (Monetization)

### 9.1 Rewarded Ads (əsas gəlir)
Oyunçu reklama həmişə **könüllü** baxır. Hər düymədə nə qazanacağı aydın yazılır.

| Yer | Mükafat | Limit |
|---|---|---|
| Satış ekranı | "Sell for x2" | Hər satışda 1 dəfə |
| Təmir taymeri | "Finish now" | Limitsiz (taymer > 30 saniyə olanda göstərilir) |
| Oflayn qazanc ekranı | "Collect x3" | Hər girişdə 1 dəfə |
| Ectoplasm Chest | 10–50 Ectoplasm | Hər 4 saatdan bir |
| Boss döyüşü | "Ghost Vacuum boost" | Hər döyüşdə 1 dəfə |
| Lucky Ghost (nadir, ekrandan uçub keçən ruh) | Böyük pul bonusu | Saatda 2 dəfə |

### 9.2 Interstitial Ads (az və ehtiyatla)
- Yalnız **ev satışından sonra** göstərilir.
- İlk 3 satışda heç göstərilmir.
- İki interstitial arasında minimum 3 dəqiqə olmalıdır.
- "Remove Ads" alan oyunçuya heç vaxt göstərilmir.

### 9.3 Banner
**Yoxdur.** İngilis bazarında banner az qazandırır və oyunun görüntüsünü korlayır.

### 9.4 In-App Purchase
| Məhsul | Qiymət | Məzmun |
|---|---|---|
| Remove Ads | $2.99 | Interstitial reklamlar söndürülür. Rewarded reklamlar reklamsız mükafata çevrilir |
| Starter Pack | $1.99 (birdəfəlik) | $5,000 + 100 Ectoplasm + Rookie Hunter |
| Ectoplasm Jar | $0.99 / $4.99 / $9.99 / $19.99 | 100 / 600 / 1,400 / 3,200 |
| Ghost Pass | $4.99 / ay | Gündəlik 50 Ectoplasm, x2 oflayn qazanc, xüsusi pet |

---

## 10. Oyunçunun ilk 5 dəqiqəsi (Onboarding)

| Vaxt | Hadisə |
|---|---|
| 0:00–0:10 | Qaranlıq daxma göstərilir, Whisper ekrandan qaçır. Mətn: *"$500? For a HAUNTED house? Deal."* |
| 0:10–0:40 | Barmaq işarəsi ilə ilk ruh qovulur və sikkələr səpələnir |
| 0:40–1:20 | Birinci otağın təmiri: Clean → Repair → Style. Hər mərhələdə vizual dəyişiklik görünür |
| 1:20–2:30 | İkinci otaq, köməksiz |
| 2:30–3:00 | İlk satış: $2,000. Konfetti. "Sell or Rent?" seçimi izah olunur |
| 3:00–4:00 | Creaky Cottage açılır, Poltergeist Pete ilə tanışlıq |
| 4:00–5:00 | İlk təmir taymeri göstərilir və "Finish now" rewarded düyməsi təqdim olunur |

Qayda: ilk 5 dəqiqədə interstitial yoxdur, mətn qısadır, oyunçu hər 10 saniyədə yeni bir şey görür.

---

## 11. Vizual üslub və AI art prompt-ları

**Üslub:** stylized 3D cartoon render (və ya 2D vector), yumşaq bənövşəyi/yaşıl gecə palitrası, isti pəncərə işıqları. Ruhlar yarı-şəffaf və iri gözlüdür. Qorxulu deyil, sevimlidir.

**Palitra:** Night Purple `#2B1E3F`, Ecto Green `#7CFFB2`, Warm Window `#FFC86B`, Cash Gold `#FFD54A`, Ghost White `#EAF2FF`.

### Prompt: App Icon
```
Mobile game app icon, a cute semi-transparent white ghost with big round eyes holding a "SOLD" sign in front of a tiny crooked haunted house, glowing ecto green outline, deep purple night background, stylized 3D cartoon render, soft rim lighting, bold readable silhouette, centered composition, no text except "SOLD", 1024x1024
```

### Prompt: Ev (Before / After)
```
Isometric view of a small crooked wooden shack in a dark foggy forest, broken windows, cobwebs, faint green ghostly glow inside, cozy-spooky stylized 3D cartoon game art, purple night palette, clean background, mobile game asset, high detail, 1:1
```
```
Same isometric small wooden house fully renovated, fresh paint, warm glowing windows, flower boxes, tidy porch with a "SOLD" sign, cozy stylized 3D cartoon game art, soft evening light, clean background, mobile game asset, 1:1
```

### Prompt: Ghost personajı (Grumpy Grandpa)
```
Character design sheet of a grumpy old man ghost, semi-transparent pale blue body, bushy eyebrows, tiny round glasses, holding a ghostly cane, floating above a rocking chair, cute and funny not scary, stylized 3D cartoon game character, three poses: idle, angry, defeated, plain dark purple background
```

Qalan ruhlar üçün də eyni şablon istifadə olunur, sadəcə xasiyyət təsviri dəyişir. Bütün personajlarda üslubu sabit saxlamaq üçün ilk təsdiqlənən şəkil referans kimi istifadə olunmalıdır.

---

## 12. Texniki plan

| Hissə | Seçim |
|---|---|
| Engine | Phaser 3 (JavaScript/TypeScript) |
| Android build | Capacitor → Android Studio → AAB |
| Reklam | Google AdMob (`@capacitor-community/admob`), mediation sonra |
| Razılıq (consent) | Google UMP SDK: Avropa/Böyük Britaniya üçün GDPR pəncərəsi |
| Yaddaş | Capacitor Preferences (lokal save), sonra cloud save |
| Analitika | Firebase Analytics |
| IAP | Google Play Billing (Capacitor plugin vasitəsilə) |

**Vacib hüquqi tələblər:**
- **Privacy Policy** səhifəsi. AdMob və Google Play bunu tələb edir, onu sizin veb saytınızda yerləşdirmək olar.
- Hədəf yaş **13+** olmalıdır. Uşaqlara yönəlmiş oyun kimi işarələnsə (Families policy), reklam qaydaları çox sərtləşir və gəlir xeyli azalır.
- Play Console-da "Data safety" formu doldurulmalıdır.

---

## 13. MVP scope (ilk versiya)

**Daxildir:**
- Ev 1–5 (Boss Ev 5-də)
- Ruh 1–5 və The Landlord
- Alət: Flashlight, Ghost Vacuum, Salt Line
- Crew: Rookie Hunter, Handyman
- Sell / Rent seçimi, oflayn qazanc
- 4 rewarded yer: x2 sell, finish now, offline x3, Ectoplasm Chest
- Remove Ads və Starter Pack
- Onboarding

**Sonraya qalır:** Ev 6–10, Prestige, Ghost Pass, pet sistemi, cloud save, iOS.

---

## 14. Uğur göstəriciləri (hədəflər)

Bu rəqəmlər casual mobil oyunlar üçün çox istinad olunan təxmini orientirlərdir, zəmanət deyil:

| Göstərici | Hədəf |
|---|---|
| D1 retention (1-ci gün qayıdanlar) | 35%+ |
| D7 retention | 12%+ |
| Gündəlik oyunçu başına rewarded ad baxışı | 4+ |
| Orta sessiya | 6+ dəqiqə |

D1 bu hədəfdən çox aşağı olarsa, marketinqə pul xərcləməzdən əvvəl onboarding və ilk evlərin balansı düzəldilməlidir.

---

## 15. Marketinq: TikTok / Reels ideyaları

Bu hissə sizin əsas üstünlüyünüzdür. Hər video ideyası oyunun içindən çəkilmiş real görüntüyə əsaslanır:

1. **"This ghost refuses to leave"**: Grumpy Grandpa ilə komik mübarizə
2. **Before / After**: daxma → hazır ev, 7 saniyəlik satisfying transformasiya
3. **"I bought a haunted house for $500"**: storytime formatında
4. **"Rate this ghost 1–10"**: hər videoda yeni ruh, şərhlərdə müzakirə yaradır

Ətraflı saniyə-saniyə ssenarilər və video prompt-ları ayrıca hazırlanacaq.

---

## 16. Növbəti addımlar

1. Bu sənədi təsdiqləmək və ya düzəlişlər etmək
2. Brauzerdə oynanılan prototip: Ev 1–2, əsas döngü
3. AI ilə art üslubunu sınamaq (app icon + 1 ev + 1 ruh)
4. MVP-ni tamamlamaq və AdMob test reklamlarını qoşmaq
5. Google Play Developer hesabı açmaq ($25), closed testing
6. Store listing və ilk TikTok videoları
