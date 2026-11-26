# 16 — Proqramlı Upload (YouTube Data API)

Bu proqram öz kompüterində işləyir. `videos/` qovluğuna qoyduğun hər hazır videonu YouTube-a **private + scheduled** kimi yükləyir. Video təqvimdəki vaxtda (`schedule.json`) özü public olur. Başlıq, təsvir, teqlər, kateqoriya, "altered content" etiketi, thumbnail və playlist avtomatik doldurulur. Metadata epizod `.md` fayllarından oxunur.

## Vacib məhdudiyyət: Google API audit
Google qaydasına görə, **audit keçməmiş API layihəsi ilə yüklənən videolar private olaraq kilidlənir** və planlanmış vaxtda public olmur. Bu, şəxsi layihələrə də aiddir. Audit üçün müraciət: Google Cloud Console → YouTube Data API → "YouTube API Services - Audit and Quota Extension Form". Cavab adətən bir neçə həftə çəkir. Bu müddəti Google müəyyən edir, mən zəmanət verə bilmərəm.

Ona görə 2 rejim var:

| Rejim | Nə vaxt | Necə |
|---|---|---|
| **A. YouTube Studio planlaşdırması** (indi, audit gözləmədən) | İlk həftələr | Hər video hazır olanda Studio-da Upload → Visibility → **Schedule**. Vaxtlar `schedule.json`-dadır (`python uploader.py status`). Faktiki olaraq bu da proqramlı yayımdır: bir dəfə yükləyirsən, YouTube vaxtında özü açır |
| **B. Bu uploader** | Audit təsdiqləndikdən sonra | `python uploader.py`: bütün hazır videoları bir komanda ilə yükləyir və planlaşdırır |

Audit gəlməmiş B rejimini sınasan, video yüklənəcək, amma private qalacaq. Belə videonu silib Studio-da yenidən yükləməli olacaqsan.

## Quraşdırma (bir dəfə, ≈20 dəq)
1. **Python 3.10+** quraşdır.
2. Bu qovluqda: `pip install -r requirements.txt`
3. **Google Cloud Console** (console.cloud.google.com):
   1. Yeni layihə: `salimofff-garage-uploader`
   2. APIs & Services → Library → **YouTube Data API v3** → Enable
   3. OAuth consent screen → External → app adı, e-poçt → Test users-ə kanalın Google hesabını əlavə et
   4. Credentials → Create credentials → **OAuth client ID** → Application type: **Desktop app** → JSON-u yüklə
   5. JSON-u bu qovluğa `client_secret.json` adı ilə qoy. **Heç kimə göndərmə, git-ə əlavə etmə** (`.gitignore`-da var).
4. `python uploader.py auth`: brauzer açılır, kanalın hesabı ilə daxil ol. `token.json` yaranır.
5. `config.example.json`-u `config.json` adı ilə kopyala, playlist ID-lərini yaz.

## Hər yayım dövründə
1. Montajdan sonra faylı adına görə qoy:
   - `videos/EP001.mp4`, `videos/L01.mp4`, `videos/MM01.mp4`, `videos/PR01.mp4` ...
   - Uzun video thumbnail-i: `thumbnails/L01.jpg` (1280x720, 2 MB-dan az)
2. Yoxla: `python uploader.py --dry-run`
3. Yüklə: `python uploader.py` (və ya yalnız birini: `python uploader.py --only EP001`)
4. Nəticə `uploaded.json`-a yazılır. Təkrar işə salsan, artıq yüklənmiş videolar ötürülür.

## Əmrlər
| Əmr | Nə edir |
|---|---|
| `python uploader.py status` | Bütün təqvim: tarix, ID, növ, vəziyyət (`-` / `ready` / `uploaded`) |
| `python uploader.py schedule --start 2026-11-28` | Başlanğıc gecikərsə, bütün təqvimi yeni tarixdən yenidən qurur |
| `python uploader.py --dry-run` | API-yə müraciət etmədən nəyin yüklənəcəyini göstərir |
| `python uploader.py` | Hazır olan hər şeyi yükləyir və planlaşdırır |
| `python test_uploader.py` | Offline testlər (API lazım deyil) |

## Qoruyucu qaydalar (proqramda)
- Yayım vaxtına 15 dəqiqədən az qalıbsa, video yüklənmir. Səbəb göstərilir: vaxtı `schedule.json`-da dəyiş və ya Studio-da əl ilə yüklə.
- Başlıqda və ya təsvirdə doldurulmamış placeholder varsa (`[CAR MODEL]`, `@username`, EP011-də olduğu kimi), video yüklənmir. `schedule.json`-da həmin sətirləri doldur.
- Başlıq 100, təsvir 5000, teqlər 500 simvol limitindən keçmir. `<` və `>` işarələri yoxlanılır.
- Server xətalarında (5xx) upload 6 dəfəyə qədər avtomatik təkrarlanır.

## Kvota
YouTube Data API-nin standart gündəlik kvotası 10 000 unit-dir. Bir video yükləmək Google sənədlərinə görə təxminən 1 600 unit-dir (dəqiq rəqəm dəyişə bilər, Cloud Console → Quotas bölməsində yoxla). Deməli, gündə təxminən 6 video yükləmək olar. Bu təqvimdə ən çox günə 4 video düşür, kvota bəs edir. Ən rahat yol: hər 2 günün 3 Short-unu bir dəfəyə yükləmək.

## Avtomatlaşdırma (könüllü)
Videoları `videos/` qovluğuna Google Drive və ya n8n ilə sinxronlaşdırırsansa, Windows Task Scheduler-də hər 3 saatdan bir `python uploader.py` işə sal. Proqram yalnız yeni hazır olan faylları yükləyir.
