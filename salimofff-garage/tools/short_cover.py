"""Short cover 1080x1920. usage: short_cover.py IMG FONT_DIR "LINE1" "LINE2" OUT.jpg"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
src, fonts, l1, l2, out = sys.argv[1:6]
im = ImageEnhance.Contrast(Image.open(src).convert("RGB").resize((1080, 1920))).enhance(1.1)
sh = Image.new("L", im.size, 0); d = ImageDraw.Draw(sh)
for y in range(1100, 1920): d.line((0, y, 1080, y), fill=int(210 * min(1, (y - 1100) / 500)))
im = Image.composite(Image.new("RGB", im.size, "black"), im, sh); d = ImageDraw.Draw(im)
f = ImageFont.truetype(f"{fonts}/Anton.ttf", 150)
d.text((540, 1420), l1, font=f, fill=(250, 245, 235), anchor="mm", stroke_width=7, stroke_fill="black")
d.text((540, 1590), l2, font=f, fill=(214, 170, 88), anchor="mm", stroke_width=7, stroke_fill="black")
im.save(out, quality=93)
