// T2 2차 — 2·3층의 새 얼굴 셋.
//   두 시대의 눈 (t2-watcher, 2층): 기둥 위의 눈. 두 시대에 다 있고 두 시대 모두를 본다(어느 시대에 있든 고개를 돌린다).
//       시선(주황 빛줄기)에 0.9초 잡히면 "붙잡힘" — 3초 동안 시대를 못 바꾸고, 곁의 경비가 깬다. 시선 밖, 등 뒤에서 찌르면 깨진다.
//   폭탄병 (t2-sapper, 2·3층): 어제. 거리를 두고 폭탄을 던진다. 도화선은 어제에 있을 때만 타고(붉은 원이 차오름),
//       터지면 어제엔 그을음뿐이지만 **오늘엔 그 자리가 구덩이로 꺼진다**(오늘에 서 있던 골렘·적도 떨어진다). 오늘에선 꺼질 칸이 미리 붉게.
//       가까이 가면 어디서 찔러도 쓰러진다(도망가며 던진다).
//   되감는 검사 (t2-duelist, 3층): 어제. 빠른 검사. 찌르면 1.5초 전 자리로 되감겨 피하고 받아친다(청록 기둥 = 되감길 자리).
//       단 **막 넘어온 너는 되감을 수 없다**: 다른 시대에 1초 이상 있다가 넘어온 뒤 1.3초 안의 찌르기는 어느 쪽에서든 통한다(흰 고리가 줄어듦).
import { EXT } from '../../ext.js';
import { T2, cellOf, C2, other, pdist, fwd, here, inFront, fromBehind, los, turnTo, turnToYaw, moveTo, nearestStand,
  fail, raiseAlarm, decal, ringGeo, discGeo, arcGeo, laneGeo, makeCone, ghostCopy, ringPassed, mat, glowMat, blocked, killFx, t2Foes, prepared, flickering, kill, ghostProp, say } from './core.js';
import { S2 } from './sfx.js';
import { base, place, play, senseSight, alert, patrol, chase, viewCommon, die, CLIP } from './humans.js';

const N = k => k;
const rad = T2.rad;

