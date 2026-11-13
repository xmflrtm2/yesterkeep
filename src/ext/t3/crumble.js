// 무너지는 바닥 (t3-crumble)
//  x  오늘 그리드: 금 간 바닥. 오늘 밟으면 0.7초 뒤 무너져 구덩이가 된다(그 방에서는 그대로). 이 시계는 오늘에 있을 때만 간다
//     → 금이 가는 중에 어제로 넘어가면 그 순간에 멈춘다(어제에서는 주황 윤곽으로 보임). 어제 그리드의 x는 그냥 멀쩡한 바닥
// 어제 그 칸에 상자를 밀어 두면, 오늘은 그 무게에 바닥이 오래전에 꺼져 상자가 구멍을 메우고 있다(밟고 지나감).
// 무너진 바닥 때문에 출구로 갈 길이 하나도 없으면 공통 막힘 검사가 "R로 다시 시작"을 띄운다.
import { mech, put, gmat, mesh, group, ghostObj, cpos, onCell, busy, crateAt, markDirty, toastOnce } from './core.js';
import { S3 } from './sfx3.js';

export const CRACK_T = 0.7;
let crackTex = null;
export default mech({
  id: 'crumble',
  fresh: () => ({ tiles: [], falling: [] }),
  count: d => d.tiles.length,
  chars: {
    x(d, E, i, j) { if (E !== 'now') return '.'; const t = { i, j, st: 'ok', t: 0 }; d.tiles.push(t); put('now', i, j, { m: 'crumble', k: 'tile', t }); return '_'; },
  },
  floor(x, era, i, j) { if (crateAt(i, j)) return undefined; return x.t.st !== 'gone'; },
  load(d, k) { for (const t of d.tiles) buildTile(t, k); },
  update(d, dt, k) {
    if (k.S.era !== 'now') return; // 떠난 시대는 멈춘다
    for (const t of d.tiles) {
      if (crateAt(t.i, t.j)) continue;
      if (t.st === 'ok' && !busy() && onCell(t.i, t.j)) {
        t.st = 'crack'; t.t = 0; S3.crack(cpos(t.i, t.j));
        toastOnce('crumble', $t('바닥이 무너져요! 멈추지 말고, 어제로 가면 그 순간에 멈춰요'), 2.6);
      } else if (t.st === 'crack') {
        t.t += dt;
        if (t.t >= CRACK_T) collapse(t, d, k);
      }
    }
  },
  frame(d, dt, k) {
    const t0 = k.S.time;
    for (const t of d.tiles) {
      const filled = !!crateAt(t.i, t.j);
      if (t.tile) t.tile.visible = t.st !== 'gone' && !filled;
      if (t.glow) { const a = t.st === 'crack' ? t.t / CRACK_T : 0; t.glow.material.opacity = a > 0 ? 0.25 + 0.75 * a : 0; t.glow.visible = a > 0 && !filled; }
      if (t.tile && t.st === 'crack' && k.S.era === 'now' && !k.S.down) { const s = (t.t / CRACK_T) * 0.04; t.tile.position.x = t.x0 + (Math.random() - 0.5) * s; t.tile.position.z = t.z0 + (Math.random() - 0.5) * s; }
    }
    for (let n = d.falling.length - 1; n >= 0; n--) {
      const f = d.falling[n]; f.t += dt; f.v -= 22 * dt; f.m.position.y += f.v * dt; f.m.rotation.x += f.r * dt; f.m.rotation.z += f.r * 0.7 * dt;
      if (f.t > 1.2) { f.m.parent && f.m.parent.remove(f.m); d.falling.splice(n, 1); }
    }
  },
});

function collapse(t, d, k) {
  t.st = 'gone'; markDirty();
  const p = cpos(t.i, t.j);
  k.sfx.crumble(p);
  k.FX.dust(p.x, 0.1, p.z, { n: 20, color: k.FXC.now.dust, speed: 2.2, up: 1.6, size: 0.7 });
  k.FX.debris(p.x, 0.2, p.z, { n: 10, color: ['#6d6a64', '#4f4c47'], up: 2.5 });
  k.FX.punch(0.15); k.S.shake = Math.max(k.S.shake, 0.18);
  for (let n = 0; n < 5; n++) { // 떨어지는 돌 조각
    const m = k.makeMesh('broken' + (1 + ((t.i * 3 + t.j * 5 + n) % 8)), 'now');
    m.position.set(p.x - 0.7 + (n % 3) * 0.6, -0.05, p.z - 0.6 + Math.floor(n / 3) * 0.8);
    k.groups.now.add(m);
    d.falling.push({ m, t: 0, v: -0.5 - n * 0.3, r: (n - 2) * 1.3 });
  }
}

function cracks(k) {
  if (crackTex) return crackTex;
  const THREE = k.THREE, c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128); x.strokeStyle = '#fff'; x.lineCap = 'round';
  const branch = (sx, sy, a, len, w, depth) => {
    let px = sx, py = sy;
    for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 0.9; const nx = px + Math.cos(a) * len / 6, ny = py + Math.sin(a) * len / 6; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke(); px = nx; py = ny; if (depth > 0 && Math.random() < 0.3) branch(px, py, a + (Math.random() < 0.5 ? 0.9 : -0.9), len * 0.5, w * 0.6, depth - 1); }
  };
  for (let n = 0; n < 5; n++) branch(64, 64, n * 1.26 + Math.random() * 0.5, 70, 3, 2);
  crackTex = new THREE.CanvasTexture(c); crackTex.colorSpace = THREE.SRGBColorSpace;
  return crackTex;
}
function buildTile(t, k) {
  const THREE = k.THREE, x0 = t.i * 2, z0 = t.j * 2, p = cpos(t.i, t.j);
  const tile = group(k.makeMesh('floor', 'now'));
  const dark = mesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: cracks(k), color: '#000', transparent: true, opacity: 0.75, depthWrite: false }), 1, 0.012, 1);
  dark.rotation.y = (t.i * 7 + t.j * 3) % 4 * Math.PI / 2;
  tile.add(dark);
  tile.position.set(x0, 0, z0); t.x0 = x0; t.z0 = z0;
  k.groups.now.add(tile); t.tile = tile;
  const glow = mesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: cracks(k), color: '#ff7a2a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), p.x, 0.02, p.z);
  glow.rotation.y = dark.rotation.y; glow.visible = false;
  k.groups.now.add(glow); t.glow = glow;
  // 어제에서 보이는 '오늘 금이 가다 멈춘 바닥' (주황)
  const g = mesh(new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), gmat('#ffae3a', 0.35), p.x, 0.08, p.z);
  ghostObj(g, 'now', () => t.st === 'crack');
}
