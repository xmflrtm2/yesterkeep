// 수문 → 물 높이 (t3-sluice)
//  W  수문 바퀴 (두 시대 같은 칸, 막힘). 어제만 돌아간다. 처음엔 닫혀 있음 (V = 처음부터 열린 바퀴)
//  ~  물 칸. 어제 그리드 = 수로: 수문을 열면 물이 흘러 잠긴다 / 오늘 그리드 = 저수지: 수문이 닫혀 있으면(오랜 세월 물이 고여) 잠기고, 열려 있으면 말라 있다
//     → 한 번 돌리면 두 시대가 반대로 바뀐다. 가장 가까운 바퀴에 묶임. 바퀴가 없으면 오늘은 늘 잠김, 어제는 늘 마름
//  q  물 칸 + 그 바닥에 떨어진 열쇠 (물이 빠져야 주울 수 있다)
// 물에 뜬 상자: 상자가 잠긴 칸에 있으면 떠서 밟고 건널 수 있다. 마른 칸이면 바닥에 앉아 길을 막는다 (두 시대 같은 규칙)
import { C, mech, put, both, mat, gmat, mesh, group, ghostObj, cpos, cellOfP, crateAt, nearest, markDirty } from './core.js';
import { S3 } from './sfx3.js';

export const flooded = w => (w.wheel ? (w.era === 'past' ? w.wheel.open : !w.wheel.open) : w.era === 'now');
let rippleTex = null;

export default mech({
  id: 'water',
  fresh: () => ({ wheels: [], water: [] }),
  count: d => d.wheels.length + d.water.length,
  chars: {
    W(d, E, i, j) { let w = d.wheels.find(w => w.i === i && w.j === j); if (!w) { w = { i, j, open: false, spin: 0, spinV: 0 }; d.wheels.push(w); } both(i, j, { m: 'water', k: 'wheel', w }); return '.'; },
    // V = 처음부터 열려 있는 수문 (2차): 어제의 물길은 차 있고 오늘의 저수지는 말라 있는 채로 시작
    V(d, E, i, j) { let w = d.wheels.find(w => w.i === i && w.j === j); if (!w) { w = { i, j, open: true, spin: 0, spinV: 0 }; d.wheels.push(w); } w.open = true; both(i, j, { m: 'water', k: 'wheel', w }); return '.'; },
    '~'(d, E, i, j) { const w = { era: E, i, j, wheel: null, level: 0 }; d.water.push(w); put(E, i, j, { m: 'water', k: 'water', w }); return '_'; },
    q(d, E, i, j) { const w = { era: E, i, j, wheel: null, level: 0 }; d.water.push(w); put(E, i, j, { m: 'water', k: 'water', w }); C.d.key.keys.push({ era: E, i, j, got: false, under: true }); return '_'; },
  },
  solid(x, era, i, j) {
    if (x.k === 'wheel') return true;
    // 마른 저수지 바닥에 내려앉은 썩은 상자는 길을 막는다 (기본 규칙은 '구덩이 위 상자 = 발판')
    if (x.k === 'water' && era === 'now' && !flooded(x.w)) { const cr = crateAt(i, j); if (cr && !cr.sunk) return true; }
    return undefined;
  },
  floor(x, era, i, j) {
    if (x.k !== 'water') return undefined;
    if (!flooded(x.w)) return true;
    return crateAt(i, j) ? undefined : false; // 잠긴 칸: 상자가 떠 있으면 기본 규칙(발판), 아니면 물
  },
  load(d, k) {
    for (const w of d.water) { w.wheel = nearest(d.wheels, w.i, w.j); w.level = flooded(w) ? 1 : 0; }
    for (const wh of d.wheels) buildWheel(wh, k);
    for (const w of d.water) buildWater(w, d, k);
    syncCrates(d, k);
  },
  update(d, dt, k) {
    syncCrates(d, k);
    // 물에 빠지는 순간: 물보라 + 소리 (추락 자체는 기본 처리)
    const S = k.S;
    if (S.falling > 0 && !d.splashed) {
      const [ci, cj] = cellOfP();
      const w = d.water.find(o => o.era === S.era && o.i === ci && o.j === cj);
      if (w) { d.splashed = true; const p = cpos(ci, cj); S3.splash(p); k.FX.dust(p.x, 0.0, p.z, { n: 18, color: ['#bfe8ff', '#7fc4e8'], speed: 3, up: 3.5, size: 0.35, g: 9, life: 0.7 }); k.toast($t('물에 빠졌어요'), 1.6); }
    } else if (S.falling <= 0) d.splashed = false;
  },
  frame(d, dt, k) {
    if (rippleTex) { rippleTex.offset.x = (k.S.time * 0.03) % 1; rippleTex.offset.y = (k.S.time * 0.018) % 1; }
    for (const wh of d.wheels) {
      wh.spinV *= Math.exp(-dt * 2.5); wh.spin += wh.spinV * dt;
      for (const g of wh.wheels || []) g.rotation.z = wh.spin;
    }
    for (const w of d.water) {
      const tgt = flooded(w) ? 1 : 0;
      w.level += (tgt - w.level) * Math.min(1, dt * (k.S.era === w.era ? 2.2 : 50)); // 보고 있는 시대면 천천히 차오르고 빠진다
      if (w.surf) { w.surf.visible = w.level > 0.03; w.surf.position.y = -0.42 + 0.2 * w.level; }
      if (w.deep) w.deep.visible = w.level > 0.5;
      if (w.mud) w.mud.visible = w.level < 0.97;
    }
    if (d.water.length && k.crates.length) crateLook(d, k); // 기본 placeCrate가 놓은 높이를 물 높이에 맞춰 덮어씀
  },
  targets(d, k) {
    const S = k.S, out = [];
    for (const wh of d.wheels) {
      const p = cpos(wh.i, wh.j);
      if (S.era === 'past') out.push({ x: p.x, z: p.z, label: () => wh.open ? $t('E 수문 닫기') : $t('E 수문 열기'), act: () => turnWheel(wh, d, k) });
      else out.push({ x: p.x, z: p.z, label: () => $t('E 수문 (녹슮)'), act: () => { S3.locked(p); k.toast($t('녹슨 수문 — 어제 돌려야 해요'), 2.4); return 'rusted'; } });
    }
    return out;
  },
});

