// T4 2차 (11/15): T2 적·T3 장치와 얽힌 유물의 동작, 저주, 런 경제(퍼즐·정예·문지기 금화).
// 유물이 없으면 아무것도 안 바꾼다(T2 적의 설정값도 그대로). 정의(이름·설명·수치)는 items.js 맨 아래.
import { EXT } from '../../ext.js';
import { T4, put, addCoins, changed } from './core.js';
import { byId } from './items.js';
import { snd } from './sfx.js';
import { SPRING } from '../t3/clock.js';
import { trace } from '../t3/light.js';
import { C as T3C, at as t3at } from '../t3/core.js';
import { SAND as T1SAND } from '../t1-run.js';

const t2foes = () => (EXT.t2 && EXT.t2.foes ? EXT.t2.foes() : []);
const live = () => T4.inv.length > 0;

// ───────── T2 사람 적(방패병·석궁병·마법사)의 설정값: 적마다 f.cfg 가 그 적의 설정 객체 ─────────
// 처음 고칠 때 원래 값을 f.t4b에 적어 두고, 유물이 없어지면 그 값으로 되돌린다
function t2Tune() {
  const st = T4.st; if (!st) return;
  const ident = !st.shieldReact && !st.shieldHear && st.aimMul === 1 && st.foeSpeed === 1;
  for (const f of t2foes()) {
    if (!f.cfg || (ident && !f.t4b)) continue;
    const c = f.cfg, b = f.t4b || (f.t4b = { react: c.react, hear: c.hear, aim: c.aim, closeAim: c.closeAim, walk: c.walk, run: c.run });
    if (f.kind === 't2-shield') { c.react = b.react + st.shieldReact; c.hear = Math.max(1, b.hear - st.shieldHear); }
    if (f.kind === 't2-xbow') { c.aim = b.aim * st.aimMul; c.closeAim = b.closeAim * st.aimMul; }
    if (b.walk != null) c.walk = b.walk * st.foeSpeed;
    if (b.run != null) c.run = b.run * st.foeSpeed;
  }
}
// T3 태엽: 감는 속도·최대 (SPRING은 T3가 매번 읽는다)
function springApply() {
  const st = T4.st; if (!st) return;
  put(SPRING, 'rate', 'T3SPRING', st.springRate);
  put(SPRING, 'max', 'T3SPRING', 1, st.springMax ? st.springMax - 5 : 0);
}
T4.listeners.add(why => { if (why === 'give' || why === 'take' || why === 'upgrade' || why === 'reset' || why === 'restore') { t2Tune(); springApply(); } });
EXT.on('roomLoad', () => { t2Tune(); springApply(); moon.segs = null; moon.t = 0; });

// ───────── 사냥개: 시대를 따라오는 시간 + ─────────
EXT.on('shift', () => {
  if (!live() || !T4.st.follow) return;
  for (const f of t2foes()) if (f.kind === 't2-hound' && f.follow && !f.follow.t4) { f.follow.t += T4.st.follow; f.follow.T += T4.st.follow; f.follow.t4 = true; }
});

// ───────── 저주 '금 간 심장': 맞으면 하트 하나 더 (떨어짐은 hurt가 아니라서 1개) ─────────
// 저주 '얇은 오늘'도: 오늘에서 맞을 때만. 오늘 +40% 걸음에 어제 −20%뿐일 땐 오늘에서 판을 짜고 어제로 넘어가 찌르는 흐름에
// 대가가 거의 없었다(11/15 직접 플레이: 쌍둥이 간수의 땅울림 띠(6.5m/s)보다 빨리 달아나 하트 하나 안 잃고 1층을 넘김)
EXT.on('hurt', (msg, K) => {
  if (!live() || !(T4.st.glassHeart || (T4.st.thinHurt && K.S.era === 'now'))) return;
  K.S.hearts = Math.max(0, K.S.hearts - 1); K.drawHearts();
});

// ───────── 처치: 깊은 잠 · 정예 사냥꾼 · 짐승 길들이기 · 밤샘 ─────────
EXT.on('kill', (foe, how, K) => {
  if (!live()) return;
  const st = T4.st;
  if (st.revDelay) for (const m of t2foes()) if (m.kind === 't2-mage' && m.alive && m.revT) m.revT.set(foe, -st.revDelay);
  if (st.eliteHunt && foe.elite) {
    addCoins(st.eliteHunt > 1 ? 6 : 4);
    if (K.S.hearts < K.STAT.maxHearts) { K.S.hearts++; T4.lastHearts = K.S.hearts; K.drawHearts(); }
    if (st.eliteHunt > 1 && EXT.run && EXT.run.addSand) EXT.run.addSand(3, 't4');
    setTimeout(() => K.toast('🏹 ' + $t('정예 사냥: 금화와 하트'), 1.6), 1200);
  }
  if (st.houndCoins && foe.kind === 't2-hound') addCoins(st.houndCoins);
  if (st.mageSand && foe.kind === 't2-mage' && EXT.run && EXT.run.addSand) EXT.run.addSand(st.mageSand, 't4');
});

