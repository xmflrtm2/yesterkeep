// T4 아이템·성장 — 바탕: 가진 유물, 능력치 계산, 훅 연결, 금화, 던지기(Q), 런 상태.
// 유물이 하나도 없으면 아무 값도 건드리지 않는다(튜토리얼 13방은 지금과 똑같다). 쓰는 법은 docs/roguelike/t4.md
import { EXT } from '../../ext.js';
import { ITEMS, SYN, RAR, byId } from './items.js';
import { snd } from './sfx.js';

const MSG = { // main.js가 hurt()에 넘기는 글자 (비교용, 그때 언어로)
  arrow: () => $t('화살에 맞았어요'), spike: () => $t('가시에 찔렸어요'), blade: () => $t('칼날에 베였어요'),
};
const DEG = Math.PI / 180;
const SHOCK_MAX = 5.0; // 시간 충격(넘어올 때 얼어붙는) 범위의 끝
// T2 적의 피해 글자 (짐승 가죽·혼령 부적이 알아보는 것)
const T2MSG = [['beast', () => $t('사냥개에게 물렸어요')], ['beast', () => $t('미믹에게 물렸어요')], ['beast', () => $t('쥐 떼에 물렸어요')],
  ['spirit', () => $t('메아리에 닿았어요 — 내가 지나온 길을 따라와요')], ['spirit', () => $t('망령에 닿았어요 — 다른 시대에서 보고, 겹쳐 넘어오세요')]];

export const T4 = {
  K: null,
  inv: [],              // [{ id, lv }]
  coins: 0,
  rerolls: 0,
  st: null,             // 지금 능력치 묶음 (freshStats + 유물 + 시너지)
  syn: [],              // 켜진 시너지 id
  base: {},             // 'STAT.speed' → 처음 고치기 전 값 (원래대로 되돌릴 때)
  room: {},             // 방마다 다시 차는 것 (방패·태엽·장화·화살 잡기)
  ammo: { knife: 0, arrows: 0 },
  run: { active: false, mini: false, rooms: 0, kills: 0, phoenixUsed: false, seen: new Set() },
  proj: [], drops: [],  // 날아가는 것 / 바닥에 떨어진 단검
  decoy: null, decoyCd: 0, breathT: 0, breathSus: null, bootsT: 0, catchT: 0, lastHearts: null,
  listeners: new Set(), // 바뀌면 부른다 (HUD)
  RAR, ITEMS, SYN, byId,
};

// ───────── 능력치 ─────────
function freshStats() {
  return {
    mul: { speed: 1, shiftCd: 1, rollCd: 1, lunge: 1, range: 1, half: 1, sus: 1, shock: 1, sense: 1, sandMul: 1, sandDrain: 1 },
    add: { maxHearts: 0 },
    strike: 0.6, shockStun: 0.6, backDeg: 110, shield: 0, shieldStun: 0, boots: 0, spring: 0, catch: 0, ammoMax: 3, knives: 0,
    killCoins: 0, price: 1, gate: 0, chain: 0, ripple: 0, breath: 0, double: 0, phoenix: 0, decoy: 0, decoyCd: 8, harvest: -1,
    lastGrain: 0, shadow: 0, glass: 0, sandKill: 0, moon: 1, pierce: 0, decoyBoth: 0,
    // 2차: T2 적·T3 장치·저주 (r2.js)
    follow: 0, shieldReact: 0, shieldHear: 0, aimMul: 1, revDelay: 0, beast: 0, beastStun: 0, spirit: 0, springRate: 1, springMax: 0,
    feather: 0, eliteHunt: 0, moonEdge: 0, houndCoins: 0, mageSand: 0,
    coinMul: 1, thinNow: 1, thinPast: 1, thinHurt: 0, foeSpeed: 1, pickPlus: 0, glassHeart: 0,
  };
}
export const has = id => T4.inv.some(e => e.id === id);
export const lvOf = id => (T4.inv.find(e => e.id === id) || {}).lv || 0;
const owned = () => T4.inv.map(e => ({ it: byId(e.id), lv: e.lv })).filter(o => o.it);

