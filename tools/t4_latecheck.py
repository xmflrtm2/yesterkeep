"""늦게 선 경비의 처치 모래 시험 (T4 2차 11/16) — 경비 모델(Male 파츠)이 오기 전에 런의 경비 방에 들어간 경우.

    py -I tools\\t4_latecheck.py            -> 결과 JSON 한 줄

화면 없는 크롬에서 경비 모델 요청을 붙잡아 두고(CDP Fetch), T1 시험 손잡이(EXT.run._dev.jump)로 경비가 있는 전투 칸에 들어간 뒤
모델을 풀어 준다 → 경비가 늦게 선다. 그 경비들을 쓰러뜨리고(K.killFoe) 모래가 처치마다 SAND.kill(1초)씩 들어왔는지 본다.
T1은 방을 불러올 때 적 수를 세어(R.enemies0) 그만큼만 처치 모래를 주므로, 늦게 선 경비 몫은 T4(r2.js)가 채운다.
"""
import asyncio, functools, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')


class C:
    def __init__(self, ws):
        self.ws, self.n, self.pending, self.paused = ws, 0, {}, []

    async def pump(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if 'id' in m and m['id'] in self.pending:
                self.pending.pop(m['id']).set_result(m)
            elif m.get('method') == 'Fetch.requestPaused':
                self.paused.append(m['params']['requestId'])

    async def call(self, method, **params):
        self.n += 1
        fut = asyncio.get_running_loop().create_future(); self.pending[self.n] = fut
        await self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        m = await fut
        if 'error' in m:
            raise RuntimeError(m['error'])
        return m.get('result', {})

    async def eval(self, js):
        r = await self.call('Runtime.evaluate', expression=js, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:400])
        return r['result'].get('value')


FIND = r"""(() => {
  const run = __yk.ext.run, D = run._dev;
  for (let k = 1; k <= 40; k++) {
    for (const [f, type] of [[1, 'combat'], [1, 'elite'], [2, 'combat'], [1, 'guard']]) {
      D.jump(f, type, 'late' + k);
      const r = __yk.S.room;
      if (r.guards && r.guards.length) return JSON.stringify({ seed: 'late' + k, floor: f, type, room: r.id, name: r.name, guardsInData: r.guards.length,
        pending: !!__yk.S.guardPending, spawned: __yk.guards().length, enemies0: D.R.enemies0, sand: run.sand() });
    }
  }
  return JSON.stringify({ none: true });
})()"""

KILL = r"""(() => {
  const K = __yk.ext.K, run = __yk.ext.run, D = run._dev;
  __yk.step(0.1); run.setSand(6); // 모래가 가득이면 더해도 안 보인다
  const before = { sand: run.sand(), guards: __yk.guards().length, late: K.guards.filter(g => g.t4late).length, enemies0: D.R.enemies0, rewarded: D.R.killsRewarded };
  let n = 0;
  for (const f of K.enemies().filter(f => f.alive && !f.optional)) { K.killFoe(f, 'back'); n++; __yk.step(0.05); }
  return JSON.stringify({ before, killed: n, after: { sand: +run.sand().toFixed(2), rewarded: D.R.killsRewarded }, gain: +(run.sand() - before.sand).toFixed(2) });
})()"""


async def main():
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-late-")}',
                           '--mute-audio', '--window-size=800,600', '--use-angle=d3d11', '--enable-gpu', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            c = C(ws); pump = asyncio.ensure_future(c.pump())
            await c.call('Runtime.enable'); await c.call('Page.enable')
            await c.call('Fetch.enable', patterns=[{'urlPattern': '*CharacterModularParts/Male/*', 'requestStage': 'Request'}])
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?seed=late0&fresh=1')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__yk && __yk.ready() && __yk.ext.run)'):
                        break
                except Exception:
                    pass
            await c.eval('__yk.pause(true); __yk.S.noHold = true; 1')
            found = json.loads(await c.eval(FIND))
            held = len(c.paused)
            for rid in c.paused:
                await c.call('Fetch.continueRequest', requestId=rid)
            await c.call('Fetch.disable')
            for _ in range(100):
                await asyncio.sleep(0.1)
                if await c.eval('__yk.guards().length > 0'):
                    break
            res = json.loads(await c.eval(KILL))
            print(json.dumps({'found': found, 'heldRequests': held, **res}, ensure_ascii=False), flush=True)
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()


asyncio.run(main())
