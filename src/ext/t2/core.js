// T2 몬스터 — 공용 도우미: 칸·시야·길찾기·경보·바닥 표시·사람 모델·멈춘 윤곽·소리·처치 이펙트.
// main.js의 경비 코드(canSee·nextStep·moveEnemy·alertGuard)와 같은 규칙을 EXT.K만으로 다시 쓴 것 (main.js는 안 고친다).
import { EXT } from '../../ext.js';

export const T2 = { K: null, rad: d => d * Math.PI / 180 };
EXT.on('init', K => { T2.K = K; });

// ───────── 칸 · 거리 ─────────
export const cellOf = v => Math.floor(v / 2);
export const C2 = i => i * 2 + 1;
export const other = e => (e === 'past' ? 'now' : 'past');
export const pdist = f => Math.hypot(T2.K.S.p.x - f.x, T2.K.S.p.z - f.z);
export const fwd = f => [Math.sin(f.yaw), Math.cos(f.yaw)];
/** 플레이어가 그 적과 같은 시대에, 살아서 움직이는 중인지 (떨어지는 중·방 넘어가는 중·되감는 중이면 아님) */
export function here(f) { const S = T2.K.S; return S.era === f.era && S.falling <= 0 && !S.trans && !S.down && !S.ended; }
/** (x, z)가 f의 앞 half(라디안) 안인가 */
export function inFront(f, x, z, half) { const [fx, fz] = fwd(f), dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz); return d < 0.01 || (dx * fx + dz * fz) / d > Math.cos(half); }
/** 찌르기 정보(tx, tz, td: 적 → 플레이어)로 등 뒤 각도 판정. halfBack = 등 뒤 부채꼴의 반각(도) */
export function fromBehind(f, info, halfBack = 70) { const [fx, fz] = fwd(f); return (info.tx * fx + info.tz * fz) / info.td < -Math.cos(T2.rad(halfBack)); }

