import re
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

D = "/usr/share/fonts/truetype/dejavu/"
for n, f in [("S", "DejaVuSans.ttf"), ("SB", "DejaVuSans-Bold.ttf"), ("SR", "DejaVuSerif-Bold.ttf"),
             ("SE", "DejaVuSerif.ttf"), ("M", "DejaVuSansMono.ttf")]:
    pdfmetrics.registerFont(TTFont(n, D + f))
registerFontFamily("S", normal="S", bold="SB", italic="S", boldItalic="SB")
registerFontFamily("SE", normal="SE", bold="SR", italic="SE", boldItalic="SR")

BASE = "/home/user/Shahin_Salimov/ashen-atlas/"
G = BASE + "video-01-mohenjo-daro/graphics/"
OUT = BASE + "video-01-mohenjo-daro/Video_01_Mohenjo-daro_Ssenari.pdf"
EMBER = colors.HexColor("#E8772E"); CHAR = colors.HexColor("#0E0F12"); GOLD = colors.HexColor("#C9A45C")
PARCH = colors.HexColor("#F4EDE0"); GREY = colors.HexColor("#5A5A5A")

st = {
    "h1": ParagraphStyle("h1", fontName="SR", fontSize=19, leading=24, textColor=CHAR, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="SB", fontSize=12.5, leading=16, textColor=EMBER, spaceBefore=9, spaceAfter=4),
    "p": ParagraphStyle("p", fontName="S", fontSize=9.4, leading=13.5, spaceAfter=4),
    "b": ParagraphStyle("b", fontName="S", fontSize=9.4, leading=13.5, leftIndent=12, bulletIndent=2, spaceAfter=2),
    "nar": ParagraphStyle("nar", fontName="SE", fontSize=10.2, leading=15.5, spaceAfter=6, leftIndent=8,
                          borderPadding=(2, 0, 2, 6), borderColor=EMBER, borderWidth=0),
    "vis": ParagraphStyle("vis", fontName="S", fontSize=8.4, leading=11.5, textColor=colors.HexColor("#3B4A5A"),
                          backColor=colors.HexColor("#EEF3F7"), borderPadding=5, leftIndent=8, rightIndent=4, spaceBefore=2, spaceAfter=7),
    "code": ParagraphStyle("code", fontName="M", fontSize=7.9, leading=11, backColor=PARCH, borderPadding=5,
                           leftIndent=8, rightIndent=4, spaceBefore=2, spaceAfter=7),
    "cap": ParagraphStyle("cap", fontName="S", fontSize=7.8, leading=10, textColor=GREY, alignment=1, spaceAfter=8),
    "cell": ParagraphStyle("cell", fontName="S", fontSize=8.2, leading=11),
    "cellb": ParagraphStyle("cellb", fontName="SB", fontSize=8.2, leading=11, textColor=colors.white),
    "note": ParagraphStyle("note", fontName="S", fontSize=8.9, leading=12.5, backColor=colors.HexColor("#FFF4E8"),
                           borderPadding=6, leftIndent=6, rightIndent=6, spaceBefore=4, spaceAfter=8),
    "sec": ParagraphStyle("sec", fontName="SB", fontSize=12, leading=16, textColor=colors.white, backColor=CHAR,
                          borderPadding=(5, 6, 5, 6), spaceBefore=12, spaceAfter=8),
}
story = []
def H1(t): story.append(Paragraph(t, st["h1"]))
def H2(t): story.append(Paragraph(t, st["h2"]))
def P(t): story.append(Paragraph(t, st["p"]))
def NOTE(t): story.append(Paragraph(t, st["note"]))
def B(items):
    for i in items: story.append(Paragraph(i, st["b"], bulletText="•"))
def esc(t): return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def CODE(t): story.append(Paragraph(esc(t.strip()).replace("\n", "<br/>"), st["code"]))
def TBL(rows, widths):
    data = [[Paragraph(str(c), st["cellb"] if r == 0 else st["cell"]) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), CHAR), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PARCH]),
                           ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
                           ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]))
    story.append(t); story.append(Spacer(1, 7))
def IM(path, w_mm, cap):
    from PIL import Image as PI
    w, h = PI.open(path).size
    story.append(KeepTogether([Image(path, width=w_mm * mm, height=w_mm * mm * h / w), Paragraph(cap, st["cap"])]))

WORDS = 0
STYLE = "+ [MASTER STYLE PROMPT]"
def SECTION(time, name, beats):
    """beats: list of ('n', narration) | ('v', visual note AZ) | ('p', prompt EN) | ('g', graphic path, caption)"""
    global WORDS
    story.append(Paragraph(f"{time}  •  {name}", st["sec"]))
    for b in beats:
        if b[0] == "n":
            WORDS += len(b[1].split())
            story.append(Paragraph(esc(b[1]), st["nar"]))
        elif b[0] == "v":
            story.append(Paragraph("<b>VİZUAL:</b> " + b[1], st["vis"]))
        elif b[0] == "p":
            story.append(Paragraph("<b>PROMPT:</b> " + esc(b[1]), st["code"]))
        elif b[0] == "g":
            IM(b[1], b[3] if len(b) > 3 else 150, b[2])

# ============ COVER ============
def cover(c, doc):
    W, H = A4
    c.setFillColor(CHAR); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.drawImage(G + "T1_thumbnail_A.jpg", 15 * mm, H - 15 * mm - (W - 30 * mm) * 9 / 16, W - 30 * mm, (W - 30 * mm) * 9 / 16)
    c.setFillColor(colors.HexColor("#E9DCC3")); c.setFont("SR", 22)
    c.drawCentredString(W / 2, 120 * mm, "VIDEO #1 — TAM SSENARİ")
    c.setFont("SR", 15); c.setFillColor(GOLD)
    c.drawCentredString(W / 2, 108 * mm, "40,000 People Vanished From This City. Here's Why.")
    c.setFont("S", 10.5); c.setFillColor(colors.white)
    c.drawCentredString(W / 2, 96 * mm, "Mohenjo-daro  •  Lost Cities  •  ~35 dəqiqə  •  English narration")
    c.drawCentredString(W / 2, 89 * mm, "+ 1 Short ssenarisi  •  prompt-lar  •  qrafikalar  •  description  •  mənbələr")
    c.drawImage(BASE + "images/01_logo_800x800.png", W / 2 - 18 * mm, 35 * mm, 36 * mm, 36 * mm)
    c.setFont("S", 8.5); c.setFillColor(GREY)
    c.drawCentredString(W / 2, 22 * mm, "ASHEN ATLAS  •  Şahin Səlimov üçün hazırlanıb  •  23 noyabr 2026")

def later(c, doc):
    W, H = A4
    c.setFillColor(EMBER); c.rect(0, H - 5 * mm, W, 5 * mm, fill=1, stroke=0)
    c.setFont("S", 7.5); c.setFillColor(GREY)
    c.drawString(18 * mm, 10 * mm, "ASHEN ATLAS  •  Video #1: Mohenjo-daro")
    c.drawRightString(W - 18 * mm, 10 * mm, str(doc.page))

story.append(PageBreak())