// ───────── 달빛 칼날: 오늘의 달빛 줄기(T3 거울 장치) 위에 선 적을 묶는다 ─────────
const moon = { segs: null, t: 0 };
function moonSegs(K) {
  const d = T3C.d && T3C.d.light;
  if (!d || !d.windows || !d.windows.length || T3C.room !== K.S.room) return null;
  const blocks = (i, j) => { const c = K.ch('now', i, j); if (c === '|' || c === 'G') return false; if (c === '#') return true; const x = t3at('now', i, j); if (x && x.k === 'bed') return x.b.planted; return K.solid('now', i, j); };
  try { return trace(d, m => m.o, blocks).segs; } catch (e) { return null; }
}
const segDist = (x, z, [x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L)); return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)); };
EXT.on('update', (dt, K) => {
  if (!live() || !T4.st.moonEdge) return;
  moon.t -= dt;
  if (moon.t <= 0) { moon.t = 0.25; moon.segs = moonSegs(K); }
  if (!moon.segs || !moon.segs.length) return;
  for (const f of K.enemies()) {
    if (!f.alive || f.era !== 'now' || f.kind === 'boss' || (f.fall && f.kind !== 't2-wraith')) continue;
    // 망령은 시간 충격·멈칫을 안 먹는다(T2가 매 프레임 stun을 0으로) → 달빛에 들어오면 흩어진다
    if (f.kind === 't2-wraith') { if (moon.segs.some(s => segDist(f.x, f.z, s) < 0.85)) moonDisperse(K, f); continue; }
    if (moon.segs.some(s => segDist(f.x, f.z, s) < 0.85)) {
      if (!(f.moonT > 0)) K.FX.motes(f.x, 1.2, f.z, { n: 10, color: ['#dff2ff', '#9fd0ff'], speed: 1.2, up: 1.5, life: 0.7, size: 0.1 });
      f.stun = Math.max(f.stun || 0, 0.35); f.wind = 0; f.moonT = 0.4;
    } else if (f.moonT > 0) f.moonT -= dt;
  }
});
function moonDisperse(K, f) {
  K.killed(f, 'moon');
  for (const o of [f.mk && f.mk.g, f.ghost, f.kill, f.killFill]) if (o) o.visible = false;
  K.FX.motes(f.x, 1.0, f.z, { n: 50, color: ['#dff2ff', '#9fd0ff', '#ffffff'], speed: 4, up: 2.5, life: 1.2 });
  K.toast('🌕 ' + $t('달빛이 망령을 흩었어요'), 1.8); snd.double();
}
// II: 묶인 적은 앞에서 찔러도 한 방
EXT.on('stab', (tgt, info) => {
  if (!live() || T4.st.moonEdge < 2 || !tgt || !tgt.alive || info.behind || !(tgt.moonT > 0) || tgt.kind === 'boss' || tgt.ext) return undefined;
  T4.K.killFoe(tgt, 'shift'); T4.K.toast('🌕 ' + $t('달빛에 묶인 적을 쓰러뜨렸어요'), 1.4);
  return 'kill-moon';
});

// ───────── 늦게 선 경비의 처치 모래 (T1) ─────────
// 경비 모델은 첫 방 뒤에 받는다(core: ec719d3). 그 전에 경비 방에 들어오면 경비가 늦게 서는데, T1은 방을 불러올 때 적 수를 세어
// (R.enemies0) 그만큼만 처치 모래를 준다 → 늦게 선 경비는 모래가 없었다. 그 경비들 몫을 T4가 T1과 같은 값(SAND.kill)으로 채운다
const late = { watch: false, room: null, n: 0, paid: 0 };
EXT.on('roomLoad', (room, K) => {
  late.watch = !!K.S.guardPending;
  if (late.room !== room.id) { late.room = null; late.n = 0; late.paid = 0; }
  else for (const g of K.guards) g.t4late = true; // 같은 방을 다시 시작해도 T1은 다시 안 센다
});
EXT.on('update', (dt, K) => {
  if (!late.watch || K.S.guardPending) return;
  late.watch = false;
  if (K.guards.length) { late.room = K.S.room && K.S.room.id; late.n = K.guards.length; late.paid = 0; for (const g of K.guards) g.t4late = true; }
});
EXT.on('kill', foe => {
  if (!foe.t4late || late.paid >= late.n || !EXT.run || !EXT.run.addSand || !(EXT.run.active && EXT.run.active())) return;
  const node = EXT.run.node && EXT.run.node(); if (!node || node.kind !== 'node') return;
  late.paid++; EXT.run.addSand(T1SAND.kill, 'kill');
});

// ───────── 런 경제: 퍼즐 방·정예·문지기도 금화 (T1 roomClear) ─────────
// 전투 방은 처치 +1 · 경보 없이 +2(core.js exit). 퍼즐 방엔 적이 없어 금화가 하나도 없었다 → +3. 정예 +3, 문지기 +6
export const CLEAR_COINS = { puzzle: 3, elite: 3, guard: 6 };
EXT.on('roomClear', (room, m) => {
  if (!T4.run.active || !m) return;
  const n = CLEAR_COINS[m.type] || 0;
  if (n) addCoins(n);
});

// ───────── 저주 ─────────
// 런 끝 기억 배수: 저주마다 +25%(왕관 +50%)
export function memMul() { let k = 1; for (const e of T4.inv) { const it = byId(e.id); if (it && it.kind === 'curse') k += it.memBonus || 0.25; } return k; }
export const cursed = () => T4.inv.filter(e => (byId(e.id) || {}).kind === 'curse').map(e => e.id);
