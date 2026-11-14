"""JS 줄이기 (새 프로그램 없이) — tools/build_itch.py가 빌드에 넣는 JS를 이걸로 줄인다 (11/15 T4 2차).

주석·들여쓰기·쓸데없는 빈칸만 지운다. 문자열('…' "…")·템플릿(`…${…}…`)·정규식(/…/)은 그대로 옮기고,
줄바꿈은 남긴다(자동 세미콜론이 바뀌지 않게). 이름 바꾸기·줄 합치기 같은 위험한 일은 안 한다.

    py -I tools\\t4_minify.py <파일.js>        -> 줄인 결과를 화면에 (확인용)
    py -I tools\\t4_minify.py --check          -> src/**, vendor/ JS를 모두 줄여 보고 크기 + 다시 줄여도 같은지(멱등) 확인
"""
import os, sys

IDENT = lambda c: bool(c) and (c.isalnum() or c in '_$\\' or ord(c) > 127)
REGEX_AFTER_WORD = {'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'}
SKIP = {'three.module.min.js'}  # 이미 줄인 것


def minify_js(src):
    out, n = [], len(src)
    st = {'sig': '', 'word': ''}  # 마지막으로 내보낸 의미 있는 글자 / 마지막 낱말

    def last():
        return out[-1][-1] if out and out[-1] else ''

    def emit(t):
        out.append(t)
        if t.strip():
            st['sig'] = t.strip()[-1]

    def regex_end(j):  # src[j] == '/'인 정규식의 끝(다음 칸). 같은 줄에 없으면 -1 (= 나눗셈)
        k, cls = j + 1, False
        while k < n:
            c = src[k]
            if c == '\n':
                return -1
            if c == '\\':
                k += 2
                continue
            if c == '[':
                cls = True
            elif c == ']':
                cls = False
            elif c == '/' and not cls:
                k += 1
                while k < n and src[k].isalpha():
                    k += 1
                return k
            k += 1
        return -1

    def string_end(j, q):
        k = j + 1
        while k < n:
            c = src[k]
            if c == '\\':
                k += 2
                continue
            if c == q:
                return k + 1
            if c == '\n':
                break
            k += 1
        raise ValueError(f'unterminated string at char {j}')

    def template(j):
        k, buf = j + 1, ['`']
        while k < n:
            c = src[k]
            if c == '\\':
                buf.append(src[k:k + 2])
                k += 2
                continue
            if c == '`':
                buf.append('`')
                emit(''.join(buf))
                st['word'] = ''
                return k + 1
            if c == '$' and k + 1 < n and src[k + 1] == '{':
                buf.append('${')
                emit(''.join(buf))
                buf = []
                k = code(k + 2, True)
                if k >= n or src[k] != '}':
                    raise ValueError(f'unterminated ${{ in template at char {j}')
                buf.append('}')
                k += 1
                continue
            buf.append(c)
            k += 1
        raise ValueError(f'unterminated template at char {j}')

    def code(j, in_expr):
        depth = 0
        while j < n:
            c = src[j]
            if c == '/' and j + 1 < n and src[j + 1] == '/':
                k = src.find('\n', j)
                j = n if k < 0 else k
                continue
            if c == '/' and j + 1 < n and src[j + 1] == '*':
                k = src.find('*/', j + 2)
                if k < 0:
                    raise ValueError(f'unterminated comment at char {j}')
                body = src[j:k + 2]
                if body.startswith('/*!') or '@license' in body:
                    emit(body)
                elif IDENT(last()) and k + 2 < n and IDENT(src[k + 2]):
                    out.append(' ')
                j = k + 2
                continue
            if c in ' \t\r':
                k = j
                while k < n and src[k] in ' \t\r':
                    k += 1
                p, q = last(), (src[k] if k < n else '')
                if p and p != '\n' and q and q != '\n' and not (q == '/' and k + 1 < n and src[k + 1] in '/*'):
                    if (IDENT(p) and IDENT(q)) or (p in '+-' and q in '+-') or p == '/' or q == '/' or (p.isdigit() and q == '.'):
                        out.append(' ')
                j = k
                continue
            if c == '\n':
                if last() not in ('', '\n'):
                    out.append('\n')
                j += 1
                continue
            if c in '\'"':
                k = string_end(j, c)
                emit(src[j:k])
                st['word'] = ''
                j = k
                continue
            if c == '`':
                j = template(j)
                continue
            if c == '/':
                prev = st['sig']
                if prev == '' or prev in '(,=:[!&|?{};+-*%<>~^}' or (IDENT(prev) and st['word'] in REGEX_AFTER_WORD):
                    k = regex_end(j)
                    if k > 0:
                        emit(src[j:k])
                        st['word'] = ''
                        j = k
                        continue
                emit('/')
                st['word'] = ''
                j += 1
                continue
            if IDENT(c):
                k = j
                while k < n and IDENT(src[k]):
                    k += 1
                emit(src[j:k])
                st['word'] = src[j:k]
                j = k
                continue
            if in_expr:
                if c == '{':
                    depth += 1
                elif c == '}':
                    if depth == 0:
                        return j
                    depth -= 1
            emit(c)
            st['word'] = ''
            j += 1
        return j

    code(0, False)
    return ''.join(out).strip() + '\n'


def targets(game):
    for folder in ('src', 'vendor'):
        for root, dirs, names in os.walk(os.path.join(game, folder)):
            dirs[:] = [d for d in dirs if d != 'dev']
            for nm in sorted(names):
                if nm.endswith('.js') and nm not in SKIP:
                    yield os.path.join(root, nm)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    game = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if '--check' in sys.argv:
        a = b = 0
        for p in targets(game):
            raw = open(p, encoding='utf-8').read()
            m = minify_js(raw)
            if minify_js(m) != m:
                print('NOT IDEMPOTENT', os.path.relpath(p, game))
            a += len(raw.encode()); b += len(m.encode())
        print(f'{a / 1048576:.3f} -> {b / 1048576:.3f} MB ({100 - 100 * b / a:.0f}% smaller)')
    else:
        print(minify_js(open(sys.argv[1], encoding='utf-8').read()))
