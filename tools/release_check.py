"""Release check for Yesterkeep, in headless Chrome with an English browser (like most jam players).

    py -I tools\\release_check.py                      -> checks this folder (needs assets/fab/)
    py -I tools\\release_check.py build\\itch\\web       -> checks the built upload folder (tools/build_itch.py)
    options: --shots <dir>   save screenshots (first room, end of run)
             --json <file>   write the full report

What it checks:
  1. the page loads with no console errors and no missing files (HTTP >= 400)
  2. every requested path matches the file name's case exactly (itch.io's CDN is case-sensitive, Windows is not)
  3. the default language is English for an en-US browser, and no translation was missing while playing
  4. every room in ORDER is cleared by src/dev/clear-all.js (real key input, no teleport)
  5. first-load size (unique files fetched before the first room shows) and total size vs DESIGN.md §11 (6 MB / 15 MB)
  6. files under assets/ that the game never requested (candidates to drop from the build)
src/dev/ is served from this folder even when checking a build, so the build itself stays free of test code.
"""
import asyncio, base64, functools, http.server, json, os, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
import websockets

sys.stdout.reconfigure(encoding='utf-8')
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
W, H = 1280, 720
FIRST_MB, TOTAL_MB = 6.0, 15.0


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static files from ROOT, but /src/dev/* from the game folder (test tools are not in the build)."""
    def translate_path(self, path):
        p = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if p.startswith('/src/dev/'):
            return os.path.join(GAME, *p.lstrip('/').split('/'))
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


def case_ok(root, rel):
    """True if every path segment of rel exists in root with exactly this case."""
    cur = root
    for seg in rel.split('/'):
        try:
            names = os.listdir(cur)
        except OSError:
            return False
        if seg not in names:
            return False
        cur = os.path.join(cur, seg)
    return True


class CDP:
    def __init__(self, ws):
        self.ws, self.n, self.pending, self.events = ws, 0, {}, []

    async def pump(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if 'id' in m and m['id'] in self.pending:
                self.pending.pop(m['id']).set_result(m)
            elif 'method' in m:
                self.events.append(m)

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

    async def until(self, expr, tries=300, step=0.2):
        for _ in range(tries):
            await asyncio.sleep(step)
            try:
                if await self.eval(expr):
                    return True
            except Exception:
                pass
        raise RuntimeError('timed out waiting for ' + expr)

    async def shot(self, path):
        d = await self.call('Page.captureScreenshot', format='png')
        with open(path, 'wb') as f:
            f.write(base64.b64decode(d['data']))
        return path


def net_summary(events, base):
    """Unique files (by path) with their size and HTTP status."""
    urls, done, status = {}, {}, {}
    for e in events:
        p = e['params']
        if e['method'] == 'Network.responseReceived':
            urls[p['requestId']] = p['response']['url']; status[p['requestId']] = p['response']['status']
        elif e['method'] == 'Network.loadingFinished':
            done[p['requestId']] = (p['encodedDataLength'], p['timestamp'])
    files = {}
    for rid, url in urls.items():
        if not url.startswith(base):
            continue
        rel = urllib.parse.unquote(urllib.parse.urlsplit(url).path).lstrip('/') or 'index.html'
        size, _ts = done.get(rid, (0, None))
        f = files.setdefault(rel, {'size': 0, 'status': status[rid]})
        f['size'] = max(f['size'], size)
        f['status'] = max(f['status'], status[rid])
    return files


async def run(root, shots, json_out):
    port, dbg = free_port(), free_port()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix='yk-check-')
    ch = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={prof}', '--lang=en-US',
                           '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
                           '--force-device-scale-factor=1', '--use-angle=d3d11', '--enable-gpu', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rep = {'root': os.path.relpath(root, GAME) if root != GAME else '.', 'when': time.strftime('%Y-%m-%d %H:%M')}
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
            pump = asyncio.ensure_future(c.pump())
            for dom in ('Page', 'Network', 'Runtime', 'Log'):
                await c.call(dom + '.enable')
            await c.call('Network.setCacheDisabled', cacheDisabled=False)
            await c.call('Emulation.setDeviceMetricsOverride', width=W, height=H, deviceScaleFactor=1, mobile=False)
            # "first load" ends when the loading screen goes away (#loading gets .done). A MutationObserver callback runs
            # as a microtask right after that, before any later network response, so background fetches never count.
            await c.call('Page.addScriptToEvaluateOnNewDocument', source="""
                window.__readyAt = null;
                document.addEventListener('DOMContentLoaded', () => {
                  const el = document.getElementById('loading');
                  if (el) new MutationObserver(() => { if (!window.__readyAt && el.classList.contains('done')) window.__readyAt = performance.now(); })
                    .observe(el, { attributes: true });
                });""")
            base = f'http://127.0.0.1:{port}/'
            t0 = time.time()
            await c.call('Page.navigate', url=base)
            await c.until('window.__yk && __yk.ready()', tries=400)
            ready_ts = None
            first_list = await c.eval("""(() => { const t = window.__readyAt; const seen = {};
                for (const e of performance.getEntriesByType('resource')) if (e.responseEnd <= t) seen[decodeURIComponent(new URL(e.name).pathname).slice(1)] = e.encodedBodySize;
                seen['index.html'] = performance.getEntriesByType('navigation')[0].encodedBodySize; return seen; })()""")
            rep['load_seconds'] = round(time.time() - t0, 2)
            rep['lang'] = await c.eval('document.documentElement.lang')
            rep['title'] = await c.eval('document.title')
            if shots:
                os.makedirs(shots, exist_ok=True)
                await c.eval('__yk.pause(true); __yk.step(1.0); true')
                await asyncio.sleep(0.4)
                await c.shot(os.path.join(shots, 'first-room-en.png'))
            await c.until('__yk.golemModel()', tries=150)
            rep['rooms_in_order'] = await c.eval('__yk.rooms()')
            rows = await c.eval("""(async () => {
                const C = (await import('/src/dev/clear-all.js?' + Date.now())).default; await C.ready();
                window.__i18nMiss.clear(); return C.all(); })()""")
            rep['rooms'] = rows
            rep['i18n_missing_at_runtime'] = await c.eval('[...window.__i18nMiss]')
            rep['ended'] = await c.eval('__yk.state().ended')
            if shots:
                await c.eval('__yk.render(); true')
                await asyncio.sleep(0.4)
                await c.shot(os.path.join(shots, 'after-run-en.png'))
            await asyncio.sleep(0.5)
            pump.cancel()
            files = net_summary(c.events, base)
            errs, expected = [], []
            for e in c.events:
                p = e['params']
                if e['method'] == 'Runtime.exceptionThrown':
                    errs.append('exception: ' + p['exceptionDetails'].get('text', '') + ' ' + json.dumps(p['exceptionDetails'].get('exception', {}).get('description', ''))[:300])
                elif e['method'] == 'Runtime.consoleAPICalled' and p['type'] in ('error', 'warning', 'assert'):
                    errs.append(p['type'] + ': ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in p['args'])[:300])
                elif e['method'] == 'Log.entryAdded' and p['entry']['level'] in ('error', 'warning'):
                    text, url = p['entry'].get('text', ''), p['entry'].get('url', '')
                    # headless only: synthetic key events are not a user gesture, so Chrome keeps the AudioContext
                    # suspended and warns on every sound; and a bare static server has no favicon (itch runs the game in an iframe)
                    if 'AudioContext was not allowed to start' in text or url.endswith('/favicon.ico'):
                        expected.append(text[:80])
                    else:
                        errs.append('log: ' + text[:300] + ' ' + url)
            rep['console'] = errs
            rep['console_expected_headless'] = len(expected)
            game_files = {k: v for k, v in files.items() if not k.startswith('src/dev/') and k != 'favicon.ico'}
            rep['http_errors'] = sorted(k for k, v in game_files.items() if v['status'] >= 400)
            rep['case_mismatch'] = sorted(k for k, v in game_files.items() if v['status'] < 400 and not case_ok(root, k))
            first = sum(first_list.values())
            total = sum(v['size'] for v in game_files.values())
            rep['first_load_files'] = len(first_list)
            rep['after_first_load'] = sorted(k for k in game_files if k not in first_list)
            rep['first_load_mb'] = round(first / 1048576, 2)
            rep['fetched_total_mb'] = round(total / 1048576, 2)
            rep['fetched_files'] = len(game_files)
            disk = []
            for r, _d, names in os.walk(os.path.join(root, 'assets')):
                for n in names:
                    disk.append(os.path.relpath(os.path.join(r, n), root).replace('\\', '/'))
            rep['unused_assets'] = sorted((d, os.path.getsize(os.path.join(root, d))) for d in disk if d not in files)
    finally:
        ch.kill(); ch.wait(); httpd.shutdown()
        shutil.rmtree(prof, ignore_errors=True)
    if json_out:
        with open(json_out, 'w', encoding='utf-8') as f:
            json.dump(rep, f, ensure_ascii=False, indent=1)
    return rep


def show(rep):
    ok = lambda b: 'OK ' if b else 'NO '
    print(f"Yesterkeep release check · {rep['when']} · root {rep['root']}")
    print(f"  {ok(not rep['console'])} console errors/warnings: {len(rep['console'])} "
          f"(+{rep['console_expected_headless']} expected in headless: audio autoplay, favicon)")
    for e in rep['console'][:10]:
        print('       ', e)
    print(f"  {ok(not rep['http_errors'])} missing files (HTTP >= 400): {rep['http_errors'] or 0}")
    print(f"  {ok(not rep['case_mismatch'])} path case mismatches (itch CDN is case-sensitive): {rep['case_mismatch'] or 0}")
    print(f"  {ok(rep['lang'] == 'en')} default language for an en-US browser: {rep['lang']} (title '{rep['title']}')")
    print(f"  {ok(not rep['i18n_missing_at_runtime'])} translations missing while playing: {len(rep['i18n_missing_at_runtime'])}")
    for k in rep['i18n_missing_at_runtime'][:10]:
        print('        -', k)
    rows = rep['rooms']
    cleared = [r for r in rows if r.get('cleared')]
    print(f"  {ok(len(cleared) == len(rows))} rooms cleared: {len(cleared)} / {len(rows)}")
    for r in rows:
        mark = 'OK  ' if r.get('cleared') else ('SKIP' if r.get('cleared') is None else 'FAIL')
        print(f"        {mark} {r['room']:<11} yesterday {r.get('past', '-')!s:>6}s  alarms {r.get('alarms', '-')}  hurts {r.get('hurts', '-')}  {r.get('note', '')}")
    print(f"  {ok(rep['first_load_mb'] <= FIRST_MB)} first load {rep['first_load_mb']} MB in {rep['first_load_files']} files (target <= {FIRST_MB}) · loaded in {rep['load_seconds']} s from localhost")
    print(f"        fetched later in the background: {', '.join(rep['after_first_load']) or '-'}")
    print(f"  {ok(rep['fetched_total_mb'] <= TOTAL_MB)} everything fetched {rep['fetched_total_mb']} MB in {rep['fetched_files']} files (target <= {TOTAL_MB})")
    un = rep['unused_assets']
    print(f"  {'-- '} unused files under assets/: {len(un)} ({sum(s for _, s in un) / 1048576:.2f} MB)")
    for d, s in un[:20]:
        print(f'        {s / 1048576:6.2f} MB  {d}')


def main():
    args = sys.argv[1:]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    shots, json_out = opt('--shots'), opt('--json')
    pos = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or not args[i - 1].startswith('--'))]
    root = os.path.abspath(pos[0]) if pos else GAME
    if not os.path.isfile(os.path.join(root, 'index.html')):
        sys.exit('no index.html in ' + root)
    show(asyncio.run(run(root, shots, json_out)))


main()