// 벽·닫힌 상자에 시야가 막힌다 (창살·창살 문은 비친다) — main.js opaque와 같음
export const opaque = (era, i, j) => T2.K.solid(era, i, j) && !'|DG'.includes(T2.K.ch(era, i, j));
export function rayLen(era, x, z, dx, dz, max) {
  for (let d = 0.25; d <= max; d += 0.2) if (opaque(era, cellOf(x + dx * d), cellOf(z + dz * d))) return Math.max(0.2, d - 0.2);
  return max;
}
export function los(era, x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1, d = Math.hypot(dx, dz); return d < 0.01 || rayLen(era, x1, z1, dx / d, dz / d, d) >= d - 0.05; }
/** 부채꼴 시야 (range m, half 라디안) + 벽 가림 */
export function sees(f, px, pz, range, half) {
  const dx = px - f.x, dz = pz - f.z, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.01) return true;
  const [fx, fz] = fwd(f);
  if ((dx * fx + dz * fz) / d < Math.cos(half)) return false;
  return rayLen(f.era, f.x, f.z, dx / d, dz / d, d) >= d - 0.05;
}
export function turnTo(f, tx, tz, dt, rate) {
  const want = Math.atan2(tx - f.x, tz - f.z);
  let d = want - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  f.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  return Math.abs(d);
}
export function turnToYaw(f, yaw, dt, rate) { let d = yaw - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); f.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt); return Math.abs(d); }
/** 칸 단위로 벽·구덩이에서 밀어내며 (tx, tz) 쪽으로 걷기. 도착하면 true */
export function moveTo(f, tx, tz, speed, dt, turn = 7, standFn) {
  const K = T2.K, R = f.r || 0.42, ok = standFn || ((i, j) => K.stand(f.era, i, j));
  const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  if (turn) turnTo(f, tx, tz, dt, turn);
  const s = Math.min(d, speed * dt);
  f.x += dx / d * s; f.z += dz / d * s;
  for (let j = cellOf(f.z - R); j <= cellOf(f.z + R); j++) for (let i = cellOf(f.x - R); i <= cellOf(f.x + R); i++) {
    if (ok(i, j)) continue;
    const nx = Math.max(i * 2, Math.min(f.x, i * 2 + 2)), nz = Math.max(j * 2, Math.min(f.z, j * 2 + 2));
    const ex = f.x - nx, ez = f.z - nz, e = Math.hypot(ex, ez);
    if (e < R && e > 1e-6) { f.x += ex / e * (R - e); f.z += ez / e * (R - e); }
  }
  return d < 0.15;
}
/** f의 칸에서 (ti, tj)로 가는 다음 칸 가운데 [x, z] (그 시대의 설 수 있는 칸으로만, 너비 우선). 못 가면 null */
export function nextStep(f, ti, tj, standFn) {
  const K = T2.K, W = K.S.W, H = K.S.H, ok = standFn || ((i, j) => K.stand(f.era, i, j));
  const si = cellOf(f.x), sj = cellOf(f.z);
  if (si === ti && sj === tj) return null;
  const prev = new Int32Array(W * H).fill(-1), q = [si + sj * W]; let qi = 0;
  prev[si + sj * W] = si + sj * W;
  while (qi < q.length) {
    const c = q[qi++], ci = c % W, cj = (c - ci) / W;
    if (ci === ti && cj === tj) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj, n = ni + nj * W;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || prev[n] >= 0 || !ok(ni, nj)) continue;
      prev[n] = c; q.push(n);
    }
  }
  let c = ti + tj * W;
  if (prev[c] < 0) return null;
  while (prev[c] !== si + sj * W) c = prev[c];
  const ci = c % W;
  return [C2(ci), C2((c - ci) / W)];
}
/** 너비 우선으로 가장 가까운 설 수 있는 칸 (avoid(i, j)면 건너뜀) → [i, j] */
export function nearestStand(era, i0, j0, avoid) {
  const K = T2.K, W = K.S.W, H = K.S.H, seen = new Set([i0 + ',' + j0]), q = [[i0, j0]];
  while (q.length) {
    const [i, j] = q.shift();
    if (K.stand(era, i, j) && !(avoid && avoid(i, j))) return [i, j];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj, k = ni + ',' + nj; if (ni >= 0 && nj >= 0 && ni < W && nj < H && !seen.has(k)) { seen.add(k); q.push([ni, nj]); } }
  }
  return [i0, j0];
}
export const t2Foes = () => (T2.K ? T2.K.extFoes.filter(f => f.t2) : []);
// 맞은 뒤 한숨 돌리기: 하트가 줄면 곁(4.5m)의 T2 적은 1.3초 물러선다 (되감기 1.15초 + 무적 1.2초 동안 또 물려 하트가 한꺼번에 빠지지 않게).
// main.js도 되살아난 자리 3m 안의 적에 stun을 주지만, 시간 충격을 안 먹는 적(사냥개·방패병)은 stun을 지우므로 따로. (11/13 직접 플레이: 사냥개 둘에 2초 만에 하트 4개)
EXT.on('hurt', (msg, K) => {
  for (const f of t2Foes()) {
    if (!f.alive || f.era !== K.S.era || pdist(f) > 4.5) continue;
    f.wind = 0;
    if (f.onPlayerHurt) f.onPlayerHurt(); else f.stun = Math.max(f.stun || 0, 1.3);
  }
});

