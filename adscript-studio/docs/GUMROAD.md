# Gumroad: quraşdırma təlimatı və hazır mətnlər

Bu sənəd iki hissədən ibarətdir:
1. **Quraşdırma (Azərbaycan dilində):** Gumroad-da nə etməli, addım-addım.
2. **Hazır mətnlər (ingilis dilində):** məhsul adları, təsvirlər, alışdan sonrakı mesaj və cover şəkli prompt-ları. Müştəri xaricdə olduğu üçün mətnlər ingiliscədir, birbaşa kopyala-yapışdır.

Qiymətlər nümunədir. Gumroad-ın hazırkı komissiyasını öz hesabında yoxla və qiyməti ona görə dəqiqləşdir.

| Paket | Kredit | Qiymət | 1 kredit | Kimin üçün |
|---|---|---|---|---|
| Starter | 20 | $5 | $0.25 | Sınamaq istəyən, kiçik mağaza |
| Creator | 60 | $12 | $0.20 | Hər həftə reklam çəkən creator / mağaza |
| Agency | 200 | $29 | $0.145 | SMM agentlik, çox müştərili freelancer |

---

## 1. Quraşdırma

### 1.1. Hər paket üçün məhsul yarat
Gumroad → **Products → New product** → növ: **Digital product**. Üç məhsul yaradacaqsan: Starter, Creator, Agency.

Hər məhsulda:
1. **Name**, **Description**, **Summary** sahələrinə aşağıdakı (2-ci hissə) mətnləri yapışdır.
2. **Price** sahəsinə qiyməti yaz. "Let customers pay what they want" seçimini **söndür**.
3. **Call to action** (düymə mətni): `Buy now` seçin.
4. **License key** bölməsində **"Generate a unique license key per sale"** seçimini **aktiv et**. Bu olmadan sistem işləməyəcək.
5. Həmin bölmədə görünən **product ID**-ni kopyala.
6. **Content** (alışdan sonra müştərinin gördüyü səhifə) bölməsinə "Post-purchase content" mətnini yapışdır.
7. **Quantity:** müştəri eyni paketdən bir neçə ədəd alsa, sistem krediti avtomatik ədədə vurur. Bunu söndürmək istəsən, məhsulda limit qoy.
8. Məhsulu **Publish** et və linkini kopyala (`https://ADIN.gumroad.com/l/...`).

### 1.2. Tətbiqə bağla
`.env.local` faylında (və Vercel → Environment Variables-da) `GUMROAD_PRODUCTS`-ı doldur:

```
GUMROAD_PRODUCTS=[{"productId":"STARTER_ID","name":"Starter","credits":20,"price":"\$5","url":"https://ADIN.gumroad.com/l/starter"},{"productId":"CREATOR_ID","name":"Creator","credits":60,"price":"\$12","url":"https://ADIN.gumroad.com/l/creator"},{"productId":"AGENCY_ID","name":"Agency","credits":200,"price":"\$29","url":"https://ADIN.gumroad.com/l/agency"}]
```

- `STARTER_ID` və digərlərini 1.1-in 5-ci addımındakı product ID-lərlə əvəz et.
- `credits` rəqəmi Gumroad təsvirindəki rəqəmlə **eyni** olmalıdır.
- Qiymətdə `\$` yaz (backslash ilə), yoxsa Next.js `$5`-i dəyişən kimi oxuyub silir.

### 1.3. Refund-ları avtomatik izləmək (tövsiyə olunur)
Gumroad-da kimsə refund alanda və ya chargeback edəndə tətbiq həmin alışın kreditlərini avtomatik geri götürür. Kredit balansı mənfiyə düşmür: müştəri kreditləri artıq xərcləyibsə, balans 0 olur.

1. Təsadüfi token yarat: terminalda `openssl rand -hex 24`. Onu `GUMROAD_WEBHOOK_TOKEN` olaraq `.env.local`-a və Vercel-ə əlavə et.
2. Gumroad → **Settings → Advanced → Applications**: yeni application yarat və **"Generate access token"** düyməsi ilə access token al.
3. Terminalda bu iki əmri işə sal (`ACCESS_TOKEN`, domen və token-i öz dəyərlərinlə əvəz et):