# ============ 0. PASPORT ============
H1("0. Video pasportu")
TBL([["Sahə", "Dəyər"],
     ["Başlıq (əsas)", "<b>40,000 People Vanished From This City. Here's Why.</b> (49 simvol)"],
     ["A/B başlıqlar", "1) Mohenjo-daro: The City That Had No Kings  2) The Lost City That Was 4,500 Years Ahead"],
     ["Thumbnail (Test &amp; Compare)", "T1 \"40,000 PEOPLE VANISHED\" • T2 \"NO KINGS. NO PALACES. NO WAR?\" • T3 \"4,500 YEARS AHEAD?\""],
     ["Uzunluq", "Narration ≈ {WORDS} söz → documentary tempi 135–140 wpm + musiqi pauzaları ≈ 35 dəqiqə. Mid-roll nöqtələri: 06:50, 11:00, 16:00, 20:00, 24:35, 28:00, 31:35"],
     ["Narrator səsi", "Dərin, sakit, kişi documentary səsi (ElevenLabs). Stability 55–60%, Style 15–20%, sürət 0.95."],
     ["Musiqi", "Ambient / ethnic drone (sitar yox — Indus mədəniyyəti sitardan minilliklər əvvəldir). Lisenziyalı kitabxanadan."],
     ["AI disclosure", "Studio → Altered content = <b>Yes</b>. 00:40-da ekranda kiçik yazı: \"Historical scenes are AI-generated reconstructions.\""],
     ["Vizual sayı", "~80–90 səhnə: ~60 AI rekonstruksiya, 6 orijinal qrafika (bu PDF-də), 10–15 real foto (Wikimedia, Bölmə 12)"],
     ], [40, 130])
NOTE("<b>Hekayənin dürüst nüvəsi:</b> başlıq \"vanished\" deyir, amma ssenari açıq şəkildə izah edir ki, insanlar bir gecədə yox olmayıb — "
     "şəhər nəsillər boyu tədricən boşalıb, insanlar başqa bölgələrə köçüb. Bu, həm clickbait-in \"vədini\" yerinə yetirir, həm də "
     "misinformation riskini aradan qaldırır. 40,000 rəqəmi alimlərin təxminidir və narration-da \"as many as / estimates\" kimi verilir.")
H2("Rəng kodları (bu PDF-də)")
B(["<b>Serif mətn</b> = narration (səsləndiriləcək mətn, ingiliscə).",
   "<b>Mavi blok</b> = VİZUAL: ekranda nə görünür (montaj təlimatı, Azərbaycanca).",
   "<b>Bej blok</b> = PROMPT: şəkil/video generasiya üçün (ingiliscə). Hər prompt-a Master Style Prompt əlavə olunur."])
H2("Master Style Prompt (hər səhnəyə əlavə et)")
CODE("""
cinematic historical reconstruction of the Indus Valley Civilization, c. 2500 BCE, photorealistic, 35mm film look, warm golden hour light, dust and drifting ember particles, muted ochre and terracotta earth tones, baked red-brown brick architecture, people with dark hair and South Asian features wearing simple undyed or red-dyed cotton garments, shell and carnelian bead jewelry, shallow depth of field, anamorphic lens, documentary realism, 16:9, no text, no logos, no modern objects, no metal armor, no horses
""")
P("Qeyd: \"no horses\" vacibdir — Indus şəhərlərində at istifadəsi sübut olunmayıb; AI modelləri tez-tez qədim səhnələrə at əlavə edir. "
  "Eyni səbəbdən monumental saray, qılınclı ordu, kral tacı da yoxdur.")

# ============ SCRIPT ============
story.append(PageBreak())
H1("1. Ssenari (narration + vizual + prompt)")

