// 시대를 건너 나르는 열쇠 (t3-key)
//  k  열쇠 (그 그리드의 시대에만 놓여 있다. 밟으면 줍기 → 들고 다른 시대로 갈 수 있다)
//  Z  자물쇠 문 (두 시대 같은 칸, 막힘). 어제 열쇠로 열면(E) 두 시대 모두 열린 채로 남는다. 오늘의 자물쇠는 녹슬어 안 열린다
//  (q = 물 바닥의 열쇠는 water.js가 등록)
// 열쇠는 문에 쓰면 사라진다. 문은 다시 잠기지 않는다 → 막다른 길이 생기지 않는다.
import { C, mech, both, mat, mesh, group, glow, cpos, onCell, busy, markDirty, toastOnce } from './core.js';
import { S3 } from './sfx3.js';
import { flooded } from './water.js';

const T = 2;
export default mech({
  id: 'key',
  fresh: () => ({ keys: [], locks: [] }),
  count: d => d.keys.length + d.locks.length,
  chars: {
    k(d, E, i, j) { d.keys.push({ era: E, i, j, got: false }); return '.'; },
    Z(d, E, i, j) { let l = d.locks.find(l => l.i === i && l.j === j); if (!l) { l = { i, j, open: false, a: 0, drop: 0 }; d.locks.push(l); } both(i, j, { m: 'key', k: 'lock', l }); return '.'; },
  },
  solid(x) { if (x.k === 'lock') return !x.l.open; return undefined; },
  load(d, k) { for (const l of d.locks) buildLock(l, k); for (const ky of d.keys) buildKey(ky, k); },
  update(d, dt, k) {
    const S = k.S;
    for (const ky of d.keys) {
      if (ky.got || busy() || S.era !== ky.era || !onCell(ky.i, ky.j)) continue;
      if (ky.under && ky.water && flooded(ky.water)) continue;
      ky.got = true; C.inv.key++;
      const p = cpos(ky.i, ky.j); S3.pick(p, 1.25);
      k.FX.motes(p.x, 0.7, p.z, { n: 22, color: ['#ffe9a8', '#ffffff', '#ffc65a'], speed: 2, up: 2, life: 1.0, size: 0.12 }); k.FX.flash(p.x, 1.0, p.z, '#ffe2a0', 3);
      k.toast($t('열쇠를 주웠어요 — 들고 다른 시대로 갈 수 있어요'), 2.6);
    }
  },
  frame(d, dt, k) {
    const t = k.S.time;
    for (const ky of d.keys) if (ky.mesh) { ky.mesh.visible = !ky.got; const base = ky.under ? -0.55 : 0.75; ky.mesh.position.y = base + Math.sin(t * 2.4 + ky.i) * (ky.under ? 0.02 : 0.08); ky.mesh.rotation.y += dt * (ky.under ? 0.3 : 1.6); }
    for (const l of d.locks) {
      l.a += ((l.open ? 1 : 0) - l.a) * Math.min(1, dt * 2.5);
      const e = l.a * l.a * (3 - 2 * l.a);
      for (const h of l.hinges || []) h.rotation.y = e * 1.75;
      if (l.open) l.drop = Math.min(1, l.drop + dt * 2.5);
      for (const pl of l.pads || []) { pl.position.y = 1.15 - 1.1 * l.drop * l.drop; pl.rotation.z = l.drop * 1.2; }
    }
  },
  targets(d, k) {
    const out = [];
    for (const l of d.locks) {
      if (l.open) continue;
      const p = cpos(l.i, l.j);
      if (k.S.era === 'past') out.push({ x: p.x, z: p.z, label: () => C.inv.key > 0 ? $t('E 자물쇠 열기') : $t('잠긴 문 — 열쇠가 필요해요'), act: () => unlock(l, k) });
      else out.push({ x: p.x, z: p.z, label: () => $t('E 잠긴 문 (녹슮)'), act: () => { S3.locked(p); k.toast(C.inv.key > 0 ? $t('오늘의 자물쇠는 녹슬어 열쇠가 안 들어가요 — 어제의 자물쇠에 꽂아 보세요') : $t('오늘의 자물쇠는 녹슬었어요'), 2.8); return 'rusted'; } });
    }
    return out;
  },
});

function unlock(l, k) {
  const p = cpos(l.i, l.j);
  if (C.inv.key <= 0) { S3.locked(p); k.toast($t('열쇠가 없어요'), 1.6); return 'nokey'; }
  C.inv.key--; l.open = true; markDirty();
  S3.unlock(p);
  k.FX.sparks(p.x, 1.1, p.z, { n: 10, color: ['#ffe9a8', '#ffc65a'], speed: 2.5, up: 2, size: 0.12 });
  setTimeout(() => k.FX.dust(p.x, 2.4, p.z, { n: 12, color: k.FXC.past.dust, speed: 0.8, up: -0.4, size: 0.5, g: 3, life: 1.2 }), 200);
  toastOnce('unlock', $t('문이 열렸어요 — 오늘까지 열린 채로 남아요'), 2.4);
  return 'unlocked';
}

function buildLock(l, k) {
  const THREE = k.THREE, i = l.i, j = l.j, cx = i * T + 1, z0 = j * T;
  l.hinges = []; l.pads = [];
  for (const E of ['past', 'now']) {
    const ew = k.isOpen(E, i, j - 1) || k.isOpen(E, i, j + 1);
    const g = group(k.makeMesh('doorway', E));
    const hinge = group(k.makeMesh('door', E)); hinge.position.set(0.89, 0, 0); g.add(hinge);
    const gold = mat(E, 'padlock', { color: E === 'past' ? '#d9a93e' : '#6a5130', roughness: E === 'past' ? 0.3 : 0.9, metalness: E === 'past' ? 0.8 : 0.3 });
    const pad = group(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.12), gold), mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12, Math.PI), gold, 0, 0.15, 0), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 6).rotateX(Math.PI / 2), mat(E, 'keyhole', { color: '#111', roughness: 1 }), 0, -0.02, 0.01));
    pad.position.set(-0.89, 1.15, 0.12); hinge.add(pad); l.pads.push(pad);
    if (ew) g.position.set(cx, 0, z0 + T - 0.14); else { g.position.set(cx, 0, z0 + 1); g.rotation.y = Math.PI / 2; }
    k.groups[E].add(g); l.hinges.push(hinge);
  }
}
function buildKey(ky, k) {
  const THREE = k.THREE, p = cpos(ky.i, ky.j), E = ky.era;
  if (ky.under) ky.water = (C.d.water && C.d.water.water.find(w => w.era === E && w.i === ky.i && w.j === ky.j)) || null; // 물이 빠져야 주울 수 있음
  const gold = mat(E, 'key', { color: '#ffd166', emissive: '#a8741c', emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.9 });
  const g = group(mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 18), gold, 0, 0, 0), mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8).rotateZ(Math.PI / 2), gold, 0.38, 0, 0), mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), gold, 0.52, -0.08, 0), mesh(new THREE.BoxGeometry(0.06, 0.1, 0.05), gold, 0.42, -0.06, 0));
  g.rotation.x = 0.3;
  const holder = group(g, glow('#ffd88a', ky.under ? 1.0 : 1.5, ky.under ? 0.45 : 0.6));
  holder.position.set(p.x, 0.75, p.z);
  k.groups[E].add(holder);
  ky.mesh = holder;
}
