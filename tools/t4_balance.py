"""T4 균형 시험: 유물을 든 채 게으른 봇을 돌려 "유물 덕에 대충 해도 깨지는지" 본다 (화면 없는 크롬).

    py -I tools\\t4_balance.py rooms spam 2 --give none
    py -I tools\\t4_balance.py rooms spam 2 --give all              -> 모래 없는 유물 26개를 모두 II로
    py -I tools\\t4_balance.py rooms rush 2 --give shock-bell:2,glass-dagger:2
    py -I tools\\t4_balance.py boss spam 3 --give all               -> src/dev/boss-bots.js 봇(spam·circle·roll·parry·wall·far)
    옵션: --rooms ambush,backtoback,golem,pair,outpost,t4-arena   --limit 60(방마다 초)

방 봇 (사람 반응 0.25초, 실제 KeyboardEvent, 시간은 __yk.step):
  spam1: spam과 같지만 1.1초마다 (T2의 '준비된 전환' 1초를 저절로 채우는 박자)
  spam : 0.5초마다 Shift를 누르며 가장 가까운 적(어느 시대든)에게 길찾기로 걸어가, 같은 시대 2.2m 안이면 찌른다 — 생각 없이 Shift 연타
  rush : 가장 가까운 적의 시대로 바꾸고 곧장 걸어가 찌른다 — 숨지도 돌아가지도 않음
  hold : 가만히 서서 Shift만 누른다 (적이 오면 찌름)
결과: 방마다 깼는지·걸린 시간·쓰러진 횟수·잃은 하트·경보. 기준 = 유물 없음(--give none)과 비교.
"""
import asyncio, functools, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

ROOM_BOTS = r"""
window.__T4B = (() => {
  const Y = () => window.__yk, S = () => window.__yk.S, P = window.__P, K = () => window.__yk.ext.K;
  const foes = era => K().enemies().filter(f => f.alive && !f.optional && (!era || f.era === era));
  const nearest = era => { const s = Y().state(); let best = null, bd = 1e9; for (const f of foes(era)) { const d = Math.hypot(f.x - s.x, f.z - s.z); if (d < bd) { bd = d; best = f; } } return [best, bd]; };
  // 지금 시대에서 서 있을 수 있는 칸으로 (i,j)까지 너비 우선 → 다음 칸 하나
  function nextCell(ti, tj) {
    const s = Y().state(), era = s.era, si = s.cell[0], sj = s.cell[1];
    const ok = (a, b) => { const c = Y().cell(a, b, era); return c.floor && !c.solid; };
    const key = (a, b) => a + ',' + b, prev = new Map([[key(si, sj), null]]), q = [[si, sj]];
    let goal = null, gd = 1e9;
    while (q.length) { const [a, b] = q.shift(); const d = Math.abs(a - ti) + Math.abs(b - tj); if (d < gd) { gd = d; goal = [a, b]; } if (d === 0) break;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (!prev.has(key(na, nb)) && ok(na, nb)) { prev.set(key(na, nb), [a, b]); q.push([na, nb]); } } }
    let c = goal, p = prev.get(key(c[0], c[1])); if (!p) return goal;
    while (p && (p[0] !== si || p[1] !== sj)) { c = p; p = prev.get(key(c[0], c[1])); }
    return c;
  }
  function stepToward(f, sec) {
    const s = Y().state(), fi = Math.floor(f.x / 2), fj = Math.floor(f.z / 2);
    if (Math.abs(fi - s.cell[0]) + Math.abs(fj - s.cell[1]) <= 1) { P.moveTo(f.x, f.z, { exact: true, max: sec, tol: 1.1 }); return; }
    const [a, b] = nextCell(fi, fj); P.moveTo(a * 2 + 1, b * 2 + 1, { exact: true, max: sec, tol: 0.4 });
  }
  function run(roomId, bot, limit) {
    P.room(roomId); const t0 = S().time; let deaths = 0, lastH = S().hearts, lost0 = S().hurts + S().falls, shifts = 0, shiftT = -9, stabs = 0, alarms = 0, lastAl = 0;
    while (S().time - t0 < limit) {
      if (!foes().length) break;
      const h = S().hearts; if (h > lastH) deaths++; lastH = h;
      if (S().alarms !== lastAl) { if (S().alarms > lastAl) alarms += S().alarms - lastAl; lastAl = S().alarms; }
      if (S().down || S().trans) { P.wait(0.1); lastAl = S().alarms; continue; }
      const [f] = nearest(null), tick = S().time;
      if (bot === 'spam' || bot === 'spam1') {
        stepToward(f, 0.25);
        if (S().time - shiftT > (bot === 'spam1' ? 1.1 : 0.5)) { P.shift(); shiftT = S().time; shifts++; }
      } else if (bot === 'rush') {
        if (f.era !== S().era && S().shiftCd <= 0) { P.shift(); shifts++; P.react(); }
        stepToward(f, 0.25);
      } else if (bot === 'hold') {
        P.wait(0.25); if (S().time - shiftT > 0.5) { P.shift(); shiftT = S().time; shifts++; }
      }
      const [g, dg] = nearest(S().era); if (g && dg < 2.2 && S().stabT <= 0) { P.stab(); stabs++; P.wait(0.15); }
      if (S().time === tick) P.wait(0.05); // 다른 시대에 멈춘 적 바로 위에 서 있으면 아무 일도 없이 돌던 문제 (시간이 꼭 흐르게)
    }
    return { room: roomId, bot, cleared: !foes().length, t: +(S().time - t0).toFixed(1), deaths, lost: (S().hurts + S().falls) - lost0, alarms, shifts, stabs };
  }
  return { run };
})();
1
"""