// ───────── 실패 · 경보 (main.js roomFail·alertGuard와 같은 일) ─────────
export function fail() {
  const K = T2.K, S = K.S;
  S.roomFails++;
  if (S.roomFails >= 2 && S.room && S.room.tip && !S.tipShown) { S.tipShown = true; K.hud.hint.textContent = K.$t(S.room.tip); K.hud.hint.classList.add('tip'); }
}
/** 방 전체 경보: 처음이면 경보 수·실패·외침. 가까운(7m) 경비·T2 사람 적도 깨운다 */
export function raiseAlarm(f, msg) {
  const K = T2.K, S = K.S;
  if (!S.alarmed) { S.alarmed = true; S.alarms++; fail(); K.sfx.alarm({ x: f.x, z: f.z }); if (msg) K.toast(msg); }
  for (const o of K.guards) if (o.alive && o.state !== 'alert' && Math.hypot(o.x - f.x, o.z - f.z) < 7) { o.sus = 0.99; o.state = 'alert'; o.lost = 0; }
  for (const o of t2Foes()) if (o !== f && o.alive && o.hearsAlarm && o.era === f.era && Math.hypot(o.x - f.x, o.z - f.z) < 7) o.hearAlarm(f);
}

// ───────── 바닥 표시 (예고·범위) ─────────
const geoCache = {};
const THREE_ = () => T2.K.THREE;
export function ringGeo(r0 = 0.9, r1 = 1) { const k = 'r' + r0 + '/' + r1; return geoCache[k] || (geoCache[k] = new (THREE_().RingGeometry)(r0, r1, 64).rotateX(-Math.PI / 2)); }
export function discGeo() { return geoCache.disc || (geoCache.disc = new (THREE_().CircleGeometry)(1, 48).rotateX(-Math.PI / 2)); }
/** 앞(+z)으로 벌어진 부채꼴 (반지름 1, 반각 halfDeg) */
export function arcGeo(halfDeg) { const k = 'a' + halfDeg, h = T2.rad(halfDeg); return geoCache[k] || (geoCache[k] = new (THREE_().CircleGeometry)(1, 40, -Math.PI / 2 - h, 2 * h).rotateX(-Math.PI / 2)); }
/** 앞(+z)으로 뻗는 띠 (폭 1, 길이 1) */
export function laneGeo() { return geoCache.lane || (geoCache.lane = new (THREE_().PlaneGeometry)(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)); }
/** 바닥 데칼 (가산, 깊이 안 씀). parent 기본 = 방 world (두 시대 모두에서 보임) */
export function decal(geo, color, { opacity = 0, add = true, depthTest = true, parent = null, order = 4 } = {}) {
  const THREE = THREE_();
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  m.renderOrder = order; m.frustumCulled = false;
  (parent || T2.K.world).add(m);
  return m;
}
/** 시야 부채꼴 (main.js makeCone과 같은 꼴, 반각·거리를 적마다) */
const CONE_N = 24;
export function makeCone() {
  const THREE = THREE_(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_N + 2) * 3), 3));
  const idx = []; for (let k = 1; k <= CONE_N; k++) idx.push(0, k, k + 1);
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 4;
  T2.K.world.add(m);
  return m;
}
export function updateCone(cone, f, range, half) {
  const pos = cone.geometry.attributes.position, a = pos.array;
  a[0] = f.x; a[1] = 0.06; a[2] = f.z;
  for (let k = 0; k <= CONE_N; k++) {
    const ang = f.yaw - half + (2 * half * k) / CONE_N, dx = Math.sin(ang), dz = Math.cos(ang);
    const L = rayLen(f.era, f.x, f.z, dx, dz, range);
    a[(k + 1) * 3] = f.x + dx * L; a[(k + 1) * 3 + 1] = 0.06; a[(k + 1) * 3 + 2] = f.z + dz * L;
  }
  pos.needsUpdate = true; cone.geometry.computeBoundingSphere();
}
/** 시야 부채꼴 색: 다른 시대면 붉게 멈춤, 아니면 평소 · 의심 · 경보 */
export function paintCone(cone, f, away) {
  const m = cone.material;
  cone.visible = f.alive && (!T2.K.S.ring || !away);
  if (away) { m.color.set('#ff5a5a'); m.opacity = 0.16; m.depthTest = false; }
  else { m.color.set(f.state === 'alert' ? '#ff4030' : f.sus > 0.05 ? '#ffb340' : '#fff1b8'); m.opacity = f.state === 'alert' ? 0.22 : 0.12 + f.sus * 0.14; m.depthTest = true; }
}
/** 머리 위 ? / ! (main.js MARK 그림을 그대로 씀) */
export function makeMark(parent, y = 2.25) {
  const THREE = THREE_(), K = T2.K;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.MARK.sus, depthTest: false, transparent: true }));
  s.scale.setScalar(0.7); s.position.y = y; s.visible = false; s.renderOrder = 9;
  parent.add(s);
  return s;
}
export function paintMark(mark, f) {
  const K = T2.K;
  mark.visible = f.alive && (f.state === 'alert' || f.sus > 0.05);
  mark.material.map = f.state === 'alert' ? K.MARK.alert : K.MARK.sus;
  mark.scale.setScalar(f.state === 'alert' ? 0.8 : 0.4 + f.sus * 0.4);
}

