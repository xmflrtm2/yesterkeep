// 씨앗 → 나무 (t3-seed)
//  o  돌 화단 (두 시대 같은 칸, 늘 막힘 — 옆 칸에서 심는다). 어제 씨앗을 심으면 오늘 그 자리에 큰 나무가 서서 달빛을 가린다.
//     심지 않은 화단은 낮아서 달빛이 넘어간다
//     (11/13 직접 플레이: 처음엔 흙 칸을 밟을 수 있고 나무만 막혔더니, 흙에 붙어 서서 심고 오늘로 가면 줄기 칸에 걸려 막혔다 → 화단 자체를 막힘으로)
//  v  뿌리 자리 (오늘 그리드, 기본은 구덩이). 4방향으로 이어진 v 무리가 닿은 화단에 나무가 자라면 뿌리 다리가 된다
//  e  마른 씨앗 주머니 (밟으면 줍기). 보통 오늘의 폐허에 둔다 → 오늘 주워 어제 심는다
// 심은 씨앗은 어제 다시 캘 수 있다(씨앗이 손으로 돌아옴) → 되돌릴 수 없는 상태가 생기지 않는다.
import { C, mech, put, both, mat, gmat, mesh, group, glow, ghostObj, cpos, onCell, busy, toastOnce, markDirty } from './core.js';
import { S3 } from './sfx3.js';

const planted = v => v.beds.some(b => b.planted);

export default mech({
  id: 'seed',
  fresh: () => ({ beds: [], vines: [], pouches: [] }),
  count: d => d.beds.length + d.pouches.length,
  chars: {
    o(d, E, i, j) { let b = d.beds.find(b => b.i === i && b.j === j); if (!b) { b = { i, j, planted: false, grow: 0 }; d.beds.push(b); } both(i, j, { m: 'seed', k: 'bed', b }); return '.'; },
    v(d, E, i, j) { if (E === 'now') { const v = { i, j, beds: [] }; d.vines.push(v); put('now', i, j, { m: 'seed', k: 'vine', v }); } return '_'; },
    e(d, E, i, j) { d.pouches.push({ era: E, i, j, got: false }); return '.'; },
  },
  solid(x) { if (x.k === 'bed') return true; return undefined; },
  floor(x, era) { if (x.k === 'vine' && era === 'now' && planted(x.v)) return true; return undefined; },
  load(d, k) {
    // 뿌리 무리: 4방향으로 이어진 v 칸들 → 무리에 닿은 흙
    const key = (i, j) => i + ',' + j, vm = new Map(d.vines.map(v => [key(v.i, v.j), v])), seen = new Set();
    for (const v of d.vines) {
      if (seen.has(key(v.i, v.j))) continue;
      const comp = [], q = [v]; seen.add(key(v.i, v.j));
      while (q.length) { const a = q.pop(); comp.push(a); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = vm.get(key(a.i + di, a.j + dj)); if (n && !seen.has(key(n.i, n.j))) { seen.add(key(n.i, n.j)); q.push(n); } } }
      const beds = d.beds.filter(b => comp.some(a => Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1));
      for (const a of comp) a.beds = beds;
    }
    for (const b of d.beds) buildBed(b, k);
    for (const v of d.vines) buildVine(v, d, k);
    for (const p of d.pouches) buildPouch(p, k);
  },
  update(d, dt, k) {
    const S = k.S;
    for (const p of d.pouches) {
      if (p.got || busy() || S.era !== p.era || !onCell(p.i, p.j)) continue;
      p.got = true; C.inv.seed++;
      const q = cpos(p.i, p.j); S3.pick(q, 0.8);
      k.FX.motes(q.x, 0.6, q.z, { n: 18, color: ['#d8f5a0', '#ffffff', '#9be070'], speed: 1.8, up: 1.8, life: 0.9, size: 0.12, spread: 0.2 });
      k.toast($t('마른 씨앗 — 어제의 화단에 심어 보세요'), 2.8);
    }
  },
  frame(d, dt, k) {
    const t = k.S.time;
    for (const b of d.beds) {
      b.grow += ((b.planted ? 1 : 0) - b.grow) * Math.min(1, dt * 6);
      if (b.sapling) { b.sapling.visible = b.grow > 0.02; b.sapling.scale.setScalar(Math.max(0.01, b.grow)); b.sapling.rotation.z = Math.sin(t * 1.7 + b.i) * 0.08; }
      if (b.tree) b.tree.visible = b.planted;
      if (b.dead) b.dead.visible = !b.planted;
      if (b.canopy) b.canopy.rotation.z = Math.sin(t * 0.6 + b.j) * 0.02;
    }
    for (const v of d.vines) { const on = planted(v); if (v.bridge) v.bridge.visible = on; if (v.stub) v.stub.visible = !on; }
    for (const p of d.pouches) if (p.mesh) { p.mesh.visible = !p.got; p.mesh.position.y = 0.15 + Math.sin(t * 2.2 + p.i) * 0.05; p.mesh.rotation.y += dt * 0.8; }
  },
  targets(d, k) {
    const S = k.S, out = [];
    for (const b of d.beds) {
      const p = cpos(b.i, b.j);
      if (S.era === 'past') out.push({ x: p.x, z: p.z, label: () => b.planted ? $t('E 씨앗 캐내기') : C.inv.seed > 0 ? $t('E 씨앗 심기 — 오늘 여기 나무가 자라요') : $t('빈 흙 — 씨앗이 없어요'), act: () => actBed(b, k) });
      else if (!b.planted) out.push({ x: p.x, z: p.z, label: () => $t('E 메마른 흙'), act: () => { k.toast($t('메마른 화단 — 씨앗은 어제 심어야 자라요'), 2.4); return 'dry'; } });
    }
    return out;
  },
});