/* ───────── 두 시대의 눈 ───────── */
const EYE = { range: 8.5, half: rad(16), sweep: rad(80), speed: rad(36), pause: 0.6, lock: 0.9, lockT: 3.0, cool: 2.5, track: rad(30) };
let eyeCells = [];
EXT.on('roomLoad', () => { eyeCells = eyeCells.filter(c => T2.K.extFoes.includes(c.f)); });
EXT.solidAt.push((era, i, j) => (eyeCells.some(c => c.i === i && c.j === j) ? true : undefined));
// 눈 자기 기둥 칸은 건너뛰고 잰다
function eyeRay(era, x, z, dx, dz, max) {
  for (let d = 1.05; d <= max; d += 0.2) { const i = cellOf(x + dx * d), j = cellOf(z + dz * d); if (T2.K.solid(era, i, j) && !'|DG'.includes(T2.K.ch(era, i, j))) return Math.max(1.0, d - 0.2); }
  return max;
}
function makeEye(K) {
  const THREE = K.THREE, g = new THREE.Group(), stone = mat('#7a7468', { roughness: 0.9 });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.7, 10), stone); col.position.y = 0.85; g.add(col);
  const eyeG = new THREE.Group(); eyeG.position.y = 2.05; g.add(eyeG);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat('#f0ead8', { roughness: 0.35, emissive: '#2a2010', emissiveIntensity: 0.6 })); eyeG.add(ball);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), glowMat('#ff8a2a', { opacity: 1, side: THREE.DoubleSide })); iris.position.z = 0.43; eyeG.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14), new THREE.MeshBasicMaterial({ color: '#120800' })); pupil.position.z = 0.435; eyeG.add(pupil);
  return { g, eyeG, iris };
}
EXT.foes['t2-watcher'] = {
  name: N('두 시대의 눈'),
  spawn(def, K) {
    const [i0, j0] = def.at;
    const f = { t2: true, kind: 't2-watcher', era: 'both', both: true, x: C2(i0), z: C2(j0), yaw: rad(def.face || 0), base: rad(def.face || 0), r: 0.7, alive: true,
      optional: def.required ? false : true, solidBody: false, state: 'patrol', stun: 0, dir: 1, pauseT: 0, meter: 0, cool: 0, tagY: 3.0 };
    eyeCells.push({ i: i0, j: j0, f });
    f.mk = makeEye(K); f.mk.g.position.set(f.x, 0, f.z); K.world.add(f.mk.g);
    f.cone = makeCone(); f.cone.material.color.set('#ffa040'); f.cone.renderOrder = 5;
    f.update = dt => {
      const S = K.S;
      f.era = S.era; // 두 시대에 다 있다(찌르기 대상도 지금 시대)
      if (!f.alive) return;
      f.cool = Math.max(0, f.cool - dt);
      const dx = S.p.x - f.x, dz = S.p.z - f.z, d = Math.hypot(dx, dz);
      const inGaze = !S.down && S.falling <= 0 && !S.trans && d < EYE.range && d > 0.3 && (() => { const [fx, fz] = fwd(f); return (dx * fx + dz * fz) / d > Math.cos(EYE.half) && eyeRay(S.era, f.x, f.z, dx / d, dz / d, d) >= d - 0.05; })();
      if (inGaze && f.cool <= 0) {
        f.meter += dt; turnTo(f, S.p.x, S.p.z, dt, EYE.track); // 붙잡은 걸 천천히 따라온다
        if (f.meter >= EYE.lock) {
          f.meter = 0; f.cool = EYE.cool; T2.lockT = EYE.lockT;
          S2.lock({ x: S.p.x, z: S.p.z }); K.screenFlash('#ff9a2a', 0.18);
          raiseAlarm(f, K.$t('두 시대의 눈에 붙잡혔어요 — 3초 동안 시대를 못 바꿔요'));
          say(K.$t('두 시대의 눈에 붙잡혔어요 — 3초 동안 시대를 못 바꿔요'), 2.2);
        }
      } else {
        f.meter = Math.max(0, f.meter - dt * 1.5);
        if (f.pauseT > 0) f.pauseT -= dt;
        else {
          f.yaw += f.dir * EYE.speed * dt;
          let off = f.yaw - f.base; off = Math.atan2(Math.sin(off), Math.cos(off));
          if (Math.abs(off) > EYE.sweep / 2) { f.yaw = f.base + Math.sign(off) * EYE.sweep / 2; f.dir = -Math.sign(off); f.pauseT = EYE.pause; }
        }
      }
      f.humT = (f.humT || 0) - dt; if (f.humT <= 0) { f.humT = 2.4; S2.eyeHum({ x: f.x, z: f.z }); }
    };
    f.view = () => {
      const S = K.S;
      f.mk.eyeG.rotation.y = f.yaw;
      f.mk.iris.material.color.set(f.meter > 0 ? '#ff3a1a' : '#ff8a2a');
      f.cone.visible = f.alive && !S.ring;
      if (f.cone.visible) {
        const pos = f.cone.geometry.attributes.position, a = pos.array, n = (a.length / 3) - 2;
        a[0] = f.x; a[1] = 0.07; a[2] = f.z;
        for (let k = 0; k <= n; k++) { const ang = f.yaw - EYE.half + (2 * EYE.half * k) / n, dx = Math.sin(ang), dz = Math.cos(ang), L = eyeRay(S.era, f.x, f.z, dx, dz, EYE.range); a[(k + 1) * 3] = f.x + dx * L; a[(k + 1) * 3 + 1] = 0.07; a[(k + 1) * 3 + 2] = f.z + dz * L; }
        pos.needsUpdate = true; f.cone.geometry.computeBoundingSphere();
        f.cone.material.opacity = 0.16 + 0.3 * Math.min(1, f.meter / EYE.lock);
      }
    };
    f.onStab = info => {
      if (!f.alive) return 'miss';
      if (fromBehind(f, info, 80)) {
        if (!kill(K, f, 'back')) return 'armor';
        f.mk.iris.material.color.set('#202020'); f.mk.eyeG.rotation.x = 0.6; f.cone.visible = false;
        S2.eggCrack({ x: f.x, z: f.z }); killFx(f, 'back', { msg: K.$t('두 시대의 눈을 깼어요') });
        return 'kill-back';
      }
      f.yaw = Math.atan2(info.tx, info.tz); f.meter = EYE.lock * 0.8;
      fail();
      return blocked(f, info, K.$t('눈이 노려봐요 — 시선 밖, 등 뒤에서'), 1.0);
    };
    f.onExternalKill = () => { f.cone.visible = false; f.mk.iris.material.color.set('#202020'); };
    return f;
  },
};
// 붙잡힘: 시대 전환 대기를 붙잡아 둔다 (main.js tryShift가 shiftCd를 본다) + 발밑 고리
let lockRing = null;
EXT.on('update', (dt, K) => {
  if (!(T2.lockT > 0)) return;
  T2.lockT -= dt; K.S.shiftCd = Math.max(K.S.shiftCd, T2.lockT);
});
EXT.on('frame', (dt, K) => {
  if (!lockRing || lockRing.parent !== K.world) { lockRing = decal(ringGeo(0.7, 0.85), '#ff9a2a', { depthTest: false, order: 8 }); }
  lockRing.visible = T2.lockT > 0;
  if (lockRing.visible) { lockRing.position.set(K.S.p.x, 0.1, K.S.p.z); lockRing.scale.setScalar(1 + 0.08 * Math.sin(K.S.time * 12)); lockRing.material.opacity = 0.5 + 0.3 * (T2.lockT / EYE.lockT); }
});
EXT.on('hurt', () => { T2.lockT = Math.min(T2.lockT || 0, 0.5); }); // 되감기 뒤까지 붙잡아 두진 않는다

