# DEPLOY — Zero-Touch System-i canlıya çıxarmaq

Bu sənəd iki təşkilatı (Studio və YouTube) Replit-də 24/7 işlədən addımları təsvir edir. Komandalar və dəyişən adları ingiliscədir, izahlar Azərbaycan dilində.

> Əmin olmadığım yerləri **[yoxla]** kimi işarələmişəm: platformaların interfeysi tez-tez dəyişir.

---

## 0. Ümumi mənzərə

```
GitHub repo (eyni kod)
   ├── Replit layihəsi A: zt-studio   ORG=studio   data/studio.db   öz Secrets-i
   └── Replit layihəsi B: zt-youtube  ORG=youtube  data/youtube.db  öz Secrets-i
```

- Hər layihə yalnız öz `orgs/<ORG>/` kodunu yükləyir (`tests/test_isolation.py` bunu yoxlayır).
- Hər layihənin öz Anthropic açarı, öz bazası, öz WhatsApp prefiksi (`[STUDIO]`, `[YOUTUBE]`) var.
- 24/7 işləmək üçün **Reserved VM Deployment** lazımdır: Autoscale deployment sorğu olmayanda yuxuya gedir və cron-lar işləmir.

---

## 1. Lazım olan hesablar və açarlar

| Xidmət | Nə üçün | Hansı Repl-də |
|--------|---------|---------------|
| Anthropic Console | Agentlər (Claude API) | Hər ikisində, **ayrı açarla** |
| Twilio | WhatsApp bildirişləri | Hər ikisində |
| Gumroad | Satış ping-i, satış yoxlaması | Studio |
| Google Cloud | YouTube Data API v3, YouTube Analytics API, OAuth | YouTube |
| ElevenLabs | Səs (TTS) | YouTube |
| OpenAI | Səhnə şəkilləri (`gpt-image-1`) | YouTube |

Anthropic Console-da hər açar üçün ayrıca **workspace + aylıq spend limit** qoy. Bu, koddakı `DAILY_BUDGET_USD`-dən əlavə ikinci qoruyucudur.

---

## 2. Replit layihələrini yaratmaq

Hər təşkilat üçün ayrıca (iki dəfə) təkrarla:

1. Replit → **Create** → **Import from GitHub** → bu repo.
2. Kod `zero-touch-system/` alt qovluğundadır. Repl-in **Run** komandasını belə təyin et (repo kökündəki `.replit` faylında və ya Repl ayarlarında):
   ```
   cd zero-touch-system && pip install -r requirements.txt && python app.py
   ```
3. **Sistem paketləri** (yalnız YouTube Repl-i üçün mütləqdir, Studio-da PDF şrifti üçün də faydalıdır): `ffmpeg` və DejaVu şriftləri. Replit-də bunlar Nix paketləri kimi əlavə olunur (Dependencies → System və ya `replit.nix`) **[yoxla: Replit-in cari interfeysi]**. Shell-də yoxla:
   ```
   ffmpeg -version && fc-list | grep -i dejavu
   ```
   DejaVu tapılmasa `PDF_FONT_PATH`-ı mövcud bir TTF şriftinə yönəlt.
4. Shell-də testləri bir dəfə işlət:
   ```
   cd zero-touch-system && python -m pytest -q && python scripts/dry_run.py --org studio && python scripts/dry_run.py --org youtube
   ```

---

## 3. Secrets (Replit → Secrets)

Heç bir dəyəri koda, `.env`-ə və ya git-ə yazma. Bütün dəyişənlərin siyahısı `.env.example`-dadır.

### Hər iki Repl

| Açar | Studio | YouTube | Qeyd |
|------|--------|---------|------|
| `ORG` | `studio` | `youtube` | Məcburi |
| `ADMIN_TOKEN` | uzun təsadüfi | uzun təsadüfi | `python -c "import secrets;print(secrets.token_urlsafe(32))"` |
| `ANTHROPIC_API_KEY` | açar A | açar B | Ayrı açarlar |
| `DAILY_BUDGET_USD` | `2` (başlanğıc) | `3` (başlanğıc) | Sonra artır |
| `WHATSAPP_PROVIDER` | `twilio` | `twilio` | Test üçün `console` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `WHATSAPP_TO` | ✓ | ✓ | Nömrələr `+994...` formatında |