```bash
curl https://api.gumroad.com/v2/resource_subscriptions -X PUT \
  -d access_token=ACCESS_TOKEN \
  -d resource_name=refund \
  -d "post_url=https://SƏNİN-DOMENİN/api/gumroad/webhook?token=GUMROAD_WEBHOOK_TOKEN"

curl https://api.gumroad.com/v2/resource_subscriptions -X PUT \
  -d access_token=ACCESS_TOKEN \
  -d resource_name=dispute \
  -d "post_url=https://SƏNİN-DOMENİN/api/gumroad/webhook?token=GUMROAD_WEBHOOK_TOKEN"
```

> Bu əmrlər Gumroad API sənədlərindəki `resource_subscriptions` endpoint-inə əsaslanır. İşə salmazdan əvvəl gumroad.com/api səhifəsində endpoint-in və parametrlərin dəyişmədiyini yoxla.

Təhlükəsizlik: Gumroad-ın göndərdiyi bildirişə kor-koranə inanılmır. Tətbiq hər bildirişdən sonra Gumroad API-dan alışın həqiqətən refund olunub-olunmadığını özü yoxlayır, kreditləri yalnız ondan sonra götürür.

### 1.4. Test alışı (launch-dan əvvəl mütləq)
1. Gumroad-da Starter məhsulu üçün **100% endirim kodu** yarat (Checkout → Discounts).
2. Həmin kodla öz məhsulunu "al" və license key-i email-dən götür.
3. Tətbiqdə **Redeem license key** bölməsinə yapışdır: 20 kredit əlavə olunmalıdır.
4. Eyni açarı yenidən yapışdır: "already redeemed" xətası çıxmalıdır.
5. Endirim kodunu sil və ya deaktiv et.

### 1.5. Gumroad profil səhifəsi
Profilin **Bio** hissəsinə yaz:
> AI tools for e-commerce brands and creators. AdScript Studio turns any product into a TikTok & Reels ad script with ready-to-use AI prompts.

Profilə tətbiqin linkini əlavə et.

---

## 2. Hazır mətnlər (ingilis dili)

### 2.1. Starter (20 credits)

**Name**
```
AdScript Studio: Starter Pack (20 AI Ad Scripts)
```

**Summary** ("You'll get…" sətri)
```
20 credits for AdScript Studio = 20 complete TikTok / Reels ad packs. Credits never expire.
```

**Description**
```
Turn any product into a scroll-stopping TikTok, Instagram Reels or YouTube Shorts ad in about 30 seconds.

Each credit gives you one complete ad pack:
• 3 hook variations for the first 3 seconds
• A second-by-second script with camera directions
• On-screen text and voiceover for every scene
• A copy-paste AI image prompt for every scene
• A copy-paste AI video (image-to-video) prompt for every scene
• Caption, CTA and 8–15 relevant hashtags
• Background music mood suggestion

Built for e-commerce brands, dropshippers, Shopify stores and UGC creators.

HOW IT WORKS
1. Buy this pack. You get a license key by email instantly.
2. Sign in at [YOUR-APP-URL] (new accounts get 3 free ad packs).
3. Paste your license key in "Redeem license key". 20 credits are added.
4. Describe your product, pick the platform and style, and generate.

GOOD TO KNOW
• Credits never expire. No subscription.
• If a generation fails, the credit is returned automatically.
• The AI only uses facts you provide. It never invents reviews, prices or claims.
• The tool writes scripts and prompts. It does not render the video itself.

Not sure yet? Try 3 ad packs free first at [YOUR-APP-URL].
```

### 2.2. Creator (60 credits)

**Name**
```
AdScript Studio: Creator Pack (60 AI Ad Scripts)
```

**Summary**
```
60 credits = 60 complete TikTok / Reels ad packs. Best value for weekly creators. Credits never expire.
```

**Description**
```
For creators and stores that test new ads every week.

60 credits = 60 complete short-form video ad packs, 20% cheaper per ad than the Starter Pack.

Each ad pack includes:
• 3 hook variations
• A second-by-second script with camera directions
• On-screen text and voiceover for every scene
• AI image + AI video prompts for every scene, ready to copy
• Caption, CTA, hashtags and a music suggestion

Testing many hooks and angles is how winning ads are found. With 60 credits you can test 3–4 angles for every product you sell.

HOW IT WORKS
1. Buy this pack. Your license key arrives by email instantly.
2. Sign in at [YOUR-APP-URL].
3. Paste the key in "Redeem license key". 60 credits are added.
4. Generate ads whenever you need them. Credits never expire.

If a generation fails, the credit is returned automatically. No subscription.
```

