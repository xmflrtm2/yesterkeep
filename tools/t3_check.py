"""T3 퍼즐 조각 점검 — 화면 없는 크롬에서 src/ext/t3/dev.js를 불러 조각마다:
  ① 풀이기: 처음 상태에서 최소 몇 번 장치를 써야 출구에 닿는지(상자 밀기 포함), 장치 없이 깨지면 '너무 쉬움'
  ② 봇 풀이: chunks.js의 solve 단계를 진짜 KeyboardEvent로 (시간은 __yk.step), 성공·걸린 게임 시간·잃은 하트
  ③ 게으른 봇 다섯(각 40초): 가만히 / 0.5초마다 Shift + 아무 데나 걷기 / 막 누르기 / 출구로 돌진(가까운 적 찌르기) / 적 둘레 빙빙(등이면 찌르기) → 깨면 안 됨

    py -I tools\t3_check.py            -> 표 + 끝 코드(문제 있으면 1)
    py -I tools\t3_check.py t3-garden  -> 한 조각만
"""
import asyncio, functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
JS = r"""
(async () => {
  const D = (await import('/src/ext/t3/dev.js')).default; await D.ready();
  const ids = IDS.length ? IDS : D.ids();
  return JSON.stringify(ids.map(id => D.check(id)));
})()
"""

async def main():
    ids = [a for a in sys.argv[1:] if not a.startswith('-')]
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-t3check-")}', '--mute-audio',
                           '--window-size=960,600', '--use-angle=d3d11', '--enable-gpu', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            await c.call('Runtime.enable'); await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=t3-lab')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__yk && __yk.ready())'):
                        break
                except Exception:
                    pass
            rows = json.loads(await asyncio.wait_for(c.eval(JS.replace('IDS', json.dumps(ids))), 1800))
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()
    bad = 0
    print(f"{'조각':16} {'tier':>4} {'최소 행동':>8} {'봇':>4} {'봇 시간':>7} {'하트':>4}  게으른 봇(가만/연타/막누름/돌진/빙빙)  비고")
    for r in rows:
        v, b = r['solver'], r['bot']
        lazy = ' '.join('깸!' if z['exited'] else '못깸' for z in r['lazy'])
        problems = []
        if not v.get('ok'): problems.append('풀이기 못 풂')
        if v.get('ok') and v.get('actions') == 0 and v.get('tier', 1) > 1 and not v.get('timing'): problems.append('장치 없이 깨짐')  # timing 조각은 박자·멈추기로 푸는 게 의도
        if not b['ok']: problems.append('봇 실패: ' + str(b.get('fail')))
        if any(z['exited'] for z in r['lazy']): problems.append('게으른 봇이 깸')
        if r['errs']: problems.append('오류 ' + '; '.join(r['errs'])[:120])
        bad += bool(problems)
        acts = v.get('actions') if v.get('ok') else '-'
        print(f"{'  ' if not problems else 'NO'}{r['id']:16} {v.get('tier', ''):>4} {str(acts):>8} {'OK' if b['ok'] else 'X':>4} {b.get('sec', 0):>6}s {b['hearts']:>4}  {lazy:26}  {', '.join(problems)}")
    print(f"{len(rows) - bad} / {len(rows)} 통과")
    return bad


if __name__ == '__main__':
    sys.exit(1 if asyncio.run(main()) else 0)
