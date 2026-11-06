# Iron Strike
## Oyun Dizayn Sənədi (GDD) v0.1

| | |
|---|---|
| Platforma | Android (sonra iOS) |
| Janr | Top-down action shooter, mərhələli kampaniya |
| Auditoriya | ABŞ, Böyük Britaniya, Kanada, Avstraliya. Yaş 13+ (Teen), əsas hədəf 16–35, kişilər üstünlük təşkil edir |
| Dil | İngilis |
| Ekran | Portrait, 1080×1920 |
| Üslub | Sci-fi military: tünd metal, narıncı təhlükə rəngi, neon effektlər |
| Gəlir modeli | Rewarded ads + interstitial + almaz və silah satışı + Battle Pass |

---

## 1. Hekayə (qısa)

İl 2050. **Overmind** adlı süni intellekt robot fabriklərini ələ keçirib. Oyunçu xüsusi təyinatlı **Iron Strike** dəstəsinin son əsgəridir. Səhra bazasından kosmik stansiyaya qədər 5 cəbhədə robot ordusunu dağıtmalıdır.

Real ölkə, bayraq və ya müharibə istifadə olunmur. Bu həm Google Play siyasətinə uyğundur, həm də reklam şəbəkələrinin oyuna daha çox reklam verməsinə kömək edir.

---

## 2. İdarəetmə

| Hərəkət | Telefon | Kompüter (test) |
|---|---|---|
| Hərəkət | Ekranın istənilən yerinə barmaq qoyub sürüşdürmək (virtual joystick) | WASD / oxlar |
| Atəş | Avtomatik: əsgər məsafədəki ən yaxın düşmənə nişan alır | Avtomatik |
| Pauza | Yuxarı sağ düymə | Esc |

Bir barmaqla oynanılır. Oyunçunun əsas işi düşmən güllələrindən yayınmaqdır.

---

## 3. Əsas döngü (Core Loop)

```
ENERGY → PLAY STAGE → EARN COINS / DIAMONDS → UPGRADE WEAPONS → HARDER STAGES
   ↑                                                              │
   └────── regen / watch ad / diamonds ←──────────────────────────┘
```

---

## 4. Kampaniya

| Fəsil | Məkan | Mərhələ | Boss | Yeni düşmən |
|---|---|---|---|---|
| 1 | Desert Outpost | 1–10 | Spider Tank | Drone, Trooper, Heavy |
| 2 | Ruined City | 11–20 | Mech Titan | Sniper Bot, Kamikaze |
| 3 | Frozen Peaks | 21–30 | Drone Carrier | Shield Bot |
| 4 | Deep Lab | 31–40 | Hydra Bot | Spawner, Laser Turret |
| 5 | Orbital Station | 41–50 | The Overmind | Elite versiyalar |

**Mərhələnin quruluşu:** 3–4 düşmən dalğası, 60–120 saniyə. Hər 5-ci mərhələ mini-boss, hər 10-cu mərhələ fəsil boss-u ilə bitir.

**Ulduzlar:**

| Ulduz | Şərt |
|---|---|
| 1 | Mərhələni bitirmək |
| 2 | Canın 35%-dən çoxu ilə bitirmək |
| 3 | Canın 70%-dən çoxu ilə bitirmək |

Hər fəsildə 10, 20 və 30 ulduz yığılanda **Star Chest** açılır.

**Çətinlik artımı:** düşmənlərin canı və zərbəsi hər mərhələdə +15%.

---

## 5. Düşmənlər

| Düşmən | Davranış | Can | Zərbə |
|---|---|---|---|
| **Drone** | Sürətli, birbaşa oyunçunun üstünə uçur | 20 | 10 (toqquşma) |
| **Trooper** | Məsafə saxlayır, tək güllə atır | 45 | 8 |
| **Heavy** | Yavaş, qalın zirehli, 3 istiqamətə atəş açır | 140 | 20 / 8 |
| **Sniper Bot** | Qırmızı lazerlə nişan alır (1 saniyə xəbərdarlıq), sonra güclü atəş | 35 | 25 |
| **Kamikaze** | Yaxınlaşıb partlayır, partlayış zonası yerdə göstərilir | 25 | 30 |
| **Shield Bot** | Önü qalxanlıdır, yalnız arxadan və ya yandan vurulur | 80 | 10 |

**Boss-lar** (hər birində 3 faza):

| Boss | Hücumları |
|---|---|
| Spider Tank | Dairəvi güllə partlayışı, 3 güllə ilə nişanlı atəş, oyunçunun üstünə hücum (charge) |
| Mech Titan | Raket yağışı (yerdə nişan dairələri), yer zərbəsi dalğası |
| Drone Carrier | Drone buraxır, fırlanan lazer |
| Hydra Bot | 3 başlı, hər baş ayrıca məhv edilir |
| The Overmind | Bütün əvvəlki boss-ların hücumlarını qarışdırır |

