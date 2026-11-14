// 거울 → 달빛 → 봉인 (t3-mirror)
//  /  \   거울 (두 시대 같은 칸, 막힘). 어제만 돌릴 수 있다(E: / ↔ \). 오늘은 녹슬어 어제 둔 방향 그대로
//  U      달빛 창 (오늘 그리드의 벽 칸). 무너진 천장 틈으로 트인 쪽을 향해 달빛이 들어온다. 어제는 지붕이 멀쩡해 빛이 없다
//  Q      봉인 수정 (막힘). 오늘 달빛이 닿으면 켜진다
//  X      봉인 문 (오늘 그리드). 가장 가까운 수정이 켜져 있으면 열림
// 달빛은 벽·막힌 칸(나무 줄기, 바닥 위 썩은 상자, 잠긴 문)에 막히고, 창살 | 과 시간 문 G 사이로는 지나간다.
// 어제에서는 '오늘 이렇게 빛이 지나갈 것'을 옅은 윤곽으로 미리 보여 준다.
import { at, mech, put, both, mat, gmat, lmat, emat, mesh, group, glow, ghostObj, cpos, nearest, markDirty, toastOnce } from './core.js';
import { S3 } from './sfx3.js';

const T = 2;
/** 달빛 따라가기. oriOf(mirror) → 0('/') | 1('\'), blocks(i, j) → 막히면 true. 결과: 켜진 수정 Set, 그릴 선분 [[x0,z0,x1,z1]] */
export function trace(d, oriOf, blocks) {
  const lit = new Set(), segs = [], stops = [], mi = new Map(d.mirrors.map(m => [m.i + ',' + m.j, m])), si = new Map(d.seals.map(s => [s.i + ',' + s.j, s]));
  for (const w of d.windows) {
    if (!w.dx && !w.dz) continue;
    let i = w.i, j = w.j, dx = w.dx, dz = w.dz, sx = i * T + 1 + dx, sz = j * T + 1 + dz;
    const seen = new Set();
    for (let n = 0; n < 240; n++) {
      i += dx; j += dz;
      const key = i + ',' + j + ',' + dx + ',' + dz; if (seen.has(key)) break; seen.add(key);
      const m = mi.get(i + ',' + j);
      if (m) { const cx = i * T + 1, cz = j * T + 1; segs.push([sx, sz, cx, cz]); sx = cx; sz = cz; [dx, dz] = oriOf(m) === 0 ? [-dz, -dx] : [dz, dx]; continue; }
      const s = si.get(i + ',' + j);
      if (s) { segs.push([sx, sz, i * T + 1 - dx * 0.35, j * T + 1 - dz * 0.35]); lit.add(s); break; }
      if (blocks(i, j)) { segs.push([sx, sz, i * T + 1 - dx, j * T + 1 - dz]); stops.push([i, j]); break; }
    }
  }
  return { lit, segs, stops };
}