SECTION("00:00 – 00:40", "COLD OPEN", [
 ("v", "Qaranlıq ekran, külək səsi. Yavaş-yavaş tozlu, boş kərpic küçə açılır. Kamera boş evlərin arasından irəliləyir."),
 ("p", "slow dolly shot through an empty ancient brick street at dawn, abandoned houses with open doorways, dust blowing across the ground, a single clay pot left on a doorstep, eerie silence, no people " + STYLE),
 ("n", "Four and a half thousand years ago, on the banks of the Indus River, there was a city with straight streets, covered drains, and hundreds of private wells. As many as forty thousand people may have lived here. It was one of the largest cities on Earth."),
 ("n", "And then, slowly, it emptied. No great fire. No conquering army. No final battle carved in stone. The people simply... left. Their language was never deciphered. Even the city's real name is lost."),
 ("v", "Kadr qaralır. Cümlə bitəndə kül hissəcikləri ekranı doldurur."),
 ("n", "Today we call it Mohenjo-daro. The Mound of the Dead."),
])
SECTION("00:40 – 01:15", "TITLE + VƏD", [
 ("v", "5 saniyəlik Ashen Atlas intro (kompas + köz). Sonra ekranda başlıq: MOHENJO-DARO. Altda kiçik yazı: \"Historical scenes are AI-generated reconstructions.\""),
 ("n", "In this documentary, we'll walk the streets of Mohenjo-daro at its peak. We'll look at what its people built, what they traded, and what they left behind. And we'll try to answer three questions. Who ran a city with no visible kings? How did they build something so advanced, so early? And where did forty thousand people go?"),
])
SECTION("01:15 – 06:50", "KONTEKST: KƏŞF VƏ DÜNYA", [
 ("v", "1920-ci illər üslubunda, sepia tonlu səhnə: Britaniya Hindistanında arxeoloqlar təpənin üstündə. Sonra real foto: təpədəki Buddist stupası (Wikimedia, Bölmə 12)."),
 ("p", "1920s archaeological excavation in the Sindh desert, sepia photograph style, local workers with baskets and an archaeologist in a pith helmet standing on a brick mound, a ruined Buddhist stupa on top, film grain, vintage documentary look, 16:9"),
 ("n", "In the early nineteen-twenties, the mound looked like nothing special. A low hill of earth and broken brick in the province of Sindh, in what is now Pakistan. On top of it stood the ruins of a Buddhist stupa, built many centuries after the city below had been forgotten. Archaeologists came for the stupa."),
 ("n", "In nineteen twenty-two, an officer of the Archaeological Survey of India, R. D. Banerji, began digging. Beneath the Buddhist layers, he found something older. Much older. Bricks laid in a way no one expected. Small carved seals with animals and a strange script. And the seals looked almost exactly like the ones being dug up at another site, Harappa, more than five hundred kilometres to the north."),
 ("n", "In nineteen twenty-four, the director of the survey, Sir John Marshall, announced the discovery to the world. Two cities, hundreds of kilometres apart, belonged to the same forgotten civilization. Historians had believed that India's story began much later. Overnight, it moved back by thousands of years."),
 ("n", "Excavations continued for decades. Marshall's team, and later Ernest Mackay, uncovered large parts of the city in the nineteen-twenties and thirties. Mortimer Wheeler dug on the Citadel in nineteen-fifty. In the nineteen-sixties, the American archaeologist George Dales tried to reach the very first layers of the city. He couldn't. The deepest levels lie below the modern water table, flooded by groundwater. Even today, no one has seen the bottom of Mohenjo-daro. We don't know exactly how old its earliest buildings are, or how large the city really became. Much of it may still be hidden under the silt of the plain."),
 ("g", G + "G1_map_indus_civilization.png", "Qrafika G1 — Indus sivilizasiyasının xəritəsi (01:15–06:00 arası 20–25 san ekranda qalır, şəhərlər bir-bir yanır).", 150),
 ("n", "We now call it the Indus Valley Civilization, or the Harappan Civilization. At its height, between roughly two thousand six hundred and nineteen hundred BCE, it stretched across most of modern Pakistan and into northwest India and Afghanistan. More than a thousand settlements have been found. By area, it was larger than ancient Egypt and Mesopotamia combined."),
 ("n", "But civilizations don't appear out of nowhere, and neither did this one. Its roots go back thousands of years earlier, to farming villages in the hills to the west of the Indus. At a site called Mehrgarh, in today's Balochistan, people were growing barley and wheat and herding cattle, sheep and goats as early as around seven thousand BCE. Over the following millennia, villages grew into towns. Potters, bead makers and metalworkers refined their crafts. Trade routes linked the hills to the plains. By the time Mohenjo-daro was founded, the people of this region already had thousands of years of experience in farming, building and trading."),
 ("p", "a Neolithic farming village of mud-brick houses at the foot of dry brown hills, people harvesting barley with sickles, herds of humped zebu cattle and goats, simple granaries, morning haze " + STYLE),
 ("n", "What changed, around four thousand six hundred years ago, was scale. In just a few generations, a handful of settlements grew into true cities, with populations in the tens of thousands, and a shared culture spread across an enormous region. Archaeologists still debate exactly how and why this happened so quickly. But the result was one of the first great urban civilizations in human history."),
 ("n", "To put that in perspective: when Mohenjo-daro was being laid out, the Great Pyramid of Giza was either brand new or still under construction. The city of Babylon was not yet important. And Stonehenge, in Britain, was still a work in progress."),
 ("v", "Split-screen: solda Giza piramidası tikintidə, sağda Mohenjo-daro tikintidə. Hər ikisinin altında \"c. 2500 BCE\"."),
 ("p", "split composition, left: Great Pyramid of Giza under construction with ramps and workers, right: ancient Indus city of baked brick being built on a huge raised platform by the river, same golden light, epic wide shot " + STYLE),
 ("n", "Egypt had its pharaohs. Mesopotamia had its kings and their boastful inscriptions. The Indus Civilization left us something different. No royal tombs filled with gold. No statues of conquering rulers. No palace that archaeologists can point to with confidence. Instead, it left us cities. Carefully planned, remarkably uniform cities. And the greatest of them all was Mohenjo-daro."),
 ("n", "The city was built on two main areas. To the west, a high mound that archaeologists call the Citadel, raised on a massive platform of mud brick and earth. To the east, a much larger Lower Town, where most people lived and worked. Both were built up deliberately, high above the plain. And there was a reason for that. The Indus was the city's lifeline. It was also its greatest threat."),
 ("v", "Dron kadrı: geniş çay, daşqın düzənliyi, şəhər süni platformanın üstündə. Sonra çayın daşması (kiçik dramatik kadr)."),
 ("p", "aerial drone view of a great brown river winding across a flat green floodplain, an ancient brick city standing on raised artificial platforms beside it, fields of wheat and barley, monsoon clouds gathering on the horizon " + STYLE),
 ("n", "Every year, melting snow from the Himalayas and the summer monsoon swelled the river. The floods brought the rich silt that fed the fields of wheat, barley and cotton. But floods could also wash a city away. So the builders of Mohenjo-daro did something remarkable. Before they built houses, they built ground. Enormous brick platforms, lifting the city above the danger. Over the centuries, the city was rebuilt again and again on top of its own ruins, rising layer by layer."),
])
SECTION("06:50 – 15:00", "YÜKSƏLİŞ: PLANLAŞDIRILMIŞ ŞƏHƏR", [
 ("v", "Səhər. Kamera Lower Town-un əsas küçəsi ilə irəliləyir: düz küçələr, iki mərtəbəli kərpic evlər, kənarda örtülü drenaj kanalı."),
 ("p", "wide street-level shot of a bustling ancient Indus city main street at morning, straight wide street, two-storey baked brick houses with plain walls and small windows facing side lanes, covered brick drain running along the street edge, merchants with bullock carts, children playing " + STYLE),
 ("n", "Let's walk into the Lower Town on an ordinary morning, around four and a half thousand years ago."),
 ("n", "The first thing you would notice is the order. The main streets run in straight lines, roughly north to south and east to west. The widest are around ten metres across, enough for two bullock carts to pass each other with room to spare. Smaller lanes branch off between the blocks of houses. This was not a village that grew by accident. Someone planned it."),
 ("g", G + "G3_city_plan.png", "Qrafika G3 — Şəhər planı (Citadel və Lower Town). 07:30 ətrafında.", 150),
 ("n", "Then you would notice the bricks. Millions of them, fired in kilns, and almost all made to the same proportions: their thickness, width and length in a ratio of one to two to four. The same proportions turn up at Harappa, hundreds of kilometres away, and at sites across the civilization. Think about what that requires. Shared standards, shared knowledge, and some way of making sure everyone followed them, across an area larger than many modern countries."),
 ("v", "Close-up: kərpic qəlibi, palçıq, sobada yanmış kərpiclər. Ekranda: 1 : 2 : 4."),
 ("p", "close-up of ancient brick makers pressing wet clay into wooden rectangular moulds, rows of drying mud bricks in the sun, a smoking kiln in the background, hands covered in clay " + STYLE),
 ("n", "Step inside one of the houses and the picture becomes even more surprising. The doors usually open from the side lanes, not the busy main streets. Behind them, rooms are arranged around an open courtyard. Stairs lead to an upper floor or a flat roof. Many houses had their own well. Archaeologists estimate the city had around seven hundred wells in total. In a world where most people fetched water from a river, the families of Mohenjo-daro drew clean water inside their homes."),
 ("p", "interior courtyard of an ancient Indus brick house, a woman drawing water from a round brick-lined well with a rope and clay pot, cooking hearth, grinding stone, steps leading to a flat roof, soft morning light " + STYLE),
 ("n", "And there is more. Many houses had a dedicated bathing area: a floor of carefully fitted bricks, sloping gently toward a drain. Some had what appear to be toilets. The waste water did not simply spill into the street. It flowed through clay pipes and channels into drains that ran along the streets, covered with bricks or stone slabs. At intervals there were soak pits and inspection points, places where the drains could be cleaned."),
 ("v", "Kəsik görüntü (cutaway): evin hamam döşəməsi → divardakı kanal → küçə altındakı örtülü drenaj. Mətn: \"Covered drains, c. 2500 BCE\"."),
 ("p", "cutaway cross-section view of an ancient brick house showing a sloped brick bathing floor, a clay pipe through the wall, and a covered brick drain under the street outside, educational reconstruction, warm light " + STYLE),
 ("n", "Many cities in the world would not have anything like this for thousands of years. It is one reason why people sometimes call Mohenjo-daro 'ahead of its time.' But it's worth being careful with that phrase. The people of the Indus were not ahead of their time. They were exactly of their time, and their time was more sophisticated than we used to imagine."),
 ("n", "Now let's climb up to the Citadel. Here, on the highest part of the city, stands the most famous structure in Mohenjo-daro. Archaeologists named it the Great Bath."),
 ("v", "Səhər işığında Great Bath: düzbucaqlı hovuz, hər iki tərəfdə pilləkənlər, ətrafında dəhliz. Sonra real foto (Bölmə 12)."),
 ("p", "the Great Bath of Mohenjo-daro at sunrise, a large rectangular sunken pool of finely fitted baked bricks, wide staircases at both ends, surrounded by a brick colonnade and small rooms, still water reflecting the sky, a few figures in white cotton descending the steps " + STYLE),
 ("n", "The Great Bath does not stand alone. Around it, excavators found a cluster of large buildings. One, with many rooms and a courtyard, was nicknamed 'the College', on the guess that it housed priests. Another, further south on the Citadel, has rows of brick pillar bases and is often called the Assembly Hall. These names are guesses too. But together they suggest that the Citadel was a place for public, perhaps religious, activities, set apart and above the busy Lower Town."),
 ("g", G + "G4_great_bath_section.png", "Qrafika G4 — Great Bath kəsiyi (ölçülər təxmini).", 150),
 ("n", "The pool is about twelve metres long and seven metres wide, and around two and a half metres deep. Broad staircases lead down into it from the north and the south. The bricks were cut and fitted so tightly that they still look sharp today, and they were laid in gypsum mortar. Behind them, the builders added a layer of bitumen, a natural tar, to make it waterproof. Water came from a well nearby, and a large drain could empty the pool when needed."),
 ("n", "Was it a public swimming pool? Almost certainly not. Most archaeologists believe it had a ritual purpose, a place for bathing as an act of purification. Water and cleanliness clearly mattered to the people of this city, and ritual bathing would later become important in many South Asian religious traditions. But we have to be honest: no inscription tells us what the Great Bath was for. It is our best interpretation, not a fact."),
 ("n", "Next to the bath stands another large building. Early excavators called it the Great Granary, imagining it full of grain collected as taxes. But no grain has ever been found inside. Today, many archaeologists prefer the more careful name: the Great Hall. It's a pattern you'll notice throughout this story. The first explanations were often borrowed from other civilizations, and many of them turned out to be wrong."),
 ("p", "a massive ancient brick platform building on a citadel mound with a grid of solid brick blocks and narrow air passages between them, wooden superstructure, workers carrying baskets up a ramp, overcast light " + STYLE),
 ("v", "\"A DAY IN MOHENJO-DARO\" bölməsi. Ekranda kiçik yazı: \"Dramatised reconstruction\". Bir bead-maker ailəsinin günü."),
 ("n", "Let's try to imagine a single day in the city. This is a reconstruction, built from what archaeologists have found. The people are imagined. The objects, the streets and the work are real."),
 ("n", "Before sunrise, in a house in the Lower Town, a family wakes up. Someone draws water from the well in the courtyard. Someone else grinds grain on a stone, for flatbread baked on the hearth. They eat barley and wheat, peas and lentils, sesame, dates, and sometimes meat from cattle, sheep, goats, or fish caught in the river."),
 ("p", "pre-dawn interior of an ancient Indus brick house lit by a small oil lamp, a woman grinding grain on a saddle quern, flatbread cooking on a clay hearth, a man pulling a rope from a courtyard well, warm intimate light " + STYLE),
 ("n", "The family are bead makers. In a small workshop, the father heats pieces of raw agate and carnelian to deepen their colour. Then comes the slow part: drilling. Archaeologists have found the specialised stone drills that Indus craftsmen used to bore holes through hard stone beads, sometimes long, narrow holes that could take days of patient work for a single bead. These beads were luxury goods, and some of them would end up in the graves of Mesopotamian royalty, thousands of kilometres away."),
 ("p", "a craftsman in a small brick workshop drilling a long red carnelian bead with a bow drill, fine stone dust, piles of polished agate and carnelian beads in clay bowls, focused expression, side light through a doorway " + STYLE),
 ("n", "By mid-morning, the streets are busy. Bullock carts with solid wooden wheels carry grain, firewood and pottery. Shell workers cut bangles from sea shells brought up from the coast. Potters turn red clay on wheels and paint it with black designs: fish scales, intersecting circles, pipal leaves. A merchant checks a load of goods against a set of stone weights, then presses his seal into a lump of clay to close the bundle."),
 ("p", "busy ancient Indus market street at midday, potters at wheels with red pottery painted with black patterns, a shell bangle maker, a merchant weighing goods with stone cube weights on a balance scale, bullock carts with solid wooden wheels " + STYLE),
 ("n", "In the evening, when the heat fades, people climb to their flat roofs to catch the breeze from the river. Children play with clay toys. Somewhere on the Citadel, people may be gathering at the Great Bath. And beneath the streets, the drains carry the day's water away. It is, in many ways, an ordinary day. That is exactly what makes it extraordinary, four and a half thousand years ago."),
 ("p", "evening on the flat rooftops of an ancient brick city, families sitting on mats, children playing with clay toys, oil lamps being lit, the river glowing orange in the distance, peaceful atmosphere " + STYLE),
 ("n", "So who organised all of this? Who decided the width of the streets, the size of the bricks, the layout of the drains? In Egypt or Mesopotamia, the answer would be obvious: the king. But in Mohenjo-daro, archaeologists have not found a palace. They have not found a royal tomb. They have found no grand monuments to a ruler, and remarkably few weapons."),
 ("v", "Yavaş kamera: Citadel-in üstündən bütün şəhərə baxış. Kadrın ortasında boşluq — \"saray yoxdur\" hissi."),
])
SECTION("15:00 – 16:00", "RE-HOOK", [
 ("v", "Musiqi kəsilir. Qaranlıq fon üzərində kiçik heykəlcik — Priest-King-in silueti. Mətn: \"The only 'king' we have... may not be a king at all.\""),
 ("n", "There is one small stone figure that people have called a king. He has a neat beard, a band around his forehead, and a robe decorated with a pattern of three-lobed shapes. Early archaeologists named him the 'Priest-King.' It is a wonderful name. The problem is that we have no idea whether he was a priest. Or a king. Or anything of the kind."),
 ("n", "In the next part of this story, we'll look at what the people of Mohenjo-daro did leave behind. Tiny objects that tell a story of trade across the sea, a writing system that no one can read, and a system of measurement so consistent that it still impresses scientists today."),
])
SECTION("16:00 – 24:35", "ZİRVƏ: TİCARƏT, MÖHÜRLƏR, YAZI, SƏNƏT", [
 ("v", "Real foto: Priest-King heykəli (Karaçi, National Museum of Pakistan). Sonra Unicorn seal fotosu."),
 ("n", "The Priest-King is only about seventeen and a half centimetres tall, carved from a soft stone called steatite. Today he is kept in the National Museum of Pakistan in Karachi. Small as he is, he has become the face of an entire civilization. But to understand how this city really worked, we need to look at even smaller objects. Seals."),
 ("n", "Thousands of carved stone seals have been found at Indus sites, many of them in Mohenjo-daro. Most are small and square, just a few centimetres across. They were carved with remarkable skill, showing animals like the bull, the elephant, the rhinoceros, the tiger. And the most common animal of all is one that does not exist: a creature that looks like a bull with a single horn. Archaeologists call it the 'unicorn.'"),
 ("p", "macro photograph style close-up of a small square carved steatite seal showing a one-horned bull-like animal in profile above a row of unknown symbols, an artisan's fingers holding a copper engraving tool, soft side light " + STYLE),
 ("n", "Above the animals, there is a short line of symbols. This is the Indus script. Scholars have catalogued somewhere around four hundred to six hundred different signs. Most inscriptions are very short, often only about five signs long. And despite a century of effort, by linguists, archaeologists and even computer scientists, no one has deciphered it. We don't know what language the people of Mohenjo-daro spoke. We cannot read a single word they wrote."),
 ("n", "Why is it so hard? Egyptian hieroglyphs were cracked thanks to the Rosetta Stone, which carried the same text in a known language. For the Indus script, no such bilingual text has ever been found. The inscriptions are also extremely short, which gives codebreakers very little to work with. Scholars have proposed connections to Dravidian languages, the family that includes Tamil today, and to other language families. Some researchers have even argued that the signs were not a full writing system at all. None of these ideas has been proven. If a long inscription, or a bilingual tablet from Mesopotamia, is ever found, it could change everything."),
 ("v", "Rosetta Stone (real foto, British Museum, public domain kimi yoxla) yanında Indus möhürü. Mətn: \"No bilingual key found\"."),
 ("v", "Ekranda Indus işarələri bir-bir yanır, sonra üstündən sual işarəsi. Mətn: \"~400–600 signs • average ~5 signs • not deciphered\"."),
 ("n", "So what were the seals for? The most likely answer is trade. When the seals were pressed into wet clay, they left an image, and clay tags with seal impressions have been found attached to goods. They worked like a signature, or a brand, showing who owned a package or who vouched for it. And those packages travelled very far indeed."),
 ("n", "More than four thousand years ago, cuneiform texts in Mesopotamia mention a distant land called Meluhha. Ships from Meluhha, one famous inscription boasts, docked at the capital of Sargon of Akkad. Meluhha supplied things like carnelian, ivory, fine woods and precious stones. Most historians believe that Meluhha was the Indus Civilization."),
 ("n", "There may even have been Indus people living in Mesopotamia. Texts mention a 'Meluhha village' near the city of Lagash. And a cylinder seal now in the Louvre belonged to a man named Shu-ilishu, described as an interpreter for the Meluhhan language. Think about that. More than four thousand years ago, someone made a living translating between the people of the Indus and the people of Mesopotamia. Unfortunately for us, he left no dictionary behind."),
 ("v", "Animasiya: G1 xəritəsindəki qızılı ox canlanır — dəniz yolu ilə Fars körfəzinə. Sonra gəmi səhnəsi."),
 ("p", "ancient wooden reed-and-plank sailing boat with a square sail leaving a river delta into the open Arabian Sea at sunset, sealed bales of cargo and clay jars on deck, sailors pulling ropes, cinematic wide shot " + STYLE),
 ("n", "And the archaeology agrees. Indus-style seals have been found in Mesopotamian cities. Long red carnelian beads, etched with white patterns in a technique typical of the Indus, have been found in the royal graves at Ur. Goods, ideas and people were moving across thousands of kilometres of sea and land, more than four thousand years ago."),
 ("n", "Mohenjo-daro was not alone. Far to the south, on the coast of Gujarat, the town of Lothal had a large brick basin that many archaeologists interpret as a dock, though others think it was a water reservoir. To the southeast, the city of Dholavira, in the dry Rann of Kutch, built a remarkable system of stone reservoirs to capture and store rainwater. Different cities solved different problems, but they shared the same seals, the same weights, the same script. A traveller moving between them would have found a world that felt familiar."),
 ("p", "aerial view of an ancient stone-built city in a dry salt desert landscape with large rectangular stone water reservoirs cut into the ground, channels leading to them, monsoon clouds approaching " + STYLE),
 ("n", "Trade needs trust. And trust needs standards. Which brings us to one of the most quietly impressive discoveries at Mohenjo-daro: a set of small stone cubes."),
 ("g", G + "G5_weights.png", "Qrafika G5 — Indus çəki sistemi (təxmini).", 140),
 ("n", "They are weights, usually made of polished chert. And they follow a system. The smaller weights double in steps, one, two, four, eight, sixteen, thirty-two, sixty-four, and the larger ones continue in decimal multiples. The basic unit was roughly fourteen grams. The same system has been found from the Indus all the way to the coast of Gujarat. A merchant in one city could trade with a merchant in another, hundreds of kilometres away, and both would agree on what a fair weight was."),
 ("n", "So the people of Mohenjo-daro had standard bricks, standard weights, a shared script and a shared style of seals. But they also had art, and some of it is extraordinary."),
 ("v", "Real foto: \"Dancing Girl\" bürünc heykəlciyi (National Museum, New Delhi). Yavaş 360° rekonstruksiya kadrı."),
 ("n", "In nineteen twenty-six, excavators found a small bronze figure of a young woman, only about ten and a half centimetres tall. She stands with one hand on her hip, her chin raised, her arm covered in bangles. She was cast using the lost-wax method, an advanced metalworking technique. She has become known as the Dancing Girl, though, like the Priest-King, the name is our invention. Today she is in the National Museum in New Delhi. More than four thousand years after she was made, her confidence is still striking."),
 ("p", "ancient bronze workshop at night, a metalsmith pouring molten bronze into a small clay mould by firelight, wax figurines on a workbench, glowing sparks, intense orange light " + STYLE),
 ("n", "Everyday life left traces too. Archaeologists have found children's toys: little clay carts with wheels that turn, animal figurines with movable heads, whistles, marbles and dice. They have found jewellery of gold, shell, faience and carnelian. And at Mohenjo-daro, they found tiny fragments of cotton cloth, some of the earliest evidence of woven cotton anywhere in the world. Every time you wear a cotton shirt, you are wearing something with a history that runs through cities like this."),
 ("n", "Some objects hint at what people believed. One famous seal shows a figure seated in a cross-legged pose, wearing a horned headdress, surrounded by animals. Early scholars called it the 'Pashupati' seal and linked it to the later Hindu god Shiva, 'lord of the animals.' It's an exciting idea, but it is also hotly debated. Many terracotta female figurines have also been found, which some interpret as evidence of mother goddess worship, and others see simply as household objects. Once again, without written texts we can read, we are interpreting silence."),
 ("p", "children playing in the shade of a brick house in an ancient Indus city, rolling small terracotta toy carts with wooden wheels, clay animal figurines on the ground, a mother weaving cotton thread nearby " + STYLE),
 ("n", "And then there is that mystery we keep coming back to. A city of tens of thousands, with planning, standards, long-distance trade and fine art, but no clear evidence of kings, armies or great temples. Some researchers think power was shared among merchant families, or councils, or religious leaders. Others think there were rulers who simply chose not to glorify themselves in stone. The honest answer is that we don't know. But it raises a fascinating possibility: that one of the world's first great urban civilizations may have been organised in a way that looks very different from the empires we usually read about."),
])
SECTION("24:35 – 31:35", "ÇÖKÜŞ: ŞƏHƏR NİYƏ BOŞALDI?", [
 ("n", "For around six hundred years, Mohenjo-daro thrived. It had planning, prosperity and connections that reached across the sea. And yet, today, it is a ruin in the desert. So how does a city like this come to an end? The answer is far more interesting than the legend."),
 ("v", "Rəng palitrası soyuyur. Eyni küçə, amma kərpiclər səliqəsiz, evlər bölünüb, küçədə zibil. Musiqi ağırlaşır."),
 ("p", "the same ancient brick street centuries later in decline, crumbling walls patched with reused broken bricks, small makeshift rooms built into the old street, a pottery kiln inside the city, fewer people, dusty grey light " + STYLE),
 ("n", "Sometime after about nineteen hundred BCE, things began to change. Archaeologists can see it in the layers. The careful street plan starts to break down. New houses are built with old, reused bricks. Large buildings are divided into small rooms. Pottery kilns appear inside the residential areas, something the earlier city seems to have avoided. The drains are not maintained as before. The seals become rarer. Writing begins to disappear."),
 ("n", "By around seventeen hundred BCE, Mohenjo-daro was largely abandoned. And the same story played out across much of the Indus Civilization. The great cities faded, and people moved into smaller villages. So what happened? For a long time, the most dramatic answer was also the most popular."),
 ("g", G + "G6_theories_board.png", "Qrafika G6 — Nəzəriyyələr lövhəsi (hər nəzəriyyə danışılanda müvafiq sətir işıqlanır).", 150),
 ("n", "Theory one: invasion. In the nineteen-forties, the famous British archaeologist Sir Mortimer Wheeler pointed to groups of human skeletons found at Mohenjo-daro, lying in streets and houses. He suggested they were victims of a final massacre, and he connected them to the arrival of Indo-Aryan speaking peoples described in the ancient Rig Veda. It was a powerful story. A peaceful city, destroyed by invaders."),
 ("n", "The problem is that the evidence doesn't support it. In nineteen sixty-four, the American archaeologist George Dales published an article with a memorable title: 'The Mythical Massacre at Mohenjo-daro.' He showed that the skeletons came from different layers of the city, which meant different periods. They did not die in a single event. There is no layer of destruction, no burnt city, no sign of a final battle. Today, very few specialists accept the massacre theory."),
 ("v", "G6-da \"Invasion / massacre — Largely rejected\" sətri qırmızı yanır. Qrafik zorakılıq göstərilmir — yalnız arxiv üslubunda kağız sənəd və qələm."),
 ("n", "Theory two: floods. Mohenjo-daro sits on a river that has always flooded. Excavators found thick layers of silt in parts of the city, and some researchers proposed that massive, repeated floods, perhaps even caused by earth movements damming the river, slowly drowned the city. Floods certainly shaped Mohenjo-daro's history, which is why it was built on platforms in the first place. But whether they destroyed it is still debated. Many geologists are not convinced."),
 ("p", "monsoon flood waters spreading across a flat plain toward an ancient brick city on a raised platform, muddy brown water, heavy grey clouds, people carrying belongings to higher ground, dramatic but not violent " + STYLE),
 ("n", "Theory three: climate. And this is where the strongest modern evidence points. Studies of lake sediments, cave formations and ancient river channels suggest that from around four thousand two hundred years ago, the monsoon over parts of South Asia began to weaken. This was not one bad year. It was a long, uneven shift, with dry periods that could last for generations."),
 ("n", "And Mohenjo-daro was not the only place affected. Around the same time, roughly four thousand two hundred years ago, many researchers see signs of drought and upheaval across a wide belt of the ancient world, from the eastern Mediterranean to Mesopotamia. Scientists sometimes call it the 4.2 kiloyear event. How strong it was, and how much it shaped human history, is still debated. But it suggests that the people of the Indus were facing changes far larger than anything they could control."),
 ("n", "In twenty twelve, a team of geologists led by Liviu Giosan published a major study of the region's ancient rivers. They argued that as the monsoon weakened, the floods that watered the fields became less reliable. Some rivers, like the Ghaggar-Hakra system to the east of the Indus, shrank and eventually dried up in many places. Agriculture that had supported big cities for centuries became harder and harder to sustain."),
 ("v", "Timelapse: yaşıl sahələr → quru, çatlamış torpaq. Çay yatağı daralır. G2 timeline ekranda, \"c. 2200 BCE — Monsoon begins to weaken\" işıqlanır."),
 ("p", "timelapse style transition of farmland near an ancient brick city, green barley fields slowly turning to cracked dry earth over years, a riverbed shrinking to a thin stream, farmers looking at the sky, harsh sunlight " + STYLE),
 ("g", G + "G2_timeline.png", "Qrafika G2 — 4,500 illik timeline (tarixlər təxminidir).", 150),
 ("n", "Theory four: trade. Remember Meluhha? Around the same time, Mesopotamia was going through its own upheavals, and references to Meluhha fade from its texts. If long-distance trade declined, the merchants and craftsmen of the Indus cities would have lost markets and wealth. On its own, that probably wouldn't empty a city. But combined with failing harvests, it could have made city life far less attractive."),
 ("n", "So which theory is right? Probably not just one. Most researchers today see the end of Mohenjo-daro not as a single catastrophe, but as a slow unravelling. A changing climate. Rivers that moved or dried up. Trade networks that weakened. And perhaps social and political changes that we can't see in the archaeological record."),
 ("n", "And here is the part that the word 'vanished' gets wrong. The people of Mohenjo-daro did not disappear. They adapted. Over generations, many seem to have moved east and south, toward regions where the monsoon rains were more dependable, into the plains of the Ganges and toward Gujarat. They lived in smaller villages. They farmed different crops. The great cities were left behind, but the people carried on."),
 ("n", "Archaeologists call this the Late Harappan period. In some regions, Indus traditions continued for centuries in a changed form: new styles of pottery, new burial customs, smaller settlements, and a greater reliance on crops like millet and rice that could cope better with uncertain rains. The seals and the script faded away. The standardised bricks and grand drains were no longer needed. But farming, craft skills and many everyday habits survived, passing quietly into the cultures that came after."),
 ("v", "Uzun kadr: ailələr öküz arabaları ilə şərqə doğru köçür, arxada qürub və boş şəhər silueti."),
 ("p", "a long line of families migrating east across a vast dry plain with bullock carts loaded with belongings, clay jars and bundles, an abandoned brick city silhouetted far behind them against a red sunset, emotional epic wide shot " + STYLE),
 ("n", "Recent DNA research supports this. In twenty nineteen, scientists published the genome of a woman buried at Rakhigarhi, another Indus city. Her ancestry, together with other studies, suggests that people related to the Indus population are one of the main ancestral sources of people living in South Asia today. In other words, the descendants of the people who built Mohenjo-daro are very likely still here. Hundreds of millions of them."),
])
SECTION("31:35 – 34:25", "WHAT WE KNOW VS. WHAT WE DON'T", [
 ("v", "Kanalın imza bölməsi. Ekran iki sütuna bölünür: solda \"WE KNOW\" (qızılı), sağda \"WE DON'T KNOW\" (boz). Hər cümlədə bir sətir əlavə olunur."),
 ("n", "So, let's separate what we know from what we don't."),
 ("n", "We know that Mohenjo-daro was built around twenty-five hundred BCE and was one of the largest cities of its age. We know it was carefully planned, with standard bricks, straight streets, hundreds of wells and a city-wide drainage system. We know its people traded across the sea with Mesopotamia, used a shared system of weights, and made fine art in stone, bronze and clay. And we know the city declined gradually and was largely abandoned by around seventeen hundred BCE."),
 ("n", "What we don't know is just as important. We don't know what the city was called. We don't know what language its people spoke, because we can't read their script. We don't know who governed them, or how. We don't know exactly what the Great Bath was used for. And we don't know the precise balance of causes that brought the city to an end."),
 ("n", "There is one more thing worth knowing. Mohenjo-daro has been a UNESCO World Heritage Site since nineteen-eighty. Since its excavation, its exposed brick walls have faced rain, floods and salt rising from the ground, which slowly crumbles them. Large-scale digging has been very limited for decades, partly to protect what remains. Which means that most of the city's secrets may still be lying in the earth, waiting."),
 ("n", "Perhaps the most important lesson of Mohenjo-daro is not about its drains or its bricks. It's about time. For six centuries, this city must have seemed permanent to the people who lived in it. Their grandparents had walked the same streets. Their wells were deep, their markets busy, their ships came and went. The changes that ended it were slow, spread over many lifetimes. Each generation probably saw only a little less rain, a little less trade, a few more empty houses. No one alive at the time would have said: our city is disappearing. And yet, it did."),
 ("n", "The story of Mohenjo-daro is not a story of failure. It's a story of people who built something remarkable, and then, when the world around them changed, made the difficult decision to move on. In the end, they didn't save their city. But they saved themselves."),
 ("p", "present-day view of the excavated ruins of Mohenjo-daro under a hazy sky, weathered red brick walls with white salt crust at their base, the Buddhist stupa on the citadel in the distance, quiet and empty, documentary realism, 16:9"),
])
SECTION("34:25 – 35:15", "OUTRO", [
 ("v", "Boş küçəyə son baxış. Sonra yavaş-yavaş şəhərin canlı (rekonstruksiya) halına keçid — eyni kadr, insanlar və həyatla. End screen 20 san."),
 ("n", "Forty-five centuries ago, people walked these streets, drew water from these wells, and pressed their seals into clay to send goods across the sea. They built one of the most advanced cities of the ancient world, and then, slowly, they let it go."),
 ("n", "If you want to see another civilization that rose and fell at the very same time, watch our documentary on the Bronze Age Collapse, on screen now. And if you enjoyed this journey, subscribe to Ashen Atlas. There's a new forgotten world every day. Thanks for watching."),
])

