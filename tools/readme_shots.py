"""README / store screenshots for Yesterkeep, rendered by headless Chrome over the DevTools protocol.

    py -I tools\\readme_shots.py <out_dir> [name ...]   -> <out_dir>\\<name>.png (1280x720, English UI)

Starts its own static server for this folder (needs assets/fab/ in place), switches the game to English,
pauses the sim and stages each shot through window.__yk. Shot recipes are the JS snippets in SHOTS.
"""
import asyncio, base64, functools, http.server, json, os, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
W, H = 1280, 720

# Shared helpers injected once per page. Cell (i, j) -> world (i*2+1, j*2+1).
HELPERS = r"""
window.__sh = {
  hud(on) { document.getElementById('hud').style.display = on ? '' : 'none'; },
  title(on) { document.getElementById('roomTitle').style.opacity = on ? 1 : 0; },
  behind(g, d = 1.3) { const y = g.yawDeg * Math.PI / 180; __yk.tpw(g.x - Math.sin(y) * d, g.z - Math.cos(y) * d); __yk.heroYaw(y); },
  frame(cx, cz, px, pz, yaw) { __yk.tpw(cx, cz); __yk.step(0.02); __yk.S.p.set(px, 0, pz); __yk.heroYaw(yaw); __yk.render(); },
  front(g, d = 2.2) { const y = g.yawDeg * Math.PI / 180; __yk.tpw(g.x + Math.sin(y) * d, g.z + Math.cos(y) * d); __yk.heroYaw(y + Math.PI); },
};
true
"""

SHOTS = {
    # Banner pair: the same spot in the "two guards" room, yesterday and today, no HUD.
    'banner_past': """
        __yk.room('pair'); __yk.pause(true); __sh.hud(false); __yk.era('past'); __yk.cam(21, 54);
        __sh.frame(15, 9.6, 9, 13, Math.PI / 2);
    """,
    'banner_now': """
        __yk.room('pair'); __yk.pause(true); __sh.hud(false); __yk.era('now'); __yk.cam(21, 54);
        __sh.frame(15, 9.6, 9, 13, Math.PI / 2);
    """,
    # Today: the guard is a frozen red ghost; walk around behind it.
    'ghost_today': """
        __yk.room('ambush'); __yk.pause(false); __yk.step(1.2); __yk.pause(true); __sh.hud(true); __sh.title(false);
        __yk.era('now'); const g = __yk.guards()[0]; __sh.behind(g, 1.6); __yk.cam(16, 55); __yk.step(0.05);
    """,
    # Yesterday: shift back and stab it in the back.
    'backstab_yesterday': """
        __yk.room('ambush'); __yk.pause(false); __yk.step(1.2); __yk.pause(true); __sh.hud(true); __sh.title(false);
        const g = __yk.guards()[0]; __yk.era('past'); __sh.behind(g, 1.1); __yk.cam(16, 55); __yk.stab(); __yk.step(0.12);
    """,
    # Stone golem (today only): a front stab bounces off and it winds up a slam.
    'golem_slam': """
        __yk.room('golem'); __yk.pause(true); __sh.hud(true); __sh.title(false); __yk.era('now');
        __yk.S.invuln = 99; const g = __yk.golems()[0]; __sh.front(g, 2.0); __yk.cam(16, 55);
        for (let k = 0; k < 80; k++) { __yk.step(0.05); __yk.S.invuln = 99; const s = __yk.golems()[0]; if (s.wind > 0.45) break; }
        __yk.S.invuln = 0; __yk.render();
    """,
    # Arrows fly yesterday...
    'arrows_yesterday': """
        __yk.room('arrows'); __yk.pause(true); __sh.hud(true); __sh.title(false); __yk.era('past');
        __yk.tp(3, 3); __yk.heroYaw(Math.PI / 2); __yk.S.invuln = 99; __yk.step(1.4); __yk.S.invuln = 0; __yk.render();
    """,
    # ...and hang frozen in the air while you are in today.
    'arrows_today': """
        __yk.room('arrows'); __yk.pause(true); __sh.hud(true); __sh.title(false); __yk.era('past');
        __yk.tp(3, 3); __yk.heroYaw(Math.PI / 2); __yk.S.invuln = 99; __yk.step(1.4); __yk.era('now'); __yk.step(0.1); __yk.S.invuln = 0; __yk.render();
    """,
}


class Server(http.server.ThreadingHTTPServer):
    # `python -m http.server` listens with a backlog of 5; Chrome's burst of texture requests overflowed it on Windows
    # ("Failed to fetch" / "Couldn't load texture", sometimes the game never became ready) -> 128, as in release_check.py
    request_queue_size = 128
    daemon_threads = True


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class CDP:
    def __init__(self, ws):
        self.ws, self.n = ws, 0

    async def call(self, method, **params):
        self.n += 1
        i = self.n
        await self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            m = json.loads(await self.ws.recv())
            if m.get('id') == i:
                if 'error' in m:
                    raise RuntimeError(f'{method}: {m["error"]}')
                return m.get('result', {})

    async def eval(self, expr):
        r = await self.call('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:800])
        return r['result'].get('value')

    async def until(self, expr, tries=300, step=0.2):
        for _ in range(tries):
            await asyncio.sleep(step)
            try:
                if await self.eval(expr):
                    return True
            except Exception:
                pass
        raise RuntimeError('timed out waiting for ' + expr)


async def run(out_dir, names):
    os.makedirs(out_dir, exist_ok=True)
    port, dbg = free_port(), free_port()
    srv = Server(('127.0.0.1', port), functools.partial(QuietHandler, directory=GAME))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix='yk-chrome-')
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={prof}', '--lang=en-US',
                           '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
                           '--force-device-scale-factor=1', '--use-angle=d3d11', '--enable-gpu', 'about:blank'],
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
        if not ws_url:
            raise RuntimeError('chrome did not start')
        async with websockets.connect(ws_url, max_size=None) as ws:
            c = CDP(ws)
            await c.call('Page.enable')
            await c.call('Emulation.setDeviceMetricsOverride', width=W, height=H, deviceScaleFactor=1, mobile=False)
            base = f'http://127.0.0.1:{port}/'
            await c.call('Page.navigate', url=base)
            await c.until("document.readyState === 'complete'")
            await c.eval("localStorage.setItem('yk-lang', 'en'); true")
            await c.call('Page.navigate', url=base + '?shots=' + str(int(time.time())))
            await c.until('window.__yk && __yk.ready()')
            await c.until('__yk.golemModel()', tries=150)
            await c.eval(HELPERS)
            for name in names:
                await c.eval('(async () => {' + SHOTS[name] + '; return true; })()')
                await asyncio.sleep(0.6)
                shot = await c.call('Page.captureScreenshot', format='png')
                out = os.path.join(out_dir, name + '.png')
                with open(out, 'wb') as f:
                    f.write(base64.b64decode(shot['data']))
                print('saved', out, os.path.getsize(out), flush=True)
    finally:
        ch.kill(); ch.wait(); srv.shutdown(); srv.server_close()
        shutil.rmtree(prof, ignore_errors=True)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    names = sys.argv[2:] or list(SHOTS)
    asyncio.run(run(sys.argv[1], names))


main()