function actBed(b, k) {
  const p = cpos(b.i, b.j);
  if (b.planted) {
    b.planted = false; C.inv.seed++; markDirty();
    S3.dig(p); k.FX.dust(p.x, 0.2, p.z, { n: 12, color: ['#6b4a2e', '#8a6a44'], speed: 1.6, up: 1.2, size: 0.5 });
    k.toast($t('캐냈어요 — 오늘의 나무도 사라져요'), 2.2);
    return 'dug';
  }
  if (C.inv.seed <= 0) { S3.locked(p); k.toast($t('씨앗이 없어요 — 오늘 폐허에서 찾아요'), 2.6); return 'noseed'; }
  b.planted = true; C.inv.seed--; markDirty();
  S3.plant(p);
  k.FX.dust(p.x, 0.15, p.z, { n: 10, color: ['#6b4a2e', '#8a6a44'], speed: 1.2, up: 1, size: 0.45 });
  k.FX.motes(p.x, 0.4, p.z, { n: 16, color: ['#b8ff9a', '#ffffff'], speed: 1.2, up: 2.2, life: 1.1, size: 0.1 });
  toastOnce('planted', $t('심었어요 — 오늘엔 큰 나무가 서 있어요'), 2.6);
  return 'planted';
}

// ── 모습 ──
function buildBed(b, k) {
  const THREE = k.THREE, p = cpos(b.i, b.j);
  // 칸을 꽉 채우는 돌 화단(높이 0.5m, 두 시대 모두 막힘). 어제: 깨끗한 돌 + 검은 흙 + (심으면) 새싹 / 오늘: 이끼 낀 깨진 돌 + 메마른 흙 또는 큰 나무
  const planter = (E, worn) => {
    const stone = mat(E, 'planter', { color: worn ? '#5d5a55' : '#9a9083', roughness: 0.95 });
    const soil = mat(E, 'soil', { color: worn ? '#3a2a20' : '#4a3322', roughness: 1 });
    const g = group(mesh(new THREE.BoxGeometry(1.7, 0.42, 1.7), soil, 0, 0.21, 0));
    for (const [x, z, w, d] of [[0, -0.86, 1.92, 0.2], [0, 0.86, 1.92, 0.2], [-0.86, 0, 0.2, 1.52], [0.86, 0, 0.2, 1.52]]) {
      const s = mesh(new THREE.BoxGeometry(w, 0.5, d), stone, x, 0.25, z);
      if (worn && x > 0) { s.scale.y = 0.7; s.position.y = 0.18; s.rotation.z = -0.06; } // 오늘: 한쪽 벽이 무너져 낮음
      g.add(s);
    }
    return g;
  };
  const leafP = mat('past', 'leaf', { color: '#58b04a', roughness: 0.7 });
  const stemP = mat('past', 'stem', { color: '#6f8a3a', roughness: 0.8 });
  const gp = planter('past', false);
  const sap = group(mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.55, 6), stemP, 0, 0.3, 0));
  for (let n = 0; n < 3; n++) { const lf = mesh(new THREE.SphereGeometry(0.13, 8, 6), leafP, Math.cos(n * 2.1) * 0.12, 0.4 + n * 0.08, Math.sin(n * 2.1) * 0.12); lf.scale.set(1, 0.45, 0.7); lf.rotation.y = n * 2.1; sap.add(lf); }
  sap.position.y = 0.42; sap.visible = false;
  gp.add(sap); gp.position.set(p.x, 0, p.z);
  k.groups.past.add(gp);
  b.sapling = sap;
  // 오늘: 메마른 흙 (심지 않았으면) / 큰 나무 (심었으면)
  const soilN = mat('now', 'soil', { color: '#3a2a20', roughness: 1 });
  const barkN = mat('now', 'bark', { color: '#5a3d28', roughness: 0.95 });
  const leafN = mat('now', 'leaf', { color: '#3f6e34', roughness: 0.85 });
  const box = planter('now', true);
  const dead = group();
  const twig = mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.45, 5), barkN, 0.1, 0.62, -0.05); twig.rotation.z = 0.6; dead.add(twig);
  const tree = group();
  tree.add(mesh(new THREE.CylinderGeometry(0.45, 0.62, 3.3, 10), barkN, 0, 1.65, 0));
  tree.add(mesh(new THREE.CylinderGeometry(0.6, 0.85, 0.9, 12), barkN, 0, 0.6, 0));
  for (let n = 0; n < 8; n++) { // 화단 벽을 넘어 흘러내리는 뿌리
    const a = n * Math.PI / 4 + 0.2, r = mesh(new THREE.CylinderGeometry(0.07, 0.17, 1.0, 6), barkN, Math.cos(a) * 0.62, 0.45, Math.sin(a) * 0.62);
    r.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0); tree.add(r);
  }
  for (const [bx, by, bz, ra] of [[0.6, 2.4, 0.1, -0.7], [-0.55, 2.7, -0.2, 0.8]]) { const br = mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.4, 6), barkN, bx, by, bz); br.rotation.z = ra; tree.add(br); }
  const canopy = group();
  for (const [cx, cy, cz, r] of [[0, 3.7, 0, 1.35], [0.85, 3.3, 0.3, 0.95], [-0.8, 3.45, -0.25, 1.0], [0.2, 3.25, -0.85, 0.9], [-0.2, 3.2, 0.85, 0.85]]) canopy.add(mesh(new THREE.IcosahedronGeometry(r, 1), leafN, cx, cy, cz));
  tree.add(canopy);
  const holder = group(box, dead, tree); holder.position.set(p.x, 0, p.z);
  k.groups.now.add(holder);
  b.dead = dead; b.tree = tree; b.canopy = canopy; tree.visible = false;
  // 어제에서 보이는 '오늘의 나무' 윤곽 (심었을 때)
  const gm = gmat('#7dffb0', 0.22);
  const gt = group(mesh(new THREE.CylinderGeometry(0.42, 0.6, 3.3, 10), gm, 0, 1.65, 0), mesh(new THREE.SphereGeometry(1.5, 12, 8), gm, 0, 3.6, 0));
  gt.position.set(p.x, 0, p.z);
  ghostObj(gt, 'now', () => b.planted);
}

