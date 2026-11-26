# 17 — Pulsuz İstehsal Planı ($0)

Prinsip: pulsuz kreditlə yalnız **video kliplər** yaradılır. Musiqi, montaj, Prompt Reveal və upload tam pulsuzdur. Bunların musiqi və montaj hissəsini bu qovluqdakı skriptlər edir.

| Hissə | Pulsuz yol | Qeyd |
|---|---|---|
| Video klip | AI video servislərinin gündəlik pulsuz kreditləri | Yeganə məhdud resurs |
| Musiqi | `beatmaker.py`: kodla sintez olunan **orijinal** beat | Suno lazım deyil, hüquq problemi yoxdur |
| Musiqi (alternativ) | YouTube Studio → **Audio Library** | Pulsuzdur, monetizasiyaya uyğundur |
| Montaj | `montage.py` (ffmpeg) və ya CapCut pulsuz | Beat sync, watermark, -14 LUFS |
| Prompt Reveal | Əsas epizodun klipləri + mətn animasiyası | Yeni generasiya tələb etmir |
| Upload | YouTube Studio → Schedule | Pulsuz |

## 1. Pulsuz video kreditləri
Bir neçə AI video servisi qeydiyyatdan sonra hər gün pulsuz kredit verir. Siyahıya Kling AI (sənin aləti), Hailuo (MiniMax), Pika, Luma Dream Machine kimi servislər daxildir. **Limitlər, model versiyaları və şərtlər tez-tez dəyişir. Burada konkret rəqəm yazmıram, çünki təsdiqləyə bilmirəm.** Hər servisdə bunları özün yoxla:
1. Gündə neçə kredit verilir və bir 5–10 saniyəlik klip neçə kredit edir.
2. İstifadə olunmayan kreditlər növbəti günə keçir, yoxsa yanır.
3. **Pulsuz planda videoya watermark qoyulurmu.** Watermark-ı silmək servisin qaydalarını poza bilər.
4. **Pulsuz planda kommersiya istifadəsinə (monetizasiyaya) icazə varmı.** Bu, kanal üçün ən vacib sualdır. Bəzi servislərdə yalnız pullu plan kommersiya hüququ verir.

İstifadə taktikası:
- 2–3 servisdə qeydiyyatdan keç. Gündəlik kreditlər toplanır və 1 gündən bir yayım ritminə kifayət edir.
- Hər servisdə kreditləri **hər gün** xərclə. Yanırsa, itirməyəsən.
- Ən vacib klipləri (reveal, final kadr) ən yaxşı modeldə yarat, ara klipləri digər servislərdə.

## 2. Pulsuz rejimdə klip büdcəsi (bir yayım günü üçün)
| Short | Klip | Necə |
|---|---|---|
| Əsas epizod | 3 x 10 san (və ya 3 x 5 san + slow motion) | Pulsuz kreditlə |
| Macro Moment | 1 x 5–10 san | Pulsuz kreditlə |
| Prompt Reveal | 0 | Əsas epizodun klipləri + mətn |
| **Cəmi** | **4 klip / 2 gün** | |

**Kredit qənaəti:** 5 saniyəlik klip yaradıb `montage.py`-də yavaşlatmaq 10 saniyəlik klipdən ucuzdur. ASMR üslubunda slow motion təbii görünür.

## 3. Uzun videolar (L01, L02)
Hər biri ≈11 x 30 saniyəlik generasiya tələb edir. Bunu pulsuz kreditlə 27–28.11-ə çatdırmaq **realist deyil**. Pulsuz variant:
- 27–28.11-də yalnız Short-lar çıxsın: gündə 3 Short.
- İlk 6 Short hazır olandan sonra uzun video **montajla** yaradılır. "Ghost Garage: 3 Builds + How I Made Them" kimi toplu olur: Short-ların 16:9 versiyası, aralarında prompt izahı (ekran mətni), `beatmaker.py`-nin uzun musiqisi. Yeni generasiya tələb etmir.
- Bu video həm watch hours toplayır, həm də "orijinallıq" sübutu olur.

## 4. Musiqi: `beatmaker.py`
```
pip install numpy scipy
python beatmaker.py all        # EP001, EP002, EP003
```
Nəticə `out/` qovluğuna düşür: `EP001_music.mp3` və s.

| Epizod | Janr | BPM | Quruluş |
|---|---|---|---|
| EP001 | Dark phonk (cowbell, 808) | 140 | 0–2 riser, 20 san drop, 28 san stop + bass hit |
| EP002 | 80s synthwave loop (hər era-da parlaqlaşır) | 120 | 20 san, son başlanğıca qoşulur |
| EP003 | Winter phonk (music box) | 135 | EP001 quruluşu |

Bütün səslər sıfırdan sintez olunur: sinus, kvadrat dalğa, noise. Heç bir sample və ya başqasının musiqisi istifadə olunmur. Vokal yoxdur. Vokallı hook istəsən, pulsuz yol YouTube Audio Library və ya öz səsini yazmaqdır.

## 5. Montaj: `montage.py`
```
python montage.py EP001 clips/EP001_p1.mp4 clips/EP001_p2.mp4 clips/EP001_p3.mp4
```
Nəticə: `final/EP001.mp4`. Skript bunları edir:
- hər klipi 1080x1920, 30 fps formatına gətirir (16:9 kliplər crop olunur);
- keçidləri beat-ə oturdur (`--bpm 140`);
- kliplərin öz ASMR səsini musiqinin altında saxlayır (`--asmr-db -6`);
- son 2 saniyədə SALIMOFFF watermark-ı göstərir;
- səsi -14 LUFS-ə gətirir və H.264 kimi export edir.

**Ən rahat yol:** klipləri bu söhbətə yüklə, montajı mən edim və hazır MP4-ü sənə göndərim.

## 6. Pulsuz 2 günlük dövr
| Gün | İş | Vaxt |
|---|---|---|
| Boş gün | Pulsuz kreditlərlə 4 klip (əsas epizod + macro) | 1 saat |
| Boş gün | Klipləri mənə göndər və ya `montage.py`-ni özün işə sal | 10 dəq |
| Yayım günü səhəri | 3 Short-u Studio-da Schedule et | 15 dəq |
