"""성채지기(보스) 공략 봇을 화면 없는 크롬에서 돌린다 (브라우저 창이 가려져 있어도 됨).

    py -I tools\\boss_sim.py parry 3          -> 의도한 풀이 봇 3판
    py -I tools\\boss_sim.py spam 2 idle 1    -> 봇 이름과 판 수를 이어서 여러 개
    봇 목록과 설명: src/dev/boss-bots.js

결과는 봇마다 JSON 한 줄씩. 이 폴더를 그대로 띄우므로 assets/fab/ 가 있어야 한다.
"""
import asyncio, base64, functools, http.server, json, os, socket, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

sys.stdout.reconfigure(encoding='utf-8')
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class Server(http.server.ThreadingHTTPServer):
    # 대기열 기본값 5면 게임 파일 100여 개를 한꺼번에 받을 때 일부가 거절돼 "Failed to fetch"·텍스처 오류·로딩 멈춤이 났다 (11/12)
    request_queue_size = 128
    daemon_threads = True


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class CDP:
    def __init__(self, ws):
        self.ws, self.n, self.pending = ws, 0, {}

    async def pump(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if 'id' in m and m['id'] in self.pending:
                self.pending.pop(m['id']).set_result(m)

    async def call(self, method, **params):
        self.n += 1
        fut = asyncio.get_event_loop().create_future()
        self.pending[self.n] = fut
        await self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        m = await fut
        if 'error' in m:
            raise RuntimeError(f'{method}: {m["error"]}')
        return m.get('result', {})

    async def eval(self, expr):
        r = await self.call('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:800])
        return r['result'].get('value')


async def main(jobs):
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix='yk-boss-')
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={prof}', '--lang=ko-KR',
                           '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=800,600',
                           '--use-angle=d3d11', '--enable-gpu', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=heart')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__yk && __yk.ready())'):
                        break
                except Exception:
                    pass
            await c.eval("(async () => { const M = (await import('/src/dev/boss-bots.js?' + Date.now())).default; window.__BB = M; return await M.ready(); })()")
            await c.call('Emulation.setDeviceMetricsOverride', width=800, height=600, deviceScaleFactor=1, mobile=False)
            for name, n in jobs:
                if name.startswith('shot:'):  # shot:<장면>=<저장할 jpg 경로>
                    stage, out = name[5:].split('=', 1)
                    info = await c.eval(f'JSON.stringify(__BB.stage({json.dumps(stage)}))')
                    d = await c.call('Page.captureScreenshot', format='jpeg', quality=88)
                    with open(out, 'wb') as f:
                        f.write(base64.b64decode(d['data']))
                    print(f'{stage} -> {out}  {info[:240]}', flush=True)
                    continue
                for k in range(n):
                    t = time.time()
                    r = await asyncio.wait_for(c.eval(f'(() => {{ try {{ return JSON.stringify(__BB.run({json.dumps(name)}, 1)[0]); }} catch (e) {{ return "ERROR " + e.stack; }} }})()'), 90)
                    print(f'{name} #{k + 1} ({time.time() - t:.0f}s real): {r}', flush=True)
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()  # 크롬 자식 프로세스까지


if __name__ == '__main__':
    a = sys.argv[1:] or ['parry', '1']
    jobs = [(a[i], int(a[i + 1]) if i + 1 < len(a) and a[i + 1].isdigit() else 1) for i in range(0, len(a)) if not a[i].isdigit()]
    asyncio.run(main(jobs))
