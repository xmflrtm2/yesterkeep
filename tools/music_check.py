"""배경 음악(src/music.js) 검사: 화면 없는 크롬에서 곡을 OfflineAudioContext로 그려 세기 · 최고값 · 무음 구간을 본다.

    py -I tools\\music_check.py            -> 곡 × 시대 + 시대 바꾸기 + 들킴/2페이즈 층 검사
    py -I tools\\music_check.py --wav      -> 위 검사 + 들어 볼 WAV를 devlog/out/music/ 에 (git에 안 올라감)

기준: 최고값 < 0.98(찢어짐 없음), 평균 세기 -38 ~ -18 dBFS, NaN 0, 시작 1초 뒤 2초 넘는 무음 없음.
"""
import asyncio, base64, functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
CASES = [  # 곡, 시대, 초, 옵션
    ('keep', 'past', 30, {}), ('keep', 'now', 30, {}),
    ('keep', 'past', 24, {'shiftEvery': 3.0}),
    ('keep', 'past', 12, {'danger': 1}),
    ('boss', 'past', 24, {}), ('boss', 'now', 24, {}),
    ('boss', 'past', 16, {'phase': 2}), ('boss', 'now', 16, {'phase': 2, 'shiftEvery': 2.0}),
]


async def main(wav):
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix='yk-music-')
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={prof}', '--no-first-run',
                           '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out_dir = os.path.join(GAME, 'devlog', 'out', 'music')
    bad = 0
    try:
        ws_url = None
        for _ in range(150):
            try:
                pages = [t for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{dbg}/json/list')) if t['type'] == 'page']
                if pages:
                    ws_url = pages[0]['webSocketDebuggerUrl']; break
            except Exception:
                pass
            time.sleep(0.2)
        async with websockets.connect(ws_url, max_size=None) as ws:
            c = CDP(ws)
            pump = asyncio.ensure_future(c.pump())
            await c.call('Runtime.enable'); await c.call('Page.enable')
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__music && window.__yk && __yk.ready())'):
                        break
                except Exception:
                    pass
            print('songs:', await c.eval('JSON.stringify(__music.songs())'))
            if wav:
                os.makedirs(out_dir, exist_ok=True)
            for song, era, sec, o in CASES:
                oo = dict(o, wav=bool(wav))
                r = await asyncio.wait_for(c.eval(f'__music.render({json.dumps(song)}, {json.dumps(era)}, {sec}, {json.dumps(oo)}).then(r => JSON.stringify(r))'), 120)
                r = json.loads(r)
                b64 = r.pop('wav', None)
                ok = r['peak'] < 0.98 and -38 <= r['rmsDb'] <= -18 and r['nan'] == 0 and r['longestSilence'] <= 2.0
                bad += not ok
                tag = '-'.join([song, era] + [f'{k}{v}' for k, v in o.items()])
                print(('OK ' if ok else 'NO ') + tag.ljust(34), json.dumps(r, ensure_ascii=False), flush=True)
                if b64:
                    with open(os.path.join(out_dir, tag + '.wav'), 'wb') as f:
                        f.write(base64.b64decode(b64))
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()
    if wav:
        print('WAV:', out_dir)
    return bad


if __name__ == '__main__':
    sys.exit(1 if asyncio.run(main('--wav' in sys.argv)) else 0)