### 2.3. Agency (200 credits)

**Name**
```
AdScript Studio: Agency Pack (200 AI Ad Scripts)
```

**Summary**
```
200 credits = 200 complete ad packs for client work. Lowest price per ad. Credits never expire.
```

**Description**
```
For social media managers, agencies and freelancers producing ads for many clients.

200 credits = 200 complete TikTok / Reels / Shorts ad packs, the lowest price per ad.

Each ad pack includes:
• 3 hook variations
• A second-by-second script with camera directions
• On-screen text and voiceover for every scene
• AI image + AI video prompts for every scene
• Caption, CTA, hashtags and a music suggestion
• One-click "Copy everything" and .txt download, ready to send to a client or editor

Why agencies use it:
• Go from client brief to a full script in under a minute
• Keep product visuals consistent across AI-generated scenes
• Deliver more concepts per client without more hours

HOW IT WORKS
1. Buy this pack. Your license key arrives by email instantly.
2. Sign in at [YOUR-APP-URL].
3. Paste the key in "Redeem license key". 200 credits are added.

Credits never expire. If a generation fails, the credit is returned automatically.
```

### 2.4. Post-purchase content (hər üç məhsul üçün eyni)
Bu mətn alışdan dərhal sonra müştəriyə göstərilir.

```
Thanks for your purchase!

Your license key is shown on this page and in your receipt email.

To add your credits:
1. Go to [YOUR-APP-URL]/login and sign in (Google or email).
2. In the dashboard, find "Redeem license key".
3. Paste your license key and click "Add credits".

Your credits appear instantly and never expire.

Tips for better ads:
• Describe your product with real facts: what it is, who it's for, the main benefit, price/offer.
• Upload a clear product photo so the AI prompts describe your product exactly.
• Generate 2–3 different styles (e.g. UGC + Problem → Solution) and test them.

Need help? Email [SUPPORT EMAIL]. We usually reply within 24 hours.
```

### 2.5. Refund policy (Gumroad məhsul səhifəsi və Terms üçün)
```
Unused credit packs can be refunded within 14 days of purchase. Email [SUPPORT EMAIL] with your receipt. Credits from a refunded purchase are removed from your account.
```

### 2.6. Cover və thumbnail şəkilləri üçün prompt-lar
Gumroad cover: **1280×720**, thumbnail: **600×600** (kvadrat). Hər paket üçün eyni üslubu saxla, yalnız rəqəmi dəyiş.

**Cover (1280×720)**
```
Realistic studio product photography, a modern smartphone standing upright on a matte black surface, the screen shows a vertical short-form video ad of a skincare bottle with bold white captions, around the phone floating translucent UI cards labeled "HOOK", "SCENE 1 0-3s", "IMAGE PROMPT", "VIDEO PROMPT", soft pink-red (#ff3d68) rim light from the left, cool blue fill light from the right, shallow depth of field, cinematic, clean minimal composition, lots of negative space on the right side for text, 16:9, high detail, no logos, no real brand names
```

**Thumbnail (600×600): Starter / Creator / Agency**
```
Minimal bold graphic, dark charcoal background (#0f1115), large white number "20" in the center with the word "AD SCRIPTS" underneath in small caps, a small pink-red (#ff3d68) play-button icon above the number, subtle soft glow, flat design, perfectly centered, square 1:1, no other text
```
Creator üçün `"20"`-ni `"60"`, Agency üçün `"200"` ilə əvəz et.

> Cover-də mətni AI ilə deyil, Canva və ya Figma-da əlavə et (məsələn "AdScript Studio · AI ad scripts for TikTok & Reels"). AI generatorları mətni çox vaxt səhv yazır.

---

## 3. Yoxlama siyahısı

- [ ] 3 məhsul yaradılıb, hər birində license key aktivdir
- [ ] Mətnlərdə `[YOUR-APP-URL]` və `[SUPPORT EMAIL]` əvəz olunub
- [ ] Product ID-lər və kredit sayları `GUMROAD_PRODUCTS`-da düzgündür
- [ ] Refund webhook-u qoşulub (1.3)
- [ ] 100% endirim kodu ilə test alışı edilib və redeem işləyib (1.4)
- [ ] Test endirim kodu silinib
