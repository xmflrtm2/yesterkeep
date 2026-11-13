// 회전 다리 — 떠난 시대에 멈추는 톱니 다리 (t3-turn)
//  +  축 (두 시대 같은 칸, 늘 바닥). 네 이웃 칸(그리드에는 구덩이 _ 로 그림)이 다리 팔이다
//     어제: 다리가 남북 1.6초 → 0.7초 동안 돎 → 동서 1.6초 → … (어제에 있을 때만 시간이 감, 돌기 0.45초 전 주황으로 깜빡)
//     오늘: 녹슨 다리가 '어제 떠난 그 순간'의 방향 그대로 멈춰 있다 → 원하는 방향일 때 어제를 떠나면 오늘 그 길로 건넌다
//     돌고 있는 순간에 떠나면 오늘 다리는 비스듬히 걸려 어느 쪽으로도 못 건넌다(축 칸만 바닥)
// 어제로 돌아가면 다시 돌기 시작하므로 막다른 상태가 생기지 않는다.
import { mech, both, put, at, mat, mesh, group, cpos, toastOnce } from './core.js';
import { S3 } from './sfx3.js';

export const TURN = { hold: 1.6, rot: 0.7, warn: 0.45 };
const P = 2 * (TURN.hold + TURN.rot);
const ease = t => t * t * (3 - 2 * t);
/** 시간 t → { ori: 'z'(남북) | 'x'(동서) | null(도는 중), ang(라디안), warn(돌기 직전) } */
export function turnState(t) {
  const p = ((t % P) + P) % P, H = TURN.hold, R = TURN.rot;
  if (p < H) return { ori: 'z', ang: 0, warn: p > H - TURN.warn };
  if (p < H + R) return { ori: null, ang: ease((p - H) / R) * Math.PI / 2, warn: false };
  if (p < 2 * H + R) return { ori: 'x', ang: Math.PI / 2, warn: p > 2 * H + R - TURN.warn };
  return { ori: null, ang: Math.PI / 2 + ease((p - 2 * H - R) / R) * Math.PI / 2, warn: false };
}

export default mech({
  id: 'turn',
  fresh: () => ({ tables: [] }),
  count: d => d.tables.length,
  chars: {
    '+'(d, E, i, j, room) {
      let tb = d.tables.find(t => t.i === i && t.j === j);
      if (!tb) {
        const ph = room.turnPhase != null ? room.turnPhase : 0;
        tb = { i, j, t: ph, st: turnState(ph), last: null, warned: false }; d.tables.push(tb);
        for (const [di, dj, ax] of [[-1, 0, 'x'], [1, 0, 'x'], [0, -1, 'z'], [0, 1, 'z']]) for (const E2 of ['past', 'now']) if (!at(E2, i + di, j + dj)) put(E2, i + di, j + dj, { m: 'turn', k: 'arm', tb, ax });
      }
      both(i, j, { m: 'turn', k: 'pivot', tb });
      return '.';
    },
  },
  floor(x) { if (x.k === 'pivot') return true; if (x.k === 'arm') return x.tb.st.ori === x.ax; return undefined; },
  load(d, k) { for (const tb of d.tables) buildTable(tb, k); },
  update(d, dt, k) {
    if (k.S.era !== 'past') return; // 오늘에 있는 동안 어제의 다리는 멈춰 있다
    for (const tb of d.tables) {
      tb.t += dt;
      const st = turnState(tb.t), p = cpos(tb.i, tb.j);
      if (st.warn && !tb.warned) { tb.warned = true; S3.warn(p); }
      if (!st.warn) tb.warned = false;
      if (tb.st.ori && !st.ori) S3.gear(p); // 돌기 시작
      tb.st = st;
    }
  },
  frame(d, dt, k) {
    for (const tb of d.tables) {
      for (const pl of tb.planks || []) pl.rotation.y = tb.st.ang;
      const w = tb.st.warn && k.S.era === 'past' ? 0.5 + 0.5 * Math.sin(k.S.time * 30) : 0;
      if (tb.warnM) tb.warnM.emissiveIntensity = w * 1.6;
      for (const g of tb.gears || []) g.rotation.y = tb.st.ang * 2;
    }
  },
  shift(d, from, to, k) {
    if (to !== 'now') return;
    for (const tb of d.tables) if (!tb.st.ori) toastOnce('turn-diag', $t('다리가 도는 중에 떠나서 비스듬히 멈췄어요'), 2.2);
  },
});

function buildTable(tb, k) {
  const THREE = k.THREE, p = cpos(tb.i, tb.j);
  tb.planks = []; tb.gears = [];
  for (const E of ['past', 'now']) {
    const brass = mat(E, 'brass', { color: E === 'past' ? '#c9a24e' : '#5c4834', roughness: E === 'past' ? 0.35 : 0.95, metalness: E === 'past' ? 0.75 : 0.2 });
    const gear = group(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 20), brass, 0, -0.02, 0));
    for (let n = 0; n < 12; n++) { const tth = mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2), brass, Math.cos(n * Math.PI / 6) * 0.95, -0.02, Math.sin(n * Math.PI / 6) * 0.95); tth.rotation.y = -n * Math.PI / 6; gear.add(tth); }
    gear.position.set(p.x, -0.12, p.z);
    k.groups[E].add(gear); tb.gears.push(gear);
    const plank = group();
    const deck = k.makeMesh('bridge', E); deck.scale.set(0.74, 1, 6 / 4.05); deck.position.y = -0.09;
    plank.add(deck);
    if (E === 'past') {
      tb.warnM = mat('past', 'warnEdge', { color: '#5a3a1c', emissive: '#ff8a1a', emissiveIntensity: 0, roughness: 0.8 });
      for (const sx of [-0.78, 0.78]) plank.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 5.9), tb.warnM, sx, 0.02, 0)); // 가장자리 (돌기 직전 주황으로)
    } else {
      for (let n = 0; n < 3; n++) plank.add(mesh(new THREE.DodecahedronGeometry(0.1, 0), mat('now', 'rubble', { color: '#555049', roughness: 1 }), (n - 1) * 0.4, 0.05, (n - 1) * 1.6));
    }
    plank.position.set(p.x, 0, p.z); plank.rotation.y = tb.st.ang;
    k.groups[E].add(plank); tb.planks.push(plank);
  }
}
