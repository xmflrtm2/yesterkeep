"""효과음(src/audio.js) 하나하나를 OfflineAudioContext로 그려 세기를 잰다 — 사람 귀 대신 숫자로 고르기.

    py -I tools\\sfx_check.py

소리마다 최고값(찢어짐 < 0.98)과 평균 세기(dBFS), 길이를 표로. 바로 곁(위치 없음)과 6m 옆에서 난 경우를 함께.
기준: 최고 < 0.98, 평균 -45 ~ -12 dBFS. 발소리·횃불처럼 자주 나는 소리는 -30 dBFS보다 작게.
"""
import asyncio, functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, Server, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
JS = r"""
(async () => {
  const mk = window.__makeSfx, names = ['step:past', 'step:now', 'roll', 'swish', 'hurt', 'fall', 'rewind', 'shift:past', 'shift:now', 'thunk', 'exit', 'room',
    'kill', 'clang', 'alarm', 'hmm', 'windup', 'lever', 'door', 'plate', 'gateOpen', 'gateClose', 'spikeUp', 'spikeWarn', 'arrowFire', 'arrowHit', 'bladeSwish',
    'raftCreak', 'scrape', 'crateSink', 'shard', 'crackle', 'heavyStep', 'slam', 'crumble', 'wake', 'arrive:past', 'charge', 'dash', 'crack', 'bossFall'];
  const FREQ = { 'step:past': 1, 'step:now': 1, crackle: 1, heavyStep: 1, spikeWarn: 1 };
  const out = [];
  for (const nm of names) {
    for (const far of [false, true]) {
      const sr = 32000, sec = 2.6, c = new OfflineAudioContext(2, sr * sec, sr);
      const S = mk(() => c, () => ({ x: 0, z: 0 }));
      const [name, arg] = nm.split(':');
      const pos = far ? { x: 6, z: 0 } : undefined;
      if (arg) S[name](arg); else S[name](pos);
      const b = await c.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1);
      let pk = 0, ss = 0, last = 0, lr = 0;
      for (let k = 0; k < L.length; k++) { const a = Math.max(Math.abs(L[k]), Math.abs(R[k])); pk = Math.max(pk, a); ss += L[k] * L[k] + R[k] * R[k]; lr += L[k] * L[k] - R[k] * R[k]; if (a > 1e-3) last = k; }
      // 평균은 소리가 나는 길이(마지막으로 1e-3 넘은 곳까지)로
      const n = Math.max(1, last), rms = Math.sqrt(ss / (2 * n));
      out.push({ name: nm + (far ? ' @6m' : ''), peak: +pk.toFixed(3), db: +(20 * Math.log10(rms || 1e-9)).toFixed(1), len: +(last / sr).toFixed(2), right: lr < 0, freq: !!FREQ[nm] });
      if (arg) break; // 시대 인자 소리는 위치 없음
    }
  }
  return JSON.stringify(out);
})()
"""


async def main():
    port, dbg = free_port(), free_port()
    httpd = Server(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-sfx-")}', '--mute-audio', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            await c.call('Runtime.enable'); await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=bridge')
            for _ in range(200):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!window.__makeSfx'):
                        break
                except Exception:
                    pass
            rows = json.loads(await asyncio.wait_for(c.eval(JS), 120))
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()
    print(f"{'소리':16} {'최고':>6} {'평균dB':>7} {'길이':>5}")
    for r in rows:
        far = r['name'].endswith('@6m')
        ok = r['peak'] < 0.98 and (far or -45 <= r['db'] <= -12) and not (r['freq'] and not far and r['db'] > -30)
        bad += not ok
        print(f"{'  ' if ok else 'NO'}{r['name']:16} {r['peak']:6.3f} {r['db']:7.1f} {r['len']:5.2f}" + ('  (오른쪽)' if far and r['right'] else ''))
    return bad


if __name__ == '__main__':
    sys.exit(1 if asyncio.run(main()) else 0)
