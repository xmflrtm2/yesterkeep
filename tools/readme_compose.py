"""Turn the raw shots from readme_shots.py into README images.

    py -I tools\\readme_compose.py <raw_dir>   -> docs\\readme\\banner.jpg (1280x640, also the GitHub social preview)
                                                 + docs\\readme\\<shot>.jpg (960x540)
"""
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(GAME, 'docs', 'readme')
FONTS = r'C:\Windows\Fonts'
GOLD, CYAN, WHITE = (255, 214, 130), (143, 227, 255), (245, 240, 230)
SHOTS = ('ghost_today', 'backstab_yesterday', 'arrows_yesterday', 'arrows_today', 'golem_slam')


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def text_shadow(img, xy, s, f, fill, anchor='la', blur=6):
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text(xy, s, font=f, fill=(0, 0, 0, 230), anchor=anchor)
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(img).text(xy, s, font=f, fill=fill + (255,), anchor=anchor)


def gradient(img, top, height, a0, a1):
    w = img.size[0]
    g = Image.new('L', (1, height))
    for y in range(height):
        g.putpixel((0, y), int(a0 + (a1 - a0) * y / max(1, height - 1)))
    band = Image.new('RGBA', (w, height), (6, 6, 10, 255))
    band.putalpha(g.resize((w, height)))
    img.alpha_composite(band, (0, top))


def banner(raw):
    past = Image.open(os.path.join(raw, 'banner_past.png')).convert('RGBA')
    now = Image.open(os.path.join(raw, 'banner_now.png')).convert('RGBA')
    box = (0, 25, 1280, 665)
    past, now = past.crop(box), now.crop(box)
    w, h = past.size
    top_x, bot_x = 700, 560  # seam: yesterday on the left, today on the right
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).polygon([(0, 0), (top_x, 0), (bot_x, h), (0, h)], fill=255)
    img = now.copy()
    img.paste(past, (0, 0), mask)
    # glowing seam
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).line([(top_x, 0), (bot_x, h)], fill=(255, 245, 220, 255), width=10)
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
    ImageDraw.Draw(img).line([(top_x, 0), (bot_x, h)], fill=(255, 250, 240, 235), width=2)
    # corner labels
    gradient(img, 0, 110, 200, 0)
    text_shadow(img, (36, 26), 'YESTERDAY', font('georgiab.ttf', 40), GOLD)
    text_shadow(img, (38, 74), 'the keep in its golden age', font('georgiai.ttf', 20), WHITE)
    text_shadow(img, (w - 36, 26), 'TODAY', font('georgiab.ttf', 40), CYAN, anchor='ra')
    text_shadow(img, (w - 38, 74), 'the keep in ruins', font('georgiai.ttf', 20), WHITE, anchor='ra')
    # title band
    gradient(img, h - 170, 170, 0, 235)
    text_shadow(img, (w // 2, h - 92), 'YESTERKEEP', font('georgiab.ttf', 64), WHITE, anchor='ms', blur=10)
    text_shadow(img, (w // 2, h - 46), 'Press Shift. The whole keep shifts between yesterday and today.', font('georgia.ttf', 24), (225, 220, 210), anchor='ms')
    return img


def main():
    raw = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    b = banner(raw)
    b.convert('RGB').save(os.path.join(OUT, 'banner.jpg'), quality=88, optimize=True, progressive=True)
    for name in SHOTS:
        im = Image.open(os.path.join(raw, name + '.png')).convert('RGB').resize((960, 540), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.jpg'), quality=85, optimize=True, progressive=True)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))


main()