/* ───────── 폭탄병 ───────── */
const SAP = { walk: 1.3, run: 3.1, range: 9.5, half: rad(55), keep: 5, throwCd: 2.6, flight: 0.6, fuse: 2.0, blast: 1.9, crater: 1.95, lose: 5 };
let bombs = [], craters = [];
EXT.on('roomLoad', () => { bombs = []; craters = []; });
EXT.floorAt.push((era, i, j) => (era === 'now' && craters.some(c => c.i === i && c.j === j) ? false : undefined));
function craterCells(x, z) {
  const K = T2.K, out = [];
  for (let j = cellOf(z) - 1; j <= cellOf(z) + 1; j++) for (let i = cellOf(x) - 1; i <= cellOf(x) + 1; i++) {
    if (Math.hypot(C2(i) - x, C2(j) - z) > SAP.crater) continue;
    if (K.ch('now', i, j) === '#' || K.ch('now', i, j) === '>' || K.solid('now', i, j) || !K.floorAt('now', i, j)) continue;
    out.push([i, j]);
  }
  return out;
}
function makeBomb(K) {
  const g = new K.THREE.Group();
  const b = new K.THREE.Mesh(new K.THREE.SphereGeometry(0.22, 12, 10), mat('#2a2622', { metalness: 0.5, roughness: 0.5 })); b.position.y = 0.22; g.add(b);
  const spark = new K.THREE.Mesh(new K.THREE.SphereGeometry(0.07, 6, 4), glowMat('#ffd060', { opacity: 1 })); spark.position.set(0, 0.5, 0); g.add(spark);
  return g;
}
function throwBomb(f, K) {
  const S = K.S, b = { fx: f.x, fz: f.z, tx: S.p.x, tz: S.p.z, t: 0, ph: 'fly', from: f };
  const [i, j] = nearestStand('past', cellOf(b.tx), cellOf(b.tz)); if (!K.stand('past', cellOf(b.tx), cellOf(b.tz))) { b.tx = C2(i); b.tz = C2(j); }
  b.mesh = makeBomb(K); K.groups.past.add(b.mesh); b.ghost = ghostCopy(b.mesh);
  b.ring = decal(ringGeo(0.9, 1), '#ff3a20', { order: 6 }); b.fill = decal(discGeo(), '#ff3a20', { order: 5 });
  b.cells = craterCells(b.tx, b.tz);
  b.prev = b.cells.map(() => { const m = decal(new K.THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), '#ff3020', { order: 6, depthTest: false }); return m; });
  bombs.push(b); S2.throwIt({ x: f.x, z: f.z });
}
function explode(b, K) {
  const S = K.S, x = b.tx, z = b.tz;
  S2.boom({ x, z }); K.impactFx(x, z, 'past', 2.2, 1.4); K.FX.flash(x, 1, z, '#ffb060', 8); S.shake = Math.max(S.shake, 0.45);
  K.FX.debris(x, 0.5, z, { n: 14, color: ['#4a3a2a', '#8a6a44'], speed: 5, up: 5, size: 0.14 });
  if (S.era === 'past' && !S.down && Math.hypot(S.p.x - x, S.p.z - z) < SAP.blast) K.hurt(K.$t('폭탄에 맞았어요'));
  for (const o of K.enemies()) {
    if (!o.alive || o.era !== 'past' || Math.hypot(o.x - x, o.z - z) > SAP.blast) continue;
    if (o.t2) { if (o.bossHp != null) { if (o.hurtBoss) o.hurtBoss('bomb'); } else if (o.onBomb) o.onBomb(); else { o._own = false; K.killFoe(o, 'bomb'); } }
    else if (o.kind !== 'boss') K.killFoe(o, 'bomb');
  }
  // 오늘의 바닥이 꺼진다
  const scorch = decal(discGeo(), '#000000', { add: false, opacity: 0.55, order: 3, parent: K.groups.past }); scorch.position.set(x, 0.03, z); scorch.scale.setScalar(1.5);
  const fresh = [];
  for (const [i, j] of b.cells) if (!craters.some(c => c.i === i && c.j === j)) {
    const hole = new K.THREE.Mesh(new K.THREE.PlaneGeometry(2.02, 2.02).rotateX(-Math.PI / 2), new K.THREE.MeshBasicMaterial({ color: '#030303' }));
    hole.position.set(C2(i), 0.04, C2(j)); K.groups.now.add(hole);
    for (let k = 0; k < 4; k++) { const r = new K.THREE.Mesh(new K.THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12, 0), mat('#4a4844')); r.position.set(C2(i) + (Math.random() - 0.5) * 1.8, 0.1, C2(j) + (Math.random() - 0.5) * 1.8); K.groups.now.add(r); }
    craters.push({ i, j }); fresh.push([i, j]);
  }
  if (fresh.length) {
    K.buildGhosts(); // 다른 시대 윤곽(오늘엔 구덩이 = 붉게)을 다시
    // 오늘 그 자리에 있던 것은 떨어진다
    for (const o of K.enemies()) {
      if (!o.alive || o.era !== 'now' || !fresh.some(([i, j]) => i === cellOf(o.x) && j === cellOf(o.z))) continue;
      if (o.t2 && o.onCrater) o.onCrater(); else if (o.kind !== 'boss') { K.killFoe(o, 'fall'); if (o.kind === 'golem') say(K.$t('어제의 폭발로 오늘 골렘 밑이 꺼졌어요'), 2.2); }
    }
    say(K.$t('어제 터진 자리 — 오늘엔 구덩이예요'), 1.8);
  }
}
EXT.on('update', (dt, K) => {
  const S = K.S;
  if (S.era !== 'past') return; // 폭탄은 어제에만 있다(오늘에 있으면 도화선도 멈춤)
  for (const b of bombs) {
    if (b.done) continue;
    b.t += dt;
    if (b.ph === 'fly') { if (b.t >= SAP.flight) { b.ph = 'fuse'; b.t = 0; S2.fuse({ x: b.tx, z: b.tz }); } }
    else if (b.ph === 'fuse' && b.t >= SAP.fuse) { b.done = true; explode(b, K); }
  }
});
EXT.on('frame', (dt, K) => {
  const S = K.S, away = S.era !== 'past';
  for (const b of bombs) {
    const k = b.ph === 'fly' ? Math.min(1, b.t / SAP.flight) : 1;
    const x = b.fx + (b.tx - b.fx) * k, z = b.fz + (b.tz - b.fz) * k, y = b.ph === 'fly' ? 4 * 1.8 * k * (1 - k) : 0;
    b.mesh.position.set(x, y, z); b.mesh.visible = !b.done && !away; b.ghost.visible = !b.done && away && ringPassed(x, z); b.ghost.position.copy(b.mesh.position);
    const fuse = b.ph === 'fuse' && !b.done, f = fuse ? b.t / SAP.fuse : 0;
    b.ring.visible = b.fill.visible = fuse;
    if (fuse) { for (const m of [b.ring, b.fill]) { m.position.set(b.tx, 0.08, b.tz); m.scale.setScalar(SAP.blast); m.material.depthTest = !away; } b.fill.material.opacity = 0.1 + 0.4 * f; b.ring.material.opacity = 0.5 + 0.4 * Math.sin(S.time * (8 + 20 * f)); b.mesh.children[1].visible = Math.sin(S.time * 30) > 0; }
    // 오늘에서: 꺼질 칸 미리 보기 (어제에서도 옅게)
    b.prev.forEach((m, n) => { const [i, j] = b.cells[n]; m.visible = !b.done; m.position.set(C2(i), 0.07, C2(j)); m.material.opacity = away ? 0.18 + 0.12 * Math.sin(S.time * 5) : 0.08; });
  }
});
EXT.foes['t2-sapper'] = {
  name: N('폭탄병'),
  spawn(def, K) {
    const C = Object.assign({}, SAP, { alarmMsg: '폭탄병이 알아챘어요 — 어제 터지면 오늘이 꺼져요' });
    const f = base(def, K, 't2-sapper', { base: 'guard', scale: 0.95, dagger: false, tint: { Armor: '#a86a2a', Shoulders: '#8a5420', Pants: '#3a2a1a' } }, C);
    const bag = new K.THREE.Mesh(new K.THREE.BoxGeometry(0.4, 0.45, 0.25), mat('#5a4030')); bag.position.set(0, 1.0, -0.3); f.holder.add(bag);
    if (f.m) ghostProp(f, bag);
    f.throwT = 1.2;
    place(f);
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      if (!f.alive) return;
      if (f.stun > 0) { f.stun -= dt; place(f); return; }
      const S = K.S, d = pdist(f), h = here(f);
      const seen = senseSight(f, dt, C.range, f.state === 'alert' ? rad(80) : C.half, 2.2, 0.8);
      f.throwT = Math.max(0, f.throwT - dt);
      if (f.state === 'alert' && h) {
        turnTo(f, S.p.x, S.p.z, dt, 5);
        // 제 발밑엔 안 던진다(폭발 1.9m + 1m 안이면 물러서기만) — 11/15 박자 봇이 폭탄병에 붙어 있으면 제 폭탄에 휘말려 방이 깨졌다
        if (seen && f.throwT <= 0 && d < C.range + 2 && d > C.blast + 1.0) { throwBomb(f, K); f.throwT = C.throwCd; if (f.ani) f.ani.once(CLIP.atk, { speed: 1.4, dur: 0.5 }); }
        if (d < C.keep) { const u = Math.max(d, 0.01); moveTo(f, f.x - (S.p.x - f.x) / u * 2, f.z - (S.p.z - f.z) / u * 2, C.run, dt, 0); play(f, CLIP.run, 0.15); }
        else play(f, CLIP.idle, 0.2);
      } else if (f.state === 'alert') play(f, CLIP.idle, 0.2);
      else if (f.sus > 0.3) { turnTo(f, S.p.x, S.p.z, dt, 3); play(f, CLIP.idle, 0.2); }
      else patrol(f, dt, C.walk);
      place(f);
    };
    f.view = () => viewCommon(f, C.range, C.half);
    // 2차 고칠 것(11/15): Shift를 박자로만 누르는 봇이 폭탄병 곁에 넘어와 찔러 7~10초에 깼다(폭탄 심지는 어제만 타서, 오가면 폭탄도 안 터짐)
    // → 넘어오며 찌르기는 '준비된 전환'만. 같은 시대 앞에서 찌르기(가까이선 약함)도 시대를 흔들며 다가왔으면 뒤로 뛰어 피한다
    const hop = () => {
      const S = K.S, d = Math.max(pdist(f), 0.01), bx = f.x - (S.p.x - f.x) / d * 2.6, bz = f.z - (S.p.z - f.z) / d * 2.6;
      const c = K.stand(f.era, cellOf(bx), cellOf(bz)) ? [bx, bz] : null;
      if (c) { K.FX.dust(f.x, 0.2, f.z, { n: 6, color: K.FXC[f.era].dust }); f.x = c[0]; f.z = c[1]; }
      if (f.state !== 'alert') alert(f);
      f.yaw = Math.atan2(S.p.x - f.x, S.p.z - f.z); f.throwT = Math.min(f.throwT, 0.5); place(f);
    };
    f.onStab = info => {
      const how = fromBehind(f, info, 70) ? 'back' : info.shift ? 'shift' : 'front';
      const ok = how === 'back' || info.thrown || (how === 'shift' ? prepared() : !flickering());
      if (!ok) { hop(); fail(); say(K.$t('폭탄병이 흔들림을 느끼고 물러났어요 — 가만히 다가가세요'), 1.8); return 'dodged'; }
      die(f, how, K.$t(how === 'front' ? '폭탄병은 가까이에선 약해요' : how === 'shift' ? '전환 기습!' : '등 뒤에서 한 방'));
      return 'kill-' + how;
    };
    f.onBomb = () => die(f, 'bomb', K.$t('제 폭탄에 휘말렸어요'));
    f.boltHit = () => { die(f, 'bolt', K.$t('동료의 화살에 맞았어요')); return true; };
    return f;
  },
};