function turnWheel(wh, d, k) {
  const p = cpos(wh.i, wh.j), [ci, cj] = cellOfP();
  // 내가 선 어제의 수로 칸이 잠기게 되면 돌리지 않는다 (발밑에 물이 차서 빠지는 억울한 추락 막기)
  const mine = d.water.find(w => w.era === 'past' && w.i === ci && w.j === cj && w.wheel === wh);
  if (mine && !wh.open && !crateAt(ci, cj)) { S3.locked(p); k.toast($t('물길에 서 있어요 — 물이 차오르면 빠져요'), 2.2); return 'standing'; }
  wh.open = !wh.open; wh.spinV = wh.open ? 9 : -9; markDirty();
  S3.wheel(p, wh.open);
  k.FX.sparks(p.x, 1.0, p.z, { n: 6, color: ['#ffd27a', '#fff2c0'], speed: 2, up: 2, size: 0.1 });
  for (const w of d.water) if (w.wheel === wh && w.era === 'past') { const q = cpos(w.i, w.j); k.FX.dust(q.x, 0.1, q.z, { n: 4, color: wh.open ? ['#bfe8ff', '#8fd0f0'] : ['#8a7a60'], speed: 1.4, up: 1.2, size: 0.4, alpha: 0.5 }); }
  k.toast(wh.open ? $t('수문 열림 — 오늘 저수지가 말라요') : $t('수문 닫힘 — 오늘 저수지가 차요'), 3.0);
  return wh.open ? 'open' : 'closed';
}

// 수로·저수지 위 상자: 잠겼으면 떠 있고(밟을 수 있음), 말랐으면 바닥에 앉아 막는다. 어제의 상자는 기본 규칙이 구덩이에 빠뜨리므로 여기서 맞춘다
function syncCrates(d, k) {
  for (const cr of k.crates) {
    const wp = d.water.find(w => w.era === 'past' && w.i === cr.i && w.j === cr.j);
    if (wp) { const f = flooded(wp); if (cr.sunk !== f) { cr.sunk = f; markDirty(); } }
  }
}
// 상자 모습 높이 맞추기 (기본 placeCrate 다음 프레임에 덮어씀)
function crateLook(d, k) {
  for (const cr of k.crates) {
    for (const E of ['past', 'now']) {
      const w = d.water.find(o => o.era === E && o.i === cr.i && o.j === cr.j);
      const m = cr.mesh && cr.mesh[E];
      if (!w || !m) continue;
      const f = w.level, bob = Math.sin(k.S.time * 1.6 + cr.i * 1.7) * 0.04 * f;
      m.position.y = -0.36 * (1 - f) + (-0.3 + bob) * f;
      m.rotation.x = 0.04 + 0.04 * Math.sin(k.S.time * 1.1 + cr.j) * f;
    }
  }
}