// 값 하나를 기본값 × 배수 + 더하기로. 배수 1·더하기 0이면 원래 값으로 되돌리고 손을 뗀다 (다른 트랙이 바꾼 값을 덮지 않게)
export function put(obj, key, tag, mul, add = 0) {
  if (!obj) return;
  const id = tag + '.' + key;
  const ident = mul === 1 && add === 0;
  if (!(id in T4.base)) { if (ident) return; T4.base[id] = obj[key]; }
  const b = T4.base[id];
  obj[key] = key === 'maxHearts' ? Math.max(1, Math.round(b * mul + add)) : b * mul + add;
  if (ident) delete T4.base[id];
}
export function apply() {
  const K = T4.K;
  const st = freshStats();
  for (const { it, lv } of owned()) if (it.stat) it.stat(st, lv);
  T4.syn = SYN.filter(s => has(s.a) && has(s.b)).map(s => s.id);
  for (const s of SYN) if (T4.syn.includes(s.id)) s.stat(st);
  T4.st = st;
  if (!K) return st;
  const S = K.S, STAT = K.STAT;
  const oldMax = STAT.maxHearts;
  put(STAT, 'maxHearts', 'STAT', 1, st.add.maxHearts);
  put(STAT, 'shiftCd', 'STAT', st.mul.shiftCd);
  put(STAT, 'lunge', 'STAT', st.mul.lunge);
  put(K.GUARD, 'range', 'GUARD', st.mul.range);
  put(K.GUARD, 'half', 'GUARD', st.mul.half);
  put(K.GUARD, 'susNear', 'GUARD', st.mul.sus);
  put(K.GUARD, 'susFar', 'GUARD', st.mul.sus);
  // 얼어붙는 범위는 5m까지 — 납 모래시계(×1.5)와 충격 종 II(×5/3)가 곱해져 7.5m가 되자 Shift 연타 봇이 T2 방 7개 중 5개를 깼다 (11/15)
  { const b = T4.base['GUARD.shock'] ?? K.GUARD.shock; put(K.GUARD, 'shock', 'GUARD', Math.min(st.mul.shock, SHOCK_MAX / b)); }
  put(K.GOLEM, 'sense', 'GOLEM', st.mul.sense);
  put(K.GOLEM, 'susNear', 'GOLEM', st.mul.sus);
  put(K.GOLEM, 'susFar', 'GOLEM', st.mul.sus);
  for (const key of ['walk', 'run']) { put(K.GUARD, key, 'GUARD', st.foeSpeed); put(K.GOLEM, key, 'GOLEM', st.foeSpeed); } // 저주: 무거운 왕관
  // T1이 읽는 모래 배수 (T1이 없으면 아무도 안 읽음)
  if (st.mul.sandMul !== 1 || 'STAT.sandMul' in T4.base) { if (STAT.sandMul == null) STAT.sandMul = 1; put(STAT, 'sandMul', 'STAT', st.mul.sandMul); }
  if (st.mul.sandDrain !== 1 || 'STAT.sandDrain' in T4.base) { if (STAT.sandDrain == null) STAT.sandDrain = 1; put(STAT, 'sandDrain', 'STAT', st.mul.sandDrain); } // T1이 어제에서 모래 줄이는 속도에 곱함
  dynStats();
  if (STAT.maxHearts !== oldMax && S) {
    if (STAT.maxHearts > oldMax) S.hearts += STAT.maxHearts - oldMax; else S.hearts = Math.min(S.hearts, STAT.maxHearts);
    S.hearts = Math.max(1, S.hearts);
    T4.lastHearts = S.hearts;
    K.drawHearts();
  }
  gateApply();
  return st;
}
// 매 프레임 바뀌는 능력치: 달빛 걸음(오늘에서만), 마지막 모래알(하트가 적을 때)
const graining = () => T4.st && T4.st.lastGrain && T4.K && T4.K.S.hearts <= T4.st.lastGrain;
// 성채지기가 깨어 있으면 걸음이 빨라지는 유물은 꺼진다 — 달빛 걸음 II(+35%)면 보스가 도는 속도(오늘 3.0 rad/s)보다 빨리 돌아
// Shift 없이 빙빙 도는 봇이 13초 만에 이겼다 (11/13 tools/t4_balance.py boss circle). 구르기 대기(마지막 모래알)는 그대로
const bossAwake = () => { const K = T4.K; return !!(K && K.bosses && K.bosses.some(b => b.alive && b.state !== 'dormant')); };
function dynStats() {
  const K = T4.K, st = T4.st; if (!K || !st) return;
  const calm = !bossAwake(), now = K.S.era === 'now', moon = calm && now ? st.moon * st.thinNow : 1, g = graining();
  put(K.STAT, 'speed', 'STAT', st.mul.speed * moon * (now ? 1 : st.thinPast) * (g && calm ? 1.15 : 1)); // 저주 '얇은 오늘'의 대가(어제 −20%)는 보스 앞에서도 그대로
  put(K.STAT, 'rollCd', 'STAT', st.mul.rollCd * (g ? 0.5 : 1));
}
// 창살 쐐기: 방 데이터의 gateHold를 잠깐 늘렸다가, 방을 떠나거나 유물이 없어지면 되돌린다
let gateRoom = null, gateOrig;
function gateApply() {
  const K = T4.K; if (!K) return;
  const room = K.S.room;
  if (gateRoom && (gateRoom !== room || !T4.st.gate)) { if (gateOrig === undefined) delete gateRoom.gateHold; else gateRoom.gateHold = gateOrig; gateRoom = null; }
  if (room && T4.st.gate && gateRoom !== room) { gateRoom = room; gateOrig = room.gateHold; room.gateHold = (gateOrig || 2.6) + T4.st.gate; }
}

