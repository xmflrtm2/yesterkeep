// 개발용 — 게임은 이 파일을 불러오지 않는다 (tools/t3_check.py · 직접 플레이 서버의 /eval에서만 import)
//   const D = (await import('/src/ext/t3/dev.js')).default; await D.ready(); D.check('t3-garden')
// 조각마다: ① 풀이기(최소 행동 수, 장치 없이도 깨지는지) ② 봇 풀이(solve 단계를 진짜 KeyboardEvent로, 시간은 __yk.step)
//          ③ 게으른 봇 셋(가만히 / Shift 연타+아무 데나 걷기 / 아무 데나 걷기+Shift·E 막 누르기) — 깨지면 너무 쉬운 것
import P from '../../dev/play.js';
import { EXT } from '../../ext.js';
import { CHUNKS } from './chunks.js';

const Y = () => window.__yk, T3 = () => window.__t3;
const ev = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code === 'ShiftLeft' ? 'Shift' : code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
const errs = [];
if (!window.__t3errHook) {
  window.__t3errHook = true;
  const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 300)); oe(...a); };
  addEventListener('error', e => errs.push('ERR ' + e.message));
}
let lastExit = null;
EXT.on('exit', r => { lastExit = r.id; });
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const st = () => Y().state();

const D = {
  errs,
  async ready() { await P.ready(); Y().pause(true); return true; },
  load(id) { lastExit = null; P.room(id); Y().S.hearts = 5; Y().S.falls = 0; Y().S.hurts = 0; Y().step(0.3); return st(); },
  /** 사람처럼 장치 앞까지 다가간다 (E는 2.15m 안에서만 닿음) */
  approach() {
    const s = st(), ts = T3().targets();
    let best = null, bd = 1e9;
    for (const t of ts) { const d = Math.hypot(t.x - s.x, t.z - s.z); if (d < bd) { bd = d; best = t; } }
    if (!best || bd < 2.0 || bd > 3.2) return;
    const k = 1.75 / bd;
    P.moveTo(best.x + (s.x - best.x) * k, best.z + (s.z - best.z) * k, { tol: 0.12, max: 1.5, exact: true });
    Y().step(0.15); // 멈춰 서기 (미끄러짐)
  },
  /** 풀이기: 처음 상태에서 최소 몇 번 장치를 써야 출구에 닿는지 */
  validate(id) {
    this.load(id);
    const c = CHUNKS.find(c => c.id === id);
    const sv = T3().solver(), r = sv ? sv.solve({ opt: false }) : null;
    return { id, tier: c && c.tier, mode: c && c.solver, ...(r || { ok: null }) };
  },
  /** 봇 풀이 */
  bot(id, steps) {
    const c = CHUNKS.find(c => c.id === id);
    steps = steps || (c && c.solve) || [];
    this.load(id);
    const h0 = st().hearts, log = [];
    let t = 0, fail = null;
    const tick = sec => { Y().step(sec); t += sec; };
    for (const s of steps) {
      if (lastExit) break;
      const [op, a, b, cc, dd] = s;
      const t0 = t, before = st();
      if (op === 'go') {
        const ok = P.goCell(a, b, { until: () => !!lastExit }); // 출구로 나가면 바로 손을 뗀다 (다음 방으로 걸어 들어가지 않게)
        if (!ok && !lastExit) fail = `no path to ${a},${b} in ${before.era}`;
      } else if (op === 'shift') {
        for (let k = 0; k < 40 && st().shiftCd > 0; k++) tick(1 / 30);
        tick(1 / 30);
        if (P.shift() !== 'ok') fail = `shift blocked at ${before.cell} (${before.era})`;
      } else if (op === 'E') { this.approach(); P.tap('KeyE'); tick(0.1); }
      else if (op === 'holdE') { this.approach(); ev('keydown', 'KeyE'); tick(1 / 60); ev('keydown', 'KeyE'); tick(a); ev('keyup', 'KeyE'); tick(1 / 60); }
      else if (op === 'wait') tick(a);
      else if (op === 'push') {
        const di = cc, dj = dd, ok = P.goCell(a - di, b - dj);
        if (!ok) fail = `no path behind crate ${a},${b}`;
        else {
          const key = di > 0 ? 'KeyD' : di < 0 ? 'KeyA' : dj > 0 ? 'KeyS' : 'KeyW';
          ev('keydown', key);
          const moved = P.waitUntil(() => Y().state().crates.some(q => q[0] === a + di && q[1] === b + dj), 4, 1 / 30);
          ev('keyup', key); tick(0.25);
          if (moved == null) fail = `crate ${a},${b} did not move`;
        }
      } else if (op === 'waitTurn') {
        const tb = () => T3().C.d.turn.tables[a].st.ori;
        P.waitUntil(() => tb() !== b, 8, 1 / 60); P.waitUntil(() => tb() === b, 8, 1 / 60);
      }
      const s2 = st();
      log.push([op + (a != null ? ' ' + [a, b, cc, dd].filter(v => v != null).join(',') : ''), s2.era, s2.cell.join(','), s2.hearts, s2.falls > before.falls ? 'FALL' : s2.hurts > before.hurts ? 'HURT' : '']);
      if (fail) break;
      void t0;
    }
    // 출구까지 마저 (마지막 go가 출구 칸이면 이미 나감)
    P.waitUntil(() => !!lastExit, 2, 1 / 30);
    const s = st();
    return { id, ok: !!lastExit, fail, hearts: (lastExit ? h0 : s.hearts) - h0, falls: s.falls, hurts: s.hurts, log };
  },
  /** 시간 재기용: 봇 풀이 동안 흐른 게임 시간 */
  timedBot(id) { const t0 = Y().S.time; const r = this.bot(id); r.sec = +(Y().S.time - t0).toFixed(1); return r; },
  /** 게으른 봇 */
  lazy(id, kind, sec = 40, seed = 7) {
    this.load(id);
    const R = rng(seed), dirs = [[], ['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA']];
    let held = [], t = 0, nextDir = 0, nextAct = 0, shifts = 0, es = 0;
    const setKeys = ks => { for (const k of held) if (!ks.includes(k)) ev('keyup', k); for (const k of ks) if (!held.includes(k)) ev('keydown', k); held = ks; };
    while (t < sec && !lastExit) {
      if (kind !== 'still' && t >= nextDir) { setKeys(dirs[1 + Math.floor(R() * 8)]); nextDir = t + 0.4 + R() * 0.8; }
      if (t >= nextAct) {
        if (kind === 'spam') { P.tap('ShiftLeft'); shifts++; nextAct = t + 0.5; }
        else if (kind === 'random') { const r = R(); if (r < 0.25) { P.tap('ShiftLeft'); shifts++; } else if (r < 0.5) { P.tap('KeyE'); es++; } nextAct = t + 0.4; }
        else nextAct = t + 1;
      }
      Y().step(1 / 20); t += 1 / 20;
    }
    setKeys([]);
    const s = st();
    return { id, kind, exited: !!lastExit, sec: +t.toFixed(1), shifts, es, hearts: s.hearts, falls: s.falls };
  },
  /** 한 조각 전부 */
  check(id) {
    const v = this.validate(id), b = this.timedBot(id);
    const lz = ['still', 'spam', 'random'].map(k => this.lazy(id, k));
    return { id, solver: v, bot: b, lazy: lz, errs: errs.splice(0) };
  },
  all() { return CHUNKS.map(c => this.check(c.id)); },
  ids: () => CHUNKS.map(c => c.id),
};
window.__t3dev = D;
export default D;
