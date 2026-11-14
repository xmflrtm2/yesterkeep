"""T3 트랙 글자 점검: src/ext/t3-puzzles.js 와 src/ext/t3/*.js 의 $t('…') / N('…') 키가 src/ext/t3/en.js 에 다 있는지.
(공용 lang/check.py는 src/*.js만 훑어서 확장 슬롯 글자를 못 본다)

    py -I tools\\t3_lang.py          -> 빠진 키 / 안 쓰는 키
    py -I tools\\t3_lang.py --keys   -> 모든 키 (en.js 채울 때)
"""
import json, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
HANG = re.compile('[가-힣]')
PAT = re.compile(r"(?:\$t|\bN)\('((?:[^'\\\n]|\\.)*)'")


def unescape(raw):
    return re.sub(r"\\(.)", lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), raw)


files = [ROOT / 'src/ext/t3-puzzles.js'] + sorted((ROOT / 'src/ext/t3').glob('*.js'))
keys = set()
for f in files:
    if f.name == 'en.js':
        continue
    for m in PAT.finditer(f.read_text(encoding='utf-8')):
        k = unescape(m.group(1))
        if HANG.search(k):
            keys.add(k)
en = (ROOT / 'src/ext/t3/en.js').read_text(encoding='utf-8')
body = en[en.index('{', en.index('Object.assign')) + 0:]
body = body[body.index('{', body.index(',')):body.rindex('}') + 1] if False else body
m = re.search(r"Object\.assign\([^,]+,\s*(\{[\s\S]*\})\s*\)\s*;?\s*$", en)
have = set(json.loads(re.sub(r',\s*}$', '}', m.group(1)))) if m else set()
if '--keys' in sys.argv:
    for k in sorted(keys):
        print(k)
    sys.exit(0)
miss, unused = sorted(keys - have), sorted(have - keys)
print(f'{len(keys)} keys in T3 files, en.js has {len(have)}: {len(miss)} missing, {len(unused)} unused')
for k in miss:
    print('   -', k)
for k in unused:
    print('   ?', k)
sys.exit(1 if miss else 0)