// ───────── 가진 것 바꾸기 ─────────
export function changed(why) { for (const f of T4.listeners) { try { f(why); } catch (e) { console.error('[t4]', e); } } }
export function give(id, { lv = 1, silent = false } = {}) {
  const it = byId(id); if (!it) { console.warn('[t4] unknown item', id); return false; }
  const e = T4.inv.find(x => x.id === id);
  if (e) e.lv = Math.max(e.lv, lv); else { T4.inv.push({ id, lv: it.kind === 'curse' ? 1 : lv }); if (it.onGive) it.onGive(T4); }
  T4.run.seen.add(id);
  apply();
  refill(it);
  if (!silent && T4.K) {
    T4.K.toast($t('{0} 얻음', $t(it.name)), 2);
    const newSyn = SYN.filter(s => T4.syn.includes(s.id) && (s.a === id || s.b === id));
    if (newSyn.length) setTimeout(() => T4.K && T4.K.toast('✦ ' + $t('시너지: {0}', $t(newSyn[0].name)), 2.4), 1300);
  }
  changed('give');
  return true;
}
export function take(id) { T4.inv = T4.inv.filter(e => e.id !== id); apply(); clampAmmo(); changed('take'); }
export function upgrade(id) {
  const e = T4.inv.find(x => x.id === id); if (!e || e.lv >= 2) return false;
  e.lv = 2; apply(); refill(byId(id));
  if (id === 't4-hourglass-heart') T4.run.phoenixUsed = false; // 강화하면 다시 채워짐
  changed('upgrade');
  return true;
}
export function canUpgrade(id) { const e = T4.inv.find(x => x.id === id), it = byId(id); return !!e && e.lv < 2 && !!it && it.kind !== 'curse'; }
// 새로 얻거나 강화한 유물의 방마다 차는 것을 바로 채운다
function refill(it) {
  if (!it || !T4.st) return;
  T4.room.shield = Math.max(T4.room.shield || 0, T4.st.shield);
  T4.room.spring = Math.max(T4.room.spring || 0, T4.st.spring);
  T4.room.boots = Math.max(T4.room.boots || 0, T4.st.boots);
  T4.room.catch = Math.max(T4.room.catch || 0, T4.st.catch);
  for (const k of ['beast', 'spirit', 'feather']) T4.room[k] = Math.max(T4.room[k] || 0, T4.st[k]);
  if (it.id === 't4-throw-knife') T4.ammo.knife = Math.max(T4.ammo.knife, T4.st.knives - T4.drops.length - T4.proj.filter(p => p.kind === 'knife').length);
}
function clampAmmo() { T4.ammo.knife = Math.min(T4.ammo.knife, T4.st.knives); T4.ammo.arrows = Math.min(T4.ammo.arrows, T4.st.catch ? T4.st.ammoMax : T4.ammo.arrows); }
export function addCoins(n, why) { if (!n) return; T4.coins = Math.max(0, T4.coins + n); if (n > 0 && T4.K && why !== 'quiet') snd.coin(); changed('coins:' + n); }
export const priceOf = it => Math.max(1, Math.round((it ? RAR[it.rar].price : 4) * (T4.st ? T4.st.price : 1)));
export const heartPrice = () => Math.max(1, Math.round(4 * (T4.st ? T4.st.price : 1)));

// 나올 수 있는가: T1 모래가 필요한 것, 런 사이 해금이 필요한 것을 거른다
export const sandOn = () => !!(EXT.run && (typeof EXT.run.addSand === 'function'));
export function available(it, meta) {
  if (it.needs === 'sand' && !sandOn()) return false;
  if (it.lock && !(meta && meta.unlocked && meta.unlocked.includes(it.id))) return false;
  return true;
}
// 고르기에 낼 n개: 안 가진 것 중 희귀도 가중치로 (tier가 높을수록 드묾·전설이 잘 나옴)
export function roll(n = 3, { tier = 1, kinds = null, meta = null, rar = null, exclude = [], curse = false } = {}) {
  // 저주는 따로 부를 때만(curse: true) — 보통 고르기·상점에는 안 섞인다 (ui.js가 보물 고르기에 한 장을 섞는다)
  const pool = ITEMS.filter(it => !has(it.id) && !exclude.includes(it.id) && available(it, meta) && (curse ? it.kind === 'curse' : it.kind !== 'curse') && (!kinds || kinds.includes(it.kind)) && (!rar || rar.includes(it.rar)));
  const w = it => (it.kind === 'curse' ? 1 : RAR[it.rar].w) * (it.rar === 'common' ? Math.max(0.4, 1.15 - 0.15 * tier) : it.rar === 'legend' ? 0.7 + 0.4 * tier : 0.9 + 0.12 * tier) * (T4.run.seen.has(it.id) ? 0.5 : 1);
  const out = [];
  while (out.length < n && pool.length) {
    let sum = 0; for (const it of pool) sum += w(it);
    let r = Math.random() * sum, k = 0;
    for (; k < pool.length - 1; k++) { r -= w(pool[k]); if (r <= 0) break; }
    out.push(pool[k].id); pool.splice(k, 1);
  }
  for (const id of out) T4.run.seen.add(id);
  return out;
}

// ───────── 런 ─────────
export function resetRun() {
  T4.inv = []; T4.coins = 0; T4.rerolls = 0; T4.ammo = { knife: 0, arrows: 0 };
  T4.run = { active: false, mini: false, rooms: 0, kills: 0, phoenixUsed: false, seen: new Set(), floors: 0 };
  apply(); changed('reset');
}
export function snapshot() { return { inv: T4.inv.map(e => ({ ...e })), coins: T4.coins, rerolls: T4.rerolls, phoenixUsed: T4.run.phoenixUsed, rooms: T4.run.rooms, kills: T4.run.kills, seen: [...T4.run.seen] }; }
export function restore(s) {
  if (!s) return;
  T4.inv = (s.inv || []).filter(e => byId(e.id)); T4.coins = s.coins || 0; T4.rerolls = s.rerolls || 0;
  Object.assign(T4.run, { active: true, phoenixUsed: !!s.phoenixUsed, rooms: s.rooms || 0, kills: s.kills || 0, seen: new Set(s.seen || []) });
  apply(); changed('restore');
}

