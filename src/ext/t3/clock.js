// 태엽 문 — 어제 쓴 시간만큼만 열려 있는 문 (t3-clock)
//  F  태엽 손잡이 (두 시대 같은 칸, 막힘). 어제 E를 누르고 있는 동안 감긴다(1초에 1초, 최대 5초)
//  H  태엽 문 (오늘 그리드). 감긴 태엽이 남아 있는 동안 열린다. 태엽은 오늘에 있을 때만 풀린다(어제로 가면 그 순간에 멈춤)
//     문 칸에 몸이 걸쳐 있는 동안은 닫히지 않는다(밀려 갇히지 않게). 가장 가까운 손잡이에 묶임
// 다시 감으면 되므로 막다른 상태가 생기지 않는다.
import { C, mech, put, both, mat, mesh, group, cpos, dist, busy, nearest, markDirty, toastOnce, HUDX, nearestTarget } from './core.js';
import { S3 } from './sfx3.js';

export const SPRING = { max: 5, rate: 1.0 };
const T = 2;
export default mech({
  id: 'clock',
  fresh: () => ({ cranks: [], doors: [] }),
  count: d => d.cranks.length + d.doors.length,
  chars: {
    F(d, E, i, j) { let c = d.cranks.find(c => c.i === i && c.j === j); if (!c) { c = { i, j, spring: 0, rot: 0, click: 0, tick: 0, winding: false }; d.cranks.push(c); } both(i, j, { m: 'clock', k: 'crank', c }); return '.'; },
    H(d, E, i, j) { const o = { era: E, i, j, a: 0, c: null, open: false }; d.doors.push(o); put(E, i, j, { m: 'clock', k: 'door', o }); return '.'; },
  },
  solid(x, era) {
    if (x.k === 'crank') return true;
    if (x.k === 'door') return era === 'now' && x.o.era === 'now' ? !(x.o.c && x.o.c.spring > 0) : true;
    return undefined;
  },
  load(d, k) {
    for (const o of d.doors) o.c = nearest(d.cranks, o.i, o.j);
    for (const c of d.cranks) buildCrank(c, k);
    for (const o of d.doors) buildDoor(o, k);
  },
  update(d, dt, k) {
    const S = k.S;
    for (const c of d.cranks) {
      c.winding = false;
      if (S.era === 'past') {
        // 감기: E를 누르고 있고, 가장 가까운 E 대상이 이 손잡이일 때
        const t = nearestTarget();
        if (C.eHeld && !busy() && t && t.crank === c) {
          const before = c.spring;
          c.spring = Math.min(SPRING.max, c.spring + dt * SPRING.rate); c.winding = c.spring > before;
          if (c.winding) { c.rot += dt * 7; c.click -= dt; if (c.click <= 0) { c.click = 0.16; S3.ratchet(cpos(c.i, c.j)); } }
          if (before <= 0 && c.spring > 0) markDirty();
        }
      } else if (c.spring > 0) {
        // 풀리기 (오늘에서만). 문 칸에 몸이 걸쳐 있으면 0.01초에서 멈춤
        const hold = d.doors.some(o => o.c === c && o.era === 'now' && k.overlapCell(o.i, o.j));
        c.spring = Math.max(hold ? Math.min(c.spring, 0.01) : 0, c.spring - dt);
        c.rot -= dt * 2.5;
        c.tick -= dt; if (c.tick <= 0) { c.tick = 0.5; for (const o of d.doors) if (o.c === c) S3.tick(cpos(o.i, o.j)); }
        if (c.spring <= 0) markDirty();
      }
    }
    for (const o of d.doors) {
      const open = o.era === 'now' && !!o.c && o.c.spring > 0;
      if (open !== o.open) { const p = cpos(o.i, o.j); if (open) k.sfx.gateOpen(p); else k.sfx.gateClose(p); if (o.era === S.era) k.FX.dust(p.x, 0.2, p.z, { n: 8, color: k.FXC[o.era].dust, speed: 1.2, up: 1, size: 0.5 }); o.open = open; }
    }
    // 화면 위: 가장 가까운 손잡이의 태엽 (감겨 있을 때만)
    const c = d.cranks.filter(c => c.spring > 0).sort((a, b) => dist(cpos(a.i, a.j).x, cpos(a.i, a.j).z) - dist(cpos(b.i, b.j).x, cpos(b.i, b.j).z))[0];
    HUDX.spring = c ? { t: c.spring, max: SPRING.max, frozen: S.era !== 'now' } : null;
  },
  frame(d, dt, k) {
    for (const c of d.cranks) for (const g of c.gears || []) g.rotation.z = c.rot;
    for (const o of d.doors) {
      o.a += ((o.open ? 1 : 0) - o.a) * Math.min(1, dt * 10);
      if (o.bars) o.bars.position.y = -3.05 * o.a;
      if (o.hand && o.c) o.hand.rotation.z = -(o.c.spring / SPRING.max) * Math.PI * 2;
    }
  },
  targets(d, k) {
    const out = [];
    for (const c of d.cranks) {
      const p = cpos(c.i, c.j);
      if (k.S.era === 'past') out.push({ crank: c, x: p.x, z: p.z, label: () => $t('E 길게 눌러 태엽 감기') + (c.spring > 0 ? ' · ' + $t('{0}초', c.spring.toFixed(1)) : ''), act: () => { toastOnce('wind', $t('누른 만큼 감겨요 = 오늘 문이 열리는 시간'), 2.6); return 'wind'; } });
      else out.push({ crank: c, x: p.x, z: p.z, label: () => $t('E 태엽 (녹슮)'), act: () => { S3.locked(p); k.toast($t('녹슨 태엽 — 어제 감은 만큼 오늘 열려요'), 2.6); return 'rusted'; } });
    }
    return out;
  },
});

