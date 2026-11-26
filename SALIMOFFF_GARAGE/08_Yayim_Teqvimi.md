# 08 — Yayım Təqvimi (Avropa + Amerika saatları)

**Yeniləmə (26.11.2026):** ritm dəyişdi.
- **İlk 2 gün (27–28.11):** hər gün **1 uzun video (16:9, ≈5:30) + 3 Short**.
- **30.11-dən sonra:** 1 gündən bir **3 Short**: Macro Moment + əsas epizod + Prompt Reveal.
- Saatlar Avropa və ABŞ auditoriyası üçün seçilib. Hamısı UTC-dədir. Bakı vaxtı = UTC + 4.

| Slot | UTC | CET | ET | PT | Bakı |
|---|---|---|---|---|---|
| Short 1 | 14:00 | 15:00 | 09:00 | 06:00 | 18:00 |
| Uzun video | 16:00 | 17:00 | 11:00 | 08:00 | 20:00 |
| Əsas Short | 18:00 | 19:00 | 13:00 | 10:00 | 22:00 |
| Short 3 | 23:00 | 00:00 | 18:00 | 15:00 | 03:00 (+1) |

Proqram versiyası: `16_Uploader/schedule.json` (`python uploader.py status`). Başlanğıc gecikərsə: `python uploader.py schedule --start YYYY-MM-DD`.

## İlk 2 gün

| Tarix | 14:00 UTC | 16:00 UTC (uzun) | 18:00 UTC | 23:00 UTC |
|---|---|---|---|---|
| 27.11 Cümə | EP002 Mercedes Headlights (loop) | **L01** 3 Dream Cars Built at 3AM | EP001 Ghost Garage #001 | EP003 Ghost Garage #002 White Ghost |
| 28.11 Şənbə | EP005 What If Bugatti 2040 | **L02** 3 Forgotten Wrecks Reborn | EP004 Barn to Billion (CTA: "you choose") | EP006 Ghost Garage #003 Gold |

## 1 gündən bir (3 Short)

| Tarix | 14:00 UTC — Macro Moment | 18:00 UTC — Əsas epizod | 23:00 UTC — Prompt Reveal |
|---|---|---|---|
| 30.11 B.e. | MM01 Carbon Fiber | EP007 BMW Grille Evolution | PR01 |
| 02.12 Çər. | MM02 Red Caliper | EP008 Desert Wreck (son CTA) | PR02 |
| 04.12 Cümə | MM03 Headlight Wake-Up | EP009 Rolls-Royce Off-Roader | PR03 |
| 06.12 Bazar | MM04 Forged Wheel | EP010 Ghost Garage #004 Red vs Black | PR04 |
| 08.12 Ç.a. | MM05 Steering Stitching | EP011 Ghost Garage #005 You Chose | PR05 |
| 10.12 C.a. | MM06 Water Beading | EP012 Porsche 911 Silhouette | PR06 |
| 12.12 Şənbə | MM07 Starlight Headliner | EP013 Ice Hypercar | PR07 |
| 14.12 B.e. | MM08 Titanium Exhaust | EP014 Volga 21 | PR08 |
| 16.12 Çər. | MM09 Gold Paint Drop | EP016 Muscle Car Faces | PR09 |
| 18.12 Cümə | MM10 Crystal Gear Selector | EP017 Ferrari Pickup | PR10 |
| 20.12 Bazar | MM11 Tire Tread | EP018 Buried in Snow 38 Years | PR11 |
| 22.12 Ç.a. | MM12 Gold Leaf Pinstripe | EP019 Fire Hypercar | PR12 |
| 24.12 C.a. | MM13 Snow on Warm Hood | EP015 Ghost Garage #006 Midnight Gift | PR13 |

İlk 30 gündə cəmi: **2 uzun video + 45 Short**.

## İstehsal ritmi
| Nə vaxt | İş | Vaxt |
|---|---|---|
| **26.11 (bu gün)** | Kanal quraşdırması (`12_Branding/Kanal_Qurasdirma.md`), L01 + EP001/002/003 generasiyası | 4–6 saat |
| 27.11 səhər | L01 montajı (16:00 UTC-ə qədər yüklənməlidir), L02 + EP004/005/006 generasiyası | 6–8 saat |
| 28.11 | L02 montajı, 30.11-in 3 Short-u | 4–5 saat |
| Hər "boş" gün (29.11, 01.12, ...) | Növbəti yayım gününün 3 Short-u: generasiya + montaj + Studio-da planlaşdırma | ≈3 saat |
| Yayım günü | Pinned comment, şərhlərə cavab, statistika | 30 dəq |

Prompt Reveal yeni generasiya tələb etmir: əsas epizodun klipləri istifadə olunur. Macro Moment 1 generasiyadır. Ona görə 3 Short ≈ 1 tam epizodun xərci + 30%.

**Real risk:** 27.11 üçün L01 ≈11 generasiya (30 san) tələb edir. Vaxt çatmasa, L01-i 28.11-ə, L02-ni 29.11-ə keç (`schedule --start 2026-11-28`). Gecikmiş video qeyri-peşəkar görünür, amma keyfiyyətsiz video daha pis görünür.

## 30 gündən sonra
- Uzun video: 2 həftədə 1 "Best of" (8–10 dəq) + proses izahı.
- 15 Short-dan sonra qərar qaydası `09_Musiqi_ve_Eylence.md`-də yazılıb: ən güclü 2 seriya növbəti ayın 70%-ni tutur.