// ───────── 던지기 (Q) ─────────
// 던진 것은 던진 시대의 엔티티라서 그 시대를 떠나면 공중에 멈춘다(떠난 시대는 멈춘다). 다른 시대에서는 붉은 윤곽으로 보인다
const PROJ = { speed: 15, range: 10, hitR: 0.25 };
let knifeGeo = null;
function projMesh(kind, era, ghost) {
  const K = T4.K, THREE = K.THREE, g = new THREE.Group();
  if (kind === 'arrow' && !ghost) { const m = K.makeMesh('arrow', era); m.scale.setScalar(2.4); m.rotation.y = Math.PI; g.add(m); }
  else {
    if (!knifeGeo) knifeGeo = { blade: new THREE.BoxGeometry(0.06, 0.03, 0.42).translate(0, 0, 0.12), hilt: new THREE.BoxGeometry(0.07, 0.07, 0.18).translate(0, 0, -0.17), guard: new THREE.BoxGeometry(0.2, 0.04, 0.04).translate(0, 0, -0.08) };
    const mat = ghost ? K.guardGhostMat : (kind === 'arrow' ? new THREE.MeshStandardMaterial({ color: '#8a6a44' }) : new THREE.MeshStandardMaterial({ color: '#d8e2ec', metalness: 0.8, roughness: 0.3, emissive: '#2a3440' }));
    const dark = ghost ? K.guardGhostMat : new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.8 });
    g.add(new THREE.Mesh(knifeGeo.blade, mat), new THREE.Mesh(knifeGeo.hilt, dark), new THREE.Mesh(knifeGeo.guard, dark));
    if (kind === 'arrow' && ghost) g.scale.set(0.6, 0.6, 2.2);
  }
  // 날아가는 동안 잘 보이게 빛 점
  if (!ghost) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: kind === 'knife' ? '#bfe8ff' : '#ffe2a8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(0.5); g.add(sp); g.userData.glow = sp; }
  return g;
}
export function throwIt() {
  const K = T4.K; if (!K) return 'none';
  const S = K.S;
  if (!S.ready || S.down || S.trans || S.falling > 0 || S.ended || S.held || S.roll > 0) return 'busy';
  const kind = T4.ammo.arrows > 0 ? 'arrow' : T4.ammo.knife > 0 ? 'knife' : null;
  if (!kind) { if (T4.st.knives || T4.st.catch) { K.toast(T4.st.knives ? $t('단검을 먼저 주우세요') : $t('던질 화살이 없어요'), 1.2); K.sfx.thunk(); } return 'empty'; }
  // 조준 보조: 앞 40° 안 같은 시대의 가장 가까운 적
  let dx = Math.sin(S.face), dz = Math.cos(S.face), best = null, bd = PROJ.range;
  for (const f of K.enemies()) {
    if (!f.alive || f.era !== S.era || f.fall) continue;
    const vx = f.x - S.p.x, vz = f.z - S.p.z, d = Math.hypot(vx, vz);
    if (d < bd && (vx * dx + vz * dz) / Math.max(d, 0.01) > Math.cos(40 * DEG)) { bd = d; best = f; }
  }
  if (best) { const d = Math.hypot(best.x - S.p.x, best.z - S.p.z) || 1; dx = (best.x - S.p.x) / d; dz = (best.z - S.p.z) / d; S.face = Math.atan2(dx, dz); }
  if (kind === 'arrow') T4.ammo.arrows--; else T4.ammo.knife--;
  const era = S.era, p = { kind, era, x: S.p.x + dx * 0.45, z: S.p.z + dz * 0.45, dx, dz, dist: 0, hits: 0, hitSet: new Set(), done: false };
  p.mesh = projMesh(kind, era, false); p.mesh.rotation.y = Math.atan2(dx, dz); p.mesh.position.set(p.x, 1.1, p.z);
  K.groups[era].add(p.mesh);
  p.ghost = projMesh(kind, era, true); p.ghost.rotation.y = p.mesh.rotation.y; p.ghost.position.copy(p.mesh.position); p.ghost.visible = false;
  K.groups[K.other(era)].add(p.ghost);
  p.ent = K.addEntity({ era, t: 0, update(dt) { stepProj(p, dt); } });
  T4.proj.push(p);
  snd.throw();
  changed('ammo');
  return kind;
}
function endProj(p, drop) {
  const K = T4.K;
  p.done = true;
  if (p.ghost && p.ghost.parent) p.ghost.parent.remove(p.ghost);
  T4.proj = T4.proj.filter(q => q !== p);
  const ent = K.entities.indexOf(p.ent); if (ent >= 0) K.entities.splice(ent, 1);
  if (p.kind === 'knife' && drop) {
    // 단검은 떨어진 자리에 남는다 (바닥이면). 구덩이면 이 방에선 잃어버림
    const i = K.cellOf(p.x), j = K.cellOf(p.z);
    if (K.floorAt(p.era, i, j)) {
      p.mesh.position.set(p.x, 0.08, p.z); p.mesh.rotation.set(Math.PI / 2 * 0.95, p.mesh.rotation.y, 0);
      if (p.mesh.userData.glow) { p.mesh.userData.glow.material.opacity = 0.35; p.mesh.userData.glow.position.set(0, 0, 0); }
      const ghost = projMesh('knife', p.era, true); ghost.position.copy(p.mesh.position); ghost.rotation.copy(p.mesh.rotation); ghost.visible = false; K.groups[K.other(p.era)].add(ghost);
      T4.drops.push({ era: p.era, x: p.x, z: p.z, mesh: p.mesh, ghost, t: 0 });
      return;
    }
  }
  if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
}
function stepProj(p, dt) {
  if (p.done) return;
  const K = T4.K, S = K.S;
  const step = PROJ.speed * dt;
  const nx = p.x + p.dx * step, nz = p.z + p.dz * step;
  if (K.solid(p.era, K.cellOf(nx + p.dx * 0.15), K.cellOf(nz + p.dz * 0.15))) {
    if (p.era === S.era) { snd.knifeWall({ x: nx, z: nz }); K.FX.sparks(nx, 1.1, nz, { n: 5, color: K.FXC[p.era].spark, speed: 2.5, up: 1.5, size: 0.12, dir: [-p.dx, -p.dz], cone: 1.2 }); }
    p.x -= p.dx * 0.25; p.z -= p.dz * 0.25; endProj(p, true); return;
  }
  p.x = nx; p.z = nz; p.dist += step;
  p.mesh.position.set(p.x, 1.1, p.z); p.ghost.position.copy(p.mesh.position);
  for (const f of K.enemies()) {
    if (!f.alive || f.era !== p.era || f.fall || p.hitSet.has(f)) continue;
    const r = (f.r || (f.kind === 'golem' ? K.GOLEM.r : f.kind === 'boss' ? K.BOSS.r : K.GUARD.r)) + PROJ.hitR;
    if (Math.hypot(f.x - p.x, f.z - p.z) < r) {
      p.hitSet.add(f);
      const go = hitFoe(p, f);
      if (!go) { endProj(p, true); return; }
    }
  }
  if (p.dist >= PROJ.range) endProj(p, true);
}
// 맞은 적: 등 뒤에서 맞으면 쓰러짐. 앞이면 튕겨 나가고 적이 이쪽을 돌아본다. 성채지기는 안 통함. 계속 날아가면 true
function hitFoe(p, f) {
  const K = T4.K, S = K.S;
  const fx = Math.sin(f.yaw || 0), fz = Math.cos(f.yaw || 0);
  const cosA = (-p.dx * fx + -p.dz * fz); // 적 앞쪽과 '날아온 쪽' 사이 각
  const behind = cosA < Math.cos(T4.st.backDeg * DEG);
  const pos = { x: f.x, z: f.z };
  if (f.kind === 'boss') { K.sfx.clang(pos); K.clangFx(f.x, f.z); if (p.era === S.era) K.toast($t('성채지기에겐 던진 것이 안 통해요'), 1.4); return false; }
  if (f.ext) {
    if (f.onThrown) { const r = f.onThrown({ behind, dx: p.dx, dz: p.dz, kind: p.kind }); return r === 'pierce'; }
    if (behind) { K.killed(f, 'back'); T4.lastThrowKill = true; K.toast($t('던져서 쓰러뜨렸어요'), 1.2); return !!(T4.st.pierce && ++p.hits <= 1); }
    f.stun = Math.max(f.stun || 0, 0.4); K.sfx.clang(pos); return false;
  }
  if (behind) {
    T4.lastThrowKill = true;
    K.killFoe(f, 'back');
    K.toast($t('던져서 쓰러뜨렸어요'), 1.2);
    return !!(T4.st.pierce && ++p.hits <= 1);
  }
  // 앞·옆: 튕겨 나가고 적이 날아온 쪽을 돌아본다 (의심이 크게 참)
  K.sfx.clang(pos); K.clangFx(f.x, f.z);
  f.yaw = Math.atan2(-p.dx, -p.dz);
  if (f.state !== 'alert') f.sus = Math.max(f.sus || 0, 0.75);
  if (p.era === S.era) K.toast($t('튕겼어요 — 등을 노려 던지세요'), 1.2);
  return false;
}
// 떨어진 단검 줍기, 다른 시대에 멈춘 화살 뽑기, 윤곽 보이기
function stepPickups() {
  const K = T4.K, S = K.S;
  for (let k = T4.drops.length - 1; k >= 0; k--) {
    const d = T4.drops[k];
    d.ghost.visible = d.era !== S.era && !S.ring;
    if (d.era === S.era && S.falling <= 0 && Math.hypot(d.x - S.p.x, d.z - S.p.z) < 0.75) {
      if (d.mesh.parent) d.mesh.parent.remove(d.mesh); if (d.ghost.parent) d.ghost.parent.remove(d.ghost);
      T4.drops.splice(k, 1);
      T4.ammo.knife = Math.min(T4.st.knives, T4.ammo.knife + 1);
      snd.pick(); changed('ammo');
    } else if (d.era === S.era) { d.t += 1 / 60; if (d.mesh.userData.glow) d.mesh.userData.glow.material.opacity = 0.3 + 0.2 * Math.sin(d.t * 5); }
  }
  for (const p of T4.proj) p.ghost.visible = p.era !== S.era && !S.ring;
  // 화살 줍기 장갑: 다른 시대에 멈춰 있는 화살(붉은 윤곽)에 닿으면 뽑아 온다 — 그 시대에서 그 화살은 사라진다
  if (T4.st.catch && T4.ammo.arrows < T4.st.ammoMax && S.falling <= 0 && !S.ring) {
    const arr = K.arrows || [];
    for (let k = arr.length - 1; k >= 0; k--) {
      const a = arr[k];
      if (a.era === S.era || Math.abs(a.x - S.p.x) > 0.55 || Math.abs(a.z - S.p.z) > 0.55) continue;
      removeArrow(a);
      T4.ammo.arrows++;
      K.toast(S.era === 'now' ? $t('어제에 멈춘 화살을 뽑았어요') : $t('멈춘 화살을 뽑았어요'), 1.4);
      snd.catch(); changed('ammo');
      break;
    }
  }
}
function removeArrow(a) {
  const arr = T4.K.arrows; const k = arr.indexOf(a); if (k >= 0) arr.splice(k, 1);
  if (a.mesh && a.mesh.parent) a.mesh.parent.remove(a.mesh);
  if (a.ghost && a.ghost.parent) a.ghost.parent.remove(a.ghost);
}

