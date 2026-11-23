# YouTube Agent

Ssenarini verirsiniz, qalan hər şeyi agent özü edir:

1. Ssenarini səhnələrə bölür.
2. Hər səhnə üçün realistik kadr prompt-u yazır.
3. Kadrları çəkir (OpenAI).
4. İstəyə görə bəzi səhnələri hərəkətə gətirir (Kie.ai).
5. Səsləndirmə edir (Fish Audio).
6. Uzun video (16:9) və Shorts (9:16) montaj edir.
7. Başlıq, təsvir, teq və thumbnail hazırlayır.
8. Hər ikisini seçdiyiniz kanala **private** yükləyir. Siz YouTube Studio-da baxıb **Public** edirsiniz.

Bir neçə kanal qoşmaq olar. Hər kanalın öz səsi, dili və kateqoriyası olur.

## 1. Quraşdırma (bir dəfə)

1. Python 3.10+ quraşdırın (python.org). Quraşdırmanın ilk ekranında **"Add Python to PATH"** qutusunu işarələyin.
2. ffmpeg quraşdırın. PowerShell-də bu əmri yazın:
   ```powershell
   winget install Gyan.FFmpeg
   ```
3. `youtube-ai-agent` qovluğunun ünvan sətrinə `powershell` yazıb Enter basın, sonra bu əmrləri yazın:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe run.py
   ```
4. Masaüstündə ikon yaratmaq üçün eyni PowerShell pəncərəsində bunu yazın:
   ```powershell
   $dir=(Get-Location).Path; $s=(New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\YouTube Agent.lnk"); $s.TargetPath="$dir\.venv\Scripts\python.exe"; $s.Arguments="run.py"; $s.WorkingDirectory=$dir; $s.Save()
   ```

## 2. API açarları (Ayarlar → API açarları)

| Servis | Nə üçün | Harada alınır |
|---|---|---|
| DeepSeek | prompt-lar, başlıq, təsvir | platform.deepseek.com → API keys |
| OpenAI | kadrlar (gpt-image-1) | platform.openai.com → API keys (balans: Billing) |
| Fish Audio | səs | fish.audio → Developers → API Keys |
| Kie.ai (könüllü) | hərəkətli səhnələr | kie.ai → API Key |

Hər açarı yapışdırın, **Yadda saxla**, sonra **Yoxla** basın.

## 3. YouTube-a qoşulmaq (bir dəfə, ~15 dəqiqə)

### 3.1. Google Cloud layihəsi
Google bəzən menyu adlarını dəyişir. Burada yazılan bənd tapılmasa, səhifədəki axtarışa adını yazın.

1. https://console.cloud.google.com saytını açın və kanalınızın Google hesabı ilə daxil olun.
2. Yuxarıda layihə seçicisini açın → **New Project** → ad yazın (məsələn `youtube-agent`) → **Create**.
3. **APIs & Services → Library** bölməsində `YouTube Data API v3` axtarın, açın və **Enable** basın.
4. **Google Auth Platform** (və ya **OAuth consent screen**) bölməsinə keçin:
   - **Get started** basın, tətbiqin adını (`YouTube Agent`) və email-inizi yazın;
   - **Audience** sualında **External** seçin, qalan addımları tamamlayın.
5. **Audience** bölməsində **Publish app** basın, sonra **Confirm**. Status **In production** olmalıdır.
   **Bu addımı keçməyin:** "Testing" rejimində Google girişi hər 7 gündən bir sıfırlayır.
6. **Clients** (və ya **Credentials**) bölməsində **Create client** basın:
   - Application type: **Desktop app**, ad yazıb **Create**.
   - **Download JSON** basın. Bu fayl `client_secret.json` faylıdır.

### 3.2. Proqramda
1. **Ayarlar → YouTube kanalları** bölməsində `client_secret.json` faylını seçin.
2. **+ Kanal əlavə et** basın. Brauzerdə Google girişi açılacaq:
   - hesabı seçin, sonra kanalı seçin (brand kanalınız varsa, siyahıda o da görünür);
   - **"Google hasn't verified this app"** xəbərdarlığı çıxacaq. Bu normaldır, çünki tətbiq sizin öz tətbiqinizdir. **Advanced → Go to YouTube Agent** basın;
   - bütün icazə qutularını işarələyin və **Continue** basın.
3. Kanal siyahıda görünəcək. Ona **Voice ID** yazın (Fish Audio → Voice Library → səs → URL-dəki `/m/`-dən sonrakı ID), həmçinin **dil** və **kateqoriya** (2 = Autos & Vehicles).

İkinci kanal üçün **+ Kanal əlavə et** düyməsini təkrar basın. Qoşulan kanalların hamısı eyni Google Cloud layihəsini istifadə edir: gündə ümumi 100 video yükləmək olar.

## 4. Gündəlik istifadə

1. **Studio** bölməsinə keçin.
2. Ssenarini yapışdırın (paraqraflar boş sətirlə ayrılır). İstəsəniz başlıq ideyası yazın.
3. Kanalı seçin, **Uzun video / Shorts** qutularını işarələyin.
4. **▶ Başla** basın.

İş növbəyə düşür. Bir neçə ssenari əlavə etsəniz, onlar bir-bir hazırlanır. Hər iş üçün addımlar, xərc və xəbərdarlıqlar görünür. Bitəndə **YouTube Studio** linki çıxır. Videoya baxıb **Public** edin.

- **Xəta çıxsa:** iş hansı addımda dayandığını və səbəbini yazır. Səbəbi düzəldib **Yenidən cəhd et** basın. Hazır olan kadrlar və səslər təkrar çəkilmir, yəni pul yenidən xərclənmir.
- **Proqram bağlansa:** yarımçıq iş "dayandı" vəziyyətinə keçir. **Yenidən cəhd et** basanda qaldığı yerdən davam edir.
- **Büdcə limiti:** standart olaraq $6-dır. Bu, gözlənilməz xərcə qarşı qorumadır. 8 dəqiqəlik video adətən ≈ $1.3–1.5 tutur (hərəkətsiz). Limit Ayarlarda dəyişdirilir.
- **Thumbnail:** YouTube custom thumbnail-i yalnız telefonla təsdiqlənmiş kanallara icazə verir. Kanal təsdiqlənməyibsə, video yenə yüklənir, sadəcə xəbərdarlıq çıxır.
- **Videolar** `output/` qovluğunda da saxlanılır (MP4, .srt, thumbnail).

## Texniki

- `app/`: `planner.py` (AI qərarları), `providers.py` (servislər), `render.py` (ffmpeg), `jobs.py` (növbə), `youtube.py`, `channels.py`, `main.py` (API), `static/` (interfeys).
- `data/`: açarlar, kanallar, tokenlər, işlər. **Heç kimə göndərməyin.**
- Testlər (saxta servislərlə, API-siz): `python -m pytest -q`
