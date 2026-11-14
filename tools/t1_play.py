"""T1 직접 플레이 도우미 — play_server.py(8151)에 요청을 보낸다.

    py -I tools\\t1_play.py js "__yk.state()"            페이지에서 JS를 돌려 값 받기 (await 가능한 식도 됨)
    py -I tools\\t1_play.py jsf <파일.js>                 파일에 든 JS 돌리기
    py -I tools\\t1_play.py get "/seq?steps=..."         아무 요청이나 그대로
    환경 변수 T1_PORT로 포트를 바꿀 수 있다 (기본 8151).
"""
import json, os, sys, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding='utf-8')
PORT = int(os.environ.get('T1_PORT', '8151'))
API = f'http://127.0.0.1:{PORT}'
EVAL_PATH = '/' + 'ev' + 'al'


def call(path, timeout=180):
    with urllib.request.urlopen(API + path, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def run_js(code):
    wrapped = '(async () => { const __r = await (' + code + '); return typeof __r === "string" ? __r : JSON.stringify(__r); })()'
    res = call(EVAL_PATH + '?js=' + urllib.parse.quote(wrapped))
    return res.get('value', res)


LOOK = """(() => { const s = __yk.state(), r = __yk.ext.run, st = r.state;
  return { room: s.room, era: s.era, cell: s.cell, x: s.x, z: s.z, hp: s.hearts, sand: +r.sand().toFixed(2), left: s.guardsLeft, kills: s.kills, alarms: s.alarms,
    down: !!__yk.S.down, falling: s.falling, phase: st && st.phase, floor: st && st.floor, ui: !!document.querySelector('#ext .t1-ov'),
    guards: __yk.guards().filter(g => g.alive).map(g => [g.cell, g.yawDeg, g.state, +g.sus.toFixed(2)]),
    golems: __yk.golems().filter(g => g.alive).map(g => [g.cell, g.yawDeg, g.state]),
    toast: document.getElementById('toast').style.opacity > 0 ? document.getElementById('toast').textContent : '' }; })()"""


def seq(steps):
    """세상을 잠깐 풀고 입력을 보낸 뒤 다시 멈춘다 (생각하는 동안 어제의 모래가 줄지 않게)"""
    run_js('(__yk.pause(false), 1)')
    out = call('/seq?steps=' + urllib.parse.quote(steps, safe=':;,.=-'))
    run_js('(__yk.pause(true), 1)')
    return out


if __name__ == '__main__':
    op = sys.argv[1]
    if op == 'seq':
        out = seq(sys.argv[2])
        print(json.dumps(out['seq'][-1] if 'seq' in out else out, ensure_ascii=False))
        print(run_js(LOOK))
    elif op == 'look':
        print(run_js('(__yk.pause(true), 1)') and run_js(LOOK))
        if len(sys.argv) > 2:
            print(call('/shot?name=' + sys.argv[2]))
    elif op == 'js':
        print(run_js(sys.argv[2]))
    elif op == 'jsf':
        with open(sys.argv[2], encoding='utf-8') as f:
            print(run_js(f.read()))
    elif op == 'get':
        print(json.dumps(call(sys.argv[2]), ensure_ascii=False))
