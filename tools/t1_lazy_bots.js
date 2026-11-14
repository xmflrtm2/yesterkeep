// T1 게으른 봇 — 런 방이 "생각 없이" 깨지는지 본다 (게임에는 안 들어감, tools/ 아래).
//   const L = (await import('/tools/t1_lazy_bots.js?' + Date.now())).default; L.suite({ floor: 1, type: 'combat', seeds: 8, sec: 60 })
// 봇은 __yk.step으로 시간을 흘린다(사람 반응 0.25초 흉내 없음 = 사람보다 빠름). 모래 규칙은 지킨다(모래가 없으면 어제로 못 감).
const Y = () => window.__yk;
const R = () => Y().ext.run;
const DT = 1 / 30;
const st = () => Y().state();
function foes() {
  const g = Y().guards().filter(x => x.alive).map(x => ({ ...x, era: 'past' }));
  const k = Y().golems().filter(x => x.alive).map(x => ({ ...x, era: 'now' }));
  return [...g, ...k];
}
function exitXZ() {
  const G = Y().grid('past');
  for (let j = 0; j < G.length; j++) { const i = G[j].indexOf('>'); if (i >= 0) return [i * 2 + 1, j * 2 + 1]; }
  return null;
}
function canShift() { const s = st(); return !(s.era === 'now' && R().sand() < R().SAND.enterMin); }
function shift() { if (canShift()) return Y().shift(); return 'nosand'; }
function walkTo(x, z, sec) { const s = st(); const dx = x - s.x, dz = z - s.z; if (Math.hypot(dx, dz) < 0.3) { Y().step(sec, DT); return; } Y().walk(dx, dz, sec); }
const done = () => !R().state || st().trans || R().state.phase === 'map' || Y().S.ended;

const BOTS = {
  idle(sec) { const t0 = Y().S.time; while (Y().S.time - t0 < sec && !done()) Y().step(0.5, DT); },
  // 0.5초마다 Shift, 출구 쪽으로 곧장 걷다가 2.2m 안에 적이 있으면 찌르기
  spam(sec) {
    const t0 = Y().S.time, ex = exitXZ();
    while (Y().S.time - t0 < sec && !done()) {
      shift();
      const s = st(); const f = foes().find(o => o.era === s.era && Math.hypot(o.x - s.x, o.z - s.z) < 2.2);
      if (f) { Y().stab(); Y().step(0.5, DT); } else walkTo(ex[0], ex[1], 0.5);
    }
  },
  // 빙빙 돌며 찌르기: 가장 가까운 적 둘레 1.8m를 돌면서 0.4초마다 찌르기, 다른 시대면 Shift (2차 안내의 "빙빙 돌기")
  circle(sec) {
    const t0 = Y().S.time, ex = exitXZ(); let ang = 0;
    while (Y().S.time - t0 < sec && !done()) {
      const s = st(), fs = foes();
      if (!fs.length) { walkTo(ex[0], ex[1], 0.3); continue; }
      fs.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
      const f = fs[0];
      if (f.era !== s.era) { if (shift() !== 'ok') walkTo(f.x, f.z, 0.3); continue; }
      ang += 1.1;
      walkTo(f.x + Math.cos(ang) * 1.8, f.z + Math.sin(ang) * 1.8, 0.2);
      Y().stab(); Y().step(0.2, DT);
    }
  },
  // 가장 가까운 적에게 곧장: 다른 시대면 Shift, 2m 안이면 찌르기(빙빙 돌기 없이)
  rush(sec) {
    const t0 = Y().S.time, ex = exitXZ();
    while (Y().S.time - t0 < sec && !done()) {
      const s = st(), fs = foes();
      if (!fs.length) { walkTo(ex[0], ex[1], 0.3); continue; }
      fs.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
      const f = fs[0];
      if (f.era !== s.era) { if (shift() !== 'ok') walkTo(f.x, f.z, 0.3); continue; }
      if (Math.hypot(f.x - s.x, f.z - s.z) < 2.0) { Y().stab(); Y().step(0.45, DT); } else walkTo(f.x, f.z, 0.3);
    }
  },
};

const M = {
  run(name, opts = {}) {
    const { floor = 1, type = 'combat', seed = 'lz' + Math.random(), sec = 60 } = opts;
    Y().pause(true);
    R()._dev.jump(floor, type, seed);
    const room = Y().S.room, n0 = foes().length, h0 = st().hearts, sand0 = R().sand();
    BOTS[name](sec);
    const ended = !R().state;
    return { bot: name, seed, room: room.name, enemies: n0, killed: n0 - foes().length, cleared: !ended && (R().state.phase === 'map' || !!st().trans),
      heartsLost: ended ? 'RUN OVER' : h0 - st().hearts, alarms: st().alarms, sandUsed: +(sand0 - R().sand()).toFixed(1), t: +(Y().S.time).toFixed(1) };
  },
  suite(opts = {}) {
    const { seeds = 8, bots = ['idle', 'spam', 'rush'] } = opts, out = [];
    for (const b of bots) for (let k = 0; k < seeds; k++) out.push(M.run(b, { ...opts, seed: 'lz' + k }));
    const sum = {};
    for (const r of out) { const s = sum[r.bot] = sum[r.bot] || { runs: 0, cleared: 0, runOver: 0, killed: 0, enemies: 0 }; s.runs++; if (r.cleared) s.cleared++; if (r.heartsLost === 'RUN OVER') s.runOver++; s.killed += r.killed; s.enemies += r.enemies; }
    return { sum, rows: out };
  },
};
export default M;