---

## 6. Silahlar

| Silah | Nadirlik | Zərbə | Sürət (atəş/san) | Xüsusiyyət | Qiymət |
|---|---|---|---|---|---|
| Assault Rifle | Common | 12 | 6 | Balanslı | Başlanğıc |
| Shotgun | Rare | 9 × 5 | 1.6 | Yaxın məsafədə çox güclü | 1,200 coins |
| SMG | Rare | 7 | 12 | Sürətli, səpələnən | 2,500 coins |
| Laser Rifle | Epic | 30 | 4 | Düşmənin içindən keçir (pierce) | 250 almaz |
| Rocket Launcher | Epic | 60 + sahə | 1 | Partlayış zonası | 400 almaz |
| Plasma Cannon | Legendary | 45 | 5 | Pierce və yanma effekti | $9.99 paket |
| Railgun | Legendary | 200 | 0.7 | Bütün xətti deşir | 1,200 almaz və ya Battle Pass |

**Upgrade:** hər silahın 10 səviyyəsi var. Hər səviyyə zərbəni +10% artırır.
Qiymət: `100 × səviyyə^1.5` coins (Lv2 = 283, Lv5 = 1,118, Lv10 = 3,162).

**Gələcək əlavələr:** armor və helmet slotları, pet drone (köməkçi), silah skin-ləri.

---

## 7. Valyutalar

| Valyuta | Qazanılır | Xərclənir |
|---|---|---|
| **Coins** | Mərhələ mükafatı (`120 + 60 × mərhələ`), düşmənlərdən düşən sikkələr | Common və Rare silahlar, upgrade |
| **Diamonds** | Boss (25), Star Chest, gündəlik sandıq, reklam, **satış** | Epic/Legendary silahlar, enerji, revive, skin |
| **Energy** | Avtomatik bərpa, reklam, almaz | Mərhələyə giriş |

**Başlanğıc:** 500 coins, 50 almaz, 30 enerji.

---

## 8. Enerji sistemi

| Parametr | Dəyər |
|---|---|
| Maksimum | 30 |
| Mərhələ qiyməti | 5 (boss mərhələsi 8) |
| Bərpa | Hər 6 dəqiqədə 1 |
| Reklamla | +10 enerji, gündə 5 dəfə |
| Almazla | Tam doldurma 50 almaz |
| Pulsuz mərhələlər | 1–10 enerji tələb etmir |
| Uğursuz mərhələ | Enerjinin yarısı geri qaytarılır |

**Qayda:** enerji maksimumdan yuxarı yığıla bilər (reklam və hədiyyələrdən), amma avtomatik bərpa yalnız 30-a qədər işləyir.

---

## 9. Pul qazanma (Monetization)

### 9.1 Rewarded Ads
| Yer | Mükafat | Limit |
|---|---|---|
| Enerji bitəndə | +10 enerji | Gündə 5 |
| Ölüm ekranı | Revive: tam can, 2 saniyə toxunulmazlıq | Hər mərhələdə 1 |
| Qələbə ekranı | Coins x2 | Hər mərhələdə 1 |
| Gündəlik sandıq | Təsadüfi mükafat (ehtimallar göstərilir) | Gündə 1 pulsuz + 2 reklamla |
| Mağaza | 5 almaz | Gündə 3 |

### 9.2 Interstitial
- Yalnız Mərhələ 5-dən sonra, hər 3 mərhələdən bir.
- İki interstitial arasında minimum 3 dəqiqə.
- Ölüm ekranında heç vaxt göstərilmir.
- Remove Ads alana göstərilmir.

### 9.3 Mağaza (IAP)
| Məhsul | Qiymət | Məzmun |
|---|---|---|
| Starter Pack | $1.99 (birdəfəlik) | 300 almaz + SMG + 20 enerji |
| Diamonds S | $0.99 | 80 |
| Diamonds M | $4.99 | 500 |
| Diamonds L | $9.99 | 1,100 |
| Diamonds XL | $19.99 | 2,400 |
| Diamonds XXL | $49.99 | 6,500 |
| Plasma Cannon Pack | $9.99 | Plasma Cannon + 500 almaz |
| Remove Ads | $3.99 | Interstitial yoxdur, rewarded mükafatlar reklamsız verilir |
| Battle Pass | $4.99 / sezon (30 gün) | Gündəlik almaz, Railgun, eksklüziv skin-lər |

### 9.4 Sandıq ehtimalları (Google Play tələbi)
Təsadüfi mükafat verən hər sandıqda ehtimallar oyunçuya açıq göstərilməlidir.

**Daily Chest:**
| Mükafat | Ehtimal |
|---|---|
| 200–500 coins | 70% |
| 10–30 almaz | 25% |
| Shotgun (varsa, 50 almaz) | 5% |

---

## 10. İlk sessiya (Onboarding)