// ───────── 사람 모델 (경비병 파츠를 다른 색·크기로) ─────────
const tintCache = new Map();
function tinted(src, key, tint, emissive) {
  const k = src.uuid + key;
  let m = tintCache.get(k);
  if (!m) {
    m = src.clone();
    if (tint) m.color.multiply(new (THREE_().Color)(tint)).multiplyScalar(1.5);
    if (emissive) { m.emissive = new (THREE_().Color)(emissive[0]); m.emissiveIntensity = emissive[1]; }
    tintCache.set(k, m);
  }
  return m;
}
/**
 * 경비(guardM) 또는 플레이어(rogueF) 파츠로 사람 하나. look = { base:'guard'|'hero', scale, tint:{ 파츠이름조각: 색 }, all: 색(모두), glow: [색, 세기], dagger: true }
 * 반환 { holder(시대 무리에 넣음), rig, meshes, ani(Animator), ghost(같은 뼈대의 붉은 윤곽 — world에) }. 파츠가 없으면 null
 */
export function buildHuman(look, era, key) {
  const K = T2.K, C = K.CHAR;
  const parts = look.base === 'hero' ? C.hero : C.guard;
  if (!parts || !C.rig) return null;
  const { rig, meshes } = K.assemble(parts, C.rig, look.dagger === false ? null : C.dagger);
  for (const sm of meshes) {
    let tint = look.all || null;
    if (look.tint) for (const [part, col] of Object.entries(look.tint)) if (sm.name.includes(part)) tint = col;
    if (tint || look.glow) sm.material = tinted(sm.material, key + sm.name, tint, look.glow);
  }
  rig.scale.setScalar(look.scale || 1);
  const holder = new (THREE_().Group)(); holder.add(rig);
  K.groups[era].add(holder);
  const ghost = new (THREE_().Group)();
  for (const sm of meshes) { const gm = new (THREE_().SkinnedMesh)(sm.geometry, K.guardGhostMat); ghost.add(gm); gm.bind(sm.skeleton, sm.bindMatrix); gm.frustumCulled = false; gm.renderOrder = 8; }
  ghost.visible = false; K.world.add(ghost);
  return { holder, rig, meshes, ghost, ani: new K.Animator(rig, C.clips) };
}
/** 코드로 만든 몸의 멈춘 윤곽: 같은 모양을 붉은 반투명(깊이 무시)으로 한 벌 더 */
export function ghostCopy(root) {
  const K = T2.K, g = root.clone(true);
  g.traverse(o => { if (o.isMesh) { o.material = K.ghostRedMat; o.renderOrder = 8; } if (o.isSprite) o.visible = false; });
  g.visible = false; K.world.add(g);
  return g;
}
/** 시대 전환 물결이 (x, z)를 지나갔는가 — 물결이 지나기 전엔 윤곽을 숨긴다 (main.js ringOk와 같은 뜻) */
export function ringPassed(x, z) { const S = T2.K.S; return !S.ring || S.ring.r > Math.hypot(x - T2.shiftAt.x, z - T2.shiftAt.z) + 1.0; }
T2.shiftAt = { x: 0, z: 0 };
// "준비된 전환": 넘어오기 전에 다른 시대에서 PREP초 이상 머물렀는가. T2 적의 넘어오며 치기(방패병 등 뒤·잠든 미믹·망령 겹치기)는 이때만 통한다
// → Shift를 0.5초마다 마구 누르는 것으론 안 되고, 다른 시대에서 자리를 잡고 넘어와야 한다 (11/13 게으른 봇: 연타로 방패병·미믹·망령이 깨졌다)
T2.PREP = 1.0; // 0.6초로는 Shift 재사용 대기(0.5초) 때문에 봇의 연타 간격(0.5~0.6초)이 걸려 망령이 연타로 깨졌다 → 1초
T2.enteredAt = -1e9; T2.lastStay = 1e9;
export const prepared = () => T2.lastStay >= T2.PREP;
export const stayHere = () => T2.K.S.time - T2.enteredAt; // 지금 시대에 머문 시간
EXT.on('shift', (from, to, K) => { T2.shiftAt = { x: K.S.p.x, z: K.S.p.z }; T2.lastStay = K.S.time - T2.enteredAt; T2.enteredAt = K.S.time; T2.arrive = { era: to, t: K.S.time, prep: T2.lastStay >= T2.PREP }; });
EXT.on('roomLoad', (room, K) => { T2.enteredAt = K.S.time - 10; T2.lastStay = 1e9; T2.arrive = null; T2.lockT = 0; });