function buildCrank(c, k) {
  const THREE = k.THREE, p = cpos(c.i, c.j);
  c.gears = [];
  for (const E of ['past', 'now']) {
    const brass = mat(E, 'brass', { color: E === 'past' ? '#c9a24e' : '#5c4834', roughness: E === 'past' ? 0.35 : 0.95, metalness: E === 'past' ? 0.75 : 0.2 });
    const wood = mat(E, 'wheelwood', { color: E === 'past' ? '#8a5a2b' : '#4a3a2c', roughness: 0.85 });
    const g = group(mesh(new THREE.BoxGeometry(0.7, 1.3, 0.55), wood, 0, 0.65, 0));
    const gear = group(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16).rotateX(Math.PI / 2), brass));
    for (let n = 0; n < 10; n++) { const tth = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), brass, Math.cos(n * Math.PI / 5) * 0.55, Math.sin(n * Math.PI / 5) * 0.55, 0); tth.rotation.z = n * Math.PI / 5; gear.add(tth); }
    const arm = mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), brass, 0, 0.3, 0.1); gear.add(arm);
    gear.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8).rotateX(Math.PI / 2), wood, 0, 0.6, 0.22));
    gear.position.set(0, 1.0, 0.36);
    g.add(gear); g.position.set(p.x, 0, p.z);
    k.groups[E].add(g); c.gears.push(gear);
  }
}
function buildDoor(o, k) {
  const THREE = k.THREE, E = o.era, i = o.i, j = o.j, cx = i * T + 1, z0 = j * T;
  const ew = k.isOpen(E, i, j - 1) || k.isOpen(E, i, j + 1);
  const g = group(k.makeMesh('doorway', E));
  const bars = k.makeMesh('bars', E); g.add(bars); o.bars = bars;
  // 문틀 위 시계판: 바늘이 남은 태엽만큼 돈다
  const face = mesh(new THREE.CircleGeometry(0.42, 24), mat(E, 'clockface', { color: E === 'past' ? '#efe2c0' : '#9a9282', roughness: 0.8 }), 0, 3.15, 0.16);
  const rim = mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 24), mat(E, 'brass', { color: E === 'past' ? '#c9a24e' : '#5c4834', roughness: 0.5, metalness: 0.6 }), 0, 3.15, 0.17);
  const hand = group(mesh(new THREE.BoxGeometry(0.05, 0.34, 0.03), mat(E, 'hand', { color: '#2a1e14', roughness: 0.6 }), 0, 0.15, 0)); hand.position.set(0, 3.15, 0.2);
  g.add(face, rim, hand); o.hand = hand;
  if (ew) g.position.set(cx, 0, z0 + T - 0.14); else { g.position.set(cx, 0, z0 + 1); g.rotation.y = Math.PI / 2; }
  k.groups[E].add(g);
}
