// T3 퍼즐 풀이기 — 장치 상태(비트) + 상자 자리 + (시대, 칸)을 0-1 너비 우선으로 훑는다. 걷기·Shift는 0, 장치 쓰기(E·줍기·상자 한 칸 밀기)는 1.
// 쓰임 두 가지:
//  1) 막다른 길 알아채기 (core.js): 세상이 바뀔 때마다(장치·상자·무너진 바닥·들고 있는 것) 지금 상태에서 출구까지 길이 아예 없으면 → "R로 다시 시작"
//     걷기·Shift는 되돌릴 수 있으므로 세상이 그대로면 판정도 그대로다 → 매번 다시 계산하지 않는다
//  2) 조각 검사 (dev.js): 처음 상태에서 최소 몇 번 장치를 써야 하는지, 장치 없이도 깨지는지(너무 쉬움)
// 시간·위험(태엽 시간, 금 가는 시간, 회전 다리 박자, 함정)은 낙관적으로 본다: 태엽 문은 감기만 하면 통과, 회전 다리 팔은 늘 건널 수 있음,
// 아직 안 무너진 바닥은 바닥. 그래서 '막혔다'는 판정은 정말 길이 없을 때만 나온다.
// 상자 밀기는 main.js tryPushCrate와 같게: 어제에서만, 밀려 갈 칸이 벽·막힘·'GDpL>'이 아니면. 어제의 구덩이에 빠지면 메워져 더 못 민다.
import { EXT } from '../../ext.js';
import { C, at, useSolver } from './core.js';
import { trace } from './light.js';

const bit = (st, n) => (st >>> n) & 1;
const FLOOR = { floor: true, solid: false }, WALL = { floor: true, solid: true }, PIT = { floor: false, solid: false };