### Yalnız Studio

| Açar | Dəyər |
|------|-------|
| `GUMROAD_ACCESS_TOKEN` | Gumroad tətbiq tokeni (aşağıda) |
| `GUMROAD_PING_SECRET` | uzun təsadüfi sətir (URL-də istifadə olunur) |
| `GUMROAD_PUBLISH_MODE` | `draft` (tövsiyə) |
| `GUMROAD_FEE_PERCENT`, `GUMROAD_FEE_FIXED_USD` | Öz Gumroad planına görə |
| `SIGNAL_SOURCES` | `reddit,hackernews` |

### Yalnız YouTube

| Açar | Dəyər |
|------|-------|
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | Google OAuth (bölmə 7) |
| `YT_NICHE` | Məs. `personal finance explained` (məcburi) |
| `YT_SEED_KEYWORDS` | Vergüllə, ən çox 3 istifadə olunur |
| `TTS_API_KEY` | ElevenLabs |
| `YT_VOICE_ID` | ElevenLabs səs ID-si (istifadə hüququn olan səs) |
| `MEDIA_GEN_API_KEY` | OpenAI |
| `TTS_USD_PER_1K_CHARS`, `IMAGE_USD_EACH` | **Real tariflərini yaz** — default-lar yer tutucudur |
| `YT_UPLOAD_QUOTA_COST` | Cloud Console-da gördüyün real dəyər (default 1600) |

---

## 4. Deploy (Reserved VM)

1. Replit → **Deploy** → **Reserved VM**.
2. Run komandası — iki variant:
   - **A (sadə, tövsiyə olunur):** bir proses, scheduler + runner + HTTP birlikdə:
     ```
     cd zero-touch-system && python app.py
     ```
   - **B (gunicorn ilə):** HTTP üçün gunicorn, işlər üçün **bir** worker prosesi:
     ```
     cd zero-touch-system && (python worker.py &) && gunicorn -w 2 -b 0.0.0.0:$PORT wsgi:app
     ```
     `worker.py`-ı heç vaxt iki dəfə işə salma, yoxsa cron-lar iki dəfə işləyər.
3. Health check yolu: `/health`.
4. Deploy-dan sonra yoxla:
   ```
   curl https://<repl-domain>/health
   ```
   `{"org": "...", "queue": 0, "kill_switch": false, ...}` görməlisən.

### Məlumatın qorunması — vacib risk

Replit-in rəsmi sənədində Reserved VM-in yerli fayl sisteminin **redeploy zamanı qorunub-qorunmadığı təsdiqlənmədi**; icma mənbələri itə biləcəyini deyir. SQLite bazası (`data/*.db`) burada saxlanır. Buna görə:

- **Hər redeploy-dan əvvəl** bazanı yüklə:
  ```
  curl -H "X-Admin-Token: $ADMIN_TOKEN" -o studio-backup.db https://<repl-domain>/admin/backup
  ```
  Bu, işləyən sistemdən ardıcıl (consistent) kopyadır.
- Redeploy-dan sonra baza boş açılırsa, köhnə run-lar itib deməkdir. Satış jurnalı Gumroad-da, videolar YouTube-da qalır, amma lokal tarixçə və direktivlər itir.
- Uzunmüddətli həll (v2): bazanı Replit PostgreSQL-ə köçürmək. Hazırda kod yalnız SQLite dəstəkləyir.

---

## 5. Gumroad

1. **Access token:** Gumroad → Settings → Advanced → Applications → yeni tətbiq yarat → "Generate access token" **[yoxla]**. `GUMROAD_ACCESS_TOKEN` kimi saxla. Token olduqda hər ping Gumroad API ilə yoxlanılır və saxta ping qəbul edilmir.
2. **Ping URL:** Gumroad → Settings → Advanced → Ping **[yoxla]**:
   ```
   https://<studio-repl-domain>/webhooks/gumroad/<GUMROAD_PING_SECRET>
   ```
   Səhv secret ilə gələn sorğu `404` alır.