| Vaxt | Hadisə |
|---|---|
| 0:00–0:15 | Qısa intro: "The Overmind took the factories. You're all that's left." |
| 0:15–0:45 | Mərhələ 1 başlayır. "Drag anywhere to move. You fire automatically." |
| 0:45–2:00 | Yalnız Drone-lar, oyunçu idarəetməni öyrənir |
| 2:00 | Qələbə: 3 ulduz, coins, "x2 with ad" təklifi |
| 2:30 | Armory açılır: ilk upgrade pulsuz |
| 3:00–6:00 | Mərhələ 2–3, Trooper və Heavy ilə tanışlıq |
| Mərhələ 5 | Mini-boss və Starter Pack təklifi |

---

## 11. Vizual üslub

**Palitra:** Gunmetal `#14181F`, Steel `#232A35`, Hazard Orange `#FF7A1A`, Energy Cyan `#3DE0FF`, Diamond `#B98CFF`, Alert Red `#FF3B4E`.

**Effektlər:** atəş alovu (muzzle flash), partlayış hissəcikləri, ekran titrəməsi, zərbə rəqəmləri, düşmənin vurulanda ağ yanıb-sönməsi, telefonun vibrasiyası.

### Prompt: App Icon
```
Mobile game app icon, a futuristic special forces soldier in dark armor with a glowing orange visor, aiming a sci-fi rifle forward, a giant red-eyed spider robot silhouette behind, orange and cyan rim lighting, dramatic low angle, stylized 3D render, high contrast, bold readable silhouette, no text, 1024x1024
```

### Prompt: Fəsil 1 fonu
```
Top-down view of a futuristic desert military outpost, sand dunes, metal crates, landing pad markings, scattered debris and scorch marks, orange hazard stripes, soft dusk lighting, stylized 3D game environment art, seamless tileable ground texture, no characters, 1080x1920
```

### Prompt: Boss: Spider Tank
```
Top-down game sprite of a giant six-legged spider tank robot, dark gunmetal armor, glowing red sensor eye, twin cannons on top, hazard orange stripes, sci-fi military design, stylized 3D render, transparent background, centered, orthographic top view
```

---

## 12. Texniki plan

| Hissə | Seçim |
|---|---|
| Prototip | HTML5 Canvas + JavaScript, tək fayl |
| Final versiya | Phaser 3 və ya Godot (performans testindən sonra seçiləcək) |
| Android build | Capacitor → Android Studio → AAB |
| Reklam | AdMob + UMP consent (GDPR) |
| IAP | Google Play Billing |
| Analitika | Firebase: mərhələ keçid faizi, ölüm yerləri, reklam baxışları |
| Saxlama | Lokal + Google Play Games cloud save |
| Anti-cheat | Server tərəfdə alış yoxlaması (receipt validation) |

**Hüquqi tələblər:** Privacy Policy, 13+ yaş reytinqi, Data safety formu, sandıq ehtimallarının göstərilməsi, real silah markalarının istifadə olunmaması.

---

## 13. Prototip scope (v0.1)

**Daxildir:**
- Mərhələ 1–3, Mərhələ 3-də Spider Tank (mini-boss kimi)
- Drone, Trooper, Heavy
- 4 silah: Assault Rifle, Shotgun, SMG, Laser Rifle. Alış və upgrade
- Enerji: bərpa, reklamla +10, almazla doldurma
- Revive (reklam və ya almaz), coins x2, gündəlik sandıq (ehtimallarla)
- Mağaza: almaz paketləri, Starter Pack, Remove Ads (test alışları)
- Ulduz sistemi, səs effektləri

**Prototipdə fərqli olan:** enerjini yoxlamaq mümkün olsun deyə pulsuz mərhələ sayı 10 yox, 1-dir.

---

## 14. Uğur göstəriciləri (təxmini orientirlər)

| Göstərici | Hədəf |
|---|---|
| D1 retention | 40%+ |
| D7 retention | 15%+ |
| Mərhələ 10-a çatanlar | 30%+ |
| Gündəlik oyunçu başına rewarded ad | 3–5 |
| Ödəniş edən oyunçular | 1–3% |

---

## 15. Marketinq (TikTok / Reels)

1. **Boss döyüşü:** "Can you beat the Spider Tank with a pistol?"
2. **Silah müqayisəsi:** "Shotgun vs Laser Rifle" eyni mərhələdə
3. **Fail / near-miss:** 1 HP ilə qələbə anı
4. **Upgrade transformasiyası:** Lv1 və Lv10 silah yan-yana

---

## 16. Növbəti addımlar

1. Prototipi oynamaq və rəy vermək
2. Mərhələ 4–10, Spider Tank-ın tam 3 fazalı versiyası
3. AI art: personaj, düşmənlər, fon
4. Final engine seçimi və Android build
5. AdMob və Billing inteqrasiyası, closed testing
