"""Build the reference board (all selected scene images in timeline order)."""
import sys
from PIL import Image, ImageDraw, ImageFont
F = sys.argv[1]
def font(sz, w='Bold'):
    f = ImageFont.truetype(F, sz); f.set_variation_by_name(w); return f
items = [('1','0–6 san','Boş sahə','scenes/01_empty_plot.jpg'),('2','6–11 san','Beton təməl','scenes/02_concrete.jpg'),
('3','11–17 san','Fərdi ev tikintisi','scenes/03_house_construction.jpg'),('4','17–23 san','Asfalt','scenes/04_asphalt.jpg'),
('4A','23–27 san','İşıq dirəyi quraşdırılır','scenes/04A_pole_installation.jpg'),
('4B','27–31 san','Lampa bağlanır','scenes/04B_street_lighting.jpg'),('5','31–36 san','Elektrik','scenes/05_electrical.jpg'),
('6','36–41 san','Havalandırma','scenes/06_ventilation.jpg'),('7','41–46 san','Kondisioner','scenes/07_air_conditioner.jpg'),
('8','46–52 san','Daxili təmir','scenes/08_interior_renovation.jpg'),('9','52–57 san','Hazır interyer','scenes/09_finished_interior.jpg'),
('9B','57–60 san','Ofisdə logo','scenes/09B_office_with_logo.png'),('10','60–66 san','Komanda','scenes/10_team.jpg'),
('10B','66–69 san','Böyük bina','scenes/10B_building.jpg'),('11','69–79 san','Logo + əlaqə','outro/endcard_final_frame.png')]
TW, TH, G, COLS = 360, 640, 28, 5
rows = (len(items) + COLS - 1) // COLS
W = COLS*TW + (COLS+1)*G; H = 170 + rows*(TH+110) + G
navy, gold = (0,34,79), (207,172,95)
b = Image.new('RGB', (W, H), (248,245,239)); d = ImageDraw.Draw(b)
d.text((G,40), 'MEH-İNŞAAT MMC — referans şəkillər', font=font(52), fill=navy)
d.text((G,108), f'Instagram / TikTok · 9:16 · 79 saniyə · {len(items)} səhnə', font=font(30,'Medium'), fill=gold)
for i, (n, t, name, p) in enumerate(items):
    r, c = divmod(i, COLS); x = G + c*(TW+G); y = 170 + r*(TH+110)
    im = Image.open(p).convert('RGB'); im = im.resize((TW, round(im.height*TW/im.width)), Image.LANCZOS).crop((0,0,TW,TH))
    b.paste(im, (x, y))
    d.rounded_rectangle((x+12, y+12, x+32+d.textlength(n, font=font(34)), y+62), 10, fill=navy)
    d.text((x+22, y+16), n, font=font(34), fill=gold)
    d.text((x, y+TH+14), name, font=font(28), fill=navy)
    d.text((x, y+TH+54), t, font=font(24,'Medium'), fill=(120,110,95))
b.save('reference_board.jpg', quality=92); print(b.size)
