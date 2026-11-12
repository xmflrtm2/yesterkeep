// 개발용: 사람처럼 키를 눌러 노는 플레이 도구 (게임에는 안 들어감)
//   const P = (await import('/src/dev/play.js')).default; await P.ready();
//   P.room('ambush'); P.moveTo(21, 7); P.shift(); P.react(); P.stab(); P.log()
// 실제 KeyboardEvent를 보내므로 입력 경로가 사람이 누를 때와 같다. 시간은 __yk.step(고정 1/60초)으로만 흐른다.
const Y = () => window.__yk;
const ev = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
const held = new Set();
function setKeys(codes) {
  for (const c of [...held]) if (!codes.includes(c)) { ev('keyup', c); held.delete(c); }
  for (const c of codes) if (!held.has(c)) { ev('keydown', c); held.add(c); }
}
const P = {
  RT: 0.25,          // 사람 반응 시간(초)
  jitter: 0.25,      // 목표 위치 오차(m)
  events: [],
  async ready() { const t0 = performance.now(); while (!(Y() && Y().ready()) && performance.now() - t0 < 40000) await new Promise(r => setTimeout(r, 200)); Y().pause(true); return Y().ready(); },
  room(id) { setKeys([]); this.events = []; Y().room(id); Y().step(0.2); return this.st(); },
  st() { const s = Y().state(); return { era: s.era, x: s.x, z: s.z, cell: s.cell, hearts: s.hearts, alarms: s.alarms, kills: s.kills, left: s.guardsLeft, past: s.pastTime, trans: s.trans, falling: s.falling, hurts: s.hurts }; },
  wait(sec) { Y().step(sec); },
  react() { Y().step(this.RT); },
  tap(code) { ev('keydown', code); ev('keyup', code); held.delete(code); Y().step(1 / 60); },
  shift() { const before = Y().state().era; this.tap('ShiftLeft'); const r = Y().state().era !== before ? 'ok' : 'no'; this.events.push(['shift', r, Y().state().era]); return r; },
  stab() { this.tap('KeyJ'); this.events.push(['stab']); },
  roll() { this.tap('Space'); },
  /** 8방향 키로 (x, z)m까지 걷는다. 사람처럼 약간 빗나간 목표로. 반환: 도착했는지 */
  moveTo(x, z, { tol = 0.35, max = 8, exact = false, until = null } = {}) {
    const j = exact ? 0 : this.jitter;
    const tx = x + (Math.random() - 0.5) * 2 * j, tz = z + (Math.random() - 0.5) * 2 * j;
    let t = 0;
    while (t < max) {
      const s = Y().state();
      if (until && until(s)) break;
      const dx = tx - s.x, dz = tz - s.z;
      if (Math.hypot(dx, dz) < tol) { setKeys([]); return true; }
      const keys = [];
      if (dx > 0.15) keys.push('KeyD'); else if (dx < -0.15) keys.push('KeyA');
      if (dz > 0.15) keys.push('KeyS'); else if (dz < -0.15) keys.push('KeyW');
      setKeys(keys); Y().step(1 / 20); t += 1 / 20;
    }
    setKeys([]);
    return false;
  },
  /** 셀 중심으로 */
  moveCell(i, j, o) { return this.moveTo(i * 2 + 1, j * 2 + 1, o); },
  /** 지금 시대에서 서 있을 수 있는 칸만 밟는 길(너비 우선)로 (i, j) 칸까지 걷는다 */
  goCell(i, j, o = {}) {
    const s = Y().state(), era = s.era, si = s.cell[0], sj = s.cell[1];
    const ok = (a, b) => { const c = Y().cell(a, b, era); return c.floor && !c.solid; };
    const key = (a, b) => a + ',' + b, prev = new Map([[key(si, sj), null]]), q = [[si, sj]];
    while (q.length) {
      const [a, b] = q.shift();
      if (a === i && b === j) break;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (!prev.has(key(na, nb)) && ok(na, nb)) { prev.set(key(na, nb), [a, b]); q.push([na, nb]); } }
    }
    if (!prev.has(key(i, j))) return false;
    const path = []; for (let c = [i, j]; c; c = prev.get(key(c[0], c[1]))) path.unshift(c);
    for (const [a, b] of path.slice(1)) if (!this.moveTo(a * 2 + 1, b * 2 + 1, { tol: 0.45, max: 3, exact: true, until: o.until })) return o.until ? true : false;
    return true;
  },
  /** 조건이 될 때까지 기다림(최대 max초) */
  waitUntil(fn, max = 15, dt = 0.05) { let t = 0; while (t < max && !fn()) { Y().step(dt); t += dt; } return t < max ? +t.toFixed(2) : null; },
  log() { return { ...this.st(), events: this.events.slice(-12), guards: Y().guards() }; },
  // ── 성채지기(보스) 시험용 ──
  boss() { return Y().boss(); },
  bossDist() { const b = Y().boss(), s = Y().state(); return Math.hypot(b.x - s.x, b.z - s.z); },
  /** 보스(또는 멈춘 윤곽) 옆을 돌아 등 뒤 d m 자리로. side: +1 왼쪽으로 / -1 오른쪽으로 */
  circleBehind(side = 1, d = 1.7, max = 2.5) {
    const b = Y().boss(), y = b.yawDeg * Math.PI / 180, fx = Math.sin(y), fz = Math.cos(y), px = -fz * side, pz = fx * side;
    this.moveTo(b.x + px * 2.3 + fx * 0.3, b.z + pz * 2.3 + fz * 0.3, { exact: true, max: max / 2, tol: 0.5 });
    this.moveTo(b.x + px * 1.6 - fx * d, b.z + pz * 1.6 - fz * d, { exact: true, max: max / 2, tol: 0.5 });
    this.moveTo(b.x - fx * d, b.z - fz * d, { exact: true, max: 0.8, tol: 0.35 });
    return this.st();
  },
};
window.__play = P;
export default P;
