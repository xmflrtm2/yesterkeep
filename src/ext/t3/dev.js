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
let lastExit = null, lastPast = null;
let runIn = null, runMax = 0, lastRun = null; // 어제에 '연달아' 머문 가장 긴 시간 (모래가 바닥이면 오늘에서 3초까지만 차오른다)
EXT.on('roomLoad', () => { runIn = null; runMax = 0; });
EXT.on('update', () => { const S = EXT.K.S; if (S.era === 'past') { if (runIn === null) runIn = S.pastTime; runMax = Math.max(runMax, S.pastTime - runIn); } else runIn = null; });
EXT.on('exit', r => { lastExit = r.id; lastPast = +EXT.K.S.pastTime.toFixed(1); lastRun = +runMax.toFixed(1); });
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const st = () => Y().state();
const KK = () => Y().ext.K;
const OTHER = { past: 'now', now: 'past' };
/** 적 찾기: 'guard' / 'golem' = 기본 경비·골렘, 그 밖 = EXT 적 kind (예 't2-hound') */
function foe(kind, n = 0) { const k = KK(); return (kind === 'guard' ? k.guards : kind === 'golem' ? k.golems : k.extFoes.filter(f => f.kind === kind))[n]; }
/** 적 조건: 'alert' 'sleep' 'dead' 'alive' 'out'(메아리) 'x<12' 'z>4' 'cell=3,4' 'band=10,16'(x가 그 사이) 'near<3'(나와의 거리) */
function foeIs(f, cond) {
  if (!f) return cond === 'dead';
  const s = st();
  if (cond === 'alert') return f.state === 'alert';
  if (cond === 'sleep') return f.state === 'sleep';
  if (cond === 'dead') return !f.alive;
  if (cond === 'alive') return f.alive;
  if (cond === 'out') return !!f.out;
  let m;
  if ((m = cond.match(/^([xz])([<>])(-?[\d.]+)$/))) { const v = f[m[1]]; return m[2] === '<' ? v < +m[3] : v > +m[3]; }
  if ((m = cond.match(/^cell=(\d+),(\d+)$/))) return Math.floor(f.x / 2) === +m[1] && Math.floor(f.z / 2) === +m[2];
  if ((m = cond.match(/^band=(-?[\d.]+),(-?[\d.]+)$/))) return f.x > +m[1] && f.x < +m[2];
  if ((m = cond.match(/^zband=(-?[\d.]+),(-?[\d.]+)$/))) return f.z > +m[1] && f.z < +m[2];
  if ((m = cond.match(/^near<([\d.]+)$/))) return Math.hypot(f.x - s.x, f.z - s.z) < +m[1];
  if ((m = cond.match(/^box=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/))) return f.x > +m[1] && f.x < +m[2] && f.z > +m[3] && f.z < +m[4];
  throw new Error('foe cond ' + cond);
}

