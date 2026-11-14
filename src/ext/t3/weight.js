// 누름판 → 무게 문 (t3-weight, 2차 11/15)
//  n  누름판 (그 그리드의 시대에 있음). 무언가 올라가 있는 동안만 눌린다:
//     그 시대의 나 · 상자(두 시대 같은 자리) · 그 시대의 적(메아리 포함 — EXT.t2.pressers) · 쓰러진 경비·골렘의 몸
//  N  무게 문 (그 그리드의 시대). 가장 가까운 누름판이 눌려 있는 동안 열리고, 떼면 0.5초(그 시대 시간) 뒤 닫힌다.
//     문 칸에 몸이 걸쳐 있으면 안 닫힌다(밀려 갇히지 않게)
// "떠난 시대는 멈춘다": 경비·메아리가 누름판 위에 있을 때 그 시대를 떠나면, 판은 눌린 채 멈추고 문도 열린 채 멈춘다.
// 경비를 누름판 위에서 쓰러뜨리면 그 몸이 판을 계속 누른다.
import { mech, put, mat, mesh, group, cpos, nearest, markDirty, toastOnce } from './core.js';
import { EXT } from '../../ext.js';
import { S3 } from './sfx3.js';

export const WEIGHT = { grace: 0.5 };
const T = 2;
const cellOf = v => Math.floor(v / T);
const inCell = (o, i, j) => cellOf(o.x) === i && cellOf(o.z) === j;

/** 판 위의 무게: 'me' | 'crate' | 'foe' | 'body' | null */
export function weighOn(p, k) {
  const S = k.S;
  if (S.era === p.era && S.falling <= 0 && !S.down && inCell(S.p, p.i, p.j)) return 'me';
  if (k.crates.some(c => c.i === p.i && c.j === p.j && !c.sunk)) return 'crate';
  const pr = EXT.t2 && EXT.t2.pressers ? EXT.t2.pressers(p.era) : [];
  if (pr.some(o => inCell(o, p.i, p.j))) return 'foe';
  for (const f of k.enemies()) {
    if (f.era !== p.era || !inCell(f, p.i, p.j) || f.kind === 't2-echo') continue;
    if (f.alive && !f.fall && !(f.fallT > 0)) return 'foe';
    if (!f.alive && (f.kind === 'guard' || f.kind === 'golem')) return 'body'; // 쓰러진 몸은 그 자리에 남는다
  }
  return null;
}

export default mech({
  id: 'weight',
  fresh: () => ({ plates: [], doors: [] }),
  count: d => d.plates.length + d.doors.length,
  chars: {
    n(d, E, i, j) { const p = { era: E, i, j, on: null, sink: 0 }; d.plates.push(p); put(E, i, j, { m: 'weight', k: 'plate', p }); return '.'; },
    N(d, E, i, j) { const o = { era: E, i, j, plate: null, open: false, grace: 0, a: 0 }; d.doors.push(o); put(E, i, j, { m: 'weight', k: 'door', o }); return '.'; },
  },
  solid(x, era) { if (x.k === 'door') return era === x.o.era ? !x.o.open : undefined; return undefined; },
  load(d, k) {
    for (const o of d.doors) o.plate = nearest(d.plates.filter(p => p.era === o.era), o.i, o.j) || nearest(d.plates, o.i, o.j);
    for (const p of d.plates) { p.on = weighOn(p, k); buildPlate(p, k); }
    for (const o of d.doors) { o.open = !!(o.plate && o.plate.on); o.a = o.open ? 1 : 0; buildDoor(o, k); }
  },
  update(d, dt, k) {
    const S = k.S;
    for (const p of d.plates) {
      if (S.era !== p.era) continue; // 떠난 시대의 판은 그 순간 그대로
      const w = weighOn(p, k);
      if (!!w !== !!p.on) {
        const q = cpos(p.i, p.j);
        if (w) { k.sfx.plate(q); k.FX.dustRing(q.x, q.z, 0.6, { n: 8, color: k.FXC[p.era].dust, speed: 1.4, alpha: 0.4 }); if (w === 'foe' || w === 'body') toastOnce('weight-foe', $t('누군가의 무게가 판을 누르고 있어요'), 2.2); }
        else S3.locked(q);
      }
      p.on = w;
    }
    for (const o of d.doors) {
      if (S.era !== o.era) continue;
      const pressed = !!(o.plate && o.plate.on), hold = k.overlapCell(o.i, o.j);
      if (pressed) o.grace = WEIGHT.grace;
      else o.grace = Math.max(0, o.grace - dt);
      const open = pressed || o.grace > 0 || (o.open && hold);
      if (open !== o.open) { o.open = open; markDirty(); const q = cpos(o.i, o.j); if (open) k.sfx.gateOpen(q); else k.sfx.gateClose(q); }
    }
  },
  frame(d, dt, k) {
    for (const p of d.plates) { p.sink += ((p.on ? 1 : 0) - p.sink) * Math.min(1, dt * 12); if (p.top) p.top.position.y = 0.02 - 0.07 * p.sink; if (p.glyph) p.glyph.material = p.on ? p.onM : p.offM; }
    for (const o of d.doors) { o.a += ((o.open ? 1 : 0) - o.a) * Math.min(1, dt * 9); if (o.bars) o.bars.position.y = 3.05 * o.a; if (o.weight) o.weight.position.y = 2.9 - 2.2 * o.a; }
  },
});