function model(opt) {
  const d = C.d, s = d.seed, w = d.water, l = d.light, ky = d.key, ck = d.clock;
  const L = { pouch: s.pouches, bed: s.beds, wheel: w.wheels, mirror: l.mirrors, key: ky.keys, lock: ky.locks, crank: ck.cranks };
  const B = {}, idx = {}; let off = 0;
  for (const [n, arr] of Object.entries(L)) { B[n] = off; off += arr.length; idx[n] = new Map(arr.map((o, k) => [o, k])); }
  if (off > 30) return null;
  let st0 = 0;
  const set = (n, k, on) => { if (on) st0 |= 1 << (B[n] + k); };
  L.pouch.forEach((p, k) => set('pouch', k, p.got)); L.bed.forEach((b, k) => set('bed', k, b.planted)); L.wheel.forEach((o, k) => set('wheel', k, o.open));
  L.mirror.forEach((m, k) => set('mirror', k, m.o === 1)); L.key.forEach((o, k) => set('key', k, o.got)); L.lock.forEach((o, k) => set('lock', k, o.open)); L.crank.forEach((c, k) => set('crank', k, c.spring > 0));
  // 어제의 물 칸 (상자가 뜨고 가라앉음이 수문에 따라 바뀜)
  const pastWater = new Map(w.water.filter(o => o.era === 'past').map(o => [o.i + ',' + o.j, o]));
  // 상자: 움직일 수 있는 것 'i,j' / 구덩이를 메워 굳은 것 'i,j!'
  const cs0 = EXT.K.crates.map(c => c.i + ',' + c.j + (c.sunk && !pastWater.has(c.i + ',' + c.j) ? '!' : '')).sort().join(';');
  const M = { L, B, idx, st0, cs0, opt, inv: { ...C.inv }, pastWater, litCache: new Map(), csCache: new Map() };
  M.b = (st, n, o) => bit(st, B[n] + idx[n].get(o));
  M.seeds = st => { let h = M.inv.seed; L.pouch.forEach((p, k) => { h += bit(st, B.pouch + k) - bit(st0, B.pouch + k); }); L.bed.forEach((b, k) => { h -= bit(st, B.bed + k) - bit(st0, B.bed + k); }); return h; };
  M.keys = st => { let h = M.inv.key; L.key.forEach((o, k) => { h += bit(st, B.key + k) - bit(st0, B.key + k); }); L.lock.forEach((o, k) => { h -= bit(st, B.lock + k) - bit(st0, B.lock + k); }); return h; };
  M.flooded = (st, wt) => { const open = wt.wheel ? M.b(st, 'wheel', wt.wheel) : 0; return wt.wheel ? (wt.era === 'past' ? !!open : !open) : wt.era === 'now'; };
  M.set = cs => { let r = M.csCache.get(cs); if (!r) { r = new Set(cs ? cs.split(';') : []); M.csCache.set(cs, r); } return r; };
  // (i, j)의 상자: null | { sunk }
  M.crate = (st, cs, i, j) => {
    const S = M.set(cs), k = i + ',' + j;
    if (S.has(k + '!')) return { sunk: true };
    if (!S.has(k)) return null;
    const pw = pastWater.get(k);
    return { sunk: pw ? M.flooded(st, pw) : false };
  };
  M.lit = (st, cs) => {
    const key = st + '|' + cs; let r = M.litCache.get(key); if (r) return r;
    const k = EXT.K;
    const blocks = (i, j) => { const c = k.ch('now', i, j); if (c === '|' || c === 'G') return false; if (c === '#') return true; const x = at('now', i, j); if (x && x.k === 'bed') return !!M.b(st, 'bed', x.b); return cell(M, st, cs, 'now', i, j, true).solid; };
    r = trace(l, m => M.b(st, 'mirror', m), blocks).lit;
    M.litCache.set(key, r); return r;
  };
  return M;
}
// (상태 st, 상자 cs에서) 칸 하나: 바닥인지·막혔는지. 기본 규칙(main.js solid/floorAt)과 내 장치 규칙을 다시 계산
function cell(M, st, cs, era, i, j, noLit) {
  const k = EXT.K, c = k.ch(era, i, j);
  if (c === '#') return { floor: false, solid: true };
  const x = at(era, i, j), cr = M.crate(st, cs, i, j);
  if (x) {
    switch (x.m + ':' + x.k) {
      case 'seed:bed': return WALL; // 돌 화단은 두 시대 모두 막힘
      case 'seed:vine': if (x.v.beds.some(b => M.b(st, 'bed', b))) return FLOOR; break;
      case 'water:wheel': case 'light:mirror': case 'light:seal': case 'clock:crank': return WALL;
      case 'water:water': {
        const fl = M.flooded(st, x.w);
        if (!fl) return cr && !cr.sunk ? WALL : FLOOR;
        return cr ? FLOOR : PIT;
      }
      case 'light:door': if (era !== 'now' || x.o.era !== 'now' || noLit) return WALL; return M.lit(st, cs).has(x.o.seal) ? FLOOR : WALL;
      case 'key:lock': return M.b(st, 'lock', x.l) ? FLOOR : WALL;
      case 'crumble:tile': if (cr) return FLOOR; return x.t.st === 'gone' ? PIT : FLOOR;
      case 'clock:door': if (era !== 'now' || x.o.era !== 'now') return WALL; return x.o.c && M.b(st, 'crank', x.o.c) ? FLOOR : WALL;
      case 'turn:pivot': case 'turn:arm': return FLOOR; // 낙관: 어제에서 기다리면 원하는 방향
    }
  }
  if (c === '|' || c === '*' || c === 'b') return WALL;
  if (c === 'D' || c === 'G') return M.opt ? FLOOR : WALL;
  if (c === '_') return cr && (era === 'now' || cr.sunk) ? FLOOR : PIT;
  if (cr && !cr.sunk) return WALL;
  return FLOOR;
}
const stand = (M, st, cs, era, i, j) => { const r = cell(M, st, cs, era, i, j, false); return r.floor && !r.solid; };

