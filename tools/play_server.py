"""직접 플레이용 조종 서버 — 화면 없는 크롬에 게임을 띄워 두고, 실제 키 입력(CDP Input.dispatchKeyEvent)을 HTTP로 보낸다.
개발자님이 미리보기 창에서 플레이하는 동안에도 겹치지 않게 Claude가 따로 플레이하며 화면을 찍어 볼 때 쓴다.

    py -I tools\\play_server.py [API 포트=8150] [저장 폴더]      (백그라운드로 켜 둔다)

    curl "http://127.0.0.1:8150/open?q=room=bridge"      게임 열기 (q = 주소 뒤 ?부분, 비우면 첫 화면)
    curl "http://127.0.0.1:8150/hold?codes=KeyD,KeyW&ms=800"   여러 키를 함께 누르고 있다가 뗌 (기다렸다 답함)
    curl "http://127.0.0.1:8150/key?code=ShiftLeft"     한 번 누름 (J·Space·E·R·M·ShiftLeft …)
    curl "http://127.0.0.1:8150/click?x=480&y=300"
    curl "http://127.0.0.1:8150/wait?ms=500"
    curl "http://127.0.0.1:8150/shot?name=01-bridge"     화면 → <저장 폴더>/01-bridge.jpg
    curl "http://127.0.0.1:8150/state"                   방·시대·칸·하트·적·보스·이펙트 수
    curl "http://127.0.0.1:8150/eval?js=..."             (확인용 JS)
    curl "http://127.0.0.1:8150/size?w=390&h=844&mobile=1"   화면 크기 (휴대폰 흉내)
    curl "http://127.0.0.1:8150/quit"
"""
import asyncio, base64, functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
API = int(sys.argv[1]) if len(sys.argv) > 1 else 8150
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(tempfile.gettempdir(), 'yk-play')
os.makedirs(OUT, exist_ok=True)
KEYS = {'ShiftLeft': ('Shift', 16), 'Space': (' ', 32), 'ArrowUp': ('ArrowUp', 38), 'ArrowDown': ('ArrowDown', 40), 'ArrowLeft': ('ArrowLeft', 37), 'ArrowRight': ('ArrowRight', 39), 'Escape': ('Escape', 27)}


def keyinfo(code):
    if code in KEYS:
        return KEYS[code]
    if code.startswith('Key'):
        return code[3:].lower(), ord(code[3:].upper())
    if code.startswith('Digit'):
        return code[5:], ord(code[5:])
    return code, 0