export default mech({
  id: 'light',
  fresh: () => ({ mirrors: [], windows: [], seals: [], doors: [], sig: '', ready: false }),
  count: d => d.mirrors.length + d.windows.length + d.seals.length + d.doors.length,
  chars: {
    '/'(d, E, i, j) { return addMirror(d, i, j, 0); },
    '\\'(d, E, i, j) { return addMirror(d, i, j, 1); },
    U(d, E, i, j) { if (!d.windows.some(w => w.i === i && w.j === j)) d.windows.push({ era: E, i, j, dx: 0, dz: 0 }); return '#'; },
    Q(d, E, i, j) { let s = d.seals.find(s => s.i === i && s.j === j); if (!s) { s = { i, j, lit: false, glowA: 0 }; d.seals.push(s); } both(i, j, { m: 'light', k: 'seal', s }); return '.'; },
    X(d, E, i, j) { const o = { era: E, i, j, seal: null, a: 0 }; d.doors.push(o); put(E, i, j, { m: 'light', k: 'door', o }); return '.'; },
  },
  solid(x, era) {
    if (x.k === 'mirror' || x.k === 'seal') return true;
    if (x.k === 'door') return era === 'now' && x.o.era === 'now' ? !(x.o.seal && x.o.seal.lit) : true;
    return undefined;
  },
  load(d, k) {
    for (const w of d.windows) for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (k.ch('now', w.i + dx, w.j + dz) !== '#') { w.dx = dx; w.dz = dz; break; }
    for (const o of d.doors) o.seal = nearest(d.seals, o.i, o.j);
    for (const m of d.mirrors) buildMirror(m, k);
    for (const w of d.windows) buildWindow(w, k);
    for (const s of d.seals) buildSeal(s, k);
    for (const o of d.doors) buildDoor(o, k);
    if (d.windows.length) {
      d.beamNow = group(); k.groups.now.add(d.beamNow);
      d.beamGhost = group(); ghostObj(d.beamGhost, 'now');
    }
    relight(d, k, true);
    for (const o of d.doors) o.a = o.seal && o.seal.lit && o.era === 'now' ? 1 : 0;
    d.ready = true;
  },
  update(d, dt, k) {
    relight(d, k, false);
    // 달빛이 오늘의 나무에 막혀 있으면, 오늘 거울 근처에 왔을 때 한 번 알려 준다 (11/13 직접 플레이: 거울은 맞췄는데 왜 안 켜지는지 안 보였다)
    if (d.treeBlock && k.S.era === 'now' && d.mirrors.some(m => { const p = cpos(m.i, m.j); return Math.hypot(p.x - k.S.p.x, p.z - k.S.p.z) < 6; })) toastOnce('tree-block', $t('오늘은 나무가 달빛을 가리고 있어요'), 2.6);
  },
  frame(d, dt, k) {
    const t = k.S.time;
    for (const m of d.mirrors) { const want = m.o === 0 ? Math.PI / 4 : -Math.PI / 4; m.yaw += (want - m.yaw) * Math.min(1, dt * 10); for (const h of m.heads || []) h.rotation.y = m.yaw; }
    for (const s of d.seals) {
      s.glowA += ((s.lit ? 1 : 0) - s.glowA) * Math.min(1, dt * 5);
      if (s.crys) { s.crys.material = s.lit ? s.litM : s.dimM; s.crys.rotation.y = t * (0.4 + s.glowA); s.crys.position.y = 1.35 + Math.sin(t * 1.8) * 0.05 * s.glowA; }
      if (s.halo) { s.halo.material.opacity = 0.75 * s.glowA; s.halo.visible = s.glowA > 0.02; }
    }
    for (const o of d.doors) {
      const open = o.era === 'now' && o.seal && o.seal.lit;
      o.a += ((open ? 1 : 0) - o.a) * Math.min(1, dt * 3);
      if (o.slab) o.slab.position.y = -2.85 * o.a;
      if (o.rune) o.rune.material = o.seal && o.seal.lit ? o.runeOn : o.runeOff;
    }
    // 달빛 깜빡임
    if (d.beamNow) d.beamNow.children.forEach((c, n) => { if (c.userData.halo) c.material.opacity = 0.16 + 0.05 * Math.sin(t * 3 + n); });
  },
  targets(d, k) {
    const out = [];
    for (const m of d.mirrors) {
      const p = cpos(m.i, m.j);
      if (k.S.era === 'past') out.push({ x: p.x, z: p.z, label: () => $t('E 거울 돌리기'), act: () => turn(m, d, k) });
      else out.push({ x: p.x, z: p.z, label: () => $t('E 거울 (녹슮)'), act: () => { S3.locked(p); k.toast($t('녹슨 거울 — 어제 돌려야 해요'), 2.6); return 'rusted'; } });
    }
    return out;
  },
});