// ── 모습: 누름판 = 청동 테두리의 무거운 돌판(가운데 추 문양) / 무게 문 = 문틀 + 위로 들리는 창살 + 옆의 평형추
function buildPlate(p, k) {
  const THREE = k.THREE, q = cpos(p.i, p.j), E = p.era;
  const rim = mat(E, 'wrim', { color: E === 'past' ? '#b08a4a' : '#5a4636', roughness: 0.5, metalness: 0.6 });
  const stone = mat(E, 'wstone', { color: E === 'past' ? '#8f877c' : '#57534d', roughness: 0.9 });
  p.offM = mat(E, 'wglyphOff', { color: '#3a3128', roughness: 0.8 });
  p.onM = mat(E, 'wglyphOn', { color: '#ffd27a', emissive: '#ffae3a', emissiveIntensity: 1.6, roughness: 0.4 });
  const g = group(mesh(new THREE.BoxGeometry(1.7, 0.06, 1.7), rim, 0, 0.03, 0));
  const top = group(mesh(new THREE.BoxGeometry(1.45, 0.12, 1.45), stone, 0, 0.06, 0));
  const glyph = mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.04, 6), p.offM, 0, 0.13, 0); top.add(glyph);
  top.add(mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10), p.offM, 0, 0.3, 0)); // 추 고리
  g.add(top); g.position.set(q.x, 0, q.z);
  k.groups[E].add(g);
  p.top = top; p.glyph = glyph;
}
function buildDoor(o, k) {
  const E = o.era, i = o.i, j = o.j, cx = i * T + 1, z0 = j * T;
  const ew = k.isOpen(E, i, j - 1) || k.isOpen(E, i, j + 1);
  const g = group(k.makeMesh('doorway', E));
  const bars = k.makeMesh('bars', E); g.add(bars); o.bars = bars;
  const THREE = k.THREE, iron = mat(E, 'iron', { color: E === 'past' ? '#b08a4a' : '#5a4636', roughness: E === 'past' ? 0.45 : 0.95, metalness: E === 'past' ? 0.6 : 0.2 });
  const weight = group(mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), iron), mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), iron, 0, 0.95, 0));
  weight.position.set(1.15, 2.9, 0.15); g.add(weight); o.weight = weight;
  if (ew) g.position.set(cx, 0, z0 + T - 0.14); else { g.position.set(cx, 0, z0 + 1); g.rotation.y = Math.PI / 2; }
  k.groups[E].add(g);
}