# ============ SHORT ============
story.append(PageBreak())
H1("2. Short ssenarisi (55 san) — \"4,500 years ago, this city had drains\"")
IM(G + "T4_short_cover.jpg", 55, "Short cover (1080×1920)")
TBL([["Vaxt", "Ekran (9:16)", "Narration (EN)", "Ekran mətni"],
     ["0–2 s", "Örtülü kərpic drenajın close-up-ı, su axır", "Four and a half thousand years ago, this city had drains.", "4,500 YEARS AGO"],
     ["2–10 s", "Dron: Mohenjo-daro platformada, çay", "This is Mohenjo-daro, in today's Pakistan. Straight streets, around seven hundred wells, and up to forty thousand people.", "MOHENJO-DARO • c. 2500 BCE"],
     ["10–25 s", "Ev içi: hamam döşəməsi → divar boru → küçə drenajı (cutaway)", "Many homes had their own bathing floor. Waste water ran through clay pipes into covered drains under the street, with points where they could be cleaned.", "COVERED DRAINS"],
     ["25–40 s", "Great Bath gün doğanda", "On the highest mound stood the Great Bath, sealed with natural tar to keep the water in.", "THE GREAT BATH"],
     ["40–52 s", "Boş, tozlu küçə; kül hissəcikləri", "And then, over generations, everyone left. We still can't read a single word they wrote.", "WHY DID THEY LEAVE?"],
     ["52–55 s", "Ashen Atlas kompası", "The full story is on the channel.", "FULL DOCUMENTARY ↑"],
     ], [16, 46, 76, 32])