3. "Send test ping" düyməsi ilə yoxla. Test ping-in `test=true` sahəsi göndərdiyi təsdiqlənməyib; gəlməsə, test satışı ledger-ə yazıla bilər.
4. **Məhsul yaratma:** Gumroad API-də məhsul yaratmaq rəsmi təsdiqlənmədi, ona görə `GUMROAD_PUBLISH_MODE=draft` istifadə et. Hər yeni məhsul `data/drafts/<permalink>/` qovluğunda hazır olur (listing.json, listing.html, ZIP). WhatsApp mesajı yeri göstərir; faylları bir dəfə əl ilə Gumroad-a yükləyirsən.

---

## 6. Twilio WhatsApp

### Başlanğıc: Sandbox
1. Twilio Console → Messaging → Try it out → Send a WhatsApp message **[yoxla]**.
2. Telefonundan sandbox nömrəsinə göstərilən `join <kod>` mesajını göndər.
3. Secrets: `TWILIO_WHATSAPP_FROM` = sandbox nömrəsi, `WHATSAPP_TO` = öz nömrən.
4. Sandbox-un limitləri var (qoşulma müəyyən vaxtdan sonra yenilənməli ola bilər) **[yoxla: Twilio-nun cari sandbox qaydaları]**.

### Vacib məhdudiyyət: 24 saatlıq pəncərə
WhatsApp biznes tərəfindən başladılan mesajları yalnız sənin son mesajından sonrakı 24 saat ərzində sərbəst mətnlə göndərməyə icazə verir; bundan kənarda təsdiqlənmiş **template** lazımdır. Hazırkı adapter sərbəst mətn (`Body`) göndərir. Buna görə:
- Ən sadə həll: hər gün Twilio nömrəsinə istənilən qısa mesaj yaz (pəncərəni açıq saxlayır).
- Production həll (v2): Twilio-da WhatsApp sender qeydiyyatı + təsdiqlənmiş Content Template və adapterdə template dəstəyi.
- Mesaj getməsə, run dayanmır: xəta log-a yazılır, iş davam edir.

---

## 7. YouTube (Google Cloud + OAuth)

