// T2 몬스터 시험 봇 (게임에는 안 들어감 — tools/ 아래). tools/t2_check.py가 화면 없는 크롬에서 부른다.
//   const B = (await import('/tools/t2_bots.js?' + Date.now())).default; await B.ready();
//   B.solve('t2-hound-pit')  → 의도한 풀이 (조각마다 아래 SOLVE)
//   B.lazy('t2-hound-pit', 'spam' | 'circle' | 'idle', sec) → 게으른 풀이: 이걸로 쉽게 깨지면 너무 쉬운 것
// 실제 키 이벤트(play.js)로 움직이고 시간은 __yk.step(1/60)으로만 흐른다(사람 반응 0.25초). 순간이동 안 씀.
import P from '/src/dev/play.js';

const Y = () => window.__yk;
const K = () => Y().ext.K;
const S = () => Y().S;
const st = () => Y().state();
const C2 = i => i * 2 + 1;
const OTHER = { past: 'now', now: 'past' };
const foes = kind => K().extFoes.filter(f => f.kind === kind);
const foe = (kind, n = 0) => foes(kind)[n];
const ev = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
const required = () => K().enemies().filter(g => g.alive && !g.optional);
const log = [];
const note = (...a) => { log.push([+S().time.toFixed(2), ...a]); };

function hold(code, sec) { ev('keydown', code); Y().step(sec); ev('keyup', code); Y().step(1 / 60); }
function tapE() { ev('keydown', 'KeyE'); ev('keyup', 'KeyE'); Y().step(1 / 30); }
function ensureEra(e) { for (let k = 0; k < 3 && st().era !== e; k++) { P.shift(); Y().step(0.1); } return st().era === e; }
function shiftNow() { const r = P.shift(); note('shift', st().era); return r; }
function strike(rt = P.RT) { Y().step(rt); P.stab(); note('stab'); Y().step(0.45); }
/** (x, z)m까지: 지금 시대의 칸 길(BFS)로 가서 마지막은 정확히 */
function goXZ(x, z, o = {}) {
  const ok = P.goCell(Math.floor(x / 2), Math.floor(z / 2), o);
  if (o.until && o.until(st())) return true;
  P.moveTo(x, z, { exact: true, tol: o.tol || 0.25, max: 2, until: o.until });
  return ok;
}
/** 적 f의 다른 시대에서 그 등 뒤 d m로 가서 넘어와 찌르기 */
function behindStrike(f, d = 2.0, rt) {
  ensureEra(OTHER[f.era]);
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
  goXZ(f.x - fx * d, f.z - fz * d);
  shiftNow(); strike(rt);
  return !f.alive;
}
/** 다른 시대에서 적 곁(아무 쪽, 두 시대 모두 설 수 있는 자리) d m로 가서 넘어와 찌르기 (시간 충격) */
function nearStrike(f, d = 2.0) {
  const e = OTHER[f.era]; ensureEra(e);
  let best = null, bd = 1e9; const s = st();
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = f.x + Math.sin(a) * d, z = f.z + Math.cos(a) * d, i = Math.floor(x / 2), j = Math.floor(z / 2);
    if (!K().stand(e, i, j) || !K().stand(f.era, i, j)) continue;
    const back = Math.cos(a - f.yaw) < -0.3 ? -3 : 0; // 등 쪽이면 더 좋다
    const c = Math.hypot(x - s.x, z - s.z) + back;
    if (c < bd) { bd = c; best = [x, z]; }
  }
  if (!best) return false;
  goXZ(best[0], best[1]);
  shiftNow(); strike();
  return !f.alive;
}
/** 출구로: 가는 동안 앞에 쥐 같은 게 있으면 찌른다 */
function goExit(i, j, era) {
  if (era) ensureEra(era);
  const until = s => s.trans || s.ended;
  for (let k = 0; k < 6 && !until(st()); k++) {
    const near = K().enemies().find(g => g.alive && g.era === st().era && !g.fall && Math.hypot(g.x - st().x, g.z - st().z) < 1.6);
    if (near) { P.stab(); Y().step(0.45); }
    P.goCell(i, j, { until: s => until(s) || K().enemies().some(g => g.alive && g.era === s.era && !g.fall && g.kind === 't2-rat' && Math.hypot(g.x - s.x, g.z - s.z) < 1.4) });
    if (!until(st())) Y().step(0.3);
  }
  return until(st());
}
const onBand = (f, x0, x1) => f.alive && f.x > x0 && f.x < x1;