function addMirror(d, i, j, o) {
  let m = d.mirrors.find(m => m.i === i && m.j === j);
  if (!m) { m = { i, j, o, yaw: o === 0 ? Math.PI / 4 : -Math.PI / 4 }; d.mirrors.push(m); }
  both(i, j, { m: 'light', k: 'mirror', mr: m });
  return '.';
}
function turn(m, d, k) {
  m.o = 1 - m.o;
  const p = cpos(m.i, m.j); S3.mirror(p);
  k.FX.sparks(p.x, 1.3, p.z, { n: 6, color: ['#fff6d8', '#ffd27a'], speed: 2, up: 1.5, size: 0.1 });
  k.FX.dust(p.x, 0.1, p.z, { n: 6, color: k.FXC.past.dust, speed: 1, up: 0.4, size: 0.4, alpha: 0.4 });
  relight(d, k, false);
  toastOnce('mirror', $t('옅은 빛줄기 = 오늘 달빛이 지나갈 길'), 3.0);
  return 'turned';
}
// 달빛 다시 따라가기 → 수정 켜짐·문 열림이 바뀌면 소리·윤곽, 선분이 바뀌면 다시 그림
function relight(d, k, first) {
  if (!d.windows.length) { for (const s of d.seals) s.lit = false; return; }
  // 달빛은 창살·시간 문 사이로 지나가고, 낮은 화단은 넘어간다(심어서 나무가 서 있으면 막힘)
  const blocks = (i, j) => { const c = k.ch('now', i, j); if (c === '|' || c === 'G') return false; if (c === '#') return true; const x = at('now', i, j); if (x && x.k === 'bed') return x.b.planted; return k.solid('now', i, j); };
  const r = trace(d, m => m.o, blocks);
  // 나무만 없었으면 켜졌을 수정이 있나 (거울은 맞췄는데 나무가 가로막은 경우만 알린다)
  d.treeBlock = r.stops.some(([i, j]) => { const x = at('now', i, j); return x && x.k === 'bed' && x.b.planted; })
    && [...trace(d, m => m.o, (i, j) => { const x = at('now', i, j); return x && x.k === 'bed' ? false : blocks(i, j); }).lit].some(s => !r.lit.has(s));
  let changed = false;
  for (const s of d.seals) {
    const on = r.lit.has(s);
    if (on !== s.lit) {
      s.lit = on; changed = true;
      if (!first) {
        const p = cpos(s.i, s.j);
        if (k.S.era === 'now') { if (on) { S3.seal(p); k.FX.flash(p.x, 1.5, p.z, '#bfe4ff', 5); k.FX.motes(p.x, 1.3, p.z, { n: 24, color: ['#dff2ff', '#9fd0ff', '#ffffff'], speed: 2, up: 2, life: 1.1, size: 0.12 }); } else S3.sealOff(p); }
        for (const o of d.doors) if (o.seal === s && o.era === 'now') S3.slab(cpos(o.i, o.j), on);
      }
    }
  }
  if (changed) markDirty();
  const sig = r.segs.map(s => s.map(v => v.toFixed(1)).join(',')).join('|');
  if (sig !== d.sig && d.beamNow) { d.sig = sig; drawBeam(d, r.segs, k); }
}
function drawBeam(d, segs, k) {
  const THREE = k.THREE;
  for (const g of [d.beamNow, d.beamGhost]) while (g.children.length) g.remove(g.children[0]);
  const core = lmat('#eef8ff', 0.9), gm = gmat('#9fd8ff', 0.4);
  for (const [x0, z0, x1, z1] of segs) {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.01) continue;
    const yaw = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const c = mesh(new THREE.BoxGeometry(0.1, 0.1, len), core, cx, 1.2, cz); c.rotation.y = yaw;
    const h = mesh(new THREE.BoxGeometry(0.42, 0.42, len), emat('now', '#8fc8ff', 0.18), cx, 1.2, cz); h.rotation.y = yaw; h.userData.halo = true;
    const fl = mesh(new THREE.PlaneGeometry(0.9, len).rotateX(-Math.PI / 2), emat('now', '#7fb8ff', 0.12), cx, 0.04, cz); fl.rotation.y = yaw; // 바닥에 비친 빛
    d.beamNow.add(c, h, fl);
    const g = mesh(new THREE.BoxGeometry(0.07, 0.07, len), gm, cx, 1.2, cz); g.rotation.y = yaw;
    d.beamGhost.add(g);
  }
  for (const [, , x1, z1] of segs) { const s = glow('#dff0ff', 0.9, 0.7); s.position.set(x1, 1.2, z1); d.beamNow.add(s); }
}

