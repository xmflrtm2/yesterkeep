"""Builds the itch.io web upload for Yesterkeep: a plain folder copy zipped with index.html at the root.

    py -I tools\\build_itch.py        -> build/itch/web/ + build/itch/yesterkeep-web.zip

No bundling and no base64: the game is ES modules + GLB files, so the folder ships as it is.
What goes in: index.html, src/**/*.js (not src/dev/), lang/*.js, vendor/, assets/fab/ (minus dev-only files below).
assets/fab/ is the paid Fab art: it ships inside the game build (allowed) but never in the git repo (.gitignore).
Run tools/release_check.py on build/itch/web afterwards to play every room from the built files.

11/15 (T4 round 2): src/ext/** (the four roguelike tracks) was missing — the old pattern copied src/*.js only, so the
build could not start. JS is now shrunk on the way in by tools/t4_minify.py (comments, indentation and needless spaces go;
strings, template literals, regex literals and line breaks stay). --no-min copies JS untouched.
"""
import fnmatch, os, shutil, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from t4_minify import minify_js, SKIP as MIN_SKIP  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(GAME, 'build', 'itch')
WEB = os.path.join(OUT, 'web')
ZIP = os.path.join(OUT, 'yesterkeep-web.zip')

# (folder, file patterns) copied into the build; folders are walked recursively
INCLUDE = [
    ('.', ['index.html']),
    ('src', ['*.js']),           # src/ and src/ext/** — src/dev/ is test tooling (SKIP_DIRS)
    ('lang', ['*.js']),
    ('vendor', ['*']),
    ('assets', ['*']),
]
RECURSIVE = {'vendor', 'assets', 'src'}
SKIP_DIRS = {os.path.join('src', 'dev')}  # relative to the game folder
# dev-only files that sit next to shipped ones
EXCLUDE = ['*.all.glb', '*.tmp', '*.bak', 'Thumbs.db', 'desktop.ini', '.DS_Store']
# itch.io HTML5 limits (zip): 1,000 files, 500 MB extracted; keep well under
ITCH_MAX_FILES, ITCH_MAX_MB = 1000, 500


def files():
    for folder, pats in INCLUDE:
        base = os.path.join(GAME, folder)
        if not os.path.isdir(base):
            sys.exit(f'missing folder: {folder}')
        walk = os.walk(base) if folder in RECURSIVE else [(base, [], os.listdir(base))]
        for root, dirs, names in walk:
            dirs[:] = [d for d in dirs if os.path.relpath(os.path.join(root, d), GAME) not in SKIP_DIRS]
            for n in sorted(names):
                p = os.path.join(root, n)
                if not os.path.isfile(p) or not any(fnmatch.fnmatch(n, pat) for pat in pats):
                    continue
                if any(fnmatch.fnmatch(n, pat) for pat in EXCLUDE):
                    continue
                yield os.path.relpath(p, GAME).replace('\\', '/')


def main():
    if not os.path.isdir(os.path.join(GAME, 'assets', 'fab')):
        sys.exit('assets/fab/ is missing (Fab packs are not in the repo, see README)')
    if os.path.isdir(WEB):
        shutil.rmtree(WEB)
    os.makedirs(WEB)
    rel = list(files())
    total = js_in = js_out = 0
    minify = '--no-min' not in sys.argv
    for r in rel:
        dst = os.path.join(WEB, r)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        src_path = os.path.join(GAME, r)
        if minify and r.endswith('.js') and r.split('/')[0] in ('src', 'vendor') and os.path.basename(r) not in MIN_SKIP:
            raw = open(src_path, encoding='utf-8').read()
            try:
                small = minify_js(raw)
            except ValueError as e:
                sys.exit(f'minify failed in {r}: {e}')
            with open(dst, 'w', encoding='utf-8', newline='\n') as f:
                f.write(small)
            js_in += len(raw.encode('utf-8')); js_out += len(small.encode('utf-8'))
        else:
            shutil.copy2(src_path, dst)
        total += os.path.getsize(dst)
    if js_in:
        print(f'JS shrunk {js_in / 1048576:.2f} -> {js_out / 1048576:.2f} MB ({100 - 100 * js_out / js_in:.0f}% smaller)')
    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for r in rel:
            z.write(os.path.join(WEB, r), r)
    zmb, tmb = os.path.getsize(ZIP) / 1048576, total / 1048576
    by = {}
    for r in rel:
        k = '/'.join(r.split('/')[:3]) if r.startswith('assets/') else r.split('/')[0]
        by[k] = by.get(k, 0) + os.path.getsize(os.path.join(WEB, r))
    print(f'{len(rel)} files, {tmb:.2f} MB extracted, zip {zmb:.2f} MB -> {os.path.relpath(ZIP, GAME)}')
    for k, v in sorted(by.items(), key=lambda kv: -kv[1]):
        print(f'  {v / 1048576:6.2f} MB  {k}')
    if len(rel) > ITCH_MAX_FILES or tmb > ITCH_MAX_MB:
        print(f'WARNING: over itch.io HTML5 limits ({ITCH_MAX_FILES} files / {ITCH_MAX_MB} MB)')
    if not any(r == 'index.html' for r in rel):
        sys.exit('index.html is not at the zip root')


main()
