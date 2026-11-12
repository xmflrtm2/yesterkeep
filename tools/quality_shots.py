"""Same-scene screenshots for checking that asset compression did not hurt the picture, plus a pixel comparison.

    py -I tools\\quality_shots.py <out_dir>                 -> <out_dir>\\<scene>.png (1280x720, English UI, sim paused)
    py -I tools\\quality_shots.py --compare <dirA> <dirB>   -> PSNR per scene and a side-by-side diff image per scene

Scenes cover yesterday and today with the player, a guard, a golem and the Warden up close, plus room overviews and a
close floor view for the dungeon textures. Rendering reuses tools/readme_shots.py (headless Chrome + own static server).
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

SCENES = {
    'guard_past': """
        __yk.room('ambush'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.step(0.3); __yk.era('past');
        const g = __yk.guards()[0]; __sh.front(g, 2.4); __yk.cam(8, 48); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'guard_now': """
        __yk.room('ambush'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.step(0.3); __yk.era('past');
        const g = __yk.guards()[0]; __sh.front(g, 2.4); __yk.cam(8, 48); __yk.era('now'); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'golem_now': """
        __yk.room('golem'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('now'); __yk.step(0.2);
        const g = __yk.golems()[0]; __sh.front(g, 3.2); __yk.cam(9, 48); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'golem_past': """
        __yk.room('golem'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('now'); __yk.step(0.2);
        const g = __yk.golems()[0]; __sh.front(g, 3.2); __yk.cam(9, 48); __yk.era('past'); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'boss_now': """
        __yk.room('heart'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('now');
        for (let k = 0; k < 50 && (!__yk.boss() || __yk.boss() === 'pending'); k++) await new Promise(r => setTimeout(r, 100));
        const b = __yk.boss(); __yk.tpw(b.x + 1.0, b.z + 4.2); __yk.heroYaw(Math.PI); __yk.cam(11, 50); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'boss_past': """
        __yk.room('heart'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('now');
        for (let k = 0; k < 50 && (!__yk.boss() || __yk.boss() === 'pending'); k++) await new Promise(r => setTimeout(r, 100));
        const b = __yk.boss(); __yk.bossSet({ era: 'past' }); __yk.era('past'); __yk.tpw(b.x + 1.0, b.z + 4.2); __yk.heroYaw(Math.PI);
        __yk.cam(11, 50); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'room_past': """
        __yk.room('pair'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('past'); __yk.cam(21, 54);
        __sh.frame(15, 9.6, 9, 13, Math.PI / 2);
    """,
    'room_now': """
        __yk.room('pair'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('now'); __yk.cam(21, 54);
        __sh.frame(15, 9.6, 9, 13, Math.PI / 2);
    """,
    'floor_close_past': """
        __yk.room('bridge'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('past'); __yk.cam(6, 62);
        __yk.tp(5, 3); __yk.heroYaw(Math.PI / 2); __yk.S.invuln = 0; __yk.step(0.05);
    """,
    'floor_close_now': """
        __yk.room('bridge'); __yk.pause(true); __sh.hud(false); __sh.title(false); __yk.era('now'); __yk.cam(6, 62);
        __yk.tp(5, 3); __yk.heroYaw(Math.PI / 2); __yk.S.invuln = 0; __yk.step(0.05);
    """,
}


def shoot(out_dir, names):
    src = open(os.path.join(HERE, 'readme_shots.py'), encoding='utf-8').read()
    ns = {'__name__': 'readme_shots_lib', '__file__': os.path.join(HERE, 'readme_shots.py')}
    exec(compile(src.rsplit('\nmain()', 1)[0], 'readme_shots.py', 'exec'), ns)
    ns['SHOTS'].update(SCENES)
    import asyncio
    asyncio.run(ns['run'](out_dir, names))


def compare(a, b):
    import numpy as np
    from PIL import Image
    out = os.path.join(b, 'diff')
    os.makedirs(out, exist_ok=True)
    print(f'{"scene":<18} PSNR(dB)  mean|diff|  max|diff|')
    for n in SCENES:
        pa, pb = os.path.join(a, n + '.png'), os.path.join(b, n + '.png')
        if not (os.path.exists(pa) and os.path.exists(pb)):
            print(f'{n:<18} missing'); continue
        ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
        x, y = np.asarray(ia, dtype=np.float32), np.asarray(ib, dtype=np.float32)
        d = np.abs(x - y)
        mse = float((d ** 2).mean())
        psnr = 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)
        print(f'{n:<18} {psnr:7.2f}   {d.mean():8.3f}   {d.max():6.0f}')
        heat = Image.fromarray(np.clip(d.mean(axis=2) * 8, 0, 255).astype('uint8')).convert('RGB')
        w, h = ia.size
        sheet = Image.new('RGB', (w * 3 // 2, h // 2))
        for k, im in enumerate((ia, ib, heat)):
            sheet.paste(im.resize((w // 2, h // 2)), (k * w // 2, 0))
        sheet.save(os.path.join(out, n + '.jpg'), quality=88)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(1)
    if a[0] == '--compare':
        compare(a[1], a[2])
    else:
        shoot(a[0], a[1:] or list(SCENES))


main()
