"""T4 screen text check: every $t('…') / N('…') key in src/ext/t4-items.js and src/ext/t4/*.js
must have an English entry in src/ext/t4/en.js (lang/check.py only looks at src/*.js).

    py -I tools\\t4_lang.py          -> counts + missing / unused keys
    py -I tools\\t4_lang.py --keys   -> just print every key (one per line)
"""
import json, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
HANG = re.compile('[가-힣]')
files = [ROOT / 'src/ext/t4-items.js', *sorted((ROOT / 'src/ext/t4').glob('*.js'))]
keys = set()
for f in files:
    if f.name == 'en.js':
        continue
    src = f.read_text(encoding='utf-8')
    keys |= {re.sub(r"\\(.)", r'\1', m.group(1)) for m in re.finditer(r"(?:\$t|\bN)\('((?:[^'\\\n]|\\.)*)'", src)}
keys = {k for k in keys if HANG.search(k)}
if '--keys' in sys.argv:
    print('\n'.join(sorted(keys)))
    sys.exit(0)
en = (ROOT / 'src/ext/t4/en.js').read_text(encoding='utf-8')
have = set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", en, re.M))
have = {re.sub(r"\\(.)", r'\1', k) for k in have}
# 게임 본체 글자(피해 메시지 등)는 공용 lang/en.js에 이미 있다
core = (ROOT / 'lang/en.js').read_text(encoding='utf-8')
keys -= {re.sub(r"\\(.)", r'\1', k) for k in re.findall(r'"((?:[^"\\]|\\.)*)"\s*:', core)} - have
miss, unused = sorted(keys - have), sorted(have - keys)
print(f'{len(keys)} T4 strings, en.js has {len(have)}: {len(miss)} missing, {len(unused)} unused')
for k in miss:
    print('   -', k)
for k in unused:
    print('   ?', k)
sys.exit(1 if miss else 0)