/* ───────── 조각마다 의도한 풀이 ───────── */
const SOLVE = {
  't2-hound-pit'() {
    const h = foe('t2-hound');
    goXZ(C2(4), C2(4)); shiftNow();
    P.goCell(9, 4); P.waitUntil(() => h.state === 'alert', 3);
    P.goCell(3, 4, { until: s => s.x < 9.6 && onBand(h, 10.4, 16) });
    P.waitUntil(() => onBand(h, 10.4, 16), 4);
    Y().step(0.1); shiftNow(); P.waitUntil(() => !h.alive, 2.5);
    return goExit(13, 4, 'past');
  },
  't2-shield-wall'() { behindStrike(foe('t2-shield'), 2.1); return goExit(13, 3); },
  't2-xbow-hall'() {
    goXZ(C2(7), C2(1)); shiftNow(); P.goCell(11, 1); shiftNow();
    nearStrike(foe('t2-xbow'));
    return goExit(15, 7);
  },
  't2-mimic-corridor'() {
    ensureEra('past'); goXZ(C2(7), C2(4) + 0.5); hold('KeyW', 0.7); hold('KeyW', 0.7);
    goXZ(C2(7), C2(3)); ensureEra('now'); return goExit(13, 3); // 오늘엔 (7,2)가 벽이라 복도 칸으로 물러나서 바꾼다
  },
  't2-nest-den'() {
    ensureEra('past'); const n = foe('t2-nest'); goXZ(n.x - 1.3, n.z); tapE();
    return goExit(13, 1, 'now');
  },
  't2-echo-gate'() {
    P.goCell(2, 1); P.goCell(12, 4); shiftNow();
    P.waitUntil(() => S().gateT > 0, 15); Y().step(0.15);
    P.goCell(12, 6); return goExit(13, 7);
  },
  't2-wraith-crypt'() {
    ensureEra('past'); const w = foe('t2-wraith'); goXZ(w.x, w.z, { tol: 0.3 }); shiftNow();
    return goExit(13, 7);
  },
  't2-mage-court'() {
    goXZ(15.2, 14.6); shiftNow(); strike();
    for (const k of [1, 0]) { const g = K().guards[k]; if (g.alive) behindStrike(g, 2.0); }
    return goExit(15, 1);
  },
  't2-shield-xbow'() {
    nearStrike(foe('t2-xbow')); behindStrike(foe('t2-shield'), 2.1);
    return goExit(15, 7);
  },
  't2-hound-mage'() {
    const h = foe('t2-hound'), m = foe('t2-mage');
    ensureEra('past'); P.goCell(4, 6); P.waitUntil(() => h.state === 'alert', 3);
    P.goCell(10, 5, { until: s => s.x > 18.6 && onBand(h, 12.4, 18) });
    P.waitUntil(() => onBand(h, 12.4, 18), 4); shiftNow(); P.waitUntil(() => !h.alive, 2.5);
    nearStrike(m);
    return goExit(15, 9);
  },
  't2-mimic-bridge'() {
    ensureEra('past'); goXZ(C2(5), C2(4) + 0.5); hold('KeyW', 0.7);
    ensureEra('now'); nearStrike(foe('t2-xbow'));
    return goExit(15, 1);
  },
  't2-rats-golem'() {
    P.goCell(1, 1); P.goCell(14, 1);
    behindStrike(K().guards[0], 2.0);
    ensureEra('past'); const n = foe('t2-nest'); goXZ(n.x, n.z - 1.3); tapE();
    const g = K().golems[0]; if (g.alive) behindStrike(g, 2.0);
    return goExit(15, 1, 'now');
  },
  't2-echo-wraith'() {
    ensureEra('past'); const w = foe('t2-wraith'); goXZ(w.x, w.z, { tol: 0.3 }); shiftNow(); // 망령
    const e = foe('t2-echo');
    if (e.out) behindStrike(e, 1.8);
    else { ensureEra('past'); P.waitUntil(() => e.out, 4); Y().step(0.6); behindStrike(e, 1.8); }
    return goExit(13, 1);
  },
  't2-elite-court'() {
    goXZ(15.2, 14.6); shiftNow(); strike();
    behindStrike(foe('t2-shield'), 1.9);
    for (const g of K().guards) if (g.alive) behindStrike(g, 2.0);
    return goExit(15, 1);
  },
  't2-elite-pack'() {
    const hs = foes('t2-hound');
    ensureEra('past'); P.goCell(4, 4); P.waitUntil(() => hs.every(h => h.state === 'alert'), 3);
    for (let round = 0; round < 6 && hs.some(h => h.alive); round++) {
      ensureEra('past');
      P.goCell(12, 4, { until: s => s.x > 20 && hs.some(h => onBand(h, 14.4, 20)) });
      P.waitUntil(() => hs.some(h => onBand(h, 14.4, 20)), 5);
      shiftNow(); Y().step(1.2);
      // 오늘로 따라와 곁에 있으면 다시 어제로 피해 처음부터
      if (hs.some(h => h.alive && h.era === 'now' && Math.hypot(h.x - st().x, h.z - st().z) < 6)) { P.goCell(14, 1); }
    }
    return goExit(15, 7);
  },
};

