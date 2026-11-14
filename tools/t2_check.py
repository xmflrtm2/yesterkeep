"""T2 몬스터 조각 점검 — 화면 없는 크롬에서 tools/t2_bots.js를 돌린다.

    py -I tools\\t2_check.py solve                 -> 모든 조각을 의도한 풀이로 (풀리는지)
    py -I tools\\t2_check.py solve t2-hound-pit    -> 한 조각만
    py -I tools\\t2_check.py lazy spam,circle,idle [조각…] [--sec 60] [--runs 2]
                                                  -> 게으른 풀이 봇: 이걸로 쉽게 깨지면 너무 쉬운 것
    py -I tools\\t2_check.py errors               -> 모든 T2 방을 열어 콘솔 오류만 확인

결과는 줄마다 JSON 하나 + 마지막에 요약. 이 폴더를 그대로 띄우므로 assets/fab/ 가 있어야 한다.
"""
import asyncio, functools, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')


async def main(argv):
    mode = argv[0] if argv else 'solve'
    rest = argv[1:]
    sec, runs = 60, 1
    if '--sec' in rest:
        k = rest.index('--sec'); sec = float(rest[k + 1]); del rest[k:k + 2]
    if '--runs' in rest:
        k = rest.index('--runs'); runs = int(rest[k + 1]); del rest[k:k + 2]
    bots = []
    if mode == 'lazy':
        bots = rest[0].split(',') if rest else ['spam', 'circle', 'idle']
        rest = rest[1:]
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-t2-")}', '--lang=ko-KR',
                           '--no-first-run', '--mute-audio', '--window-size=800,600', '--use-angle=d3d11', '--enable-gpu', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
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

            async def pump():
                async for raw in ws:
                    m = json.loads(raw)
                    if 'id' in m and m['id'] in c.pending:
                        c.pending.pop(m['id']).set_result(m)
                    elif m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']; errors.append((d.get('text', '') + ' ' + (d.get('exception') or {}).get('description', ''))[:400])
                    elif m.get('method') == 'Runtime.consoleAPICalled' and m['params']['type'] == 'error':
                        errors.append(' '.join(str(a.get('value', a.get('description', ''))) for a in m['params']['args'])[:400])
            pt = asyncio.ensure_future(pump())
            await c.call('Runtime.enable'); await c.call('Page.enable')
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=t2-zoo')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__yk && __yk.ready() && __yk.golemModel())'):
                        break
                except Exception:
                    pass
            await c.eval("import('/tools/t2_bots.js?' + Date.now()).then(m => (window.__t2b = m.default, m.default.ready()))")
            ids = rest or await c.eval('__t2b.ids()')
            results = []
            if mode == 'errors':
                for rid in await c.eval("Object.keys(__yk.ext.rooms).filter(k => k.startsWith('t2-'))"):
                    n0 = len(errors)
                    await c.eval(f"(__yk.room('{rid}'), __yk.pause(true), __yk.step(3), true)")
                    print(json.dumps({'room': rid, 'errors': errors[n0:]}, ensure_ascii=False), flush=True)
            else:
                for rid in ids:
                    for bot in (bots or ['solve']):
                        for r in range(runs):
                            n0 = len(errors)
                            js = f"JSON.stringify(__t2b.solve('{rid}'))" if bot == 'solve' else f"JSON.stringify(__t2b.lazy('{rid}', '{bot}', {sec}))"
                            try:
                                res = json.loads(await c.eval(js))
                            except Exception as e:
                                res = {'id': rid, 'bot': bot, 'error': str(e)[:300]}
                            res['errors'] = errors[n0:]
                            results.append(res)
                            print(json.dumps(res, ensure_ascii=False), flush=True)
                won = [f"{r['id']}:{r.get('bot')}" for r in results if r.get('cleared')]
                print(json.dumps({'summary': {'runs': len(results), 'cleared': len(won), 'cleared_list': won}}, ensure_ascii=False), flush=True)
            pt.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1:]))
