"""타격감 이펙트 장면 스크린샷 (화면 없는 크롬, src/dev/fx-shots.js의 장면).

    py -I tools\\fx_shots.py <저장 폴더> [장면 ...]     장면: slam stab arrive death wall shift (기본: 전부)

장면마다 <저장 폴더>/<장면>.jpg 와 그 순간의 이펙트 수(알갱이 · 돌 조각 · 바닥 금 · 빛 · 카메라 펀치)를 찍는다.
"""
import asyncio, base64, functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from boss_sim import CDP, Quiet, free_port, CHROME, GAME  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
ALL = ['slam', 'stab', 'arrive', 'death', 'wall', 'shift']


async def main(out, stages):
    os.makedirs(out, exist_ok=True)
    port, dbg = free_port(), free_port()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={tempfile.mkdtemp(prefix="yk-fx-")}', '--mute-audio',
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
            await c.call('Emulation.setDeviceMetricsOverride', width=960, height=600, deviceScaleFactor=1, mobile=False)
            await c.call('Page.navigate', url=f'http://127.0.0.1:{port}/?room=heart')
            for _ in range(300):
                await asyncio.sleep(0.2)
                try:
                    if await c.eval('!!(window.__yk && __yk.ready())'):
                        break
                except Exception:
                    pass
            r = await c.eval("(async () => { try { const M = (await import('/src/dev/fx-shots.js?' + Date.now())).default; window.__FS = M; return await M.ready(); } catch (e) { return 'ERROR ' + e.stack; } })()")
            if isinstance(r, str) and r.startswith('ERROR'):
                sys.exit(r)
            for s in stages:
                info = await asyncio.wait_for(c.eval(f"(() => {{ try {{ return JSON.stringify(__FS.stage({json.dumps(s)})); }} catch (e) {{ return 'ERROR ' + e.stack; }} }})()"), 90)
                d = await c.call('Page.captureScreenshot', format='jpeg', quality=88)
                path = os.path.join(out, s + '.jpg')
                with open(path, 'wb') as f:
                    f.write(base64.b64decode(d['data']))
                print(s.ljust(7), path, info, flush=True)
                if s.endswith('Pre'):  # 이어 찍기: 0.06초씩 6장 → 한 장으로 (움직임이 있어야 보이는 먼지·파편 확인용)
                    frames = [path]
                    for k in range(5):
                        await c.eval('JSON.stringify(__FS.step(0.06))')
                        d = await c.call('Page.captureScreenshot', format='jpeg', quality=85)
                        fp = os.path.join(out, f'{s}-{k + 1}.jpg')
                        with open(fp, 'wb') as f:
                            f.write(base64.b64decode(d['data']))
                        frames.append(fp)
                    from PIL import Image
                    ims = [Image.open(f).crop((240, 90, 720, 450)) for f in frames]
                    sheet = Image.new('RGB', (480 * 3, 360 * 2))
                    for k, im in enumerate(ims):
                        sheet.paste(im, ((k % 3) * 480, (k // 3) * 360))
                    sp = os.path.join(out, s + '-sheet.jpg'); sheet.save(sp, quality=88)
                    for f in frames[1:]:
                        os.remove(f)
                    print('       sheet', sp, flush=True)
            errs = await c.eval("JSON.stringify((window.__errs || []).slice(0, 3))")
            pump.cancel()
    finally:
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(ch.pid)], capture_output=True); httpd.shutdown()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], sys.argv[2:] or ALL))