# 보스 'wide': Shift 없이 같은 시대에서 보스 둘레를 돌다가, 유물이 넓힌 등 판정(T4 st.backDeg) 안이면 찌른다 — 암살자의 눈을 노리는 게으른 풀이
BOSS_WIDE = r"""
window.__T4W = (limit) => {
  const Y = () => __yk, S = () => __yk.S, B = () => __yk.boss(), P = window.__P;
  P.room('heart'); const t0 = S().time; let hits = 0, deaths = 0, lastH = S().hearts, lost0 = S().hurts + S().falls;
  const back = () => { const b = B(), s = Y().state(), y = b.yawDeg * Math.PI / 180, dx = s.x - b.x, dz = s.z - b.z, d = Math.hypot(dx, dz);
    return (dx * Math.sin(y) + dz * Math.cos(y)) / Math.max(d, 0.01) < Math.cos(((__t4.st() && __t4.st().backDeg) || 110) * Math.PI / 180); };
  while (B().alive && S().time - t0 < limit) {
    const h = S().hearts; if (h > lastH) deaths++; lastH = h;
    if (S().down) { P.wait(0.1); continue; }
    const b = B(), s = Y().state(), a = Math.atan2(s.x - b.x, s.z - b.z) + 0.9, tick = S().time;
    P.moveTo(b.x + Math.sin(a) * 1.8, b.z + Math.cos(a) * 1.8, { exact: true, max: 0.25, tol: 0.3 });
    if (b.era === s.era && back() && b.hurtCd <= 0 && Math.hypot(s.x - b.x, s.z - b.z) < (__yk.ext.stats.lunge || 3)) { const hp = b.hp; P.stab(); P.wait(0.15); if (B().hp < hp) hits++; }
    if (S().time === tick) P.wait(0.05);
  }
  return { bot: 'wide', win: !B().alive, t: +(S().time - t0).toFixed(1), bossHp: B().hp, hits, deaths, lost: (S().hurts + S().falls) - lost0 };
};
1
"""


async def main(mode, bot, n, give, rooms, limit):
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-t4b-")}', '--lang=ko-KR',
                           '--no-first-run', '--mute-audio', '--window-size=800,600', '--use-angle=d3d11', '--enable-gpu', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = []
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
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=' + ('heart' if mode == 'boss' else 'bridge'))
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__yk && __yk.ready() && window.__t4)'):
                        break
                except Exception:
                    pass
            # 유물 주기: none / all(모래 없는 것 모두 II) / 목록
            js_give = {'none': '[]', 'all': "__t4.ITEMS.filter(it => !it.needs).map(it => it.id + ':2')"}.get(give, json.dumps(give.split(',')))
            got = await c.eval(f"(() => {{ __t4.reset(); __t4.T4.run.active = true; for (const s of {js_give}) {{ const [id, lv] = s.split(':'); __t4.give(id.startsWith('t4-') ? id : 't4-' + id, {{ lv: +lv || 1, silent: true }}); }} return JSON.stringify([__t4.state().inv.length, __yk.ext.stats.maxHearts]); }})()")
            print(f'give {give}: {got}', flush=True)
            if mode == 'boss':
                await c.eval("(async () => { const M = (await import('/src/dev/boss-bots.js?' + Date.now())).default; window.__BB = M; window.__P = (await import('/src/dev/play.js')).default; return await M.ready(); })()")
                await c.eval(BOSS_WIDE)
                for k in range(n):
                    t = time.time()
                    call = '__T4W(90)' if bot == 'wide' else f'__BB.run({json.dumps(bot)}, 1)[0]'
                    r = await asyncio.wait_for(c.eval(f'(() => {{ try {{ return JSON.stringify({call}); }} catch (e) {{ return "ERROR " + e.stack; }} }})()'), 180)
                    print(f'boss {bot} #{k + 1} ({time.time() - t:.0f}s real): {r}', flush=True)
                    out.append(r)
            else:
                await c.eval("(async () => { window.__P = (await import('/src/dev/play.js?' + Date.now())).default; await __P.ready(); return 1; })()")
                await c.eval(ROOM_BOTS)
                # 경비 모델은 첫 방 뒤에 받는다(core: ec719d3) — 받기 전에 경비 방을 열면 경비가 아직 없어 '0초에 깼다'로 잘못 나온다(11/15)
                await c.eval("__P.room('ambush'), 1")
                for _ in range(150):
                    if await c.eval('!__yk.S.guardPending'):
                        break
                    await asyncio.sleep(0.2)
                for room in rooms:
                    for k in range(n):
                        r = await asyncio.wait_for(c.eval(f'(() => {{ try {{ return JSON.stringify(__T4B.run({json.dumps(room)}, {json.dumps(bot)}, {limit})); }} catch (e) {{ return "ERROR " + e.stack; }} }})()'), 180)
                        print(r, flush=True)
                        out.append(r)
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    def opt(name, d):
        return a[a.index(name) + 1] if name in a else d
    pos = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or not a[i - 1].startswith('--'))]
    mode, bot, n = pos[0], pos[1], int(pos[2]) if len(pos) > 2 else 1
    rooms = opt('--rooms', 'ambush,backtoback,golem,pair,outpost,t4-arena').split(',')
    asyncio.run(main(mode, bot, n, opt('--give', 'none'), rooms, float(opt('--limit', '60'))))