// ───────── 잔상 미끼 ─────────
function makeDecoyMesh(era, ghost) {
  const K = T4.K, THREE = K.THREE, g = new THREE.Group();
  const col = ghost ? '#ff7a6a' : era === 'past' ? '#ffd27a' : '#7fe8ff';
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: ghost ? 0.22 : 0.42, depthWrite: false, blending: THREE.AdditiveBlending, depthTest: !ghost });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 12), mat); body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat); head.position.y = 1.55;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 32).rotateX(-Math.PI / 2), mat); ring.position.y = 0.06;
  g.add(body, head, ring); g.userData.mat = mat;
  return g;
}
function dropDecoy(era) {
  const K = T4.K, S = K.S;
  clearDecoy();
  const d = { era, x: S.p.x, z: S.p.z, active: 0, hold: new Map() };
  d.mesh = makeDecoyMesh(era, false); d.mesh.position.set(d.x, 0, d.z); K.groups[era].add(d.mesh);
  d.ghost = makeDecoyMesh(era, true); d.ghost.position.set(d.x, 0, d.z); K.groups[K.other(era)].add(d.ghost);
  T4.decoy = d;
}
function clearDecoy() { const d = T4.decoy; if (!d) return; for (const m of [d.mesh, d.ghost]) if (m && m.parent) m.parent.remove(m); T4.decoy = null; }
function stepDecoy(dt) {
  const d = T4.decoy, K = T4.K, S = K.S; if (!d) return;
  d.ghost.visible = d.era !== S.era && !S.ring;
  if (d.active <= 0 || S.era !== d.era) return;
  d.active -= dt;
  const k = Math.min(1, d.active / 0.6);
  d.mesh.userData.mat.opacity = 0.42 * k * (0.75 + 0.25 * Math.sin(S.time * 9));
  for (const f of K.enemies()) {
    if (!f.alive || f.era !== d.era || f.kind === 'boss' || f.state === 'alert' || f.fall) continue;
    if (Math.hypot(f.x - d.x, f.z - d.z) > 7) continue;
    if (!d.hold.has(f)) d.hold.set(f, [f.x, f.z]);
    const [hx, hz] = d.hold.get(f); f.x = hx; f.z = hz;          // 서서
    const want = Math.atan2(d.x - f.x, d.z - f.z);               // 잔상 쪽을 본다
    let dd = want - f.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); f.yaw += dd * Math.min(1, dt * 10);
    if (f.holder) { f.holder.position.set(f.x, f.holder.position.y, f.z); f.holder.rotation.y = f.yaw; }
  }
  if (d.active <= 0) { clearDecoy(); changed('decoy'); }
}

