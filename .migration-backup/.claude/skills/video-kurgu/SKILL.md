---
name: video-kurgu
description: Danışan-baş (talking head) ham videonu Claude ilə tam montaj etmək — boşluqları/səssiz yerləri FFmpeg ilə kəsmək, Whisper ilə söz-söz transkript, səhnə-səhnə plan göstərib təsdiq almaq, sonra altyazı və HyperFrames motion qrafikalarını əlavə edib render etmək, revizyonlar. İstifadəçi "ham çəkilişi montaj et", "ham çekimi kurgula", "boşluqları kəs, səhnə-səhnə plan göstər", "videoya altyazı və motion əlavə et", Reels/TikTok üçün video montaj istəyəndə istifadə et.
---

# Çək, at, göndər — montaj iş axını (Kısım 1, Addım 4)

Mənbə: kit səh. 7–8. Ön şərt: `video-kurgu-setup` (alətlər) və `style-rules` (qayda faylı).

## İstifadəçi tərəfi

1. **Videonu çək.** Telefon kifayətdir. Səssiz otaq, üzə öndən gələn işıq. Cümləni səhv desən dayanma, cümləni başdan de.
2. **Qovluğa at.** Faylı `video-kurgu/raw/` qovluğuna qoy.
3. **Mesajı göndər:**
   > Ham çekimi kurgula: boşlukları kes, sahne sahne planı göster.
4. **Planı oxu**, bəyənmədiyin səhnəni de, bəyənəndə təsdiqlə.
5. Təsdiqdən sonra Claude boşluqları kəsir, altyazı və motion-ları əlavə edir, videonu çıxarır.
   İlk sınaq üçün 20–30 saniyəlik video istifadə et.

Kitdəki nümunə: ham çəkiliş 5:39 → montajdan sonra 1:18.

## Claude tərəfi — addım-addım

### 0. Hazırlıq
- `style-rules.md`-i oxu. Yoxdursa, `style-rules` skill-i ilə əvvəlcə onu yaratmağı təklif et
  (onsuz video "hamınınkı kimi" alınır).
- Ham faylı tap, `ffprobe` ilə müddət, ölçü, fps, səs məlumatını al.

```bash
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of compact raw/<fayl>
```

### 1. Transkript (söz-söz zaman damğaları ilə)

```bash
ffmpeg -y -i raw/<fayl> -vn -ac 1 -ar 16000 work/audio.wav
whisper work/audio.wav --model large-v3 --language <az|tr|en|ru> \
  --word_timestamps True --output_format json --output_dir work/
```
- Dil videonun dilinə uyğun seçilir (Azərbaycan dili: `az`). Kompüter zəifdirsə `medium` model.
- Transkriptdə xüsusi adları `style-rules.md`-dəki "Xüsusi adlar" siyahısına görə düzəlt
  (məs. "Cloud" → "Claude").

### 2. Boşluqları və təkrarları tap
```bash
ffmpeg -i work/audio.wav -af silencedetect=noise=-35dB:d=0.4 -f null - 2>&1 | grep silence_
```
- Səssiz hissələri (nəfəs üçün ~0.1–0.15 s saxla) və səhv başlanmış cümlələri işarələ.
- **Eyni cümlə bir neçə dəfə deyilibsə:** default olaraq **sonuncu** deyiləni saxla.
  İstifadəçi başqa cür deyə bilər: "Girişdəki cümlənin son dediyimi saxla" və ya
  "eyni cümlənin bütün cəhdlərini ard-arda qoy, mən seçim".

### 3. Səhnə-səhnə PLAN (təsdiqdən əvvəl heç nə render etmə)

Planı cədvəl kimi göstər:

| # | Zaman (yeni) | Cümlə | Kəsmə | Altyazı | Motion / qrafika |
|---|--------------|-------|-------|---------|------------------|
| 1 | 0:00–0:03 | "..." | 0.8s boşluq çıxarıldı | vurğu: "Claude" | Hook: başlıq girişi, yuxarıda |

Sonda: ümumi müddət (əvvəl → sonra), istifadə olunan qaydalar, açıq suallar.
İstifadəçi səhnə üzrə dəyişiklik deyir → planı yenilə → təsdiq gözlə.

### 4. Təsdiqdən sonra icra
1. **Kəsmə:** saxlanılan seqmentlərin siyahısından FFmpeg ilə birləşdir
   (dəqiq kəsim üçün yenidən kodla), `work/cut.mp4`. Səs atlamalarında qısa audio fade (≈10–20 ms).
2. **Yeni transkript:** kəsilmiş video üçün Whisper-i yenidən işlət (zamanlar dəyişib).
3. **Motion + altyazı:** HyperFrames layihəsi qur (`hyperframes-motion-prompt` skill-indəki texniki
   qaydalar), `index.html`-i qayda faylına görə yaz: rənglər, font, altyazı yeri/ölçüsü/söz sayı,
   hərəkət sürəti, **üzü örtmə**, qadağalar.
4. **Yoxla və render et:**
   ```bash
   npx hyperframes check
   npx hyperframes render --fps 60 --output output/<ad>.mp4
   ```
   Öz çıxışına bax (bir neçə kadr çıxar: `ffmpeg -ss <t> -i output/<ad>.mp4 -frames:v 1 work/chk_<t>.jpg`),
   üz örtülürmü, yazı kəsilirmi yoxla; xəta varsa özün düzəlt.
5. Son nəticə: fayl yolu, müddət, nə edildi, istifadə olunan qaydalar.

Uzun videoda proses vaxt aparır — istifadəçiyə bunu qeyd et.

## Revizyon — "montajçıya deyirmiş kimi"

Fərqi nə istədiyini nə qədər dəqiq deməyin yaradır: saniyəni, yeri və nə olmalı olduğunu.
Qeyri-müəyyən rəy gələrsə, bu formata çevirmək üçün bir qısa sual ver.

| Belə yox | Belə |
|----------|------|
| "Daha gözəl et." | "Girişdəki yazı çox yavaş gəlir, yarı müddətdə gəlsin." |
| "Bu hissə alınmadı." | "0:12-dəki qrafika üzümü örtür, sağa çək." |
| "Altyazı pisdir." | "Altyazıda 'Cloud' yazılıb, 'Claude' olmalıdır." |
| "Başı darıxdırıcıdır." | "Başlanğıc hissəsində çox kiçik bir kəsmə (cut) et." |

## Video bitəndə

| | |
|---|---|
| **Başdan sona izlə** | Telefonda izlə — izləyici də orada izləyəcək. Qeyd al, bütün qeydləri tək mesajda göndər. |
| **Qayda et** | Eyni şeyi ikinci dəfə düzəldirsənsə, qayda faylına əlavə et (`style-rules`). |
| **Öz proqramında** | Son toxunuşu Premiere və ya CapCut-da edəcəksənsə, motion-ları ayrıca fayl kimi istə (alfa kanallı, məs. ProRes 4444 `.mov` və ya şəffaf fonlu PNG ardıcıllığı) — videonun üstünə qoyarsan. |

## Problemlər

| Problem | Həll |
|---------|------|
| Altyazıda adlar səhv çıxır | Whisper xüsusi adları qarışdırır. Düzgün yazılışı qayda faylına əlavə et. |
| Video hamınınkı kimi görünür | Addım 3-ə qayıt: referans ver, qadağalar siyahısını uzat, hər videodan sonra qayda əlavə et. |
| Animasiyalar üzü örtür | Qayda faylına yaz: "Danışan şəxsin üzünü örtmə." |
| Quraşdırma xətası | Xəta mesajını olduğu kimi yapışdır, "bunu düzəlt". |
