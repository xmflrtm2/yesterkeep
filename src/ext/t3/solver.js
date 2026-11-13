// T3 퍼즐 풀이기 — 장치 상태를 비트로 묶어 (상태, 시대, 칸)을 너비 우선으로 훑는다. 걷기·Shift는 0, 장치 하나 쓰기(E·줍기)는 1.
// 쓰임 두 가지:
//  1) 막다른 길 알아채기 (core.js가 1초마다): 지금 상태에서 출구까지 가는 길이 아예 없으면 true → "R로 다시 시작"
//  2) 조각 검사 (dev.js): 처음 상태에서 최소 몇 번 장치를 써야 하는지, 장치 없이도 깨지는지(너무 쉬움)
// 시간·위험(태엽 시간, 금 가는 시간, 회전 다리 박자, 함정)은 낙관적으로 본다: 태엽 문은 감기만 하면 통과, 회전 다리 팔은 늘 건널 수 있음,
// 아직 안 무너진 바닥은 바닥. 그래서 '막혔다'는 판정은 정말 길이 없을 때만 나온다. 상자는 다루지 않는다(상자가 움직일 수 있는 방은 판정 보류).
import { EXT } from '../../ext.js';
import { C, at, crateAt, useSolver } from './core.js';
import { trace } from './light.js';