class Play:
    def __init__(self):
        self.loop = None; self.c = None; self.port = None; self.errors = []

    async def key(self, code, down):
        k, vk = keyinfo(code)
        p = {'type': 'keyDown' if down else 'keyUp', 'code': code, 'key': k, 'windowsVirtualKeyCode': vk, 'nativeVirtualKeyCode': vk}
        if down and len(k) == 1:
            p['text'] = k
        await self.c.call('Input.dispatchKeyEvent', **p)

    async def goto(self, tx, tz, tol, mx):
        t_end, held = time.time() + mx, set()
        room0 = await self.c.eval('__yk.state().room')
        while time.time() < t_end:
            s = json.loads(await self.c.eval('JSON.stringify([__yk.state().x, __yk.state().z, __yk.state().room, !!(__yk.S.trans || __yk.S.down)])'))
            if s[2] != room0 or s[3]:  # 방이 바뀌었거나 쓰러져 되감는 중이면 손을 뗀다 (사람도 그 순간엔 멈춘다)
                break
            dx, dz = tx - s[0], tz - s[1]
            if abs(dx) < tol and abs(dz) < tol:
                break
            want = set()
            if dx > tol * 0.5: want.add('KeyD')
            elif dx < -tol * 0.5: want.add('KeyA')
            if dz > tol * 0.5: want.add('KeyS')
            elif dz < -tol * 0.5: want.add('KeyW')
            for c in held - want:
                await self.key(c, False)
            for c in want - held:
                await self.key(c, True)
            held = want
            await asyncio.sleep(0.02)
        for c in held:
            await self.key(c, False)
        s = json.loads(await self.c.eval('JSON.stringify(__yk.state())'))
        return {'cell': s['cell'], 'x': s['x'], 'z': s['z'], 'era': s['era'], 'hearts': s['hearts']}

    async def handle(self, path, q):
        g = lambda k, d=None: q.get(k, [d])[0]
        if path == '/open':
            await self.c.call('Page.navigate', url=f'http://127.0.0.1:{self.port}/' + (('?' + g('q')) if g('q') else ''))
            for _ in range(200):
                await asyncio.sleep(0.2)
                try:
                    if await self.c.eval('!!(window.__yk && __yk.ready())'):
                        break
                except Exception:
                    pass
            return {'ok': True}
        if path == '/key':
            await self.key(g('code'), True); await asyncio.sleep(0.05); await self.key(g('code'), False); return {'ok': True}
        if path == '/hold':
            codes = g('codes').split(','); ms = int(g('ms', '300'))
            for c in codes:
                await self.key(c, True)
            await asyncio.sleep(ms / 1000)
            for c in codes:
                await self.key(c, False)
            return {'ok': True}
        if path == '/seq':  # 손에 익은 연속 입력을 한 번에 (요청 사이 지연 없이): key:ShiftLeft;goto:10.9,9;key:ShiftLeft;wait:100;down:KeyD;up:KeyD
            out = []
            for st in g('steps').split(';'):
                op, _, arg = st.partition(':')
                if op == 'key':
                    await self.key(arg, True); await asyncio.sleep(0.04); await self.key(arg, False)
                elif op in ('down', 'up'):
                    await self.key(arg, op == 'down')
                elif op == 'wait':
                    await asyncio.sleep(int(arg) / 1000)
                elif op == 'goto':
                    a = [float(v) for v in arg.split(',')]
                    out.append(await self.goto(a[0], a[1], a[2] if len(a) > 2 else 0.3, 6))
                elif op == 'gotojs':  # 그 순간 화면에 보이는 것(적 위치 등)으로 목표를 정해 간다: JS 식이 [x, z]를 돌려줌
                    a = json.loads(await self.c.eval('JSON.stringify(' + arg + ')'))
                    out.append(await self.goto(a[0], a[1], 0.3, 6))
                elif op == 'until':  # JS 조건이 참이 될 때까지 기다림 (최대 8초) — 화살이 지나가길 지켜보듯
                    t_end = time.time() + 8
                    while time.time() < t_end and not await self.c.eval('!!(' + arg + ')'):
                        await asyncio.sleep(0.02)
            out.append(json.loads(await self.c.eval('JSON.stringify([__yk.state().era, +__yk.state().x.toFixed(2), +__yk.state().z.toFixed(2), __yk.state().hearts])')))
            return {'seq': out}
        if path == '/goto':  # 칸(i, j)이나 좌표(x, z)까지: 방향키를 누른 채 위치를 보며 가다가 닿으면 뗀다 (사람이 화면 보며 걷듯)
            if g('i') is not None:
                tx, tz = int(g('i')) * 2 + 1, int(g('j')) * 2 + 1
            else:
                tx, tz = float(g('x')), float(g('z'))
            return await self.goto(tx, tz, float(g('tol', '0.35')), float(g('max', '6')))
        if path == '/click':
            x, y = float(g('x')), float(g('y'))
            for t in ('mousePressed', 'mouseReleased'):
                await self.c.call('Input.dispatchMouseEvent', type=t, x=x, y=y, button='left', clickCount=1)
            return {'ok': True}
        if path == '/wait':
            await asyncio.sleep(int(g('ms', '500')) / 1000); return {'ok': True}
        if path == '/shot':
            d = await self.c.call('Page.captureScreenshot', format='jpeg', quality=85)
            fp = os.path.join(OUT, g('name', str(int(time.time() * 1000))) + '.jpg')
            with open(fp, 'wb') as f:
                f.write(base64.b64decode(d['data']))
            return {'path': fp}
        if path == '/state':
            return json.loads(await self.c.eval("""JSON.stringify((() => { const s = __yk.state(), b = __yk.boss && __yk.boss();
              return { room: s.room, idx: s.roomIdx, era: s.era, cell: s.cell, x: s.x, z: s.z, hearts: s.hearts, enemies: s.guardsLeft, kills: s.kills, alarms: s.alarms,
                shards: s.shards, gateT: s.gateT, lever: s.lever, falls: s.falls, hurts: s.hurts, ended: s.ended, held: __yk.S.held, hold: __yk.S.hold,
                boss: b && b !== 'pending' ? { hp: b.hp, era: b.era, state: b.state, wind: b.wind, kind: b.kind, cell: b.cell } : b,
                fx: window.__fx && __fx.stats(), audio: window.__music && __music.X ? __music.X.c.state : 'none', toast: document.getElementById('toast').textContent,
                hint: document.getElementById('hint').textContent }; })())"""))
        if path == '/eval':
            return {'value': await self.c.eval(g('js'))}
        if path == '/size':
            await self.c.call('Emulation.setDeviceMetricsOverride', width=int(g('w', '960')), height=int(g('h', '600')), deviceScaleFactor=1, mobile=g('mobile') == '1')
            if g('mobile') == '1':
                await self.c.call('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
            return {'ok': True}
        if path == '/errors':
            return {'errors': self.errors[-20:]}
        return {'error': 'unknown ' + path}

    async def main(self):
        self.loop = asyncio.get_running_loop()
        self.port, dbg = free_port(), free_port()
        httpd = Server(('127.0.0.1', self.port), functools.partial(Quiet, directory=GAME))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-play-")}', '--mute-audio',
                               '--autoplay-policy=no-user-gesture-required', '--window-size=960,600', '--use-angle=d3d11', '--enable-gpu', 'about:blank'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
                self.c = CDP(ws)
                orig = self.c.pump

                async def pump():  # 콘솔 오류도 모아 둔다
                    async for raw in ws:
                        m = json.loads(raw)
                        if 'id' in m and m['id'] in self.c.pending:
                            self.c.pending.pop(m['id']).set_result(m)
                        elif m.get('method') == 'Runtime.exceptionThrown':
                            self.errors.append(m['params']['exceptionDetails'].get('text', '')[:300])
                pt = asyncio.ensure_future(pump())
                await self.c.call('Runtime.enable'); await self.c.call('Page.enable')
                await self.c.call('Emulation.setDeviceMetricsOverride', width=960, height=600, deviceScaleFactor=1, mobile=False)
                self.done = asyncio.Event()
                play = self

                class H(http.server.BaseHTTPRequestHandler):
                    def log_message(self, *a):
                        pass

                    def do_GET(self):
                        u = urllib.parse.urlsplit(self.path)
                        if u.path == '/quit':
                            play.loop.call_soon_threadsafe(play.done.set); res = {'bye': True}
                        else:
                            fut = asyncio.run_coroutine_threadsafe(play.handle(u.path, urllib.parse.parse_qs(u.query)), play.loop)
                            try:
                                res = fut.result(120)
                            except Exception as e:
                                res = {'error': repr(e)[:400]}
                        body = json.dumps(res, ensure_ascii=False).encode('utf-8')
                        self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body)
                api = http.server.ThreadingHTTPServer(('127.0.0.1', API), H)
                threading.Thread(target=api.serve_forever, daemon=True).start()
                print(f'play server on http://127.0.0.1:{API}  shots -> {OUT}', flush=True)
                await self.done.wait()
                api.shutdown(); pt.cancel()
        finally:
            subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()


if __name__ == '__main__':
    asyncio.run(Play().main())