function buildVine(v, d, k) {
  const THREE = k.THREE, p = cpos(v.i, v.j), K2 = k;
  const barkN = mat('now', 'bark', { color: '#5a3d28', roughness: 0.95 });
  const leafN = mat('now', 'leaf', { color: '#3f6e34', roughness: 0.85 });
  // 이어진 쪽(다른 뿌리·흙·바닥)으로 굵은 뿌리를 뻗는다 → 다리처럼 보이게
  const conn = [];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = v.i + di, nj = v.j + dj;
    const isV = d.vines.some(o => o.i === ni && o.j === nj), isB = d.beds.some(b => b.i === ni && b.j === nj);
    const c = K2.ch('now', ni, nj);
    if (isV || isB || (c !== '#' && c !== '_' && c !== '|' && c !== '*')) conn.push([di, dj]);
  }
  const br = group();
  br.add(mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.22, 10), barkN, 0, -0.1, 0)); // 가운데 뿌리 매듭
  for (const [di, dj] of conn) {
    for (const off of [-0.42, 0, 0.42]) {
      const lg = mesh(new THREE.CylinderGeometry(0.17, 0.21, 1.15, 7), barkN, di * 0.5 + (dj ? off : 0), -0.08, dj * 0.5 + (di ? off : 0));
      lg.rotation.set(dj ? Math.PI / 2 : 0, 0, di ? Math.PI / 2 : 0); br.add(lg);
    }
  }
  for (let n = 0; n < 3; n++) { const lf = mesh(new THREE.IcosahedronGeometry(0.2, 0), leafN, Math.cos(n * 2.3 + v.i) * 0.6, 0.05, Math.sin(n * 2.3 + v.j) * 0.6); br.add(lf); }
  br.position.set(p.x, 0, p.z); br.visible = false;
  k.groups.now.add(br);
  v.bridge = br;
  // 심기 전: 구덩이 가장자리에 말라 죽은 뿌리 끄트머리 (여기로 뿌리가 뻗을 수 있다는 표시)
  const stub = group();
  for (const [di, dj] of conn.slice(0, 2)) { const s = mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.7, 5), barkN, di * 0.75, -0.2, dj * 0.75); s.rotation.set(dj ? Math.PI / 2.6 * Math.sign(dj) : 0, 0, di ? -Math.PI / 2.6 * Math.sign(di) : 0); stub.add(s); }
  stub.position.set(p.x, 0, p.z);
  k.groups.now.add(stub); v.stub = stub;
  // 어제에서 보이는 '뿌리가 뻗을 자리' 표시 (심기 전, 옅은 초록 테두리) — 심고 나면 기본 청록 윤곽이 대신 보인다
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: '#8dff9a', transparent: true, opacity: 0.55, depthTest: false }));
  edges.position.set(p.x, 0.07, p.z);
  ghostObj(edges, 'now', () => !planted(v));
}

function buildPouch(pc, k) {
  const THREE = k.THREE, p = cpos(pc.i, pc.j);
  const cloth = mat(pc.era, 'pouch', { color: pc.era === 'now' ? '#8c7a5c' : '#c2a77a', roughness: 0.95 });
  const tie = mat(pc.era, 'tie', { color: '#6b4a2e', roughness: 0.9 });
  const g = group(mesh(new THREE.SphereGeometry(0.26, 10, 8), cloth, 0, 0.22, 0), mesh(new THREE.ConeGeometry(0.12, 0.22, 8), cloth, 0, 0.5, 0), mesh(new THREE.TorusGeometry(0.1, 0.03, 5, 10).rotateX(Math.PI / 2), tie, 0, 0.42, 0));
  g.children[0].scale.y = 0.85;
  for (let n = 0; n < 3; n++) g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), tie, Math.cos(n * 2) * 0.3, 0.04, Math.sin(n * 2) * 0.3)); // 흘린 씨앗
  g.add(glow('#d8f5a0', 1.2, 0.35));
  g.position.set(p.x, 0.15, p.z);
  k.groups[pc.era].add(g);
  pc.mesh = g;
}
