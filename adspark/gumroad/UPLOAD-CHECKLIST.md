# AdSpark — Gumroad-a yükləmə təlimatı

Bu qovluqdakı hər şey satışa hazırdır. Aşağıdakı addımları ardıcıl edin.

## Fayllar haradadır

| Nə | Fayl |
| --- | --- |
| Alıcının yükləyəcəyi paket | `gumroad/dist/AdSpark-v1.1.0.zip` |
| Cover (əsas şəkil, 16:9) | `gumroad/images/cover-1280x720.png` (daha kəskin: `cover-2560x1440.png`) |
| Thumbnail (kvadrat) | `gumroad/images/thumbnail-600x600.png` (daha kəskin: `thumbnail-1200x1200.png`) |
| Qalereya şəkilləri | `gumroad/images/gallery/01…08.jpg` |
| Listinq mətnləri | `gumroad/LISTING.md` |
| Nümunə PDF (preview kimi də yükləmək olar) | `docs/demo/sample-campaign.pdf` |

## Satışdan əvvəl mütləq edin

1. **Öz kompüterinizdə sınayın.** ZIP-i açın, `AdSpark.html`-i Edge-də açın, nümunə kampaniyaya baxın, bir kampaniya yaradıb PDF yükləyin. 5 dəqiqə çəkir.
2. **"AdSpark" adını yoxlayın.** Bu adda başqa məhsul və ya qeydiyyatdan keçmiş ticarət nişanı ola bilər. Mən bunu yoxlaya bilmədim. Google və Gumroad-da "AdSpark" axtarın. Konflikt varsa, adı dəyişmək lazım olacaq (dəyişməyə kömək edə bilərəm).
3. **Lisenziyanı oxuyun.** `gumroad/package/LICENSE.txt` adi istifadə üçün yazılıb, amma hüquqşünas tərəfindən yoxlanmayıb. Böyük həcmdə satışdan əvvəl baxdırmaq tövsiyə olunur.
4. **Qiyməti və refund siyasətini seçin.** Tövsiyə: $19, birdəfəlik ödəniş və 14 günlük "işləmirsə pulu qaytarılır" siyasəti. Qərar sizindir.

## Gumroad-da addım-addım

1. gumroad.com → **Products → New product**.
2. Növ: **Digital product**. Ad: `LISTING.md` → *Product name*. Qiymət: seçdiyiniz məbləğ.
3. **Product page** bölməsi:
   - **Description:** `LISTING.md` → *Description* blokunu kopyalayın. FAQ-ı da sonuna əlavə edin.
   - **Cover:** əvvəl `cover-2560x1440.png`, sonra qalereya şəkillərini `01`-dən `08`-ə qədər ardıcıl yükləyin.
   - **Thumbnail:** `thumbnail-1200x1200.png`.
   - **Summary:** `LISTING.md` → *Summary*.
   - **Product info** (varsa): `LISTING.md`-dəki cədvəl.
   - **URL:** `adspark` (boşdursa).
4. **Content** bölməsi:
   - `AdSpark-v1.1.0.zip` faylını yükləyin.
   - Post-purchase / receipt mesajı: `LISTING.md` → *Post-purchase message*.
5. **Settings:**
   - Tags: `LISTING.md` → *Tags*.
   - Category: Business & Money → Marketing (və ya ən yaxın marketinq kateqoriyası).
   - Refund policy: `LISTING.md` → *Refund policy*.
   - İstəsəniz endirim kodu: `LAUNCH30` (30%).
6. **Payout** ayarlarınızın (bank/PayPal) Gumroad hesabında qurulduğunu yoxlayın.
7. **Preview** ilə səhifəyə baxın, sonra **Publish**.
8. Yayımdan sonra öz məhsulunuzu 100% endirim koduyla "alıb" yükləməni yoxlayın.

## Satış zamanı vacib qaydalar

- Reklamda **"AI generator" yazmayın.** Məhsul şablon kitabxanası ilə işləyir və tətbiq bunu açıq göstərir. "AI" iddiası refund və şikayət səbəbi ola bilər. Dürüst ifadə: *"ad campaign planner"*, *"ad script & storyboard tool"*.
- Saxta rəy, reytinq və ya "1000+ istifadəçi" kimi rəqəmlər yazmayın.
- Dəstək: alıcılar qəbzə cavab yazacaqlar. Ən çox veriləcək suallar `LISTING.md` → FAQ-dadır.

## Yeniləmə buraxmaq

Kodda dəyişiklik etdikdən sonra:

```
npm run build:gumroad
```

Yeni `gumroad/dist/AdSpark-vX.Y.Z.zip` yaranır. Gumroad-da **Content** bölməsində köhnə faylı yenisi ilə əvəz edin. Alıcılar yeni versiyanı kitabxanalarından yükləyə bilərlər.

## Bilinən məhdudiyyətlər (alıcıya dürüst)

- Avtomatik testlər Linux-da Chromium mühərriki ilə (Chrome/Edge-in mühərriki) aparılıb. **Windows və macOS-da birbaşa sınanmayıb**, ona görə yuxarıdakı 1-ci addım vacibdir. **Firefox və Safari sınanmayıb**, START HERE Edge/Chrome tövsiyə edir.
- Məlumatlar brauzerdə saxlanılır. Brauzer məlumatları silinərsə, kampaniyalar itir (backup funksiyası var).
- Azərbaycan, türk və rus mətnləri diqqətlə yazılıb, amma ana dilli kopirayter tərəfindən yoxlanmayıb.
