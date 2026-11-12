"""Builds the itch.io web upload for Yesterkeep: a plain folder copy zipped with index.html at the root.

    py -I tools\\build_itch.py        -> build/itch/web/ + build/itch/yesterkeep-web.zip

No bundling and no base64: the game is ES modules + GLB files, so the folder ships as it is.
What goes in: index.html, src/*.js (not src/dev/), lang/*.js, vendor/, assets/fab/ (minus dev-only files below).
assets/fab/ is the paid Fab art: it ships inside the game build (allowed) but never in the git repo (.gitignore).
Run tools/release_check.py on build/itch/web afterwards to play every room from the built files.
"""
import fnmatch, os, shutil, sys, zipfile

sys.stdout.reconfigure(encoding='utf-8')
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(GAME, 'build', 'itch')
WEB = os.path.join(OUT, 'web')
ZIP = os.path.join(OUT, 'yesterkeep-web.zip')

# (folder, file patterns) copied into the build; folders are walked recursively
INCLUDE = [
    ('.', ['index.html']),
    ('src', ['*.js']),           # top level only: src/dev/ is test tooling
    ('lang', ['*.js']),
    ('vendor', ['*']),
    ('assets', ['*']),
]
RECURSIVE = {'vendor', 'assets'}
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
        for root, _dirs, names in walk:
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
    total = 0
    for r in rel:
        dst = os.path.join(WEB, r)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(GAME, r), dst)
        total += os.path.getsize(dst)
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