/** 풀기. opt: 'D'·'G'를 열린 것으로 볼지(막힘 검사). from: { era, i, j } (없으면 지금 플레이어 자리). 결과 { ok, actions, plan, nodes, capped } */
function* solveGen({ opt = false, from = null, cap = 300000 } = {}) {
  const k = EXT.K, S = k.S;
  const M = model(opt); if (!M) return null;
  const E2 = ['past', 'now'];
  const sp = from || { era: S.era, i: Math.floor(S.p.x / 2), j: Math.floor(S.p.z / 2) };
  // 장치 옆 칸 → 할 수 있는 일
  const acts = new Map();
  const addAct = (dev, fn) => { for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const key2 = (dev.i + di) + ',' + (dev.j + dj); if (!acts.has(key2)) acts.set(key2, []); acts.get(key2).push(fn); } };
  M.L.bed.forEach((b, n) => addAct(b, (st) => { const m = 1 << (M.B.bed + n); if (st & m) return [st & ~m, 'dig']; if (M.seeds(st) > 0) return [st | m, 'plant']; return null; }));
  M.L.wheel.forEach((w, n) => addAct(w, (st, cs, i, j) => {
    const mine = M.pastWater.get(i + ',' + j);
    if (mine && mine.wheel === w && !(st & (1 << (M.B.wheel + n))) && !M.crate(st, cs, i, j)) return null; // 발밑이 잠기면 돌리지 않음 (water.js와 같게)
    return [st ^ (1 << (M.B.wheel + n)), 'wheel'];
  }));
  M.L.mirror.forEach((m, n) => addAct(m, st => [st ^ (1 << (M.B.mirror + n)), 'mirror']));
  M.L.lock.forEach((l, n) => addAct(l, st => { const m = 1 << (M.B.lock + n); if (st & m || M.keys(st) <= 0) return null; return [st | m, 'unlock']; }));
  M.L.crank.forEach((c, n) => addAct(c, st => { const m = 1 << (M.B.crank + n); return st & m ? null : [st | m, 'wind']; }));
  // 밟으면 줍는 것
  const picks = (st, cs, era, i, j) => {
    let cost = 0;
    M.L.pouch.forEach((p, n) => { const m = 1 << (M.B.pouch + n); if (!(st & m) && p.era === era && p.i === i && p.j === j) { st |= m; cost++; } });
    M.L.key.forEach((o, n) => {
      const m = 1 << (M.B.key + n); if (st & m || o.era !== era || o.i !== i || o.j !== j) return;
      if (o.under && o.water && cell(M, st, cs, era, i, j, false).floor === false) return;
      st |= m; cost++;
    });
    return [st, cost];
  };
  // 상자 한 칸 밀기 (어제): (ni, nj)의 상자를 (ti, tj)로
  const pushCrate = (st, cs, ni, nj, ti, tj) => {
    const cr = M.crate(st, cs, ni, nj); if (!cr || cr.sunk) return null;
    const tc = k.ch('past', ti, tj);
    if (tc === '#' || 'GDpL>'.includes(tc) || cell(M, st, cs, 'past', ti, tj, false).solid) return null;
    const pw = M.pastWater.get(ti + ',' + tj);
    const moved = ti + ',' + tj + (tc === '_' && !pw ? '!' : '');
    return [...M.set(cs)].filter(s => s !== ni + ',' + nj).concat(moved).sort().join(';');
  };
  const isExit = (era, i, j) => k.ch(era, i, j) === '>';
  const dist = new Map(), prev = new Map(), dq = [];
  const nk = (st, cs, e, i, j) => st + '|' + cs + '|' + e + '|' + i + '|' + j;
  const push = (st, cs, e, i, j, dd, from2, what, front) => { const key2 = nk(st, cs, e, i, j); const o = dist.get(key2); if (o !== undefined && o <= dd) return; dist.set(key2, dd); prev.set(key2, [from2, what]); if (front) dq.unshift([st, cs, e, i, j, dd]); else dq.push([st, cs, e, i, j, dd]); };
  const e0 = E2.indexOf(sp.era);
  { const [st1, c1] = picks(M.st0, M.cs0, sp.era, sp.i, sp.j); push(st1, M.cs0, e0, sp.i, sp.j, c1, null, null, true); }
  let nodes = 0;
  while (dq.length) {
    const [st, cs, e, i, j, dd] = dq.shift();
    const key2 = nk(st, cs, e, i, j);
    if (dist.get(key2) !== dd) continue;
    if (++nodes > cap) return { ok: false, capped: true, nodes };
    if ((nodes & 511) === 0) yield nodes; // 막힘 검사는 여러 프레임에 나눠 계산 (한 번에 다 하면 상자 방에서 0.35초 끊김)
    const era = E2[e];
    if (isExit(era, i, j)) { const plan = []; for (let q = key2; q; q = prev.get(q)[0]) { const w = prev.get(q)[1]; if (w) plan.unshift(w); } return { ok: true, actions: dd, plan, nodes }; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (stand(M, st, cs, era, ni, nj)) {
        const [st2, c2] = picks(st, cs, era, ni, nj);
        push(st2, cs, e, ni, nj, dd + c2, key2, c2 ? 'pick@' + era + ':' + ni + ',' + nj : null, c2 === 0);
      } else if (era === 'past') {
        const cs2 = pushCrate(st, cs, ni, nj, ni + di, nj + dj);
        if (cs2 !== null) push(st, cs2, e, i, j, dd + 1, key2, 'push@' + ni + ',' + nj + '>' + (ni + di) + ',' + (nj + dj), false);
      }
    }
    const o = 1 - e;
    if (stand(M, st, cs, E2[o], i, j)) { const [st2, c2] = picks(st, cs, E2[o], i, j); push(st2, cs, o, i, j, dd + c2, key2, c2 ? 'pick@' + E2[o] + ':' + i + ',' + j : null, c2 === 0); }
    if (era === 'past') for (const fn of acts.get(i + ',' + j) || []) { const r = fn(st, cs, i, j); if (r) push(r[0], cs, e, i, j, dd + 1, key2, r[1] + '@' + i + ',' + j, false); }
  }
  return { ok: false, nodes };
}
/** 한 번에 끝까지 (시험 도구용) */
export function solve(opts) { const g = solveGen(opts); let r; do r = g.next(); while (!r.done); return r.value; }