function ripple(k) {
  if (rippleTex) return rippleTex;
  const THREE = k.THREE, c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#7f9fb0'; x.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 90; n++) { x.strokeStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.18})`; x.lineWidth = 1 + Math.random() * 1.5; x.beginPath(); const cx = Math.random() * 128, cy = Math.random() * 128, r = 6 + Math.random() * 18; x.ellipse(cx, cy, r, r * 0.4, Math.random() * 3, 0, Math.PI * (0.6 + Math.random())); x.stroke(); }
  rippleTex = new THREE.CanvasTexture(c); rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping; rippleTex.colorSpace = THREE.SRGBColorSpace;
  return rippleTex;
}

function buildWheel(wh, k) {
  const THREE = k.THREE, p = cpos(wh.i, wh.j);
  wh.wheels = [];
  for (const E of ['past', 'now']) {
    const wood = mat(E, 'wheelwood', { color: E === 'past' ? '#8a5a2b' : '#4a3a2c', roughness: 0.85 });
    const iron = mat(E, 'iron', { color: E === 'past' ? '#b08a4a' : '#5a4636', roughness: E === 'past' ? 0.45 : 0.95, metalness: E === 'past' ? 0.6 : 0.2 });
    const g = group(mesh(new THREE.BoxGeometry(0.5, 1.15, 0.5), wood, 0, 0.58, 0), mesh(new THREE.BoxGeometry(1.7, 0.25, 0.7), mat(E, 'stone2', { color: E === 'past' ? '#9b9184' : '#5f5c58', roughness: 1 }), 0, 0.12, 0));
    const wheel = group(mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 20), iron), mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10).rotateX(Math.PI / 2), iron));
    for (let n = 0; n < 6; n++) { const s = mesh(new THREE.BoxGeometry(1.2, 0.07, 0.07), iron); s.rotation.z = n * Math.PI / 6; wheel.add(s); }
    for (let n = 0; n < 6; n++) { const h = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 5).rotateX(Math.PI / 2), wood, Math.cos(n * Math.PI / 3) * 0.66, Math.sin(n * Math.PI / 3) * 0.66, 0.1); wheel.add(h); }
    wheel.position.set(0, 1.35, 0.32);
    g.add(wheel);
    if (E === 'now') for (let n = 0; n < 3; n++) g.add(mesh(new THREE.DodecahedronGeometry(0.15 + n * 0.05, 0), mat('now', 'rubble', { color: '#555049', roughness: 1 }), -0.6 + n * 0.5, 0.1, 0.45));
    g.position.set(p.x, 0, p.z);
    k.groups[E].add(g);
    wh.wheels.push(wheel);
  }
}

function buildWater(w, d, k) {
  const THREE = k.THREE, p = cpos(w.i, w.j), E = w.era;
  const tex = ripple(k);
  const surfM = mat(E, 'surf', { color: E === 'past' ? '#3a86a8' : '#2e5a74', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.82, emissive: E === 'past' ? '#123c50' : '#0c2638', emissiveIntensity: 0.7, map: tex, depthWrite: false });
  const surf = mesh(new THREE.PlaneGeometry(2.02, 2.02).rotateX(-Math.PI / 2), surfM, p.x, -0.22, p.z);
  surf.renderOrder = 2;
  const deep = mesh(new THREE.PlaneGeometry(2.02, 2.02).rotateX(-Math.PI / 2), mat(E, 'deep', { color: '#05121a', roughness: 1 }), p.x, -1.6, p.z);
  const mud = group(mesh(new THREE.PlaneGeometry(2.02, 2.02).rotateX(-Math.PI / 2), mat(E, 'mud', { color: E === 'past' ? '#5a4632' : '#3c3128', roughness: 1 })));
  for (let n = 0; n < 2; n++) { const pd = mesh(new THREE.CircleGeometry(0.22 + ((w.i * 7 + w.j * 3 + n) % 5) * 0.06, 12).rotateX(-Math.PI / 2), mat(E, 'puddle', { color: '#28404c', roughness: 0.2, metalness: 0.2 }), ((w.i + n * 3) % 3 - 1) * 0.5, 0.01, ((w.j + n) % 3 - 1) * 0.5); mud.add(pd); }
  if (E === 'now') for (let n = 0; n < 2; n++) mud.add(mesh(new THREE.DodecahedronGeometry(0.12, 0), mat('now', 'rubble', { color: '#555049', roughness: 1 }), ((w.j + n * 2) % 3 - 1) * 0.6, 0.06, ((w.i + n) % 3 - 1) * 0.6));
  mud.position.set(p.x, -0.4, p.z);
  k.groups[E].add(surf, deep, mud);
  w.surf = surf; w.deep = deep; w.mud = mud;
  // 다른 시대에서 보이는 '저쪽은 물' 표시 (푸른 물결 판)
  const gm = gmat('#4fb4ff', 0.3);
  const gq = mesh(new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), gm, p.x, 0.08, p.z);
  ghostObj(gq, E, () => flooded(w));
}