// ───────── 그림자 걸음 ─────────
function shadowSlide(to) {
  const K = T4.K, S = K.S;
  const dx = Math.sin(S.face), dz = Math.cos(S.face);
  let best = 0;
  for (let d = 0.25; d <= 2.5 + 1e-6; d += 0.25) {
    const x = S.p.x + dx * d, z = S.p.z + dz * d;
    const i = K.cellOf(x), j = K.cellOf(z);
    if (!K.floorAt(to, i, j) || K.solid(to, i, j) || K.overlapSolids(to, x, z, K.PR * 0.9).length) break;
    if (K.enemies().some(f => f.alive && f.era === to && Math.hypot(f.x - x, f.z - z) < (f.r || 0.45) + K.PR)) break;
    best = d;
  }
  if (best < 0.5) return;
  const ox = S.p.x, oz = S.p.z;
  S.p.x += dx * best; S.p.z += dz * best; K.resolve();
  K.FX.dust(ox, 0.2, oz, { n: 8, color: K.FXC[to].dust, speed: 1.2, up: 0.5, size: 0.45, alpha: 0.4 });
  K.FX.motes(S.p.x, 0.5, S.p.z, { n: 10, color: K.FXC[to].glow, speed: 1.5, up: 1, life: 0.6, spread: 0.3 });
}

// ───────── 하트를 잃었을 때 (맞음·추락 둘 다): 되감기 태엽, 모래시계 심장 ─────────
function heartWatch() {
  const K = T4.K, S = K.S;
  if (T4.lastHearts == null) { T4.lastHearts = S.hearts; return; }
  if (S.hearts < T4.lastHearts && S.down) {
    if (S.down.kind === 'fall' && T4.room.feather > 0) { // 깃털 발목: 떨어짐(구덩이·물·무너진 바닥)만
      T4.room.feather--; S.hearts = Math.min(K.STAT.maxHearts, S.hearts + 1);
      K.toast('🪽 ' + $t('깃털 발목이 하트를 지켰어요'), 1.8); snd.spring(); changed('feather');
    } else if (T4.room.spring > 0) {
      T4.room.spring--; S.hearts++;
      K.toast('⏪ ' + $t('되감기 태엽이 하트를 지켰어요'), 1.8); snd.spring(); changed('spring');
    } else if (S.hearts <= 0 && T4.st.phoenix && !T4.run.phoenixUsed) {
      T4.run.phoenixUsed = true; S.hearts = Math.min(K.STAT.maxHearts, T4.st.phoenix);
      K.toast('💠 ' + $t('모래시계 심장이 깨지며 버텼어요'), 2.4); snd.phoenix(); K.screenFlash('#7fe8ff', 0.35); changed('phoenix');
    }
    K.drawHearts();
  }
  T4.lastHearts = S.hearts;
}

// ───────── 훅 ─────────
const live = () => T4.inv.length > 0; // 유물이 하나도 없으면 아무 일도 안 한다