P("Short-un Related video sahəsi = bu uzun video. Başlıq: <b>This City Had Drains 4,500 Years Ago</b> #history #ancienthistory #shorts")
P("<b>Short prompt nümunəsi (9:16):</b>")
CODE("vertical 9:16 close-up of water flowing through an ancient covered brick drain under a street, one brick slab lifted to reveal the channel, morning light, dust particles, photorealistic " + STYLE)

# ============ DESCRIPTION ============
story.append(PageBreak())
H1("3. Description, chapters, tags, pinned comment")
H2("3.1 Description (kopyala)")
CODE("""
Mohenjo-daro was one of the largest cities in the world 4,500 years ago, with straight streets, around 700 wells and covered drains. Then, over generations, its people left. Where did they go, and why?

In this documentary we explore the lost city of Mohenjo-daro and the Indus Valley Civilization: how it was built, how it traded with Mesopotamia, the script no one can read, and what really caused its decline.

CHAPTERS
00:00 The Mound of the Dead
00:40 Three questions
01:15 A discovery that rewrote history
06:50 Walking the planned city
11:00 A day in Mohenjo-daro
15:00 The "Priest-King"
16:00 Seals, script and trade with Mesopotamia
24:35 Why did the city empty out?
31:35 What we know vs. what we don't
34:25 The people who carried on

SOURCES
- J. M. Kenoyer, Ancient Cities of the Indus Valley Civilization (Oxford University Press, 1998)
- G. L. Possehl, The Indus Civilization: A Contemporary Perspective (AltaMira Press, 2002)
- A. Robinson, The Indus: Lost Civilizations (Reaktion Books, 2015)
- G. F. Dales, "The Mythical Massacre at Mohenjo-daro", Expedition (1964)
- L. Giosan et al., "Fluvial landscapes of the Harappan civilization", PNAS (2012)
- V. Shinde et al., "An Ancient Harappan Genome Lacks Ancestry from Steppe Pastoralists or Iranian Farmers", Cell (2019)
- UNESCO World Heritage Centre: Archaeological Ruins at Moenjodaro

AI DISCLOSURE: Historical scenes in this video are AI-generated reconstructions for illustration, based on archaeological research. Maps, timelines and diagrams are original graphics. Photographs are credited on screen.

Music: [licensed source]

#MohenjoDaro #IndusValley #AncientHistory
""")
H2("3.2 Tags")
CODE("mohenjo daro, mohenjo-daro documentary, indus valley civilization, harappan civilization, lost city, ancient history documentary, lost civilizations, indus script, great bath, bronze age, archaeology documentary, why did the indus valley civilization collapse, ancient mysteries, ashen atlas")
H2("3.3 Pinned comment")
CODE("""
Quick note: the people of Mohenjo-daro didn't vanish overnight. The city emptied over generations, and their descendants are still part of South Asia today. Which part surprised you most: the drains, the unreadable script, or the missing kings?
""")