/* ───────── 되감는 검사 ───────── */
const DUEL = { walk: 1.6, run: 4.2, turn: 8, range: 8, half: rad(70), win: 1.3, back: 1.5, lose: 6,
  lunge: { w: 0.45, speed: 9, len: 5, min: 2.8, max: 6.5, cd: 2.2, rec: 0.55 }, flurry: { w: 0.42, r: 2.2, half: 65, rec: 0.55 } };
EXT.foes['t2-duelist'] = {
  name: N('되감는 검사'),
  spawn(def, K) {
    const C = Object.assign({}, DUEL, { alarmMsg: '검사가 칼을 뽑았어요 — 막 넘어온 순간에만 통해요' });
    const f = base(def, K, 't2-duelist', { base: 'guard', scale: 1.02, tint: { Armor: '#2aa8a0', Shoulders: '#1e8078', Pants: '#18303a', Boots: '#10242a' }, glow: ['#062a28', 1] }, C);
    f.hist = []; f.histT = 0; f.act = null; f.cdL = 1.0;
    f.post = decal(discGeo(), '#7fe8ff', { order: 6 }); f.postR = decal(ringGeo(0.85, 1), '#7fe8ff', { order: 6 });
    f.winR = decal(ringGeo(0.9, 1), '#ffffff', { order: 7 }); f.cone2 = decal(arcGeo(65), '#ff3a20'); f.lane = decal(laneGeo(), '#ff3020', { order: 5 });
    for (const m of [f.winR, f.cone2, f.lane]) m.visible = false;
    place(f);
    const open = () => { const A = T2.arrive; return A && A.era === f.era && A.prep && K.S.time - A.t < C.win; };
    f.isOpen = open;
    const start = k => { f.act = { k, t: 0, A: C[k], ph: 'wind', hit: false, aim: Math.atan2(K.S.p.x - f.x, K.S.p.z - f.z) }; if (f.ani) f.ani.once(k === 'lunge' ? CLIP.atk : 'AS_Combo_Attack_01_01_Seq', { speed: 1.5, dur: C[k].w + 0.35 }); S2.bigSwing({ x: f.x, z: f.z }); };
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      if (!f.alive) return;
      const S = K.S, d = pdist(f), h = here(f);
      // 되감길 자리 기록(이 시대 시간 1.5초 전)
      f.histT -= dt; if (f.histT <= 0) { f.histT = 0.1; f.hist.push({ x: f.x, z: f.z, yaw: f.yaw }); if (f.hist.length > Math.round(C.back / 0.1)) f.hist.shift(); }
      if (f.stun > 0) { f.stun -= dt; place(f); return; }
      f.cdL = Math.max(0, f.cdL - dt);
      const seen = senseSight(f, dt, C.range, C.half, 2.6, 1.0);
      if (f.act) {
        const a = f.act, A = a.A; a.t += dt;
        if (a.k === 'flurry') {
          if (a.t < a.w * 0.5) turnTo(f, S.p.x, S.p.z, dt, 6);
          if (a.ph === 'wind' && a.t >= A.w) { a.ph = 'rec'; S2.bigSwing({ x: f.x, z: f.z }); if (h && d < A.r && inFront(f, S.p.x, S.p.z, rad(A.half))) K.hurt(K.$t('검사에게 베였어요')); }
          if (a.ph === 'rec' && a.t >= A.w + A.rec) f.act = null;
        } else {
          if (a.ph === 'wind') { if (a.t < A.w - 0.15) { turnTo(f, S.p.x, S.p.z, dt, 8); a.aim = f.yaw; } if (a.t >= A.w) { a.ph = 'dash'; a.gone = 0; } }
          else if (a.ph === 'dash') {
            const st = A.speed * dt, ux = Math.sin(a.aim), uz = Math.cos(a.aim);
            if (!K.stand(f.era, cellOf(f.x + ux * (st + 0.45)), cellOf(f.z + uz * (st + 0.45))) || a.gone >= A.len) { a.ph = 'rec'; a.t = 0; }
            else { f.x += ux * st; f.z += uz * st; a.gone += st; if (!a.hit && h && pdist(f) < 1.0) { a.hit = true; K.hurt(K.$t('검사의 찌르기에 맞았어요')); } }
          } else if (a.ph === 'rec' && a.t >= A.rec) { f.act = null; f.cdL = A.cd; }
        }
        place(f); return;
      }
      if (f.state === 'alert' && h) {
        if (d < 2.0 && inFront(f, S.p.x, S.p.z, rad(70))) start('flurry');
        else if (d > C.lunge.min && d < C.lunge.max && f.cdL <= 0 && los(f.era, f.x, f.z, S.p.x, S.p.z)) start('lunge');
        else { chase(f, dt, C.run, 1.7); turnTo(f, S.p.x, S.p.z, dt, C.turn); }
      } else if (f.state !== 'alert' && f.sus > 0.3) { turnTo(f, S.p.x, S.p.z, dt, 4); play(f, CLIP.idle, 0.2); }
      else if (f.state !== 'alert') patrol(f, dt, C.walk);
      place(f);
    };
    f.view = () => {
      const S = K.S, away = viewCommon(f, C.range, C.half), a = f.act, h0 = f.hist[0];
      const show = f.alive && !!h0 && (!away || ringPassed(f.x, f.z));
      f.post.visible = f.postR.visible = show;
      if (show) { f.post.position.set(h0.x, 0.07, h0.z); f.post.scale.setScalar(0.45); f.post.material.opacity = 0.18; f.postR.position.set(h0.x, 0.08, h0.z); f.postR.scale.setScalar(0.55); f.postR.material.opacity = 0.45; for (const m of [f.post, f.postR]) m.material.depthTest = !away; }
      const op = f.alive && open();
      f.winR.visible = op;
      if (op) { const left = 1 - (S.time - T2.arrive.t) / C.win; f.winR.position.set(f.x, 0.1, f.z); f.winR.scale.setScalar(0.8 + 1.4 * left); f.winR.material.opacity = 0.9; }
      const k = a && a.ph === 'wind' ? Math.min(1, a.t / a.A.w) : 0;
      f.cone2.visible = !!a && a.k === 'flurry' && a.ph === 'wind';
      if (f.cone2.visible) { f.cone2.position.set(f.x, 0.07, f.z); f.cone2.rotation.y = f.yaw; f.cone2.scale.setScalar(a.A.r * (0.5 + 0.5 * k)); f.cone2.material.opacity = 0.2 + 0.45 * k; f.cone2.material.depthTest = !away; }
      f.lane.visible = !!a && a.k === 'lunge' && a.ph !== 'rec';
      if (f.lane.visible) { f.lane.position.set(f.x, 0.09, f.z); f.lane.rotation.y = a.aim; f.lane.scale.set(1.0, 1, a.A.len); f.lane.material.opacity = 0.25 + 0.4 * k; f.lane.material.depthTest = !away; }
    };
    const rewind = () => {
      const h0 = f.hist[0] || { x: f.x, z: f.z, yaw: f.yaw };
      K.FX.motes(f.x, 1, f.z, { n: 26, color: ['#7fe8ff', '#ffffff'], speed: 3, up: 1.5, life: 0.6 });
      f.x = h0.x; f.z = h0.z; f.yaw = Math.atan2(K.S.p.x - f.x, K.S.p.z - f.z); f.hist = [];
      K.FX.motes(f.x, 1, f.z, { n: 26, color: ['#7fe8ff', '#ffffff'], speed: 2, up: 1.5, life: 0.7 });
      S2.rewindWhoosh({ x: f.x, z: f.z });
      if (f.state !== 'alert') alert(f);
      f.act = null; f.cdL = 0; // 되감자마자 받아칠 수 있다
      place(f);
    };
    f.onStab = info => {
      if (!f.alive) return 'miss';
      if (open() && !info.thrown) { die(f, info.shift ? 'shift' : 'back', K.$t('막 넘어온 순간 — 되감지 못했어요!')); return 'kill'; }
      rewind(); fail();
      say(K.$t(T2.arrive && T2.arrive.wary ? '되감았어요 — 자꾸 오가서 알아챘어요, 3초 쉬었다 넘어오세요' : '되감았어요 — 다른 시대에 1초 있다가 넘어온 직후에만 통해요'), 2);
      return 'rewound';
    };
    f.boltHit = () => { rewind(); return true; };
    return f;
  },
};
