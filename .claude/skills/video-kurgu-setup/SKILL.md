---
name: video-kurgu-setup
description: Claude ilə video montaj (kurgu) və motion üçün ilkin quraşdırma — iş qovluğunu açmaq, qovluq strukturunu qurmaq, FFmpeg, Whisper, HyperFrames (Node.js) və yt-dlp alətlərini quraşdırıb yoxlamaq. İstifadəçi "video montaj üçün quraşdır", "video-kurgu setup", "FFmpeg/Whisper/HyperFrames qur", "kiti oxu və məni quraşdırmadan keçir" deyəndə və ya video-kurgu / video-montaj skill-ləri alətlər tapılmadığı üçün işləməyəndə istifadə et.
---

# Video kurgu — quraşdırma (Kısım 1, Addım 1–2)

Mənbə: "Claude'la video kurgulamak için gereken her şey" kiti (@kerembarant), səh. 2–4.

## Əsas məntiq

Claude videonu Premiere kimi əllə montaj etmir. Kompüterdə **alətləri işə salır**:
səssiz yerləri kəsir, danışığı söz-söz mətnə çevirir, animasiyaların **kodunu yazıb**
videoya çevirir. İstifadəçi isə montajçıya deyirmiş kimi nə istədiyini deyir.

Bunun üçün iki şey vacibdir:
1. Claude-un fayllara (qovluğa) çıxışı olsun.
2. Claude istifadəçinin üslubunu bilsin → `style-rules` skill-i.

Bütün iş 4 addımdır: **1. Tətbiq və qovluq → 2. Alətlər → 3. Üslub (qayda faylı) → 4. Çək və göndər.**
Quraşdırma bir dəfə edilir (~30 dəq). Sonrakı videolarda yalnız 4-cü addım qalır.

## Lazım olanlar

| Nə | Qeyd |
|----|------|
| Kompüter | Mac və ya Windows. Telefonla çəkilmiş video kifayətdir. |
| Claude | Desktop tətbiqi + ödənişli plan. Tətbiqdəki **Code** bölməsi pulsuz planda yoxdur, Pro kifayətdir. |
| Alətlər | Hamısı pulsuz, Claude özü quraşdırır. |

## Addım 1 — Tətbiq və qovluq

İstifadəçiyə bu addımları izah et (bunlar istifadəçinin öz kompüterində edilir):

1. `claude.ai/download` ünvanından Claude desktop tətbiqini yüklə, hesabla daxil ol.
2. Masaüstündə yeni qovluq aç. Ad qısa olsun, xüsusi hərf (ə, ş, ç, ğ, ı, ö, ü) və boşluq olmasın: məs. `video-kurgu`.
3. Tətbiqdə soldan **Code**-a keç, mesaj qutusunun altındakı qovluq seçicidən bu qovluğu seç.
4. Bundan sonra hər şey bu qovluqda baş verir.

İcazə: Claude bir şey işə salmazdan əvvəl icazə istəyir. Nə edəcəyini bir cümlə ilə yaz.
Qovluqdan kənara çıxmaq lazım gələrsə, səbəbini açıq de.

### Qovluq strukturunu qur

İş qovluğunda bu strukturu yarat (yoxdursa):

```
video-kurgu/
├── raw/          # ham çəkilişlər
├── references/   # referans videolar, ekran görüntüləri, font faylları
├── output/       # hazır videolar və motion faylları
└── style-rules.md  # qayda faylı (style-rules skill-i ilə doldurulur)
```

```bash
mkdir -p raw references output
```

## Addım 2 — Alətlər

İstifadəçinin göndərdiyi tək mesaj (orijinal):
> Video kurgusu için FFmpeg, Whisper, HyperFrames ve yt-dlp'yi kur, sonra hepsinin çalıştığını kontrol et.

### Hansı alət nəyə lazımdır

| Alət | Vəzifəsi |
|------|----------|
| **FFmpeg** | Videonu kəsir, birləşdirir, səsi ayırır. Montajın qayçısı. |
| **Whisper** | Danışığı söz-söz, saniyəsi ilə mətnə çevirir. Altyazı və animasiya zamanlaması buradan gəlir. |
| **HyperFrames** | Claude-un yazdığı animasiya kodunu (HTML + GSAP) videoya çevirir. **Node.js** tələb edir. |
| **yt-dlp** | Bəyənilən videoları incələmək (üslub analizi, Addım 3) üçün yükləyir. Başqasının videosunu öz videonda istifadə etmək üçün deyil. |

### Quraşdırma prosesi

Əvvəlcə əməliyyat sistemini və mövcud alətləri yoxla:

```bash
uname -s 2>/dev/null || ver
for t in ffmpeg node npx python3 pip3 whisper yt-dlp brew winget; do
  printf "%-8s " "$t"; command -v "$t" >/dev/null 2>&1 && echo OK || echo MISSING
done
```

Sonra yalnız çatışmayanları quraşdır:

**macOS (Homebrew):**
```bash
# Homebrew yoxdursa, istifadəçidən rəsmi quraşdırma komandasını Terminal-da özü işlətməsini istə
brew install ffmpeg
brew install node          # HyperFrames üçün
pip3 install -U openai-whisper
brew install yt-dlp
npx hyperframes doctor     # HyperFrames npx ilə özü yüklənir və mühiti yoxlayır
```

**Windows (PowerShell, winget):**
```powershell
winget install --id Gyan.FFmpeg -e
winget install --id OpenJS.NodeJS.LTS -e
pip install -U openai-whisper
winget install --id yt-dlp.yt-dlp -e
npx hyperframes doctor
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install -y ffmpeg nodejs npm python3-pip
pip3 install -U openai-whisper yt-dlp
npx hyperframes doctor
```

Paket adları və ya mövcud paket menecerləri fərqli olarsa, sistemə uyğunlaşdır; uydurma komanda yazma.

### Yoxlama

Hamısını yoxla və nəticəni cədvəl şəklində göstər:

```bash
ffmpeg -version | head -1
whisper --help >/dev/null && echo "whisper OK"
node --version
npx hyperframes doctor
yt-dlp --version
```

## İstifadəçinin bilməli olduqları

- **Mac:** Homebrew yoxdursa, Claude Terminal-da işlətmək üçün komanda verə bilər. Parol istəsə, kompüter parolunu yazmaq lazımdır; yazarkən ekranda görünmür, bu normaldır.
- **Windows:** Komandalar fərqlidir, amma mesaj eynidir — Claude özü həll edir.
- **Whisper** ilk işə düşəndə modelini yükləyir, bir neçə dəqiqə çəkə bilər.
- Xəta çıxarsa: xəta mesajını olduğu kimi Claude-a yapışdır və "bunu düzəlt" de.

## Növbəti addım

Quraşdırma bitəndə istifadəçini `style-rules` skill-inə yönləndir (Addım 3 — ən vacib addım).