EXT.on('init', K => { T4.K = K; apply(); });

EXT.on('roomLoad', (room, K) => {
  T4.proj = []; T4.drops = []; T4.decoy = null; T4.breathT = 0; T4.bootsT = 0; T4.catchT = 0;
  T4.lastThrowKill = false;
  T4.lastHearts = K.S.hearts;
  const st = T4.st || apply();
  T4.room = { shield: st.shield, spring: st.spring, boots: st.boots, catch: st.catch, beast: st.beast, spirit: st.spirit, feather: st.feather, id: room.id };
  T4.ammo.knife = st.knives; // 방에 들어오면 단검이 손에 돌아온다
  if (live()) { gateApply(); dynStats(); }
  else if (gateRoom) gateApply();
  changed('room');
});

EXT.on('shift', (from, to, K) => {
  if (!live()) return;
  const S = K.S, st = T4.st;
  const g = graining();
  if (st.strike !== 0.6 || g) S.shiftStrike = Math.max(S.shiftStrike, st.strike * (g ? 2 : 1));
  if (st.shockStun > 0.6) for (const f of K.enemies()) if (f.alive && f.era === to && f.kind !== 'boss' && Math.hypot(f.x - S.p.x, f.z - S.p.z) < K.GUARD.shock) f.stun = Math.max(f.stun || 0, st.shockStun);
  if (st.breath) { T4.breathT = st.breath; T4.breathSus = new Map(K.enemies().filter(f => f.alive && f.era === to).map(f => [f, f.sus || 0])); }
  if (st.shadow && (to === 'past' || st.shadow > 1)) shadowSlide(to);
  // 잔상 미끼: 떠난 시대에 남기고(쿨다운이 끝났을 때), 그 시대로 돌아오면 켜진다. 쿨다운은 켜질 때부터
  if (st.decoy) {
    const d = T4.decoy;
    if (d && d.era === to && !d.used) { d.active = st.decoy; d.used = true; d.hold = new Map(); T4.decoyCd = st.decoyCd; snd.decoy(); changed('decoy'); }
    else if (T4.decoyCd <= 0 && (!d || d.used) && (from === 'past' || st.decoyBoth)) dropDecoy(from);
  }
  dynStats();
});

EXT.on('beforeHurt', msg => {
  if (!live()) return undefined;
  const K = T4.K, S = K.S;
  // 무쇠 장화: 가시·칼날
  if (msg === MSG.spike() || msg === MSG.blade()) {
    if (T4.bootsT > 0) return false;
    if (T4.room.boots > 0) { T4.room.boots--; T4.bootsT = 1.5; K.toast('🥾 ' + $t('무쇠 장화가 버텼어요'), 1.4); snd.block(); changed('boots'); return false; }
  }
  // 화살 줍기 장갑: 맞을 화살을 잡는다
  if (msg === MSG.arrow() && T4.room.catch > 0 && T4.ammo.arrows < T4.st.ammoMax) {
    const a = (K.arrows || []).find(a => a.era === S.era && Math.abs(a.x - S.p.x) < K.PR + 0.2 && Math.abs(a.z - S.p.z) < K.PR + 0.2);
    if (a) removeArrow(a);
    T4.room.catch--; T4.ammo.arrows++;
    K.toast('🧤 ' + $t('화살을 잡았어요 — Q로 던지기'), 1.6); snd.catch(); changed('ammo');
    return false;
  }
  // 짐승 가죽 · 혼령 부적 (T2 적의 물기·닿기) — 방패보다 먼저 쓴다
  const kindMsg = T2MSG.find(([k, f]) => msg === f());
  if (kindMsg && T4.room[kindMsg[0]] > 0) {
    T4.room[kindMsg[0]]--; S.invuln = Math.max(S.invuln, 1.0);
    K.toast(kindMsg[0] === 'beast' ? '🐗 ' + $t('짐승 가죽이 막았어요') : '🧿 ' + $t('혼령 부적이 막았어요'), 1.4); snd.block(); changed(kindMsg[0]);
    if (kindMsg[0] === 'beast' && T4.st.beastStun) for (const f of K.enemies()) if (f.alive && f.era === S.era && Math.hypot(f.x - S.p.x, f.z - S.p.z) < 3) { f.stun = Math.max(f.stun || 0, T4.st.beastStun); f.wind = 0; }
    return false;
  }
  // 금 간 방패
  if (T4.room.shield > 0) {
    T4.room.shield--; S.invuln = Math.max(S.invuln, 1.0);
    K.toast('🛡️ ' + $t('방패가 막았어요'), 1.4); snd.shield(); K.screenFlash('#cfe8ff', 0.18);
    K.FX.sparks(S.p.x, 1.0, S.p.z, { n: 16, color: ['#e8f4ff', '#9fc8ff'], speed: 4, up: 2.5 });
    if (T4.st.shieldStun) for (const f of K.enemies()) if (f.alive && f.era === S.era && f.kind !== 'boss' && Math.hypot(f.x - S.p.x, f.z - S.p.z) < 3) { f.stun = Math.max(f.stun || 0, T4.st.shieldStun); f.wind = 0; }
    changed('shield');
    return false;
  }
  return undefined;
});