const bit = (st, n) => (st >>> n) & 1;
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
  const M = { L, B, idx, st0, opt, inv: { ...C.inv }, litCache: new Map() };
  M.b = (st, n, o) => bit(st, B[n] + idx[n].get(o));
  M.seeds = st => { let h = M.inv.seed; L.pouch.forEach((p, k) => { h += bit(st, B.pouch + k) - bit(st0, B.pouch + k); }); L.bed.forEach((b, k) => { h -= bit(st, B.bed + k) - bit(st0, B.bed + k); }); return h; };
  M.keys = st => { let h = M.inv.key; L.key.forEach((o, k) => { h += bit(st, B.key + k) - bit(st0, B.key + k); }); L.lock.forEach((o, k) => { h -= bit(st, B.lock + k) - bit(st0, B.lock + k); }); return h; };
  M.lit = st => {
    let r = M.litCache.get(st); if (r) return r;
    const k = EXT.K;
    const blocks = (i, j) => { const c = k.ch('now', i, j); if (c === '|' || c === 'G') return false; if (c === '#') return true; return cell(M, st, 'now', i, j, true).solid; };
    r = trace(l, m => M.b(st, 'mirror', m), blocks).lit;
    M.litCache.set(st, r); return r;
  };
  return M;
}
const FLOOR = { floor: true, solid: false }, WALL = { floor: true, solid: true }, PIT = { floor: false, solid: false };
// (상태 st에서) 칸 하나: 바닥인지·막혔는지. 기본 규칙(main.js solid/floorAt)과 내 장치 규칙을 상태로 다시 계산
function cell(M, st, era, i, j, noLit) {
  const k = EXT.K, c = k.ch(era, i, j);
  if (c === '#') return { floor: false, solid: true };
  const x = at(era, i, j), cr = crateAt(i, j);
  if (x) {
    switch (x.m + ':' + x.k) {
      case 'seed:bed': return era === 'now' && M.b(st, 'bed', x.b) ? WALL : FLOOR;
      case 'seed:vine': if (x.v.beds.some(b => M.b(st, 'bed', b))) return FLOOR; break;
      case 'water:wheel': case 'light:mirror': case 'light:seal': case 'clock:crank': return WALL;
      case 'water:water': {
        const w = x.w, open = w.wheel ? M.b(st, 'wheel', w.wheel) : 0, fl = w.wheel ? (w.era === 'past' ? open : !open) : w.era === 'now';
        if (!fl) return cr ? WALL : FLOOR;
        return cr ? FLOOR : PIT;
      }
      case 'light:door': if (era !== 'now' || x.o.era !== 'now' || noLit) return WALL; return M.lit(st).has(x.o.seal) ? FLOOR : WALL;
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
const stand = (M, st, era, i, j) => { const r = cell(M, st, era, i, j, false); return r.floor && !r.solid; };

/** 풀기. opt: 'D'·'G'를 열린 것으로 볼지(막힘 검사). from: { era, i, j } (없으면 지금 플레이어 자리). 결과 { ok, actions, plan, nodes, capped } */
export function solve({ opt = false, from = null, cap = 300000 } = {}) {
  const k = EXT.K, S = k.S;
  const M = model(opt); if (!M) return null;
  const E2 = ['past', 'now'];
  const sp = from || { era: S.era, i: Math.floor(S.p.x / 2), j: Math.floor(S.p.z / 2) };
  // 장치 옆 칸 → 할 수 있는 일
  const acts = new Map();
  const addAct = (dev, fn) => { for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const key2 = (dev.i + di) + ',' + (dev.j + dj); if (!acts.has(key2)) acts.set(key2, []); acts.get(key2).push(fn); } };
  M.L.bed.forEach((b, n) => addAct(b, (st) => { const m = 1 << (M.B.bed + n); if (st & m) return [st & ~m, 'dig']; if (M.seeds(st) > 0) return [st | m, 'plant']; return null; }));
  M.L.wheel.forEach((w, n) => addAct(w, (st, i, j) => {
    const mine = C.d.water.water.find(o => o.era === 'past' && o.i === i && o.j === j && o.wheel === w);
    if (mine && !(st & (1 << (M.B.wheel + n))) && !crateAt(i, j)) return null; // 발밑이 잠기면 돌리지 않음 (water.js와 같게)
    return [st ^ (1 << (M.B.wheel + n)), 'wheel'];
  }));
  M.L.mirror.forEach((m, n) => addAct(m, st => [st ^ (1 << (M.B.mirror + n)), 'mirror']));
  M.L.lock.forEach((l, n) => addAct(l, st => { const m = 1 << (M.B.lock + n); if (st & m || M.keys(st) <= 0) return null; return [st | m, 'unlock']; }));
  M.L.crank.forEach((c, n) => addAct(c, st => { const m = 1 << (M.B.crank + n); return st & m ? null : [st | m, 'wind']; }));
  // 밟으면 줍는 것
  const picks = (st, era, i, j) => {
    let cost = 0;
    M.L.pouch.forEach((p, n) => { const m = 1 << (M.B.pouch + n); if (!(st & m) && p.era === era && p.i === i && p.j === j) { st |= m; cost++; } });
    M.L.key.forEach((o, n) => {
      const m = 1 << (M.B.key + n); if (st & m || o.era !== era || o.i !== i || o.j !== j) return;
      if (o.under && o.water && cell(M, st, era, i, j, false).floor === false) return;
      st |= m; cost++;
    });
    return [st, cost];
  };
  const isExit = (era, i, j) => k.ch(era, i, j) === '>';
  const dist = new Map(), prev = new Map(), dq = [];
  const nk = (st, e, i, j) => st + '|' + e + '|' + i + '|' + j;
  const push = (st, e, i, j, dd, from2, what, front) => { const key2 = nk(st, e, i, j); const o = dist.get(key2); if (o !== undefined && o <= dd) return; dist.set(key2, dd); prev.set(key2, [from2, what]); if (front) dq.unshift([st, e, i, j, dd]); else dq.push([st, e, i, j, dd]); };
  const e0 = E2.indexOf(sp.era);
  { const [st1, c1] = picks(M.st0, sp.era, sp.i, sp.j); push(st1, e0, sp.i, sp.j, c1, null, null, true); }
  let nodes = 0;
  while (dq.length) {
    const [st, e, i, j, dd] = dq.shift();
    const key2 = nk(st, e, i, j);
    if (dist.get(key2) !== dd) continue;
    if (++nodes > cap) return { ok: false, capped: true, nodes };
    const era = E2[e];
    if (isExit(era, i, j)) { const plan = []; for (let q = key2; q; q = prev.get(q)[0]) { const w = prev.get(q)[1]; if (w) plan.unshift(w); } return { ok: true, actions: dd, plan, nodes }; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!stand(M, st, era, ni, nj)) continue;
      const [st2, c2] = picks(st, era, ni, nj);
      push(st2, e, ni, nj, dd + c2, key2, c2 ? 'pick@' + era + ':' + ni + ',' + nj : null, c2 === 0);
    }
    const o = 1 - e;
    if (stand(M, st, E2[o], i, j)) { const [st2, c2] = picks(st, E2[o], i, j); push(st2, o, i, j, dd + c2, key2, c2 ? 'pick@' + E2[o] + ':' + i + ',' + j : null, c2 === 0); }
    if (era === 'past') for (const fn of acts.get(i + ',' + j) || []) { const r = fn(st, i, j); if (r) push(r[0], e, i, j, dd + 1, key2, r[1] + '@' + i + ',' + j, false); }
  }
  return { ok: false, nodes };
}

/** 막힘 검사: true = 길이 하나도 없음, false = 길 있음, undefined = 판정 못 함(상자·뗏목 방, 너무 큼) */
export function stuckCheck() {
  const k = EXT.K;
  if (k.crates.some(c => !c.sunk)) return undefined;
  const r = k.S.room; if (!r) return undefined;
  if (['past', 'now'].some(E => r[E].some(row => /[Mm]/.test(row)))) return undefined;
  if (k.enemies().some(f => f.alive && f.era && !f.optional && f.kind === 'boss')) return undefined;
  const res = solve({ opt: true, cap: 120000 });
  if (!res || res.capped) return undefined;
  return !res.ok;
}
useSolver({ stuckCheck, solve });
