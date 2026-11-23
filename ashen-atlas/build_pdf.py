from reportlab.lib.pagesizes import A4
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
                                Image, KeepTogether)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

D = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("S", D + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("SB", D + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SR", D + "DejaVuSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("M", D + "DejaVuSansMono.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("S", normal="S", bold="SB", italic="S", boldItalic="SB")

IMG = "/home/user/Shahin_Salimov/ashen-atlas/images/"
OUT = "/home/user/Shahin_Salimov/ashen-atlas/Ashen_Atlas_Kanal_Plani.pdf"
EMBER = colors.HexColor("#E8772E"); CHAR = colors.HexColor("#0E0F12"); GOLD = colors.HexColor("#C9A45C")
PARCH = colors.HexColor("#F4EDE0"); GREY = colors.HexColor("#5A5A5A")

st = {
    "h1": ParagraphStyle("h1", fontName="SR", fontSize=20, leading=25, textColor=CHAR, spaceBefore=4, spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="SB", fontSize=13, leading=17, textColor=EMBER, spaceBefore=10, spaceAfter=5),
    "p": ParagraphStyle("p", fontName="S", fontSize=9.6, leading=14, spaceAfter=5),
    "b": ParagraphStyle("b", fontName="S", fontSize=9.6, leading=14, leftIndent=12, bulletIndent=2, spaceAfter=2),
    "code": ParagraphStyle("code", fontName="M", fontSize=8.3, leading=11.5, backColor=PARCH, borderPadding=6,
                           leftIndent=6, rightIndent=6, spaceBefore=4, spaceAfter=9),
    "cap": ParagraphStyle("cap", fontName="S", fontSize=8, leading=10, textColor=GREY, alignment=1, spaceAfter=8),
    "cell": ParagraphStyle("cell", fontName="S", fontSize=8.3, leading=11),
    "cellb": ParagraphStyle("cellb", fontName="SB", fontSize=8.3, leading=11, textColor=colors.white),
    "note": ParagraphStyle("note", fontName="S", fontSize=9, leading=13, backColor=colors.HexColor("#FFF4E8"),
                           borderPadding=7, leftIndent=6, rightIndent=6, spaceBefore=5, spaceAfter=9),
}
story = []
def H1(t): story.append(Paragraph(t, st["h1"]))
def H2(t): story.append(Paragraph(t, st["h2"]))
def P(t): story.append(Paragraph(t, st["p"]))
def B(items):
    for i in items: story.append(Paragraph(i, st["b"], bulletText="•"))
def NOTE(t): story.append(Paragraph(t, st["note"]))
def CODE(t):
    t = t.strip().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    story.append(Paragraph(t, st["code"]))
def TBL(rows, widths):
    data = [[Paragraph(str(c), st["cellb"] if r == 0 else st["cell"]) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), CHAR), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PARCH]),
                           ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(t); story.append(Spacer(1, 8))
def IM(path, w_mm, cap):
    from PIL import Image as PI
    w, h = PI.open(IMG + path).size
    story.append(KeepTogether([Image(IMG + path, width=w_mm * mm, height=w_mm * mm * h / w),
                               Paragraph(cap, st["cap"])]))

# ---------------- COVER ----------------
def cover(c, doc):
    W, H = A4
    c.setFillColor(CHAR); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.drawImage(IMG + "02_banner_2560x1440.jpg", 0, H - W * 9 / 16 - 40 * mm, W, W * 9 / 16)
    c.drawImage(IMG + "01_logo_800x800.png", W / 2 - 30 * mm, 95 * mm, 60 * mm, 60 * mm, mask="auto")
    c.setFillColor(colors.HexColor("#E9DCC3")); c.setFont("SR", 26)
    c.drawCentredString(W / 2, 78 * mm, "ASHEN ATLAS")
    c.setFont("S", 12); c.setFillColor(GOLD)
    c.drawCentredString(W / 2, 68 * mm, "YouTube kanal strategiyası, brend paketi və addım-addım qurulma planı")
    c.setFont("S", 10); c.setFillColor(colors.white)
    c.drawCentredString(W / 2, 58 * mm, "Niş: Lost civilizations & forgotten history  •  Dil: English  •  Gündəlik 1 long (35 dəq) + 1 Short")
    c.setFont("S", 9); c.setFillColor(GREY)
    c.drawCentredString(W / 2, 22 * mm, "Şahin Səlimov üçün hazırlanıb  •  23 noyabr 2026")

def later(c, doc):
    W, H = A4
    c.setFillColor(EMBER); c.rect(0, H - 6 * mm, W, 6 * mm, fill=1, stroke=0)
    c.setFont("S", 7.5); c.setFillColor(GREY)
    c.drawString(18 * mm, 10 * mm, "ASHEN ATLAS  •  Kanal planı")
    c.drawRightString(W - 18 * mm, 10 * mm, str(doc.page))

story.append(PageBreak())

# ---------------- 0. MÜNDƏRİCAT / XÜLASƏ ----------------
H1("Xülasə (1 səhifədə bütün qərar)")
TBL([["Element", "Qərar"],
     ["Kanal adı", "<b>Ashen Atlas</b> — handle: <b>@AshenAtlas</b> (əlçatanlığı yoxlanmalıdır, bax: Bölmə 4)"],
     ["Niş", "Lost civilizations &amp; forgotten history — itmiş şəhərlər, unudulmuş imperiyalar, qədim sirlər. AI ilə yaradılmış realistic, cinematic vizuallar + araşdırılmış ssenari."],
     ["Format", "Hər gün: 1 long-form documentary (~35 dəq) + 1 Short (45–58 san), Short həmin günün long videosuna trafik ötürür."],
     ["Auditoriya", "ABŞ, UK, Kanada, Avstraliya; 25–54 yaş, əsasən kişi; axşam/gecə izləyən, uzun documentary sevən izləyici."],
     ["Fərqləndirici", "Hər videoda \"Evidence Layer\": ekranda mənbə, xəritə, tarix xətti və \"What we know vs. what we don't\" bölməsi. Uydurma yox — sübut əsaslı."],
     ["Qanuni çərçivə", "YouTube-un altered/synthetic content disclosure qaydası (realistic AI = label ON) və inauthentic content siyasətinə tam uyğun iş axını."],
     ["Monetizasiya", "Uzun video = mid-roll reklam (8+ dəq). Tarix nişi bloqlarda yüksək RPM nişi kimi göstərilir (təxmini, yoxlanmamış rəqəmlər)."],
     ["Ən böyük risk", "Gündəlik 35 dəq — şablon/təkrar (\"mass-produced\") görünə bilər. Həll: hər video unikal araşdırma, unikal vizual, insan redaktəsi."],
     ], [35, 135])
NOTE("<b>Dürüst qeyd:</b> Aşağıdakı kanal statistikası əsasən üçüncü tərəf bloqlarından və xəbər mənbələrindən götürülüb. "
     "YouTube kanal sayğaclarına birbaşa daxil ola bilmədim, buna görə rəqəmləri təxmini qəbul et və işə başlamazdan əvvəl "
     "vidIQ / Social Blade ilə özün yoxla. Mənbələr sonuncu bölmədədir.")

# ---------------- 1. BAZAR ANALİZİ ----------------
story.append(PageBreak())
H1("1. Son 6–8 ayın uğurlu AI kanalları — expert analizi")
P("Təlim-tədris (\"AI necə istifadə olunur\") kanalları kənarda saxlanılıb. Burada AI-ni <b>istehsal aləti</b> kimi istifadə edən, "
  "əyləncə/documentary məzmunu ilə böyüyən kanallar və eyni zamanda YouTube tərəfindən cəzalandırılan nümunələr təhlil olunur — "
  "çünki uğursuz nümunələr qaydaları uğurlulardan daha aydın göstərir.")
H2("1.1 Uğurlu nümunələr")
TBL([["Kanal / model", "Nə edir", "Niyə işləyir", "Bizə dərs"],
     ["Boring History (Adavia Davis)", "Saatlarla davam edən \"history to sleep to\" documentary-lər. Bloqlara görə ssenari və vizualda Claude, səsdə ElevenLabs.",
      "Uzun watch time, evergreen mövzu, aşağı istehsal xərci (mənbə: Fortune-a istinadla bloq, ~$60/video).", "Tarix + uzun format + AI pipeline real biznes modelidir."],
     ["Mack, Axen (2026 yazında açılıb)", "Stick-figure stilində qədim tarix izahları.",
      "Tanınan vizual üslub, sadə amma ardıcıl brend. Bir mənbəyə görə aylar içində 60K+ abunəçi.", "Vizual imza (signature style) böyümənin açarıdır."],
     ["LEMMiNO, fern (AI deyil — benchmark)", "Üzsüz (faceless), yüksək keyfiyyətli documentary-lər.",
      "Dərin araşdırma, güclü hekayə quruluşu, milyonlarla abunəçi.", "Keyfiyyət çıtası budur: AI yalnız sürət verir, hekayəni insan qurur."],
     ["AI Yamada Studio", "AI-first kanal, 2025 oktyabrında açılıb; snapshot-da ~54.5K abunəçi, 34 video, ~9.9M baxış.",
      "Az video, yüksək keyfiyyət.", "Kəmiyyət yox, hər videonun keyfiyyəti."],
     ["Faceless documentary nişi (ümumi)", "Noyabr 2026 bloq nümunəsində 40 sürətlə böyüyən faceless kanaldan 16-sı documentary formatındadır.",
      "Documentary = uzun izləmə + yüksək RPM.", "Format seçimimizi təsdiqləyir."],
     ], [32, 46, 50, 42])
H2("1.2 Cəzalandırılan nümunələr (nə etməməli)")
TBL([["Hal", "Nə baş verdi", "Dərs"],
     ["AI fake movie trailer kanalları", "Dekabr 2025-də YouTube iki böyük AI fake-trailer kanalını bağladı (birlikdə ~35M abunəçi, ~4.7B baxış; mənbə: XDA, IBTimes UK).", "Böyüklük qoruma deyil. Yanıltıcı AI məzmun = kanalın sonu."],
     ["Müharibə mövzulu AI şəbəkəsi (DFRLab)", "AI ssenari, AI səs, AI \"diktor\" ilə müharibə xəbəri saxtalaşdıran kanallar ~1.8B baxış toplayıb, araşdırmaya düşüb.", "Real hadisələri AI ilə uydurmaq olmaz. Biz yalnız sənədli tarixə əsaslanırıq."],
     ["Saxta true crime kanalı", "150+ uydurma qətl hekayəsini real kimi təqdim edib; 404 Media ifşa edib.", "\"Based on true story\" iddiası mənbə ilə sübut olunmalıdır."],
     ["\"AI slop\" kanalları (Kapwing araşdırması)", "278 kanal tamamilə aşağı keyfiyyətli AI məzmun istehsal edir; YouTube iyul 2026-da siyasəti dəqiqləşdirdi.", "Şablon, təkrar, dəyərsiz məzmun YPP-dən çıxarılır."],
     ], [38, 82, 50])
H2("1.3 Ortaq nəticə (sintez)")
B(["<b>Format qalib gəlir:</b> uzun documentary + tarix/sirr mövzusu həm watch time, həm RPM baxımından ən güclü kombinasiyadır.",
   "<b>Brend ardıcıllığı:</b> uğurlu kanalların hamısında tanınan vizual imza var (rəng, şrift, thumbnail stili, narrator səsi).",
   "<b>AI = istehsal aləti, məzmun = insan dəyəri:</b> araşdırma, hekayə strukturu, faktların yoxlanması insanda qalmalıdır.",
   "<b>Doğruluq qırmızı xəttdir:</b> uydurma faktlar, real hadisəni saxtalaşdırmaq, yanıltıcı \"real footage\" iddiası kanalı öldürür.",
   "<b>Şablon təkrarı təhlükədir:</b> gündəlik yükləmə yalnız hər video məzmunca fərqli olduqda təhlükəsizdir.",
   "<b>Shorts = vitrin:</b> Shorts və long-form ayrı-ayrı sıralanır; Short-un işi long videoya izləyici gətirməkdir."])

# ---------------- 2. QAYDALAR ----------------
story.append(PageBreak())
H1("2. YouTube-un AI qaydaları (noyabr 2026 vəziyyəti)")
H2("2.1 Altered or synthetic content — disclosure (açıqlama)")
B(["Realistic AI məzmunu və mənalı dəyişikliklər <b>mütləq açıqlanmalıdır</b>; qeyri-realistic (animasiya, fantastik) və kiçik edit-lər üçün tələb olunmur.",
   "Açıqlama yükləmə zamanı YouTube Studio-da: <b>Details → Altered content → Yes</b>.",
   "May 2026-dan: label long videolarda player-in <b>birbaşa altında</b>, Shorts-da videonun üzərində göstərilir.",
   "May 2026-dan: YouTube AI məzmunu <b>avtomatik aşkarlayır</b> və açıqlanmayıbsa label-i özü qoyur. Mütəmadi açıqlamamaq cəzaya səbəb ola bilər.",
   "Label-in özü tövsiyə alqoritminə və monetizasiyaya təsir etmir (YouTube-un rəsmi açıqlaması)."])
NOTE("<b>Bizim qayda:</b> Ashen Atlas-da realistic AI ilə bərpa olunmuş tarixi səhnələr var — ona görə <b>hər videoda label = Yes</b>. "
     "Bundan əlavə description-da və videonun əvvəlində qısa qeyd: \"Historical scenes in this documentary are AI-generated reconstructions.\" "
     "Bu, şəffaflıq brendimizin bir hissəsidir, zəiflik yox.")
H2("2.2 Inauthentic content (YPP monetizasiya siyasəti, iyul 2026 dəqiqləşdirməsi)")
P("YouTube AI-ni qadağan etmir. Qadağan olunan — <b>dəyərsiz, kütləvi istehsal olunmuş</b> məzmundur. TechCrunch-a görə siyasət üç kateqoriyaya bölünür:")
TBL([["Kateqoriya", "Mənası", "Bizim qoruma tədbirimiz"],
     ["1. Generic, repetitive, template-based", "Eyni şablonla, minimal dəyişikliklə kütləvi istehsal.", "Hər video ayrı araşdırma, ayrı hekayə strukturu, unikal vizuallar, fərqli thumbnail kompozisiyası. Eyni intro/outro qısa (5–8 san) saxlanılır."],
     ["2. Off-putting / distressing", "İtici, narahatedici, şok məqsədli məzmun.", "Qətliam, müharibə, fəlakət səhnələri qrafik göstərilmir — işarə, silüet, nəticə ilə izah olunur."],
     ["3. AI personas on sensitive topics", "Sağlamlıq, maliyyə kimi həssas mövzularda AI \"ekspert\" personaj.", "Bizim nişdə yoxdur. Narrator özünü insan ekspert kimi təqdim etmir."],
     ], [42, 50, 78])
B(["Bu kateqoriyaya düşən kanal, məzmun AI olsun-olmasın, <b>bütövlükdə YPP-dən çıxarıla bilər</b>.",
   "<b>Reused content:</b> başqalarının videolarını, filmlərdən kəsikləri dəyər əlavə etmədən istifadə etmək olmaz.",
   "<b>Misinformation:</b> tarixi faktlar mənbə ilə; mübahisəli nəzəriyyələr (Atlantis, \"aliens built it\") yalnız \"theory\" kimi, fakt kimi yox."])
H2("2.3 Digər vacib qaydalar")
B(["<b>YPP şərtləri:</b> rəsmi rəqəmlər üçün YouTube Help \"YouTube Partner Program overview\" səhifəsinə bax (tam monetizasiya üçün əvvəllər 1,000 abunəçi + 12 ayda 4,000 saat və ya 90 gündə 10M Shorts baxışı tələb olunurdu — müraciət anında yenidən yoxla).",
   "<b>Ölkə:</b> YPP yalnız müəyyən ölkələrdə əlçatandır. Azərbaycanın siyahıdakı vəziyyətini təsdiqləyə bilmədim — kanalı açmazdan əvvəl YouTube Help-də \"YPP availability\" siyahısını yoxla. Kanal ölkəsini uydurma göstərmək qaydalara ziddir.",
   "<b>Musiqi:</b> yalnız YouTube Audio Library və ya lisenziyalı kitabxana (Epidemic Sound, Artlist). Lisenziya sənədini saxla.",
   "<b>Real şəxslər:</b> yaşayan real insanların realistic AI təsviri yoxdur. Tarixi şəxslər — rekonstruksiya kimi qeyd olunur.",
   "<b>Muzey/arxeoloji fotolar:</b> yalnız public domain və ya Creative Commons (atribusiya ilə), məs. Wikimedia Commons."])

# ---------------- 3. NİŞ ----------------
story.append(PageBreak())
H1("3. Niş: Lost Civilizations &amp; Forgotten History")
H2("3.1 Niyə bu niş")
TBL([["Kriteriya", "Qiymət", "İzah"],
     ["Tələb (axtarış + tövsiyə)", "Yüksək", "Documentary formatı faceless böyümədə liderdir; qədim tarix evergreen-dir — video illərlə baxış toplayır."],
     ["RPM", "Yüksək (təxmini)", "Bloq nümunələrində tarix kanalları üçün ~$7.5–8 RPM qeyd olunub. Yoxlanmamış, təxmini."],
     ["Sənin bacarığınla uyğunluq", "Çox yüksək", "Sən onsuz da realistic AI video hazırlayırsan — qədim şəhər, döyüş, saray rekonstruksiyası tam bu bacarıqdır."],
     ["35 dəq format", "Uyğun", "Bir sivilizasiyanın yüksəlişi–zirvəsi–çöküşü təbii olaraq 30–40 dəqiqəlik hekayədir; mid-roll üçün ideal."],
     ["Mövzu bazası", "Tükənməz", "Yüzlərlə itmiş şəhər, imperiya, ekspedisiya, arxeoloji tapıntı. 365 gün mövzu problemi yoxdur."],
     ["Qayda riski", "Aşağı–orta", "Real tarix + mənbə + disclosure = təhlükəsiz. Risk yalnız şablon təkrarındadır."],
     ], [42, 26, 102])
H2("3.2 Məzmun sütunları (content pillars)")
TBL([["Sütun", "Pay", "Nümunə mövzular"],
     ["Lost Cities", "35%", "Mohenjo-daro, Pompeii, Petra, Great Zimbabwe, Angkor, Çatalhöyük, Cahokia"],
     ["Fallen Empires", "25%", "Bronze Age Collapse, Khmer Empire, Hittites, Sasanian Empire, Mali Empire"],
     ["Ancient Mysteries (sübuta əsaslanan)", "20%", "Göbekli Tepe, Antikythera mechanism, Nazca Lines, Voynich manuscript"],
     ["Forgotten Expeditions &amp; Events", "20%", "Franklin Expedition, Roanoke Colony, Library of Alexandria, Tunguska"],
     ], [52, 15, 103])
H2("3.3 Auditoriya portreti")
B(["<b>Coğrafiya:</b> ABŞ (əsas), UK, Kanada, Avstraliya — ən yüksək reklam qiymətli bazarlar.",
   "<b>Yaş/cins:</b> 25–54, əsasən kişi (tarix/documentary nişinin tipik profili — kanal açıldıqdan sonra Analytics ilə təsdiqlə).",
   "<b>Davranış:</b> axşam və gecə izləyir, TV-də uzun video açır, fon kimi dinləyir. TV ekranı üçün vizual keyfiyyət vacibdir.",
   "<b>Yükləmə vaxtı:</b> 19:00 ET (Bakı vaxtı ilə 04:00 — Studio-da schedule et). Short: 12:00 ET (Bakı 21:00)."])

# ---------------- 4. AD ----------------
story.append(PageBreak())
H1("4. Kanal adı")
H2("4.1 Seçim: ASHEN ATLAS")
B(["<b>Ashen</b> — kül, yanmış, keçmişdə qalmış: itmiş sivilizasiyaların obrazı. <b>Atlas</b> — xəritə, dünya, səyahət: kanalın coğrafi miqyası.",
   "Alliterasiya (A–A) yadda qalır, iki söz, 11 hərf, tələffüzü asandır.",
   "Ümumi söz deyil (\"History Channel 24\" tipli deyil) — axtarışda brend kimi seçilir.",
   "Logo üçün təbii simvol: kompas + kül/köz (ember) hissəcikləri."])
H2("4.2 Ehtiyat variantlar")
TBL([["Ad", "Handle", "Qeyd"],
     ["Vanished Ages", "@VanishedAges", "Daha birbaşa, nişi aydın deyir."],
     ["Ember Chronicles", "@EmberChronicles", "Eyni vizual konsept (köz, od)."],
     ["The Forgotten Ledger", "@ForgottenLedger", "Daha \"arxiv/sənəd\" hissi."],
     ], [50, 50, 70])
NOTE("<b>Əlçatanlığı yoxla (məcburi):</b> 1) YouTube-da adı və @handle-ı axtar; 2) Instagram, TikTok, X-də handle; 3) domen (ashenatlas.com); "
     "4) USPTO/EUIPO ticarət nişanı bazasında axtarış. Mən bu yoxlamanı edə bilmədim — ad tutulubsa ehtiyat variantlara keç.")

# ---------------- 5. VİZUAL KİMLİK ----------------
story.append(PageBreak())
H1("5. Vizual kimlik və şəkillər")
TBL([["Element", "Dəyər"],
     ["Əsas rənglər", "Charcoal #0E0F12 • Ember #E8772E • Gold #C9A45C • Parchment #E9DCC3"],
     ["Başlıq şrifti", "Cinzel Bold (Google Fonts, pulsuz) — klassik, Roma yazısı hissi. Mockup-larda DejaVu Serif istifadə olunub."],
     ["Thumbnail şrifti", "Montserrat ExtraBold / Bebas Neue — böyük, oxunaqlı."],
     ["Vizual stil", "Golden hour və ya gecə işığı, köz hissəcikləri, silüet, dramatik sky. Rəng: isti narıncı vs. soyuq qaranlıq."],
     ], [35, 135])
IM("01_logo_800x800.png", 62, "Şəkil 1 — Profil şəkli (800×800). YouTube-da dairəvi, 98×98 px göstərilir, ona görə yazısız kompas istifadə olunur.")
IM("01c_logo_with_wordmark_800x800.png", 62, "Şəkil 2 — Logo + wordmark (Instagram, TikTok, sayt, intro üçün).")
IM("02_banner_2560x1440.jpg", 170, "Şəkil 3 — Kanal banneri (2560×1440, maks. 6 MB).")
IM("02b_banner_safe_area_guide.jpg", 140, "Şəkil 4 — Safe area (1546×423): bütün mətn bu yaşıl çərçivənin içindədir, telefonda kəsilmir.")
IM("03_thumbnail_A_1280x720.jpg", 150, "Şəkil 5 — Thumbnail A: rəqəm + emosional söz + kiçik alt başlıq.")
IM("04_thumbnail_B_1280x720.jpg", 150, "Şəkil 6 — Thumbnail B: sual formatı, soyuq rəng palitrası (mövzuya görə dəyişir).")
IM("05_thumbnail_C_1280x720.jpg", 150, "Şəkil 7 — Thumbnail C: vaxt təzyiqi + qırmızı ox (diqqət nöqtəsi).")
story.append(KeepTogether([
    Table([[Image(IMG + "06_shorts_cover_1080x1920.jpg", 55 * mm, 55 * mm * 1920 / 1080),
            Image(IMG + "07_watermark_150x150.png", 30 * mm, 30 * mm)]], colWidths=[85 * mm, 60 * mm]),
    Paragraph("Şəkil 8 — Shorts cover (1080×1920) və Şəkil 9 — Video watermark (150×150, Studio → Customization → Branding).", st["cap"])]))
NOTE("Bu şəkillər kodla hazırlanmış <b>brend mockup-larıdır</b> (kompozisiya, rəng, şrift sistemi). Real thumbnail-larda fon kimi öz AI aləti "
     "ilə yaratdığın realistic səhnələri istifadə et — prompt-lar Bölmə 7-dədir. Kompozisiya qaydası eyni qalır: solda mətn (maks. 3–4 söz), "
     "sağda səhnə, küncdə kiçik kompas.")

# ---------------- 6. DESCRIPTION / TAGS ----------------
story.append(PageBreak())
H1("6. Description, keywords, tags")
H2("6.1 Kanal description (About) — kopyala")
CODE("""
Ashen Atlas makes cinematic documentaries about the cities, empires and people history forgot.

Every day we travel to a different lost world: from Mohenjo-daro and Göbekli Tepe to the Bronze Age Collapse and the last day of Pompeii. Each film is built on archaeological research and academic sources, and we always separate what we know from what we don't.

NEW: a full-length documentary every day at 7 PM ET, plus a daily Short.

Transparency: historical scenes in our documentaries are AI-generated reconstructions based on research. They are illustrations, not real footage. Sources for every video are listed in its description.

Subscribe and explore the forgotten corners of the human story.

Business inquiries: [email]
""")
H2("6.2 Kanal keywords (Studio → Settings → Channel → Basic info)")
CODE("""
"lost civilizations" "ancient history documentary" "ancient mysteries" "lost cities" "history documentary" "fallen empires" "archaeology" "ancient civilizations" "forgotten history" "bronze age collapse" "ancient world" "history explained" "documentary" "ashen atlas"
""")
H2("6.3 Video description şablonu")
CODE("""
[1-2 sentence hook with the main keyword in the first line]
In this documentary we explore [TOPIC]: how it rose, what made it extraordinary, and why it disappeared.

CHAPTERS
00:00 [Cold open title]
02:30 [Chapter 1]
...
33:40 What we still don't know

SOURCES
- [Author, Title, Publisher, Year]
- [Museum / university page]

AI DISCLOSURE: Historical scenes are AI-generated reconstructions for illustration. Maps and timelines are original graphics.
Music: [licensed source]

#AncientHistory #LostCivilizations #Documentary
""")
H2("6.4 Video tags (nümunə: Mohenjo-daro videosu)")
CODE("""
mohenjo daro, indus valley civilization, harappa, lost city, ancient history documentary, lost civilizations, ancient mysteries, bronze age, archaeology documentary, why did the indus valley civilization collapse, ashen atlas
""")
P("Qayda: 8–15 tag; birinci tag = əsas açar söz; sonda kanal adı. Tag-lər YouTube-da ikinci dərəcəli siqnaldır — başlıq, thumbnail və ilk 30 saniyə daha vacibdir.")
H2("6.5 Başlıq formulları")
TBL([["Formul", "Nümunə"],
     ["[Rəqəm] + [itki] + [yer]", "40,000 People Vanished From This City — Nobody Knows Why"],
     ["The Rise and Fall of [X]", "The Rise and Fall of the Khmer Empire"],
     ["[X] Was Older Than [tanış şey]", "This Temple Is 6,000 Years Older Than Stonehenge"],
     ["The Last Day of [X]", "The Last Day of Pompeii, Hour by Hour"],
     ], [60, 110])
P("Başlıq 60 simvoldan qısa; thumbnail mətni başlığı təkrarlamır, tamamlayır.")

# ---------------- 7. CONTENT FORMULA ----------------
story.append(PageBreak())
H1("7. Video formulu: 35 dəqiqəlik long + Short")
H2("7.1 Long-form struktur (~5,000–5,300 söz, 150 wpm)")
TBL([["Vaxt", "Bölmə", "Məzmun"],
     ["00:00–00:45", "Cold open", "Ən dramatik an (məs. şəhərin son günü). Sual: \"How did this happen?\""],
     ["00:45–01:15", "Title + vəd", "Kanal intro (5 san) + videoda nə öyrənəcəyik (3 sual)."],
     ["01:15–06:00", "Kontekst", "Xəritə, tarix xətti, dövrün dünyası. Evidence Layer başlayır."],
     ["06:00–14:00", "Yüksəliş", "Necə quruldu, kimlər idi, gündəlik həyat (rekonstruksiya səhnələri)."],
     ["14:00–15:00", "Re-hook", "Gözlənilməz fakt — mid-roll-dan əvvəl izləyicini saxlayır."],
     ["15:00–23:00", "Zirvə", "Texnologiya, ticarət, mədəniyyət — ən təsirli kəşflər."],
     ["23:00–31:00", "Çöküş", "Nəzəriyyələr bir-bir: sübut nə deyir, nə demir."],
     ["31:00–34:00", "What we know vs. what we don't", "Kanalın imza bölməsi: dürüst yekun."],
     ["34:00–35:00", "Outro", "Növbəti videoya end screen + Short-a keçid. CTA qısa."],
     ], [26, 40, 104])
H2("7.2 Short struktur (45–58 san)")
TBL([["Vaxt", "Məzmun"],
     ["0–2 san", "Vizual şok + mətn (\"A whole city buried in one day\")."],
     ["2–10 san", "Kontekst: harada, nə vaxt."],
     ["10–40 san", "1 ən maraqlı fakt / an, 3–4 sürətli səhnə."],
     ["40–55 san", "Açıq sual + \"Full documentary on the channel\". Related video linki long videoya bağlanır."],
     ], [30, 140])
H2("7.3 İş axını (gündəlik pipeline)")
TBL([["Mərhələ", "Alət", "Vaxt (təxmini)"],
     ["Mövzu + araşdırma (akademik mənbələr, muzey saytları)", "Claude + Google Scholar + Wikipedia mənbə siyahısı", "1–1.5 saat"],
     ["Ssenari + fakt yoxlaması", "Claude (draft) → sən (redaktə, mənbə uyğunluğu)", "1.5 saat"],
     ["Narration", "ElevenLabs (bir sabit səs, lisenziyalı)", "20 dəq"],
     ["Vizuallar (60–90 səhnə)", "Sənin realistic image/video alətlərin (Midjourney / Kling / Veo / Runway və s.)", "2–3 saat"],
     ["Xəritə, tarix xətti, mənbə kartları", "Canva / After Effects şablonları (hər video yeni məzmunla)", "40 dəq"],
     ["Montaj + musiqi + subtitr", "DaVinci Resolve / CapCut", "1.5–2 saat"],
     ["Short + thumbnail + upload", "Eyni materiallardan", "45 dəq"],
     ], [70, 70, 30])
NOTE("<b>Real yük:</b> gündəlik 35 dəqiqəlik keyfiyyətli documentary təxminən 8–10 saat işdir. Tək adamla davamlı deyil. Tövsiyə: "
     "launch-dan əvvəl <b>10 videoluq bufer</b> hazırla; ilk ay həftədə 4–5 long + gündəlik Short; pipeline oturandan sonra gündəlik long-a keç. "
     "Bu, keyfiyyəti qoruyur və \"mass-produced\" riskini azaldır.")

H2("7.4 Prompt-lar (kopyala)")
P("<b>Master style prompt</b> (hər səhnəyə əlavə et — vizual ardıcıllıq üçün):")
CODE("""
cinematic historical reconstruction, photorealistic, 35mm film look, golden hour volumetric light, drifting ember particles and dust in the air, muted earth tones with warm orange highlights, deep shadows, atmospheric haze, anamorphic lens, shallow depth of field, documentary realism, 16:9, no text, no logos, no modern objects
""")
P("<b>Səhnə nümunəsi</b> (Mohenjo-daro, establishing shot):")
CODE("""
aerial establishing shot of Mohenjo-daro at its peak around 2500 BCE, grid-planned streets of baked mud-brick houses, the Great Bath complex at the citadel, Indus River in the distance, merchants with carts and clay pots, morning mist, + [master style prompt]
""")
P("<b>Video (image-to-video) hərəkət prompt-u:</b>")
CODE("""
slow cinematic drone push-in over the ancient city, gentle parallax, people walking naturally in the streets, smoke rising from kilns, subtle wind in fabric, 6 seconds, steady camera, no morphing, no sudden cuts
""")
P("<b>Thumbnail fon prompt-u</b> (mətn sonradan əlavə olunur, sol tərəf boş saxlanılır):")
CODE("""
dramatic wide shot of ancient ruins silhouetted against a blazing orange sunset, ember sparks floating in the air, dark empty negative space on the left third of the frame, high contrast, cinematic, photorealistic, 16:9, no text
""")
P("<b>Short (9:16) prompt-u:</b>")
CODE("""
vertical 9:16 cinematic shot, Mount Vesuvius erupting behind the Roman city of Pompeii in 79 CE, ash cloud covering the sky, citizens running through a stone street, glowing embers falling, photorealistic, dramatic lighting, + [master style prompt]
""")

# ---------------- 8. 30 MÖVZU ----------------
story.append(PageBreak())
H1("8. İlk 30 video (mövzu planı)")
topics = [
 ("Mohenjo-daro: The City That Vanished", "Lost Cities"), ("Göbekli Tepe: The Temple Before Civilization", "Mysteries"),
 ("The Last Day of Pompeii, Hour by Hour", "Lost Cities"), ("The Bronze Age Collapse", "Fallen Empires"),
 ("Petra: The City Carved in Stone", "Lost Cities"), ("What Really Happened at Roanoke?", "Events"),
 ("The Khmer Empire and the Fall of Angkor", "Fallen Empires"), ("The Antikythera Mechanism", "Mysteries"),
 ("Çatalhöyük: Life 9,000 Years Ago", "Lost Cities"), ("The Lost Franklin Expedition", "Events"),
 ("The Hittites: The Empire History Erased", "Fallen Empires"), ("Great Zimbabwe", "Lost Cities"),
 ("The Nazca Lines: What We Actually Know", "Mysteries"), ("The Library of Alexandria", "Events"),
 ("Cahokia: North America's Lost Metropolis", "Lost Cities"), ("The Sea Peoples", "Fallen Empires"),
 ("The Minoans and the Thera Eruption", "Fallen Empires"), ("The Voynich Manuscript", "Mysteries"),
 ("Teotihuacan: City of the Gods", "Lost Cities"), ("The Tunguska Event", "Events"),
 ("The Mali Empire and Mansa Musa", "Fallen Empires"), ("Troy: Myth or Real City?", "Lost Cities"),
 ("Easter Island: The Real Story", "Mysteries"), ("The Sasanian Empire", "Fallen Empires"),
 ("Caral: The Oldest City in the Americas", "Lost Cities"), ("The Lost Colony of Vinland", "Events"),
 ("The Olmecs and the Colossal Heads", "Mysteries"), ("Carthage: Destroyed by Rome", "Fallen Empires"),
 ("Derinkuyu: The Underground City", "Lost Cities"), ("The Dyatlov Pass Incident", "Events")]
TBL([["#", "Long video başlığı (working title)", "Sütun", "Short ideyası"]] +
    [[i + 1, t, p, "Ən təsirli 1 fakt → long-a yönləndirmə"] for i, (t, p) in enumerate(topics)], [8, 88, 30, 44])
P("Ardıcıllıq qaydası: eyni sütundan iki video ardıcıl getmir; ilk 10 video ən böyük axtarış həcmli mövzulardır (Pompeii, Göbekli Tepe, Bronze Age Collapse).")

# ---------------- 9. ADDIM-ADDIM QURULMA ----------------
story.append(PageBreak())
H1("9. Kanalın qurulması — addım-addım (əvvəldən sona)")
steps = [
 ("Mərhələ A — Hazırlıq (Gün -14 … -8)", [
  "Ad və handle əlçatanlığını yoxla (Bölmə 4). Seçimi təsdiqlə.",
  "YPP-nin Azərbaycan üçün əlçatanlığını YouTube Help-də yoxla. Əlçatan deyilsə, qanuni variantları (məsələn şirkət qeydiyyatı olan ölkə) hüquqşünasla müzakirə et — saxta ölkə göstərmə.",
  "Ayrıca Gmail aç (məs. ashenatlas.studio@...). Şəxsi hesabdan ayrı saxla.",
  "Google hesabında 2-Step Verification aktiv et (YouTube bunu monetizasiya üçün tələb edir).",
  "ashenatlas.com domenini və Instagram/TikTok/X handle-larını rezerv et."]),
 ("Mərhələ B — Kanalın yaradılması (Gün -7)", [
  "youtube.com → profil → Create a channel → ad: Ashen Atlas → handle: @AshenAtlas.",
  "Telefonla verify et (youtube.com/verify) — 15 dəqiqədən uzun video yükləmək üçün vacibdir (35 dəq videolar!).",
  "Studio → Settings → Channel → Feature eligibility: Intermediate və Advanced features aktiv et.",
  "Brand Account kimi qur ki, gələcəkdə montajçı/menecer əlavə edə biləsən (Settings → Permissions)."]),
 ("Mərhələ C — Brendinq (Gün -7)", [
  "Customization → Branding: Profile picture = 01_logo_800x800.png; Banner = 02_banner_2560x1440.jpg; Watermark = 07_watermark_150x150.png (display: entire video).",
  "Customization → Basic info: Description (Bölmə 6.1), Links (Instagram, TikTok, sayt), Contact email.",
  "Settings → Channel → Basic info: Country, Keywords (Bölmə 6.2).",
  "Settings → Channel → Advanced: Audience = \"No, set this channel as not made for kids\"."]),
 ("Mərhələ D — Upload defaults (Gün -6)", [
  "Settings → Upload defaults: Title şablonu, Description şablonu (Bölmə 6.3), Tags (əsas 5 tag), Category = Education və ya Entertainment, Language = English, Caption certification.",
  "Advanced: \"Altered content\" sahəsini hər upload-da <b>Yes</b> seç (default yoxdursa, checklist-ə əlavə et).",
  "License: Standard YouTube License; Comments: Hold potentially inappropriate comments."]),
 ("Mərhələ E — Məzmun buferi (Gün -14 … 0)", [
  "İlk 10 long video + 14 Short hazırla (Bölmə 8).",
  "Hər video üçün mənbə siyahısını ayrıca sənəddə saxla (YouTube sorğusu olarsa sübut).",
  "60–90 san channel trailer hazırla: \"What is Ashen Atlas\" + 3 ən güclü səhnə."]),
 ("Mərhələ F — Kanal səhifəsi (Gün -1)", [
  "Playlists: Lost Cities, Fallen Empires, Ancient Mysteries, Forgotten Expeditions, Shorts.",
  "Customization → Layout: Channel trailer (yeni izləyicilər üçün), Featured video (abunəçilər üçün), Sections = playlist-lər.",
  "End screen şablonu: Best for viewer + Subscribe + Playlist."]),
 ("Mərhələ G — Launch (Gün 0)", [
  "İlk gün 3 long video birdən (kanal \"boş\" görünməsin), sonra gündəlik ritm.",
  "Long: 19:00 ET schedule; Short: 12:00 ET. Short-da Related video = həmin günün long videosu.",
  "Instagram/TikTok-da eyni Short-ları paylaş (sənin mövcud auditoriyan üçün körpü)."]),
 ("Mərhələ H — Böyümə və optimizasiya (Gün 1–90)", [
  "Hər long video üçün Test &amp; Compare ilə 3 thumbnail yüklə (YouTube qalibi watch time-a görə seçir).",
  "48 saat sonra yoxla: CTR, ilk 30 san retention, average view duration.",
  "Həftəlik: ən yaxşı 2 videonun formulunu təkrarla, ən zəif sütunu azalt.",
  "YPP şərtlərinə çatan kimi müraciət et; AdSense hesabını qoş."]),
]
for title, items in steps:
    H2(title)
    for i, s in enumerate(items, 1):
        story.append(Paragraph(f"<b>{i}.</b> {s}", st["b"]))

H2("Hər upload üçün compliance checklist")
TBL([["✓", "Yoxlama"],
     ["☐", "Faktlar mənbə ilə yoxlanıb, mənbələr description-dadır"],
     ["☐", "Altered content = Yes; videoda və description-da AI disclosure cümləsi"],
     ["☐", "Musiqi lisenziyalıdır; istifadə olunan bütün foto public domain / CC"],
     ["☐", "Qrafik zorakılıq, qan, şok səhnə yoxdur"],
     ["☐", "Yaşayan real şəxsin realistic AI təsviri yoxdur"],
     ["☐", "Bu video əvvəlki videoların şablon təkrarı deyil (yeni struktur, yeni vizual)"],
     ["☐", "Başlıq və thumbnail videonun məzmununu düzgün əks etdirir (clickbait ≠ yalan)"],
     ["☐", "Chapters, end screen, Short-a related video bağlantısı"],
     ], [10, 160])

# ---------------- 10. KPI ----------------
H1("10. 90 günlük hədəflər (KPI)")
TBL([["Metrik", "Gün 30", "Gün 60", "Gün 90"],
     ["Long video sayı", "20–25", "50–55", "80–90"],
     ["Thumbnail CTR", "4%+", "5%+", "6%+"],
     ["Average view duration (35 dəq video)", "6 dəq+", "8 dəq+", "10 dəq+"],
     ["Abunəçi", "Hədəf deyil, öyrənmə dövrü", "1,000 hədəfi", "YPP şərtlərinə yaxınlaşmaq"],
     ], [70, 33, 33, 34])
P("Qeyd: bu rəqəmlər zəmanət deyil, nişin orta göstəricilərinə əsaslanan təxmini istiqamətdir. Real nəticə ilk 10 videonun datası ilə dəqiqləşdiriləcək.")

# ---------------- 11. MƏNBƏLƏR ----------------
H1("11. Mənbələr")
for s in [
 "YouTube Help — Disclosing use of altered or synthetic content: support.google.com/youtube/answer/14328491",
 "YouTube Blog — Improving AI labels for viewers and creators (May 2026): blog.youtube/news-and-events/improving-ai-labels-viewers-creators/",
 "TechCrunch — YouTube clarifies policies around AI slop and upsetting videos (20.07.2026)",
 "Music Business Worldwide — YouTube will now automatically detect and label AI videos",
 "DFRLab — AI-generated YouTube channels co-opt war coverage (23.03.2026)",
 "Search Engine Journal — YouTube's AI Slop Problem And How Marketers Can Compete",
 "SlashGear — Nearly a quarter of YouTube videos fed to new accounts are 'AI slop'",
 "Glock Media — Faceless YouTube niches breaking out (Nov 2026)",
 "Branzly — Fastest growing faceless YouTube channels 2026",
 "Taletok — Top 15 faceless YouTube channels in 2026",
 "Medium (Write A Catalyst) — How much can you earn from AI YouTube videos in 2026",
 "Banner ölçüləri: havecamerawilltravel.com/youtube-banner-size, async.com/blog/youtube-banner-size",
]:
    story.append(Paragraph(s, st["b"], bulletText="•"))

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title="Ashen Atlas — YouTube Channel Plan", author="Shahin Salimov")
doc.build(story, onFirstPage=cover, onLaterPages=later)
print("ok", OUT)