/* ───────── 게으른 풀이 ───────── */
function exitOf(room) { for (const E of ['now', 'past']) for (let j = 0; j < room[E].length; j++) { const i = room[E][j].indexOf('>'); if (i >= 0) return [i, j]; } return null; }
const LAZY = {
  // 0.5초마다 Shift, 출구 쪽으로 걷고, 1.8m 안 적은 찌른다
  spam(sec) {
    const [ei, ej] = exitOf(S().room), t0 = S().time; let nextShift = 0;
    const T = () => S().time - t0;
    while (T() < sec && !st().trans && !st().ended) {
      const a = S().time;
      if (T() >= nextShift) { P.tap('ShiftLeft'); nextShift = T() + 0.5; }
      const near = K().enemies().find(g => g.alive && g.era === st().era && !g.fall && Math.hypot(g.x - st().x, g.z - st().z) < 1.8);
      if (near) P.tap('KeyJ');
      // 출구 쪽으로(출구가 안 열렸으면 그 둘레를 서성임). 시간은 꼭 흐르게
      const w = Math.sin(T() * 1.3) * 3;
      P.moveTo(C2(ei) + w, C2(ej) + Math.cos(T() * 1.7) * 2, { exact: true, max: 0.25, tol: 0.4 });
      const used = S().time - a; if (used < 0.25) Y().step(0.25 - used);
    }
  },
  // Shift 없이(그 시대에 적이 없을 때만 바꿈) 가장 가까운 적 둘레를 돌며 찌르기
  circle(sec) {
    let t = 0, side = 1;
    while (t < sec && !st().trans && !st().ended) {
      const s = st(), here = required().filter(g => g.era === s.era && !g.fall);
      if (!here.length) {
        if (required().length) { P.tap('ShiftLeft'); Y().step(0.3); t += 0.3; continue; }
        const [ei, ej] = exitOf(S().room); P.goCell(ei, ej, { until: x => x.trans || x.ended }); break;
      }
      const g = here.reduce((a, b) => (Math.hypot(a.x - s.x, a.z - s.z) < Math.hypot(b.x - s.x, b.z - s.z) ? a : b));
      const a = Math.atan2(s.x - g.x, s.z - g.z) + side * 0.9;
      P.moveTo(g.x + Math.sin(a) * 1.8, g.z + Math.cos(a) * 1.8, { exact: true, max: 0.3, tol: 0.3 });
      const dx = st().x - g.x, dz = st().z - g.z, d = Math.hypot(dx, dz);
      if (d < 2.6 && (dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw)) / Math.max(d, 0.01) < -0.3) { P.tap('KeyJ'); Y().step(0.4); t += 0.4; }
      if (Math.random() < 0.03) side = -side;
      t += 0.3;
    }
  },
  idle(sec) { Y().step(sec); },
};

const B = {
  log,
  async ready() { await P.ready(); return true; },
  open(id) { Y().hold(false); P.room(id); Y().step(0.3); log.length = 0; S().roomFails = 0; this.h0 = 0; return st(); },
  report(id, bot, t0) {
    const s = st(), all = K().enemies(), req = all.filter(g => !g.optional);
    return { id, bot, cleared: !!(s.trans || s.ended), time: +(S().time - t0).toFixed(1), hurts: S().hurts - this.hurt0, falls: S().falls - this.fall0, deaths: this.deaths,
      left: req.filter(g => g.alive).map(g => g.kind), alarms: s.alarms, past: s.pastTime, log: log.slice(-14) };
  },
  run(id, fn) {
    this.open(id);
    const t0 = S().time; this.hurt0 = S().hurts; this.fall0 = S().falls; this.deaths = 0;
    // 하트를 다 잃으면 방이 다시 시작된다 → 세어 둔다
    const hk = Y().ext.on('hurt', () => { if (S().hearts <= 0) this.deaths++; });
    try { fn(); } catch (e) { note('error', String(e).slice(0, 200)); }
    const hs = Y().ext.hooks.hurt; hs.splice(hs.indexOf(hk), 1);
    return this.report(id, fn.botName || 'solve', t0);
  },
  solve(id) { const f = SOLVE[id]; if (!f) return { id, error: 'no solve' }; f.botName = 'solve'; return this.run(id, f); },
  lazy(id, bot, sec = 60) { const f = () => LAZY[bot](sec); f.botName = bot; return this.run(id, f); },
  ids: () => Object.keys(SOLVE),
};
window.__t2bots = B;
export default B;