const D = {
  errs,
  async ready() { await P.ready(); Y().pause(true); return true; },
  load(id) { lastExit = null; P.room(id); Y().S.hearts = 5; Y().S.falls = 0; Y().S.hurts = 0; Y().step(0.3); return st(); },
  /** 사람처럼 장치 앞까지 다가간다 (E는 2.15m 안에서만 닿음) */
  approach() {
    const s = st(), ts = T3().targets();
    let best = null, bd = 1e9;
    for (const t of ts) { const d = Math.hypot(t.x - s.x, t.z - s.z); if (d < bd) { bd = d; best = t; } }
    if (!best || bd < 2.3 || bd > 3.4) return;
    const k = 1.75 / bd;
    P.moveTo(best.x + (s.x - best.x) * k, best.z + (s.z - best.z) * k, { tol: 0.12, max: 1.5, exact: true });
    Y().step(0.15); // 멈춰 서기 (미끄러짐)
  },
  /** 풀이기: 처음 상태에서 최소 몇 번 장치를 써야 출구에 닿는지 */
  validate(id) {
    this.load(id);
    const c = CHUNKS.find(c => c.id === id);
    const sv = T3().solver(), r = sv ? sv.solve({ opt: false }) : null;
    return { id, tier: c && c.tier, mode: c && c.solver, timing: !!(c && c.timing), combat: !!(c && ((c.tags && c.tags.includes('combat')) || (c.foes && c.foes.length) || (c.guards && c.guards.length))), ...(r || { ok: null }) };
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
      } else if (op === 'to') { P.moveTo(a, b, { exact: true, tol: 0.2, max: 4, until: () => !!lastExit }); }
      else if (op === 'stab') { P.stab(); tick(0.45); }
      else if (op === 'waitFoe') { const f = foe(a, b); if (P.waitUntil(() => foeIs(foe(a, b), cc), dd || 10, 1 / 60) == null) fail = `waited for ${a}#${b} ${cc}`; void f; }
      else if (op === 'goUntil') { // ['goUntil', i, j, [kind, n, cond]] 걸어가다 적 조건이 되면 멈춤
        const [kind, n, cond] = cc; P.goCell(a, b, { until: () => !!lastExit || foeIs(foe(kind, n), cond) });
      } else if (op === 'behind' || op === 'near') { // ['behind', kind, n, d] 다른 시대에서 등 뒤 d m(또는 아무 쪽)로 가서 1초 넘게 머문 뒤 넘어와 찌르기
        const f = foe(a, b), d = cc || 2.0, k = KK();
        if (!f || !f.alive) fail = `no foe ${a}#${b}`;
        else {
          const e = OTHER[f.era];
          for (let q = 0; q < 3 && st().era !== e; q++) { for (let w = 0; w < 40 && st().shiftCd > 0; w++) tick(1 / 30); P.shift(); tick(0.1); }
          let tx, tz;
          if (op === 'behind') { const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw); tx = f.x - fx * d; tz = f.z - fz * d; }
          else {
            let bd = 1e9; const s0 = st();
            for (let q = 0; q < 24; q++) { const an = q / 24 * Math.PI * 2, x = f.x + Math.sin(an) * d, z = f.z + Math.cos(an) * d, i = Math.floor(x / 2), j = Math.floor(z / 2);
              if (!k.stand(e, i, j) || !k.stand(f.era, i, j)) continue; const c = Math.hypot(x - s0.x, z - s0.z) + (Math.cos(an - f.yaw) < -0.3 ? -3 : 0); if (c < bd) { bd = c; tx = x; tz = z; } }
          }
          if (tx == null) fail = `no place near ${a}#${b}`;
          else {
            P.goCell(Math.floor(tx / 2), Math.floor(tz / 2)); P.moveTo(tx, tz, { exact: true, tol: 0.2, max: 2 });
            // 다른 시대 쪽을 보고 서기 (넘어오자마자 찌르기 판정이 앞 60°)
            const yaw = Math.atan2(f.x - st().x, f.z - st().z); Y().S.face = yaw;
            tick(1.1); // 준비된 전환(T2: 다른 시대에 1초 넘게)
            for (let w = 0; w < 40 && st().shiftCd > 0; w++) tick(1 / 30);
            P.shift(); Y().S.face = Math.atan2(f.x - st().x, f.z - st().z); tick(dd != null ? dd : 0.1); P.stab(); tick(0.5);
            if (f.alive) fail = `${op} strike failed on ${a}#${b}`;
          }
        }
      } else if (op === 'waitJs') { // ['waitJs', '식', 최대초] — C = __t3.C
        const fn = new Function('C', 'K', 'S', 'return (' + a + ')');
        if (P.waitUntil(() => fn(T3().C, KK(), Y().S), b || 8, 1 / 60) == null) fail = 'waitJs ' + a;
      } else if (op === 'chest') { // ['chest', 미믹 번호, di, dj] 어제의 궤짝을 한 칸 밀기
        const f = foe('t2-mimic', a), ch = f && f.chest;
        if (!ch) fail = 'no chest';
        else {
          const i0 = ch.i, j0 = ch.j, ok = P.goCell(i0 - b, j0 - cc);
          if (!ok) fail = `no path behind chest ${i0},${j0}`;
          else {
            const key = b > 0 ? 'KeyD' : b < 0 ? 'KeyA' : cc > 0 ? 'KeyS' : 'KeyW';
            ev('keydown', key); const moved = P.waitUntil(() => ch.i !== i0 || ch.j !== j0 || ch.sunk, 3, 1 / 60); ev('keyup', key); tick(0.3);
            if (moved == null) fail = `chest ${i0},${j0} did not move`;
          }
        }
      } else if (op === 'wraithRing') { // ['wraithRing', n] 어제에서 망령의 멈춘 자리(고리 안)로 가서 1초 넘게 머문 뒤 오늘로
        const f = foe('t2-wraith', a);
        if (!f || !f.alive) fail = 'no wraith';
        else {
          if (st().era === f.era) { P.shift(); tick(0.1); }
          P.goCell(Math.floor(f.x / 2), Math.floor(f.z / 2)); P.moveTo(f.x, f.z, { exact: true, tol: 0.15, max: 2 });
          tick(1.15); for (let w = 0; w < 40 && st().shiftCd > 0; w++) tick(1 / 30); P.shift(); tick(0.6);
          if (f.alive) fail = 'wraith not dispelled';
        }
      } else if (op === 'waitWarn') { // ['waitWarn', 다리 번호, 'x'|'z'] 그 방향으로 놓였다가 주황으로 깜빡이기 시작할 때까지
        const tb = () => T3().C.d.turn.tables[a].st;
        P.waitUntil(() => tb().ori !== b, 8, 1 / 60); P.waitUntil(() => tb().ori === b && tb().warn, 8, 1 / 60);
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
    return { id, ok: !!lastExit, fail, hearts: -(s.falls + s.hurts), falls: s.falls, hurts: s.hurts, past: lastPast, run: lastRun, log }; void h0;
  },
  /** 시간 재기용: 봇 풀이 동안 흐른 게임 시간 */
  timedBot(id) { const t0 = Y().S.time; const r = this.bot(id); r.sec = +(Y().S.time - t0).toFixed(1); return r; },
  /** 게으른 봇 */
  lazy(id, kind, sec = 40, seed = 7) {
    this.load(id);
    const R = rng(seed), dirs = [[], ['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA']];
    let held = [], t = 0, nextDir = 0, nextAct = 0, shifts = 0, es = 0;
    const setKeys = ks => { for (const k of held) if (!ks.includes(k)) ev('keyup', k); for (const k of ks) if (!held.includes(k)) ev('keydown', k); held = ks; };
    const k = KK(), exitCell = (() => { for (let j = 0; j < k.S.H; j++) for (let i = 0; i < k.S.W; i++) if (k.ch('now', i, j) === '>') return [i, j]; return null; })();
    const stepToward = (ti, tj) => { // 지금 시대의 칸 길 다음 칸으로 방향키 (돌진)
      const s0 = st(), E = s0.era, key = (a, b) => a + ',' + b, prev = new Map([[key(s0.cell[0], s0.cell[1]), null]]), q = [s0.cell];
      while (q.length) { const [a, b] = q.shift(); if (a === ti && b === tj) break; for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (!prev.has(key(na, nb)) && k.stand(E, na, nb)) { prev.set(key(na, nb), [a, b]); q.push([na, nb]); } } }
      if (!prev.has(key(ti, tj))) return false;
      let c = [ti, tj]; while (prev.get(key(c[0], c[1])) && (prev.get(key(c[0], c[1]))[0] !== s0.cell[0] || prev.get(key(c[0], c[1]))[1] !== s0.cell[1])) c = prev.get(key(c[0], c[1]));
      const dx = c[0] * 2 + 1 - s0.x, dz = c[1] * 2 + 1 - s0.z, ks = [];
      if (dx > 0.2) ks.push('KeyD'); else if (dx < -0.2) ks.push('KeyA'); if (dz > 0.2) ks.push('KeyS'); else if (dz < -0.2) ks.push('KeyW');
      setKeys(ks); return true;
    };
    while (t < sec && !lastExit) {
      const near = k.enemies().filter(g => g.alive && g.era === st().era).sort((a, b) => Math.hypot(a.x - st().x, a.z - st().z) - Math.hypot(b.x - st().x, b.z - st().z))[0];
      if (kind === 'rush') { // 출구로 곧장, 적이 1.8m 안이면 찌르기, 길이 없으면 Shift
        if (t >= nextDir) { nextDir = t + 0.15; if (!exitCell || !stepToward(exitCell[0], exitCell[1])) { setKeys([]); if (t >= nextAct) { P.tap('ShiftLeft'); shifts++; nextAct = t + 0.7; } } }
        if (near && Math.hypot(near.x - st().x, near.z - st().z) < 1.8 && t >= nextAct) { P.stab(); nextAct = t + 0.5; }
      } else if (kind === 'circle') { // Shift 없이 가장 가까운 적 둘레를 돌며 등 쪽이면 찌르기 (그 시대에 적이 없으면 바꿈)
        if (!near) { if (t >= nextAct) { P.tap('ShiftLeft'); shifts++; nextAct = t + 1; } }
        else if (t >= nextDir) {
          nextDir = t + 0.15; const s0 = st(), an = Math.atan2(s0.x - near.x, s0.z - near.z) + 0.5, tx = near.x + Math.sin(an) * 2, tz = near.z + Math.cos(an) * 2, ks = [];
          if (tx - s0.x > 0.2) ks.push('KeyD'); else if (tx - s0.x < -0.2) ks.push('KeyA'); if (tz - s0.z > 0.2) ks.push('KeyS'); else if (tz - s0.z < -0.2) ks.push('KeyW'); setKeys(ks);
          const back = Math.cos(Math.atan2(s0.x - near.x, s0.z - near.z) - near.yaw) < -0.3;
          if (back && Math.hypot(near.x - s0.x, near.z - s0.z) < 2.2 && t >= nextAct) { Y().S.face = Math.atan2(near.x - s0.x, near.z - s0.z); P.stab(); nextAct = t + 0.6; }
        }
      }
      if ((kind === 'spam' || kind === 'random') && t >= nextDir) { setKeys(dirs[1 + Math.floor(R() * 8)]); nextDir = t + 0.4 + R() * 0.8; }
      if (t >= nextAct) {
        if (kind === 'spam') { P.tap('ShiftLeft'); shifts++; nextAct = t + 0.5; }
        else if (kind === 'random') { const r = R(); if (r < 0.25) { P.tap('ShiftLeft'); shifts++; } else if (r < 0.5) { P.tap('KeyE'); es++; } nextAct = t + 0.4; }
        else if (kind === 'still') nextAct = t + 1;
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
    const lz = ['still', 'spam', 'random', 'rush', 'circle'].map(k => this.lazy(id, k));
    return { id, solver: v, bot: b, lazy: lz, errs: errs.splice(0) };
  },
  all() { return CHUNKS.map(c => this.check(c.id)); },
  ids: () => CHUNKS.map(c => c.id),
};
window.__t3dev = D;
export default D;