// ───────── 머티리얼 ─────────
export function mat(color, o = {}) { return new (THREE_().MeshStandardMaterial)(Object.assign({ color, roughness: 0.75, metalness: 0.1 }, o)); }
export function glowMat(color, o = {}) { return new (THREE_().MeshBasicMaterial)(Object.assign({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE_().AdditiveBlending }, o)); }

// ───────── 처치 · 막힘 공용 ─────────
/** 막힘: 플레이어를 적 반대쪽으로 밀고 쇳소리 + 불꽃 + 한 줄 */
export function blocked(f, info, msg, push = 1.0) {
  const K = T2.K, S = K.S;
  if (!info.thrown) { S.p.x += info.tx / info.td * push; S.p.z += info.tz / info.td * push; K.resolve(); } // 던진 것이 튕길 땐 플레이어를 안 민다
  K.sfx.clang({ x: f.x, z: f.z }); S.shake = Math.max(S.shake, 0.15); K.clangFx(f.x, f.z);
  if (msg) K.toast(msg, 1.4);
  return 'blocked';
}
/** 처치 공통: 점수·소리·이펙트·멈칫 → K.killed (방 정리) */
export function killFx(f, how, { msg, color, big = 1 } = {}) {
  const K = T2.K, S = K.S, E = f.era;
  S.hitstop = Math.max(S.hitstop, 0.1); S.shake = Math.max(S.shake, 0.25 * big);
  K.FX.sparks(f.x, 1.1, f.z, { n: 14, color: color || K.FXC[E].spark }); K.FX.dust(f.x, 0.2, f.z, { n: 8, color: K.FXC[E].dust }); K.FX.punch(0.25 * big);
  if (msg) K.toast(msg, 1.3);
}
/**
 * T2 적이 스스로 쓰러질 때는 꼭 이걸로 (K.killed 직전에 표시). 2차(11/15): T4 유물(던진 단검·두 시대 동시 처치)이 K.killFoe로
 * 바로 쓰러뜨리면 쓰러지는 모습 없이 선 채로 남고, 미니 보스는 한 방에 끝났다 → 'kill' 훅에서 표시가 없는 처치를 따로 다룬다
 */