EXT.on('kill', (foe, how, K) => {
  const S = K.S;
  const thrown = T4.lastThrowKill; T4.lastThrowKill = false;
  if (T4.run.active) T4.run.kills++;
  if (T4.run.active || live()) addCoins(Math.round((foe.kind === 'boss' ? 8 : 1 + (T4.st ? T4.st.killCoins : 0)) * (T4.st ? T4.st.coinMul : 1)));
  if (!live()) return;
  const st = T4.st;
  if (st.sandKill && EXT.run && EXT.run.addSand) EXT.run.addSand(st.sandKill);
  if (foe.kind === 'boss') return;
  // 거꾸로 도는 모래시계: 연쇄
  if (st.chain && foe.era === S.era) { S.shiftCd = 0; S.shiftStrike = Math.max(S.shiftStrike, st.chain); }
  // 시간 파문
  if (st.ripple) for (const f of K.enemies()) if (f !== foe && f.alive && f.era === foe.era && f.kind !== 'boss' && Math.hypot(f.x - foe.x, f.z - foe.z) < 8) { f.stun = Math.max(f.stun || 0, st.ripple); f.wind = 0; }
  // 겹친 순간: 전환 기습(또는 그 창 안에서 찌른 것)이면 다른 시대의 같은 자리
  if (st.double && !T4.inDouble && !thrown && (how === 'shift' || S.shiftStrike > 0) && foe.era === S.era) {
    T4.inDouble = true;
    try {
      for (const f of K.enemies().slice()) {
        if (!f.alive || f.era === foe.era || f.kind === 'boss' || f.fall) continue;
        if (Math.hypot(f.x - foe.x, f.z - foe.z) > st.double) continue;
        K.killFoe(f, 'shift');
        K.toast('👥 ' + $t('두 시대에서 함께 쓰러뜨렸어요'), 1.8); snd.double();
        K.FX.motes(f.x, 1, f.z, { n: 24, color: K.FXC[f.era].glow, speed: 2.5, up: 2, life: 0.9 });
      }
    } finally { T4.inDouble = false; }
  }
});

EXT.on('cleared', (room, K) => {
  if (!live()) return;
  const st = T4.st;
  if (st.harvest >= 0 && K.S.alarms <= st.harvest && K.S.hearts < K.STAT.maxHearts) { K.S.hearts++; T4.lastHearts = K.S.hearts; K.drawHearts(); snd.heal(); setTimeout(() => K.toast('🌾 ' + $t('고요한 수확: 하트 +1'), 1.8), 2000); } // 바로 뒤에 main.js가 '출구가 열렸어요'를 띄우므로 그 뒤에
});

EXT.on('exit', (room, K) => {
  if (!T4.run.active) return;
  T4.run.rooms++;
  // 경보 없이 적을 다 잡고 나가면 금화 +2
  if (K.enemies().length && !K.S.alarms) addCoins(2);
});

EXT.on('stab', (tgt, info) => {
  if (!live() || !tgt || !tgt.alive) return undefined;
  const K = T4.K, st = T4.st;
  if (info.behind) return undefined;
  const fx = Math.sin(tgt.yaw || 0), fz = Math.cos(tgt.yaw || 0);
  const cosA = (info.tx * fx + info.tz * fz) / info.td;
  // 암살자의 눈은 성채지기엔 안 통한다 — 등 220°면 빙빙 돌며 옆구리만 찌르는 봇이 14초 만에 이겼다 (11/13)
  if (st.backDeg < 110 && tgt.kind !== 'boss' && cosA < Math.cos(st.backDeg * DEG)) {
    if (tgt.ext) return tgt.onStab ? tgt.onStab({ ...info, behind: true }) : undefined;
    const r = K.killFoe(tgt, 'back');
    return 'kill-back';
  }
  if (st.glass && tgt.kind !== 'boss' && tgt.state !== 'alert' && !tgt.ext) {
    K.killFoe(tgt, 'shift');
    K.toast('💎 ' + $t('유리 단검!'), 1.2);
    return 'kill-glass';
  }
  return undefined;
});

EXT.on('update', (dt, K) => {
  if (!live()) return;
  const S = K.S;
  T4.bootsT = Math.max(0, T4.bootsT - dt);
  if (T4.decoyCd > 0) { T4.decoyCd = Math.max(0, T4.decoyCd - dt); if (T4.decoyCd <= 0) changed('decoy'); }
  heartWatch();
  dynStats();
  // 멈춘 숨: 넘어온 뒤 잠깐은 의심이 차지 않는다
  if (T4.breathT > 0) {
    T4.breathT -= dt;
    for (const f of K.enemies()) if (f.alive && f.era === S.era && f.state !== 'alert' && f.sus != null) f.sus = Math.min(f.sus, T4.breathSus && T4.breathSus.has(f) ? T4.breathSus.get(f) : 0);
  }
  stepPickups();
  stepDecoy(dt);
});

EXT.on('frame', (dt, K) => {
  if (!live()) return;
  const S = K.S;
  if (S.down) heartWatch();
  // 바뀐 범위만큼 바닥 원을 키운다 (원 모양은 main.js가 처음 값으로 만들어 둠)
  const ks = K.GUARD.shock / (T4.base['GUARD.shock'] || K.GUARD.shock), kg = K.GOLEM.sense / (T4.base['GOLEM.sense'] || K.GOLEM.sense);
  if (ks !== 1) for (const g of K.guards) if (g.shockRing) g.shockRing.scale.multiplyScalar(ks); // 경비 원은 main.js가 매 프레임 1로 되돌림
  for (const g of K.golems) { if (g.shockRing) g.shockRing.scale.setScalar(ks); if (g.senseRing) g.senseRing.scale.setScalar(kg); } // 골렘 원은 안 되돌림
});

// Q = 던지기, 그 밖의 키는 ui.js
export function onThrowKey() { return throwIt(); }