// ── 모습 ──
function buildMirror(m, k) {
  const THREE = k.THREE, p = cpos(m.i, m.j);
  m.heads = [];
  for (const E of ['past', 'now']) {
    const stone = mat(E, 'ped', { color: E === 'past' ? '#a39a8c' : '#5f5b55', roughness: 0.95 });
    const frame = mat(E, 'mframe', { color: E === 'past' ? '#b98b3e' : '#5e4a34', roughness: E === 'past' ? 0.4 : 0.9, metalness: E === 'past' ? 0.7 : 0.25 });
    const glass = mat(E, 'glass', { color: E === 'past' ? '#e6eef4' : '#8e989c', roughness: E === 'past' ? 0.04 : 0.35, metalness: 0.95, emissive: E === 'now' ? '#223040' : '#000000', emissiveIntensity: 0.4 });
    const g = group(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.45, 12), stone, 0, 0.22, 0));
    const head = group(mesh(new THREE.BoxGeometry(1.55, 1.95, 0.14), frame, 0, 1.4, 0), mesh(new THREE.BoxGeometry(1.32, 1.72, 0.05), glass, 0, 1.4, 0.06), mesh(new THREE.BoxGeometry(1.32, 1.72, 0.05), glass, 0, 1.4, -0.06), mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), frame, 0, 0.55, 0));
    head.rotation.y = m.yaw;
    g.add(head); g.position.set(p.x, 0, p.z);
    k.groups[E].add(g); m.heads.push(head);
  }
}
function buildWindow(w, k) {
  const THREE = k.THREE, yaw = Math.atan2(w.dx, w.dz), x = w.i * T + 1 + w.dx * 1.02, z = w.j * T + 1 + w.dz * 1.02;
  const pane = mesh(new THREE.PlaneGeometry(1.1, 1.6), lmat('#d8ecff', 0.8), x, 2.1, z); pane.rotation.y = yaw;
  const arch = mesh(new THREE.CircleGeometry(0.55, 16, 0, Math.PI), lmat('#d8ecff', 0.8), x, 2.9, z); arch.rotation.y = yaw;
  const halo = glow('#bcdcff', 3.2, 0.5); halo.position.set(x + w.dx * 0.3, 2.2, z + w.dz * 0.3);
  k.groups.now.add(group(pane, arch, halo));
  const sh = mat('past', 'shutter', { color: '#6b4a2e', roughness: 0.9 });
  const s1 = mesh(new THREE.BoxGeometry(1.2, 1.7, 0.06), sh, x, 2.1, z); s1.rotation.y = yaw;
  k.groups.past.add(s1);
}
function buildSeal(s, k) {
  const THREE = k.THREE, p = cpos(s.i, s.j);
  s.litM = mat('now', 'crysOn', { color: '#cfe8ff', emissive: '#7fc0ff', emissiveIntensity: 2.4, roughness: 0.15, metalness: 0.1 });
  s.dimM = mat('now', 'crysOff', { color: '#56606c', emissive: '#1a2430', emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 });
  for (const E of ['past', 'now']) {
    const stone = mat(E, 'ped', { color: E === 'past' ? '#a39a8c' : '#5f5b55', roughness: 0.95 });
    const g = group(mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.9, 8), stone, 0, 0.45, 0), mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.12, 8), stone, 0, 0.95, 0));
    const crys = mesh(new THREE.OctahedronGeometry(0.34, 0), E === 'now' ? s.dimM : mat('past', 'crysPast', { color: '#9aa6b4', roughness: 0.3, metalness: 0.3 }), 0, 1.35, 0); crys.scale.y = 1.5;
    g.add(crys);
    if (E === 'now') { s.crys = crys; const h = glow('#9fd0ff', 2.4, 0); h.position.y = 1.35; g.add(h); s.halo = h; }
    g.position.set(p.x, 0, p.z); k.groups[E].add(g);
  }
}
function buildDoor(o, k) {
  const THREE = k.THREE, E = o.era, i = o.i, j = o.j, cx = i * T + 1, z0 = j * T;
  const ew = k.isOpen(E, i, j - 1) || k.isOpen(E, i, j + 1);
  const g = group(k.makeMesh('doorway', E));
  const stone = mat(E, 'slab', { color: E === 'past' ? '#8f877c' : '#5a5650', roughness: 0.95 });
  const slab = group(mesh(new THREE.BoxGeometry(1.72, 2.7, 0.26), stone, 0, 1.35, 0));
  o.runeOff = mat(E, 'runeOff', { color: '#3a4450', emissive: '#10202c', emissiveIntensity: 0.6, roughness: 0.6 });
  o.runeOn = mat(E, 'runeOn', { color: '#cfe8ff', emissive: '#7fc0ff', emissiveIntensity: 2.2, roughness: 0.3 });
  if (E === 'now') {
    const rune = mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 28), o.runeOff, 0, 1.55, 0.14);
    const moon = mesh(new THREE.CircleGeometry(0.2, 16, 0.6, 4.5), o.runeOff, 0.05, 1.55, 0.135);
    slab.add(rune, moon); o.rune = rune; o.moon = moon;
  }
  g.add(slab);
  if (ew) g.position.set(cx, 0, z0 + T - 0.14); else { g.position.set(cx, 0, z0 + 1); g.rotation.y = Math.PI / 2; }
  k.groups[E].add(g);
  o.slab = slab;
}