# ============ FACT CHECK ============
H1("4. Fakt yoxlama cədvəli (çəkilişdən əvvəl)")
P("Ssenaridəki hər rəqəm aşağıdakı mənbələrlə yoxlanmalıdır. Rəqəmlər populyar elmi ədəbiyyatda geniş istinad olunan təxminlərdir; "
  "mən onları birbaşa mənbə mətnləri ilə tutuşdura bilmədim, ona görə yükləmədən əvvəl yoxla.")
TBL([["İddia (ssenaridə)", "Status", "Harada yoxlamalı"],
     ["Tikilmə c. 2500 BCE; Mature Harappan c. 2600–1900 BCE", "Geniş qəbul olunub", "Kenoyer 1998; Possehl 2002"],
     ["Əhali \"as many as 40,000\"", "Təxmin, mübahisəli", "Kenoyer; Robinson 2015"],
     ["~700 quyu", "Tez-tez istinad olunan təxmin", "Jansen-in tədqiqatları, Kenoyer"],
     ["Kərpic nisbəti 1:2:4", "Geniş qəbul olunub", "Kenoyer 1998"],
     ["Great Bath ≈12×7 m, ≈2.4 m dərin, bitum qatı", "Geniş qəbul olunub (ölçülər yuvarlaqlaşdırılıb)", "UNESCO; Kenoyer"],
     ["\"Great Granary\" → \"Great Hall\", taxıl tapılmayıb", "Müasir şərh", "Kenoyer; Possehl"],
     ["Priest-King ≈17.5 sm, steatit, Karaçi muzeyi", "Geniş qəbul olunub", "National Museum of Pakistan"],
     ["Dancing Girl ≈10.5 sm, bürünc, 1926, Yeni Dehli", "Geniş qəbul olunub", "National Museum, New Delhi"],
     ["Yazı ~400–600 işarə, orta ~5 işarə, oxunmayıb", "Geniş qəbul olunub (işarə sayı mübahisəli)", "Robinson 2015; Possehl"],
     ["Meluhha = Indus; Sargon kitabəsi; Ur-da karnelian muncuqlar", "Əksər tarixçilərin fikri", "Possehl; Robinson"],
     ["Çəki sistemi: ikiqat, sonra onluq; vahid ≈14 q", "Geniş qəbul olunub (≈13.6–14 q)", "Kenoyer"],
     ["Banerji 1922; Marshall elanı 1924", "Geniş qəbul olunub", "ASI tarixçəsi; Robinson"],
     ["Wheeler massacre nəzəriyyəsi; Dales 1964 təkzibi", "Geniş qəbul olunub", "Dales 1964 (Expedition)"],
     ["Monsun zəifləməsi ~4,200 il əvvəl; Giosan 2012", "Güclü sübut, amma tək səbəb deyil", "Giosan et al. 2012, PNAS"],
     ["Rakhigarhi genomu 2019", "Dərc olunub", "Shinde et al. 2019, Cell"],
     ["UNESCO 1980; duz eroziyası", "Geniş qəbul olunub", "UNESCO WHC siyahısı"],
     ["Mehrgarh: əkinçilik c. 7000 BCE", "Geniş qəbul olunub (tarix təxmini)", "Possehl; Kenoyer"],
     ["Dales ən alt qatlara çata bilmədi (qrunt suyu)", "Geniş istinad olunur", "Kenoyer; Possehl"],
     ["Shu-ilishu möhürü, \"Meluhha tərcüməçisi\", Louvre", "Dərc olunub", "Louvre kolleksiyası; Possehl"],
     ["4.2 kiloyear event; regional quraqlıq", "Mübahisəli miqyas", "Giosan 2012 və sonrakı tədqiqatlar"],
     ["Lothal \"dock\" (mübahisəli), Dholavira su rezervuarları", "Geniş qəbul olunub", "ASI; Possehl"],
     ["Pashupati seal — Shiva ilə əlaqə", "Mübahisəli (ssenaridə belə deyilir)", "Possehl; Robinson"],
     ], [70, 50, 50])

