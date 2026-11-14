"""T5 전후 비교 그림: 같은 장면의 바꾸기 전(왼쪽)·후(오른쪽)를 한 장으로.

    py -I tools\\t5_compare.py <스크린샷 폴더> <저장 폴더>
    (전: devlog/shots/2026-11-15-t5/before-*.jpg, 후: <스크린샷 폴더>/<이름>.jpg — 아래 PAIRS)
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEFORE = os.path.join(GAME, 'devlog', 'shots', '2026-11-15-t5')
SHOTS = sys.argv[1] if len(sys.argv) > 1 else BEFORE
OUT = sys.argv[2] if len(sys.argv) > 2 else BEFORE
# (저장 이름, 전 파일, 후 파일, 제목)
PAIRS = [
    ('cmp-01-hud-past', 'before-b03-hud-past', 'h04-past', 'HUD · 어제'),
    ('cmp-02-hud-now', 'before-b02-hud-now', 'h03-now', 'HUD · 오늘'),
    ('cmp-03-run-hud', 'before-b08-hud-items', 'h05-run-hud', '런 HUD (금화·탄·유물 칸)'),
    ('cmp-04-pick', 'before-b07-pick', 'p01-pick-now', '셋 중 하나 고르기'),
    ('cmp-05-map', 'before-b06-map', 'm02-map-now', '층 지도'),
    ('cmp-06-menu', 'before-b04-menu', 'g26-continue', '시작·런 메뉴'),
    ('cmp-07-summary', 'before-b12-summary', 'g23', '런 요약 (실제로 쓰러져서)'),
    ('cmp-08-inv', 'before-b09-inv', 'm05-inv-past', 'Tab 유물 목록'),
    ('cmp-09-rest', 'before-b10-rest', 'r01-rest-now', '쉼터'),
    ('cmp-10-shop', 'before-b11-shop', 's01-shop-now', '상점 받침대'),
    ('cmp-11-meta', 'before-b13-meta', 'r02-meta-past', '기억의 서고'),
    ('cmp-12-map-phone', 'before-b14-map-mobile', 'mo02-map', '층 지도 · 휴대폰 세로'),
    ('cmp-13-pick-phone', 'before-b15-pick-mobile', 'mo03-pick', '고르기 · 휴대폰 세로'),
]
FONT = r'C:\Windows\Fonts\malgunbd.ttf'


def find(name):
    for d in (SHOTS, BEFORE):
        p = os.path.join(d, name + '.jpg')
        if os.path.exists(p):
            return p
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    f = ImageFont.truetype(FONT, 26) if os.path.exists(FONT) else ImageFont.load_default()
    made = 0
    for out, a, b, title in PAIRS:
        pa, pb = find(a), find(b)
        if not pa or not pb:
            print('skip', out, a if not pa else b)
            continue
        A, B = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
        h = 720 if A.height <= A.width else 844
        A = A.resize((round(A.width * h / A.height), h)); B = B.resize((round(B.width * h / B.height), h))
        W = A.width + B.width + 12
        im = Image.new('RGB', (W, h + 48), (16, 14, 12))
        im.paste(A, (0, 48)); im.paste(B, (A.width + 12, 48))
        d = ImageDraw.Draw(im)
        d.text((14, 9), f'전 · {title}', font=f, fill=(200, 200, 200))
        d.text((A.width + 26, 9), '후 (T5 그린 아이콘·판넬)', font=f, fill=(255, 210, 122))
        im.save(os.path.join(OUT, out + '.jpg'), quality=86)
        made += 1
    print('made', made, '->', OUT)


if __name__ == '__main__':
    main()
