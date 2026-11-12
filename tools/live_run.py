"""성채지기 보스전을 실시간으로 한 판 (화면 없는 크롬 + src/dev/live-bot.js) — 진짜 화면 속도로 돌려 프레임·오류를 재고 영상 프레임을 받는다.

    py -I tools\\live_run.py <저장 폴더> [최대 초=120]

결과: <저장 폴더>/status.json (승패·걸린 시간·맞은 수·프레임 평균/최저·이펙트 최대 수·기록),
      <저장 폴더>/fight.gif (전체를 6fps로 줄인 것), <저장 폴더>/hits/*.jpg (찌른 순간 앞뒤 프레임)
브라우저 창이 가려져 있으면 크롬이 화면 갱신을 멈춰서(초당 1프레임) 실시간 시험은 화면 없는 크롬으로 한다.
"""
import asyncio, base64, functools, http.server, io, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')


class Cast(CDP):
    """화면 녹화 프레임(Page.screencastFrame)을 받아 둔다."""
    def __init__(self, ws):
        super().__init__(ws); self.frames = []; self.errors = []

    async def pump(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if 'id' in m and m['id'] in self.pending:
                self.pending.pop(m['id']).set_result(m)
            elif m.get('method') == 'Page.screencastFrame':
                p = m['params']
                self.frames.append((time.time(), p['data']))
                await self.ws.send(json.dumps({'id': 10 ** 6 + len(self.frames), 'method': 'Page.screencastFrameAck', 'params': {'sessionId': p['sessionId']}}))
            elif m.get('method') == 'Runtime.exceptionThrown':
                self.errors.append(m['params']['exceptionDetails'].get('text', '')[:200])
            elif m.get('method') == 'Runtime.consoleAPICalled' and m['params'].get('type') == 'error':
                self.errors.append(' '.join(str(a.get('value', a.get('description', '')))[:160] for a in m['params'].get('args', [])))


async def main(out, max_sec):
    os.makedirs(os.path.join(out, 'hits'), exist_ok=True)
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-live-")}', '--mute-audio',
                           '--window-size=1280,720', '--use-angle=d3d11', '--enable-gpu', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            c = Cast(ws)
            pump = asyncio.ensure_future(c.pump())
            await c.call('Runtime.enable'); await c.call('Page.enable')
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=heart')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval("!!(window.__yk && __yk.ready() && __yk.boss() && __yk.boss() !== 'pending')"):
                        break
                except Exception:
                    pass
            await c.eval("(async () => { const L = (await import('/src/dev/live-bot.js?' + Date.now())).default; return 1; })()")
            await c.call('Page.startScreencast', format='jpeg', quality=72, maxWidth=960, maxHeight=540, everyNthFrame=2)
            t0 = time.time()
            await c.eval(f'window.__live.start({{ maxSec: {max_sec} }}); 1')
            st = None
            while time.time() - t0 < max_sec + 8:
                await asyncio.sleep(1.0)
                st = json.loads(await c.eval('JSON.stringify(window.__live.status())'))
                if st['result']:
                    break
            await c.call('Page.stopScreencast')
            full = json.loads(await c.eval('JSON.stringify(Object.assign(window.__live.status(), { log: window.__live.log }))'))
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()
    full['errors'] = c.errors[:10]
    full['frames'] = len(c.frames)
    full['castFps'] = round(len(c.frames) / max(1, (c.frames[-1][0] - c.frames[0][0]) if len(c.frames) > 1 else 1), 1)
    with open(os.path.join(out, 'status.json'), 'w', encoding='utf-8') as f:
        json.dump(full, f, ensure_ascii=False, indent=1)
    # GIF (6fps, 480×270) + 찌른 순간 앞뒤 프레임
    from PIL import Image
    imgs, last = [], -1
    for ts, data in c.frames:
        if ts - last < 1 / 6:
            continue
        last = ts
        imgs.append(Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB').resize((480, 270)))
    if imgs:
        imgs[0].save(os.path.join(out, 'fight.gif'), save_all=True, append_images=imgs[1:], duration=int(1000 / 6), loop=0, optimize=True)
    stabs = [float(e.split(':')[0]) for e in full['log'] if e.split(':', 1)[1].startswith('stab')]
    for k, s in enumerate(stabs[:8]):
        for dt in (-0.1, 0.15, 0.4):
            ts = t0 + s + dt
            best = min(c.frames, key=lambda f: abs(f[0] - ts)) if c.frames else None
            if best:
                with open(os.path.join(out, 'hits', f'stab{k + 1}_{dt:+.2f}.jpg'), 'wb') as f:
                    f.write(base64.b64decode(best[1]))
    return full


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    r = asyncio.run(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 120))
    print(json.dumps({k: r[k] for k in ('result', 'sec', 'bossHp', 'hits', 'parries', 'hurts', 'deaths', 'fps', 'peak', 'frames', 'castFps', 'errors')}, ensure_ascii=False))
    print('log:', ' | '.join(r['log'][-30:]))
