// 개발용: 실시간으로 성채지기와 싸우는 봇 (게임에는 안 들어감). 게임 시간을 건너뛰지 않고 진짜 화면 속도로 키를 누른다
// → 크롬에서 이펙트가 움직이는 모습·프레임·오류를 눈으로 보며 시험하고 녹화할 때.
//   const L = (await import('/src/dev/live-bot.js')).default; L.start(); ... L.status()
// 풀이는 boss-bots.js의 parry와 같다: 내려찍기·천장 예고에 0.25초 반응 → Shift(시간 회피) → 멈춘 윤곽 등 뒤로 → 도착하면 찌르기.
// 휘두르기 고리는 굴러서, 돌진·땅 가르기 줄은 옆으로 비킨다. 무너진 돌 원 안이면 걸어 나간다.
const Y = () => window.__yk;
const RT = 0.25;
const held = new Set();
const ev = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code === 'ShiftLeft' ? 'Shift' : code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
function keys(codes) {
  for (const c of [...held]) if (!codes.includes(c)) { ev('keyup', c); held.delete(c); }
  for (const c of codes) if (!held.has(c)) { ev('keydown', c); held.add(c); }
}
function tap(code) { ev('keydown', code); ev('keyup', code); held.delete(code); }
function toward(tx, tz, tol = 0.35) {
  const s = Y().state(), dx = tx - s.x, dz = tz - s.z;
  if (Math.hypot(dx, dz) < tol) { keys([]); return true; }
  const k = [];
  if (dx > 0.15) k.push('KeyD'); else if (dx < -0.15) k.push('KeyA');
  if (dz > 0.15) k.push('KeyS'); else if (dz < -0.15) k.push('KeyW');
  keys(k); return false;
}
const now = () => performance.now() / 1000;
const L = {
  mode: 'idle', since: 0, seen: 0, timer: 0, log: [], hits: 0, parries: 0, t0: 0, hearts0: 5, hurts0: 0, deaths: 0, lastHearts: 5, result: null,
  fps: { frames: 0, last: 0, samples: [], min: 99, raf: 0 }, peak: { points: 0, rocks: 0 },
  set(m) { this.mode = m; this.since = now(); },
  note(s) { this.log.push(`${(now() - this.t0).toFixed(1)}:${s}`); if (this.log.length > 60) this.log.shift(); },
  start({ maxSec = 150 } = {}) {
    this.stop(); this.t0 = now(); this.maxSec = maxSec; this.result = null; this.log = []; this.hits = 0; this.parries = 0; this.deaths = 0;
    this.hurts0 = Y().state().hurts; this.lastHearts = Y().state().hearts; this.peak = { points: 0, rocks: 0 };
    Y().pause(false); this.set('bait');
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.note('ERR ' + e.message); } }, 33);
    // 프레임 세기 (1초마다)
    const F = this.fps; F.frames = 0; F.last = now(); F.samples = []; F.min = 99;
    const loop = () => { F.frames++; const t = now(); if (t - F.last >= 1) { const f = F.frames / (t - F.last); F.samples.push(+f.toFixed(1)); F.min = Math.min(F.min, f); F.frames = 0; F.last = t; } F.raf = requestAnimationFrame(loop); };
    F.raf = requestAnimationFrame(loop);
  },
  stop() { clearInterval(this.timer); this.timer = 0; keys([]); cancelAnimationFrame(this.fps.raf); },
  finish(r) { if (this.result) return; this.result = r; this.note('END ' + r); this.stop(); },
  status() {
    const s = Y().state(), b = Y().boss(), f = this.fps.samples;
    return { result: this.result, sec: +(now() - this.t0).toFixed(1), mode: this.mode, bossHp: b && b.hp, hits: this.hits, parries: this.parries, hurts: s.hurts - this.hurts0, deaths: this.deaths,
      fps: { avg: f.length ? +(f.reduce((a, x) => a + x, 0) / f.length).toFixed(1) : null, min: f.length ? +Math.min(...f).toFixed(1) : null, last: f.slice(-5) }, peak: this.peak, log: this.log.slice(-14) };
  },
  tick() {
    const Yk = Y(), s = Yk.state(), b = Yk.boss();
    if (!b || b === 'pending') return;
    const fs = window.__fx && window.__fx.stats(); if (fs) { this.peak.points = Math.max(this.peak.points, fs.points); this.peak.rocks = Math.max(this.peak.rocks, fs.rocks); }
    if (s.hearts > this.lastHearts) { this.deaths++; this.note('restart'); this.set('bait'); }
    this.lastHearts = s.hearts;
    if (!b.alive) { keys([]); if (now() - this.since > 0.1 && this.mode !== 'won') { this.set('won'); this.note('boss down'); setTimeout(() => this.finish('win'), 2500); } return; }
    if (now() - this.t0 > this.maxSec) { this.finish('timeout'); return; }
    const t = now(), same = b.era === s.era, dx = s.x - b.x, dz = s.z - b.z, dist = Math.hypot(dx, dz);
    const y = b.yawDeg * Math.PI / 180, fx = Math.sin(y), fz = Math.cos(y), dot = (dx * fx + dz * fz) / Math.max(dist, 0.01);
    const front = dot > Math.cos(65 * Math.PI / 180), behind = dot < Math.cos(110 * Math.PI / 180);
    const other = s.era === 'past' ? 'now' : 'past', pitThere = !Yk.cell(s.cell[0], s.cell[1], other).floor;
    const away = (d = 3.4) => toward(b.x + dx / Math.max(dist, 0.01) * d, b.z + dz / Math.max(dist, 0.01) * d, 0.5);
    switch (this.mode) {
      case 'circle': { // 시간 회피 뒤: 멈춘 윤곽 옆을 돌아 등 뒤로
        const px = -fz, pz = fx, side = (dx * px + dz * pz) >= 0 ? 1 : -1;
        const bx = b.x - fx * 1.7, bz = b.z - fz * 1.7;
        if (!behind && dist < 3.2) toward(b.x + px * side * 2.4 - fx * 0.6, b.z + pz * side * 2.4 - fz * 0.6, 0.6);
        else toward(bx, bz, 0.3);
        if (same) this.set('strike');
        if (t - this.since > 3) this.set('bait');
        return;
      }
      case 'strike': {
        if (behind && b.hurtCd <= 0 && dist < 3) { tap('KeyJ'); this.hits++; this.note('stab hp' + b.hp + (b.sweep ? ' sw' : '') + (b.wind > 0 ? ' w' : '') + (b.rec > 0 ? ' r' : '') + ' d' + dist.toFixed(1)); this.set('retreat'); return; }
        toward(b.x - fx * 1.6, b.z - fz * 1.6, 0.3);
        if (t - this.since > 1.3) { this.note('late'); this.set('retreat'); }
        return;
      }
      case 'retreat': away(3.6); if (t - this.since > 0.7) this.set('bait'); return;
      case 'side': if (t - this.since > 0.55) this.set('bait'); return;
      case 'won': return;
    }
    // bait: 앞 2m쯤에서 공격을 부르고, 예고를 보면 0.25초 뒤 대응
    if (!same || b.fall) { keys([]); return; }
    const rock = (b.rocks || []).find(r => s.era === 'now' && Math.hypot(r.x - s.x, r.z - s.z) < 1.7 && r.t < 1.2);
    const threat = b.sweep === 'wind' ? 'sweep' : b.charge === 'tele' ? 'charge' : b.wind > 0 ? b.kind : rock ? 'rock' : null;
    if (threat && !this.seen) this.seen = t;
    if (!threat) this.seen = 0;
    if (threat && t - this.seen >= RT) {
      this.seen = 0;
      if (threat === 'sweep') { away(3.6); tap('Space'); this.note('roll sweep'); return; }
      if (threat === 'charge' || threat === 'fissure') {
        const px = -fz, pz = fx, sgn = Math.random() < 0.5 ? 1 : -1;
        toward(s.x + px * sgn * 2.6, s.z + pz * sgn * 2.6, 0.2); this.note('side ' + threat); this.set('side'); return;
      }
      if (threat === 'rock') { toward(rock.x + (s.x - rock.x) * 3, rock.z + (s.z - rock.z) * 3, 0.2); this.note('rock out'); this.set('side'); return; }
      if ((threat === 'slam' && front) || threat === 'quake') {
        if (pitThere) { away(3.6); tap('Space'); this.note('pit under me'); return; }
        tap('ShiftLeft'); this.parries++; this.note('parry ' + threat); this.set('circle'); return;
      }
    }
    if (!threat) toward(b.x + fx * 2.1, b.z + fz * 2.1, 0.45);
  },
};
window.__live = L;
export default L;
