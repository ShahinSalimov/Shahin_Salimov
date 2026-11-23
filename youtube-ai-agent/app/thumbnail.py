"""YouTube thumbnail: 1280x720 JPEG, photo + big outlined headline on the emptier side."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

W, H = 1280, 720
FONTS = ["arialbd.ttf", "Arial Bold.ttf", "impact.ttf", "DejaVuSans-Bold.ttf"]


def _font(size: int):
    for name in FONTS:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _wrap(draw, text: str, font, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and draw.textlength(trial, font=font) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    return lines + ([cur] if cur else [])


def compose(image: Path, text: str, out: Path) -> Path:
    img = Image.open(image).convert("RGB")
    scale = max(W / img.width, H / img.height)
    img = img.resize((int(img.width * scale) + 1, int(img.height * scale) + 1), Image.LANCZOS)
    left, top = (img.width - W) // 2, (img.height - H) // 2
    img = img.crop((left, top, left + W, top + H))

    # put text on the half with less detail
    gray = img.convert("L").filter(ImageFilter.FIND_EDGES)
    busy_left = ImageStat.Stat(gray.crop((0, 0, W // 2, H))).mean[0]
    busy_right = ImageStat.Stat(gray.crop((W // 2, 0, W, H))).mean[0]
    on_left = busy_left <= busy_right

    shade = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for x in range(W // 2 + 120):
        alpha = int(170 * (1 - x / (W // 2 + 120)))
        xx = x if on_left else W - 1 - x
        sd.line([(xx, 0), (xx, H)], fill=alpha)
    img = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), img, shade)

    draw = ImageDraw.Draw(img)
    text = text.upper().strip()
    max_w = W // 2 - 60
    size = 150
    while size > 50:
        font = _font(size)
        lines = _wrap(draw, text, font, max_w)
        if len(lines) <= 3 and all(draw.textlength(l, font=font) <= max_w for l in lines):
            break
        size -= 8
    line_h = int(size * 1.08)
    y = (H - line_h * len(lines)) // 2
    for i, line in enumerate(lines):
        x = 50 if on_left else W - 50 - int(draw.textlength(line, font=font))
        color = (255, 214, 0) if i == len(lines) - 1 else (255, 255, 255)
        draw.text((x, y), line, font=font, fill=color, stroke_width=max(4, size // 14), stroke_fill=(0, 0, 0))
        y += line_h
    img.save(out, "JPEG", quality=90, optimize=True)
    return out