export function kill(K, f, how) {
  if (armorBlock(f, how)) return false; // 정예 접두어(단단한·되감는)가 한 번 막음
  f._own = true; f.alive = false; f._dying = true;
  K.killed(f, how);
  f._own = false;
  return true;
}
EXT.on('kill', (f, how, K) => {
  if (!f || !f.t2 || f._own) return;
  // 다른 길(유물 등)로 쓰러짐: 미니 보스는 한 칸 피해로 바꾸고 살려 둔다(main.js는 이 훅 뒤에 '방을 다 잡았나'를 본다)
  if (f.bossHp != null) {
    f.alive = true; f.counted = false; K.S.kills = Math.max(0, K.S.kills - 1);
    if (f.hurtBoss) f.hurtBoss(how, { relic: true });
    return;
  }
  if (armorBlock(f, how)) { f.alive = true; f.counted = false; K.S.kills = Math.max(0, K.S.kills - 1); return; }
  f._dying = true;
  if (f.onExternalKill) { try { f.onExternalKill(how); } catch (e) { console.error('[T2 externalKill]', f.kind, e); } }
});
/** 정예 '단단한'(갑옷 한 겹)·'되감는'(한 번 되돌아옴): 쓰러질 일을 한 번 막는다. 막았으면 true */
export function armorBlock(f, how) {
  const K = T2.K;
  if (['fall', 'sunk', 'crushed', 'sealed', 'gone'].includes(how)) return false; // 구덩이·막기 같은 시대의 결과는 갑옷으로 못 막는다
  if (f.armor > 0) {
    f.armor--; f.stun = Math.max(f.stun || 0, 0.8); f.wind = 0;
    K.sfx.clang({ x: f.x, z: f.z }); K.clangFx(f.x, f.z);
    K.FX.debris(f.x, 1.2, f.z, { n: 8, color: ['#9aa6b8', '#5d6878'], speed: 3, up: 3, size: 0.1 });
    K.toast(K.$t('갑옷이 깨졌어요 — 한 번 더!'), 1.4);
    if (f.onArmorBreak) f.onArmorBreak();
    return true;
  }
  if (f.rewindOnce && f.hist && f.hist.length) {
    f.rewindOnce = false;
    const back = f.hist[0];
    K.FX.motes(f.x, 1, f.z, { n: 30, color: ['#b98cff', '#ffffff'], speed: 3, up: 2, life: 0.8 });
    f.x = back.x; f.z = back.z; f.stun = Math.max(f.stun || 0, 0.7); f.wind = 0;
    K.FX.motes(f.x, 1, f.z, { n: 30, color: ['#b98cff', '#ffffff'], speed: 2, up: 2, life: 0.8 });
    K.sfx.rewind && K.sfx.rewind();
    K.toast(K.$t('2초 전으로 되감겼어요 — 다시 한 번!'), 1.6);
    return true;
  }
  return false;
}
/** T4 던진 단검 약속(onThrown) → 우리 찌르기 판정으로. 쓰러지면(관통 유물이면) 'pierce' */
export function thrownToStab(f, t) {
  const K = T2.K, S = K.S;
  if (!f.onStab) return undefined;
  // 날아온 쪽 = 던진 쪽: 적 → 날아온 쪽 벡터를 플레이어 위치처럼 넘긴다
  const tx = -t.dx, tz = -t.dz;
  const info = { behind: t.behind, shift: false, tx, tz, td: 1, thrown: true };
  f.onStab(info);
  return undefined; // 관통 여부는 T4가 정한다(우리 쪽에선 늘 멈춤)
}

// 보는 사람(시험 도구·T1·T4)이 쓸 수 있게
EXT.t2 = EXT.t2 || {};
EXT.t2.foes = t2Foes;
EXT.t2.stay = () => stayHere(); // 지금 시대에 머문 초 (시험 봇이 '준비된 전환'을 기다릴 때)
EXT.t2.T2 = T2;
