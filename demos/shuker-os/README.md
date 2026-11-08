# Shuker OS: vizual demo

Şükran Soltanov üçün şəxsi biznes idarəetmə sisteminin satış demosu. Tək fayldır (`index.html`), quraşdırma tələb etmir. Telefonda və ya brauzerdə açmaq kifayətdir.

> Demodakı bütün rəqəmlər, ödənişlər, təqvim və reklam statusları **nümunədir**, real məlumat deyil. Ekranın yuxarısında bu barədə banner var, onu silmə.

## Bölmələr

| Bölmə | Göstərdiyi |
|---|---|
| Əsas | Səhər brifinqi (dalğa animasiyası + mətn), KPI-lar, bugünkü plan, canlı lead botu sayğacı, AI balı ilə yeni təkliflər, Canlı Media Kit |
| Reklamlar | Mərhələlər üzrə pipeline: Sorğu, Müqavilə, Çəkiliş, Paylaşıldı, Hesabat. Kartı açanda AI qiymət tövsiyəsi, hesabat və ödəniş xatırlatması |
| AI | Səsli mesaj simulyasiyası, təqvimə və reklamlara avtomatik yazma, ssenari generasiyası |
| Təqvim | 7 günlük görünüş, üst-üstə düşmə xəbərdarlığı, "Avtomatik düzəlt" |
| Maliyyə | 6 aylıq gəlir qrafiki, sahələr üzrə bölgü, gözlənilən ödənişlər |

## Təqdimat ssenarisi (3–4 dəqiqə)

| Vaxt | Nə edirsən | Nə deyirsən |
|---|---|---|
| 0:00–0:30 | Əsas ekranı aç, "Səhər brifinqi"nin play düyməsinə bas | "Hər səhər saat 9-da gününüzün xülasəsi Telegram-a səsli mesaj kimi gəlir." |
| 0:30–0:50 | Yuxarıdan gələn "Yeni reklam təklifi" bildirişinə bas | "Yeni təklif gələndə AI brendi qiymətləndirir və qiymət tövsiyə edir." |
| 0:50–1:10 | "Qəbul et və təklif göndər" düyməsinə bas | "Bir kliklə müqavilə layihəsi brendə gedir." |
| 1:10–2:00 | AI bölməsi, mikrofona bas | "Maşında gedərkən səsli mesaj yazırsınız. Sistem təqvimə yazır, brendə təsdiq göndərir, ödəniş xatırlatması qoyur." |
| 2:00–2:20 | Bildirişə bas, təqvim açılır | "Baxın, çəkiliş artıq təqvimdədir. Üst-üstə düşən işləri də özü tapır." |
| 2:20–2:40 | "Avtomatik düzəlt" düyməsinə bas | "Görüşü özü keçirir və qarşı tərəfə xəbər verir." |
| 2:40–3:10 | "Market üçün sketç ssenarisi ver" chip-inə bas | "Sizin üslubunuzda, saniyə-saniyə bölünmüş ssenari." |
| 3:10–3:40 | Əsas ekrana qayıt, canlı lead sayğacı və Media Kit | "Əmlak reklamlarında hər şərh lead-ə çevrilir. Developerə rəqəmlə nəticə göstərirsiniz və reklam qiyməti qalxır." |

## Real versiyada texnologiya

- **AI köməkçi:** Telegram bot + Claude/OpenAI, səs üçün Whisper
- **Avtomatlaşdırma:** n8n (brifinq, xatırlatmalar, hesabatlar, Instagram Graph API)
- **Baza və panel:** Supabase + mobil veb panel
- **Instagram statistikası:** rəsmi Graph API (Business və ya Creator hesab + sahibinin icazəsi)