1. Google Cloud Console → yeni layihə.
2. **APIs & Services → Library:** `YouTube Data API v3` və `YouTube Analytics API`-ni aktiv et.
3. **OAuth consent screen:** User type "External", tətbiq adı, öz e-poçtun. Scopes: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`, `yt-analytics-monetary.readonly`.
   - Tətbiq **"Testing"** statusunda qalsa, refresh token-lər təxminən 7 gündən sonra etibarsız olur. 24/7 iş üçün tətbiqi **"In production"** statusuna keçir (yoxlanmamış tətbiq xəbərdarlığı göstərsə də, öz kanalın üçün işləyir) **[yoxla: Google-un cari siyasəti]**.
4. **Credentials → Create OAuth client ID → Desktop app.** Client ID və secret-i götür.
5. **Öz kompüterində** (Replit-də yox, çünki brauzer lazımdır):
   ```
   cd zero-touch-system
   python scripts/youtube_oauth.py --client-id <ID> --client-secret <SECRET>
   ```
   Kanalın sahibi olan hesabla daxil ol. Çap olunan `YT_REFRESH_TOKEN`-i YouTube Repl-inin Secrets-inə əlavə et.
6. **Audit:** auditdən keçməmiş API layihəsindən yüklənən videolar **private** qalır. Public dərc üçün Google-un "YouTube API Services Audit and Quota Extension" formunu doldur. Audit bitənə qədər sistem videoları private planlaşdırır; WhatsApp-a gələn linkdən əl ilə public edə bilərsən.
7. **Kvota:** Cloud Console → APIs → YouTube Data API v3 → Quotas. Default 10 000 unit/gün. `videos.insert`-in qiyməti mənbələrdə 100 və ya 1600 kimi göstərilir; real rəqəmi buradan götürüb `YT_UPLOAD_QUOTA_COST`-a yaz.
8. **Thumbnail:** xüsusi thumbnail üçün kanal təsdiqlənməlidir (telefonla). Təsdiq yoxdursa, thumbnail addımı keçilir və bu barədə WhatsApp-a qeyd gedir.
9. **AI açıqlaması:** sistem realistik AI media aşkar edəndə `containsSyntheticMedia=true` göndərir. Bunu söndürmə.

---

## 8. İlk canlı işə salma (yoxlama siyahısı)

**Studio Repl:**
1. `GUMROAD_PUBLISH_MODE=draft`, `DAILY_BUDGET_USD=2`.
2. Bir run başlat:
   ```
   curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" https://<studio-domain>/admin/run/studio_daily
   ```
3. Nəticəyə bax:
   ```
   curl -H "X-Admin-Token: $ADMIN_TOKEN" https://<studio-domain>/admin/runs/<run_id>
   ```
4. WhatsApp-a "Yeni məhsul hazırdır" mesajı gəlməlidir. Draft-ı (`data/drafts/...`) Replit Files-dan yüklə, keyfiyyətini yoxla, Gumroad-a yüklə.
5. 100% endirim kodu ilə özün test alışı et → "Yeni satış" mesajı gəlməlidir.

**YouTube Repl:**
1. İlk günlər `VIDEOS_PER_DAY=1`, `DAILY_BUDGET_USD=3`.
2. `/admin/run/youtube_daily` → WhatsApp-da "Yeni video planlaşdırıldı".
3. YouTube Studio-da videoya bax (private). İlk 7 gün hər videonu əl ilə yoxla, sonra avtomatik rejimə burax.

---

## 9. Gündəlik əməliyyat

| Nə | Necə |
|----|------|
| Vəziyyət | `GET /health` — növbə, kill switch, son run, qalan büdcə |
| Run detalları | `GET /admin/runs/<run_id>` və ya Shell-də `python scripts/replay.py --org studio <run_id> --full` |
| Son run-lar | `python scripts/replay.py --org studio` |
| Hər şeyi dayandır | `curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -d '{"reason":"..."}' -H "Content-Type: application/json" https://<domain>/admin/kill` |
| Yenidən aç | `curl -X DELETE -H "X-Admin-Token: $ADMIN_TOKEN" https://<domain>/admin/kill` |
| Baza kopyası | `GET /admin/backup` (bölmə 4) |
| Loglar | Deployment logs: hər sətir JSON-dur (`run_id`, `step`, `org`), açarlar `***` ilə maskalanır |

Kill switch avtomatik də işə düşür: 24 saatda 5 uğursuz run, və ya Banker / Growth Banker `critical` xəbərdarlığı. Aktiv olanda yalnız hesabat pipeline-ları işləyir.

**Açar rotasiyası:** açarı xidmətdə yenilə → Replit Secrets-də dəyiş → redeploy (əvvəlcə `/admin/backup`).

---

## 10. Məlum məhdudiyyətlər (v2 üçün)

1. SQLite bazanın redeploy zamanı qorunması təsdiqlənməyib → PostgreSQL-ə keçid.
2. Gumroad məhsulları əl ilə yüklənir (API ilə yaratma təsdiqlənməyib).
3. WhatsApp template dəstəyi yoxdur (24 saat pəncərəsi).
4. YouTube: AI video və stock b-roll provayderi yoxdur (şəkil + Ken Burns ilə əvəz olunur); `zoom`/`whip` keçidləri kəsik kimi; CTR metrikası gəlmir; pin şərhi əl ilə.
5. TTS və şəkil tarifləri konfiqurasiyadan gəlir — real tarifləri yazmasan, büdcə hesabı yanlış olar.
6. Real xarici API-lər (Gumroad, YouTube, ElevenLabs, OpenAI, Twilio) testlərdə mock ilə yoxlanılıb; ilk canlı işə salmada payload formatında xırda uyğunsuzluq çıxa bilər. Ona görə bölmə 8-dəki addımları kiçik büdcə ilə et.