// 세상 상태 요약 (바뀌었을 때만 막힘을 다시 계산)
function signature() {
  const d = C.d, k = EXT.K;
  return [d.seed.beds.map(b => +b.planted).join(''), d.seed.pouches.map(p => +p.got).join(''), d.water.wheels.map(w => +w.open).join(''), d.light.mirrors.map(m => m.o).join(''),
    d.key.keys.map(o => +o.got).join(''), d.key.locks.map(o => +o.open).join(''), d.clock.cranks.map(c => +(c.spring > 0)).join(''), d.crumble.tiles.map(t => t.st[0]).join(''),
    k.crates.map(c => c.i + ',' + c.j + (c.sunk ? '!' : '')).join(';'), C.inv.seed, C.inv.key, k.S.room && k.S.room.id].join('|');
}
let lastSig = null, lastRes, job = null, jobSig = null;
/** 막힘 검사 한 걸음 (core.js가 매 프레임): 세상이 바뀌면 새로 풀기 시작해 budget ms씩 이어 간다.
 *  true = 길이 하나도 없음, false = 길 있음, undefined = 아직 계산 중이거나 판정 못 함(뗏목 방·보스, 너무 큼) */
export function stuckTick(budget = 3) {
  const k = EXT.K;
  const r = k.S.room; if (!r) return undefined;
  if (['past', 'now'].some(E => r[E].some(row => /[Mm]/.test(row)))) return undefined;
  if (k.enemies().some(f => f.alive && f.kind === 'boss')) return undefined;
  const sig = signature();
  if (sig !== lastSig && sig !== jobSig) { job = solveGen({ opt: true, cap: 150000 }); jobSig = sig; }
  if (job) {
    const t0 = performance.now(); let step;
    do step = job.next(); while (!step.done && performance.now() - t0 < budget);
    if (step.done) { const res = step.value; lastSig = jobSig; lastRes = !res || res.capped ? undefined : !res.ok; job = null; jobSig = null; }
  }
  return sig === lastSig ? lastRes : undefined;
}
export function stuckCheck() { let v; for (let n = 0; n < 2000; n++) { v = stuckTick(50); if (!job) break; } return v; }
export function resetStuck() { lastSig = null; job = null; jobSig = null; }
useSolver({ stuckCheck, stuckTick, solve, resetStuck });
