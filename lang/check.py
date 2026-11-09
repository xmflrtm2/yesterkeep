"""Lists game text that has no translation yet.

Every player-facing string is Korean source text: passed to $t('...') or marked N('...') (data tables)
in index.html or src/*.js, or written in the HTML (<span data-t> blocks and the <title>).
A string missing from lang/<code>.js simply shows in Korean.

    py -I lang\\check.py            -> counts per language + the missing keys
    py -I lang\\check.py --json     -> {code: [missing keys]} for a translation pass
"""
import json, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
HANG = re.compile('[가-힣]')
norm = lambda s: re.sub(r'\s+', ' ', s).strip()


def unescape(raw):
    return re.sub(r"\\(.)", lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), raw)


def code_keys(src):
    return {unescape(m.group(1)) for m in re.finditer(r"(?:\$t|\bN)\('((?:[^'\\\n]|\\.)*)'", src)}


def html_keys(html):
    keys = code_keys(html)
    for m in re.finditer(r'<span data-t>([\s\S]*?)</span>', html):
        keys.add(norm(m.group(1)))
    keys.add(norm(re.search(r'<title>(.*?)</title>', html).group(1)))
    return keys


def lang_keys(path):
    src = path.read_text(encoding='utf-8')
    body = src[src.index('= {') + 2:src.rindex('}') + 1]
    body = re.sub(r',\s*}$', '}', body)
    return set(json.loads(body.replace('<\\/', '</')))


keys = html_keys((ROOT / 'index.html').read_text(encoding='utf-8'))
for f in sorted((ROOT / 'src').glob('*.js')):
    keys |= code_keys(f.read_text(encoding='utf-8'))
keys = {k for k in keys if HANG.search(k)}
missing = {}
for f in sorted((ROOT / 'lang').glob('*.js')):
    have = lang_keys(f)
    missing[f.stem] = {'missing': sorted(keys - have), 'unused': sorted(have - keys)}
if '--json' in sys.argv:
    print(json.dumps({k: v['missing'] for k, v in missing.items()}, ensure_ascii=False, indent=1))
else:
    print(f'{len(keys)} strings in index.html + src/*.js')
    for code, v in missing.items():
        print(f"{code}: {len(v['missing'])} missing, {len(v['unused'])} unused")
        for k in v['missing'][:30]:
            print('   -', k)
        for k in v['unused'][:30]:
            print('   ?', k)