# ============ GRAPHICS + PHOTOS ============
story.append(PageBreak())
H1("5. Thumbnail variantları (Test &amp; Compare)")
IM(G + "T1_thumbnail_A.jpg", 120, "T1 — rəqəm + emosiya (əsas variant)")
IM(G + "T2_thumbnail_B.jpg", 120, "T2 — sirr / sual")
IM(G + "T3_thumbnail_C.jpg", 120, "T3 — \"ahead of its time\" bucağı")
NOTE("Fon üçün real AI səhnə istifadə edəndə kompozisiyanı saxla: mətn solda, səhnə sağda. Thumbnail fon prompt-u: "
     "<i>dramatic wide shot of the ruins of an ancient brick city with a stupa on a mound, silhouetted against a blazing orange sunset, "
     "ember sparks in the air, empty dark negative space on the left third, high contrast, photorealistic, 16:9, no text</i>")

H1("6. Real fotolar — Wikimedia Commons siyahısı")
P("Bu sessiyanın şəbəkə ayarları Wikimedia-ya girişi bloklayır, ona görə real fotoları PDF-ə özüm yükləyə bilmədim. "
  "Aşağıdakıları commons.wikimedia.org-da axtarıb endir. Hər faylın lisenziyasını (Public domain / CC BY / CC BY-SA) yoxla "
  "və müəllifi ekranda kiçik yazı ilə göstər (məs. \"Photo: [Author], CC BY-SA 4.0, Wikimedia Commons\").")
TBL([["#", "Axtarış sorğusu (Commons)", "Videoda harada"],
     ["1", "Mohenjo-daro stupa citadel", "01:15 — kəşf"],
     ["2", "Mohenjo-daro Great Bath", "13:00 — Great Bath"],
     ["3", "Mohenjo-daro street drain", "09:30 — drenaj"],
     ["4", "Mohenjo-daro well", "08:30 — quyular"],
     ["5", "Priest-King Mohenjo-daro", "15:00 — re-hook, 16:00"],
     ["6", "Dancing Girl Mohenjo-daro bronze", "21:30 — sənət"],
     ["7", "Indus seal unicorn", "16:30 — möhürlər"],
     ["8", "Indus Valley weights cubes", "20:00 — çəkilər"],
     ["9", "Indus toy cart terracotta", "22:30 — gündəlik həyat"],
     ["10", "Etched carnelian beads Ur", "19:00 — Mesopotamiya ticarəti"],
     ["11", "Mohenjo-daro panorama ruins", "33:00 — bugünkü vəziyyət"],
     ["12", "John Marshall Illustrated London News 1924 (yalnız public domain olduqda)", "03:00 — elan"],
     ], [8, 92, 70])

H1("7. Orijinal qrafikalar (videoya hazır, 1920×1080)")
P("Fayllar: <b>ashen-atlas/video-01-mohenjo-daro/graphics/</b>. Hamısı sxematikdir (dəqiq miqyasda deyil) və ekranda \"schematic\" kimi işarələnib. "
  "G1–G6 ssenari daxilində də göstərilib.")
for f, c in [("G1_map_indus_civilization.png", "G1 — Xəritə"), ("G3_city_plan.png", "G3 — Şəhər planı")]:
    IM(G + f, 120, c)

# ============ PRODUCTION CHECKLIST ============
H1("8. İstehsal checklist-i")
TBL([["☐", "Addım"],
     ["☐", "Narration-u ElevenLabs-da 9 bölmə ayrı-ayrı generasiya et (hər bölmə ayrı fayl — düzəliş asan olsun)"],
     ["☐", "Hər bölmə üçün 6–12 AI səhnə; Master Style Prompt + \"no horses\" qaydası"],
     ["☐", "Image-to-video: 5–6 saniyəlik yavaş hərəkətlər (push-in, pan, parallax). Sürətli kəsik yoxdur — documentary tempi"],
     ["☐", "G1–G6 qrafikalarını Ken Burns effekti ilə yerləşdir"],
     ["☐", "Real fotoların lisenziyasını yoxla və ekranda kredit ver"],
     ["☐", "Subtitr (English SRT) — narration mətnindən birbaşa"],
     ["☐", "00:40-da AI disclosure yazısı; Studio-da Altered content = Yes"],
     ["☐", "Chapters description-da; end screen: Bronze Age Collapse videosu + Subscribe"],
     ["☐", "3 thumbnail Test &amp; Compare-a; Short ayrıca, related video = bu video"],
     ["☐", "Fakt yoxlama cədvəlindəki (Bölmə 4) hər sətri təsdiqlə"],
     ], [10, 160])

# fill WORDS placeholder in passport table after counting
def fix_words(flow):
    from reportlab.platypus import Table as T
    for f in flow:
        if isinstance(f, T):
            for row in f._cellvalues:
                for cell in row:
                    if hasattr(cell, "text") and "{WORDS}" in cell.text:
                        new = Paragraph(cell.text.replace("{WORDS}", f"{WORDS:,}"), st["cell"])
                        row[row.index(cell)] = new
                        return
fix_words(story)

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=15 * mm, bottomMargin=18 * mm,
                        title="Ashen Atlas — Video 1: Mohenjo-daro script", author="Shahin Salimov")
doc.build(story, onFirstPage=cover, onLaterPages=later)
print("words", WORDS, "->", round(WORDS / 147, 1), "min")
