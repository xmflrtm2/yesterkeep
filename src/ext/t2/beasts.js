// T2 몬스터 — 짐승 셋: 시간 사냥개 · 미믹 · 쥐구멍(쥐 떼).
//   시간 사냥개: 두 시대를 다 오간다. 내가 시대를 바꾸면 0.7초 뒤 같은 자리로 따라온다(그동안 그 자리에 도착 고리).
//               칼은 피한다(찔러도 소용없음). 그 자리가 넘어간 시대에서 구덩이면 떨어진다 → 구덩이로 꾀어 떨어뜨리는 게 유일한 길.
//   미믹: 오늘엔 이빨 달린 궤짝(제자리에서 물어뜯음), 어제엔 그냥 궤짝. 어제 궤짝을 밀면 오늘의 미믹도 그 자리에 있다.
//         어제 구덩이에 밀어 넣거나, 오늘엔 구덩이·벽인 칸으로 밀면 오늘의 미믹이 사라진다. 등 뒤·잠든 채 기습도 통한다.
//   쥐구멍: 오늘에 쥐를 계속 내보낸다. 어제의 같은 자리에서 E로 돌을 밀어 막으면 오늘의 구멍도 막혀 있다. 쥐는 한 번 찌르면 앞쪽 여러 마리.
import { EXT } from '../../ext.js';
import { T2, cellOf, C2, other, pdist, fwd, here, inFront, fromBehind, sees, los, turnTo, turnToYaw, moveTo, nextStep, nearestStand,
  fail, raiseAlarm, decal, ringGeo, discGeo, arcGeo, ghostCopy, ringPassed, mat, glowMat, blocked, killFx, t2Foes, prepared } from './core.js';
import { S2 } from './sfx.js';

const N = k => k;
const rad = T2.rad;

/* ───────── 시간 사냥개 ───────── */
const HOUND = { run: 4.5, walk: 1.6, turn: 9, r: 0.38, wake: 6.5, wakeAny: 3.0, follow: 0.7, daze: 0.3, windup: 0.42, recover: 0.55, reach: 1.6, arc: rad(75), attackAt: 1.35 };
const HOUND_E = { run: 4.9, follow: 0.5, windup: 0.36 };
const HOUND_COL = { past: { fur: '#8a5a32', dark: '#4a2e18' }, now: { fur: '#5d6670', dark: '#2c3238' } };
function makeHound(K) {
  const THREE = K.THREE, root = new THREE.Group();
  const fur = mat('#8a5a32'), dark = mat('#4a2e18'), crack = glowMat('#7fe8ff', { opacity: 0.85 }), eye = glowMat('#aaf4ff', { opacity: 1 });
  const box = (w, h, d, x, y, z, m, p = root) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const bodyG = new THREE.Group(); root.add(bodyG);
  box(0.42, 0.4, 1.0, 0, 0.62, -0.05, fur, bodyG);
  box(0.5, 0.5, 0.42, 0, 0.7, 0.32, fur, bodyG);
  const headG = new THREE.Group(); headG.position.set(0, 0.88, 0.56); bodyG.add(headG);
  box(0.32, 0.3, 0.38, 0, 0.02, 0.1, fur, headG);
  box(0.2, 0.16, 0.28, 0, -0.05, 0.38, dark, headG);
  for (const sx of [-0.1, 0.1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), dark); ear.position.set(sx, 0.24, 0.02); headG.add(ear);
    box(0.06, 0.04, 0.03, sx, 0.07, 0.29, eye, headG);
  }
  for (const sx of [-0.22, 0.22]) { box(0.02, 0.06, 0.7, sx, 0.66, -0.05, crack, bodyG); box(0.02, 0.18, 0.04, sx, 0.72, 0.15, crack, bodyG); }
  const legs = [];
  for (const [x, z] of [[-0.15, 0.36], [0.15, 0.36], [-0.15, -0.38], [0.15, -0.38]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.55, z); bodyG.add(hip);
    box(0.12, 0.52, 0.13, 0, -0.26, 0, dark, hip); legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.75, -0.55); bodyG.add(tail);
  box(0.08, 0.08, 0.45, 0, 0.08, -0.2, fur, tail); tail.rotation.x = -0.6;
  return { root, bodyG, headG, legs, tail, fur, dark };
}
EXT.foes['t2-hound'] = {
  name: N('시간 사냥개'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, HOUND, elite ? HOUND_E : {});
    const [i0, j0] = def.at || def.path[0];
    const f = { t2: true, kind: 't2-hound', era: def.era || 'past', x: C2(i0), z: C2(j0), yaw: rad(def.face || 0), r: C.r, alive: true, elite,
      state: def.awake ? 'alert' : 'sleep', sus: 0, stun: 0, wind: 0, rec: 0, replan: 0, step: null, follow: null, daze: 0, fallT: 0, sniffed: false, walkT: 0, hearsAlarm: true, gaitT: 0 };
    f.mk = makeHound(K); f.mk.root.scale.setScalar(elite ? 1.2 : 1); K.world.add(f.mk.root);
    if (elite) { f.mk.fur.color.set('#c9a050'); f.mk.fur.emissive = new K.THREE.Color('#3a2a00'); }
    f.ghost = ghostCopy(f.mk.root);
    f.ring = decal(ringGeo(0.86, 1), '#7fe8ff', { depthTest: false, order: 7 });
    f.biteArc = decal(arcGeo(75), '#ff3a20');
    f.zzz = null;
    const setEraLook = () => { const c = HOUND_COL[f.era]; if (!elite) f.mk.fur.color.set(c.fur); f.mk.dark.color.set(c.dark); };
    setEraLook();
    f.hearAlarm = () => { if (f.alive && f.state === 'sleep') wake(false); };
    const wake = loud => {
      f.state = 'alert'; f.daze = 0.35; S2.bark({ x: f.x, z: f.z });
      if (loud) raiseAlarm(f, K.$t('사냥개가 깨어났어요! 한쪽 시대에만 있는 구덩이로 꾀어내세요'));
    };
    // 내가 시대를 바꾸면: 깨어 있으면 0.7초 뒤 따라온다 (돌아오면 취소)
    f.onShift = (from, to) => {
      if (!f.alive || f.fallT > 0) return;
      if (from === f.era && f.state === 'alert') f.follow = { t: C.follow, T: C.follow };
      else if (to === f.era) f.follow = null;
    };
    const landing = () => {
      const S = K.S, E = S.era, i = cellOf(f.x), j = cellOf(f.z);
      // 정예가 피할 자리: 가장 가까운 바닥이되 플레이어와 3m 넘게 (곁에 내려앉아 바로 물지 않게)
      if (!K.floorAt(E, i, j)) return elite && !f.sniffed ? { kind: 'dodge', at: nearestStand(E, i, j, (a, b) => Math.hypot(C2(a) - S.p.x, C2(b) - S.p.z) < 3) } : { kind: 'pit' };
      if (K.solid(E, i, j)) return { kind: 'move', at: nearestStand(E, i, j) };
      return { kind: 'ok' };
    };
    const arrive = () => {
      const L = landing();
      f.era = K.S.era; f.follow = null; setEraLook();
      S2.timeJump({ x: f.x, z: f.z }); K.FX.motes(f.x, 0.5, f.z, { n: 18, color: ['#7fe8ff', '#ffffff'], speed: 2, up: 1.4, life: 0.6 });
      if (L.kind === 'pit') { f.fallT = 0.001; f.fall = true; S2.yelp({ x: f.x, z: f.z }); return; }
      if (L.kind === 'dodge') { f.sniffed = true; S2.growl({ x: f.x, z: f.z }); K.toast(K.$t('정예 사냥개는 구덩이 냄새를 맡아요 — 한 번 더!'), 1.8); }
      if (L.at) { f.x = C2(L.at[0]); f.z = C2(L.at[1]); }
      f.daze = L.kind === 'dodge' ? 0.8 : C.daze; f.wind = 0; f.rec = 0;
      f.yaw = Math.atan2(K.S.p.x - f.x, K.S.p.z - f.z);
    };
    K.addEntity({ era: 'both', t: 0, update(dt) {
      const S = K.S;
      if (!f.alive) return;
      if (f.fallT > 0) { // 구덩이: 빙글 돌며 가라앉고 1초 뒤 사라짐
        f.fallT += dt; f.mk.root.position.y = -9 * f.fallT * f.fallT; f.mk.root.rotation.z += dt * 6;
        if (f.fallT > 1.0) { f.alive = false; f.mk.root.visible = false; K.killed(f, 'fall'); K.toast(K.$t('사냥개가 구덩이에 떨어졌어요'), 1.6); }
        return;
      }
      if (f.follow) { if (S.era === f.era) f.follow = null; else { f.follow.t -= dt; if (f.follow.t <= 0) arrive(); } return; }
      if (S.era !== f.era) return; // 다른 시대에 멈춰 있다
      f.stun = 0; // 시간 충격은 안 먹힌다 (늘 시간을 넘나드는 짐승)
      const d = pdist(f), h = here(f);
      if (f.state === 'sleep') {
        if (h && ((d < C.wake && sees(f, S.p.x, S.p.z, C.wake, rad(110))) || d < C.wakeAny)) wake(true);
        pose(dt, 0); place(); return;
      }
      if (f.daze > 0) { f.daze -= dt; pose(dt, 0); place(); return; }
      if (f.wind > 0) {
        turnTo(f, S.p.x, S.p.z, dt, 6); f.wind -= dt;
        if (f.wind <= 0) {
          f.rec = C.recover; S2.bite({ x: f.x, z: f.z });
          const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw); f.x += fx * 0.35; f.z += fz * 0.35;
          if (h && d < C.reach && inFront(f, S.p.x, S.p.z, C.arc)) K.hurt(K.$t('사냥개에게 물렸어요'));
        }
        pose(dt, 0); place(); return;
      }
      if (f.rec > 0) { f.rec -= dt; pose(dt, 0); place(); return; }
      if (h && d < C.attackAt && inFront(f, S.p.x, S.p.z, rad(60))) { f.wind = C.windup; S2.growl({ x: f.x, z: f.z }); pose(dt, 0); place(); return; }
      // 쫓기: 그 시대의 설 수 있는 칸으로만. 못 닿으면 가장자리에서 서성이며 짖는다
      f.replan -= dt;
      if (f.replan <= 0) { f.replan = 0.25; f.step = nextStep(f, cellOf(S.p.x), cellOf(S.p.z)); f.cut = !f.step && (cellOf(S.p.x) !== cellOf(f.x) || cellOf(S.p.z) !== cellOf(f.z)); }
      let sp = 0;
      if (f.cut) { turnTo(f, S.p.x, S.p.z, dt, 6); f.barkT = (f.barkT || 0) - dt; if (f.barkT <= 0) { f.barkT = 1.4; S2.bark({ x: f.x, z: f.z }); } }
      else { const tgt = f.step && d > 2.0 ? f.step : [S.p.x, S.p.z]; if (d > 1.1) { moveTo(f, tgt[0], tgt[1], C.run, dt, C.turn); sp = C.run; } else turnTo(f, S.p.x, S.p.z, dt, C.turn); }
      f.pantT = (f.pantT || 0) - dt; if (f.pantT <= 0) { f.pantT = 1.1; S2.pant({ x: f.x, z: f.z }); }
      pose(dt, sp); place();
    } });
    const pose = (dt, sp) => {
      const m = f.mk;
      f.gaitT += dt * (sp > 0 ? 13 : 2);
      const a = sp > 0 ? 0.75 : 0.04, s = Math.sin(f.gaitT);
      m.legs[0].rotation.x = s * a; m.legs[3].rotation.x = s * a; m.legs[1].rotation.x = -s * a; m.legs[2].rotation.x = -s * a;
      m.bodyG.position.y = sp > 0 ? Math.abs(Math.cos(f.gaitT)) * 0.07 : 0;
      m.tail.rotation.y = Math.sin(K.S.time * (f.state === 'alert' ? 12 : 3)) * 0.4;
      const crouch = f.wind > 0 ? 0.12 * (1 - f.wind / C.windup) : 0;
      m.bodyG.rotation.x = f.state === 'sleep' ? 0 : crouch; m.headG.rotation.x = f.state === 'sleep' ? 0.5 : -crouch * 1.5;
      if (f.state === 'sleep') { m.bodyG.position.y = -0.3; for (const l of m.legs) l.rotation.x = 1.2; }
    };
    const place = () => { f.mk.root.position.x = f.x; f.mk.root.position.z = f.z; if (f.fallT <= 0) f.mk.root.position.y = 0; f.mk.root.rotation.y = f.yaw; };
    place(); pose(0, 0);
    f.view = () => {
      const S = K.S, away = f.era !== S.era;
      f.mk.root.visible = f.alive && (!away || (S.ring && !ringPassed(f.x, f.z)));
      f.ghost.visible = f.alive && away && f.fallT <= 0 && ringPassed(f.x, f.z);
      f.ghost.position.copy(f.mk.root.position); f.ghost.rotation.copy(f.mk.root.rotation);
      if (f.ghost.visible) { f.ghost.children[0].position.copy(f.mk.bodyG.position); f.ghost.children[0].rotation.copy(f.mk.bodyG.rotation); }
      // 도착 고리: 따라오는 중이면 그 자리(줄어듦). 넘어간 시대에서 구덩이면 붉게, 정예가 피할 자리면 주황
      const R = f.ring;
      R.visible = !!(f.alive && f.follow && away && ringPassed(f.x, f.z));
      if (R.visible) {
        const k = f.follow.t / f.follow.T, L = landing();
        R.material.color.set(L.kind === 'pit' ? '#ff3a3a' : L.kind === 'dodge' ? '#ffae3a' : '#7fe8ff');
        R.position.set(f.x, 0.1, f.z); R.scale.setScalar(0.5 + 1.1 * k); R.material.opacity = 0.75;
      }
      const a = f.biteArc;
      a.position.set(f.x, 0.07, f.z); a.rotation.y = f.yaw;
      const kk = f.alive && f.wind > 0 ? 1 - f.wind / C.windup : 0;
      a.material.opacity = f.alive && f.wind > 0 ? 0.2 + 0.4 * kk : 0; a.scale.setScalar(C.reach * (0.4 + 0.6 * kk));
      a.material.depthTest = !away;
    };
    f.onStab = info => {
      if (f.state === 'sleep') wake(true);
      // 칼을 피해 뒤로 뛴다
      const d = Math.max(info.td, 0.01), bx = f.x - info.tx / d * 1.4, bz = f.z - info.tz / d * 1.4;
      for (let k = 0; k < 6; k++) moveTo(f, bx, bz, 8, 1 / 30, 0);
      f.daze = 0.25; f.wind = 0; S2.growl({ x: f.x, z: f.z });
      K.FX.dust(f.x, 0.2, f.z, { n: 6, color: K.FXC[f.era].dust });
      K.toast(K.$t('사냥개는 칼을 피해요 — 한쪽 시대에만 있는 구덩이로 꾀어내세요'), 2);
      fail();
      return 'dodged';
    };
    f.boltHit = () => false; // 화살도 피한다
    f.onPlayerHurt = () => { f.daze = Math.max(f.daze, 1.4); f.wind = 0; f.rec = 0; }; // 물고 나면 잠깐 물러선다
    f.revive = () => { // 되살아나면 떨어진 자리 옆 바닥에서
      const [i, j] = nearestStand(f.era, cellOf(f.x), cellOf(f.z));
      f.x = C2(i); f.z = C2(j); f.alive = true; f.counted = false; f.fall = false; f.fallT = 0; f.daze = 1; f.state = 'alert'; f.follow = null;
      f.mk.root.position.y = 0; f.mk.root.rotation.z = 0; f.mk.root.visible = true; K.S.kills = Math.max(0, K.S.kills - 1);
    };
    return f;
  },
};

/* ───────── 미믹 ───────── */
const MIMIC = { wake: 2.4, sleep: 4.8, sleepAfter: 3, turn: 5, windup: 0.5, recover: 0.75, reach: 2.3, arc: rad(60), attackAt: 2.2, push: 0.25, r: 0.8 };
const MIMIC_E = { wake: 3.2, windup: 0.38, reach: 2.6 };
let chests = []; // 이 방의 어제 궤짝 (미믹마다 하나)
EXT.on('roomLoad', () => { chests = chests.filter(c => c.f && T2.K.extFoes.includes(c.f)); });
EXT.solidAt.push((era, i, j) => (era === 'past' && chests.some(c => !c.sunk && c.i === i && c.j === j) ? true : undefined));
function makeChest(K, now) {
  const THREE = K.THREE, g = new THREE.Group();
  // 오늘은 푸른 밤 조명이라 어두운 나무가 묻힌다 → 밝게 + 은은한 발광
  const wood = now ? mat('#8a7254', { emissive: '#2a1e10', emissiveIntensity: 1 }) : mat('#8a5c2e'), band = mat(now ? '#8a8478' : '#b08a40', { metalness: 0.6, roughness: 0.45, emissive: now ? '#1a1a1a' : '#000' });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.72, 0.95), wood); base.position.y = 0.36; g.add(base);
  const lidG = new THREE.Group(); lidG.position.set(0, 0.72, -0.47); g.add(lidG);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.35, 12, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.set(0, 0, 0.47); lidG.add(lid);
  for (const x of [-0.45, 0.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.76, 0.99), band); b.position.set(x, 0.37, 0); g.add(b); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.06), band); lock.position.set(0, 0.62, 0.49); g.add(lock);
  const out = { g, lidG, wood };
  if (now) {
    // 이빨 · 혀 · 눈 (깨어나 뚜껑이 열릴 때 보인다)
    const teeth = new THREE.Group(); teeth.position.set(0, 0.72, 0.4); g.add(teeth);
    const tm = mat('#efe6cf', { roughness: 0.4 });
    for (let k = 0; k < 7; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), tm); t.position.set(-0.54 + k * 0.18, 0.08, 0); teeth.add(t); const u = t.clone(); u.rotation.x = Math.PI; u.position.y = 0.32; lidG.add(u); u.position.set(-0.54 + k * 0.18, -0.08, 0.86); }
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.6), mat('#a03040')); tongue.position.set(0, 0.74, 0.25); g.add(tongue);
    const eyeM = glowMat('#ff3a2a', { opacity: 0 });
    for (const x of [-0.25, 0.25]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeM); e.position.set(x, 0.18, 0.4); lidG.add(e); }
    const moss = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.6), mat('#3d5a2a')); moss.position.set(0.1, 1.2, -0.1); lidG.add(moss); moss.position.set(0.1, 0.48, 0.3);
    out.eyeM = eyeM; out.teeth = teeth; out.tongue = tongue;
  }
  return out;
}
EXT.foes['t2-mimic'] = {
  name: N('미믹'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, MIMIC, elite ? MIMIC_E : {});
    const [i0, j0] = def.at;
    if (chests.length && !K.extFoes.includes(chests[0].f)) chests = []; // 새 방의 첫 미믹: 지난 방 궤짝 비우기
    const f = { t2: true, kind: 't2-mimic', era: 'now', x: C2(i0), z: C2(j0), yaw: rad(def.face || 0), r: C.r, alive: true, elite, state: 'patrol', sus: 0, stun: 0, wind: 0, rec: 0, farT: 0, hearsAlarm: false };
    const ch = { i: i0, j: j0, f, sunk: false, vx: f.x, vz: f.z, vy: 0, pushT: 0 };
    chests.push(ch); f.chest = ch;
    // 어제: 궤짝 (어제 무리 — 오늘엔 안 보임)
    ch.past = makeChest(K, false); K.groups.past.add(ch.past.g);
    // 오늘: 이빨 달린 궤짝 (오늘 무리) + 어제에서 보이는 붉은 멈춘 윤곽
    f.mk = makeChest(K, true); if (elite) { f.mk.wood.color.set('#5a3a2a'); f.mk.wood.emissive = new K.THREE.Color('#401000'); }
    f.mk.g.scale.setScalar(elite ? 1.15 : 1);
    K.groups.now.add(f.mk.g);
    f.ghost = ghostCopy(f.mk.g);
    // 어제에선 같은 자리의 궤짝이 보여야 하므로 윤곽은 옅게(붉은 기운) + 조금 크게
    const faint = K.ghostRedMat.clone(); faint.opacity = 0.2;
    f.ghost.traverse(o => { if (o.isMesh) o.material = faint; });
    f.ghost.scale.multiplyScalar(1.06);
    f.arc = decal(arcGeo(60), '#ff3a20');
    const place = () => {
      ch.past.g.position.set(ch.vx, ch.vy, ch.vz); ch.past.g.rotation.y = f.yaw;
      f.mk.g.position.set(f.x, 0, f.z); f.mk.g.rotation.y = f.yaw;
    };
    place();
    const vanish = (how, msg) => { // 어제의 일 때문에 오늘에서 사라짐
      if (!f.alive) return;
      f.alive = false; f.gone = true; f.mk.g.visible = false;
      K.FX.dust(f.x, 0.3, f.z, { n: 14, color: K.FXC.now.dust }); K.FX.debris(f.x, 0.6, f.z, { n: 6, color: ['#4f4232', '#3a3226'], speed: 2, up: 3, size: 0.12 });
      S2.mimicWake({ x: f.x, z: f.z });
      K.killed(f, how); if (msg) K.toast(msg, 2.4);
    };
    const wake = () => { if (f.state === 'alert') return; f.state = 'alert'; f.farT = 0; S2.mimicWake({ x: f.x, z: f.z }); K.S.shake = Math.max(K.S.shake, 0.15); fail(); };
    f.update = dt => {
      if (!f.alive) return;
      const S = K.S, d = pdist(f), h = here(f);
      if (f.stun > 0) { f.stun -= dt; return; }
      if (f.state !== 'alert') {
        if (h && d < C.wake && los('now', f.x, f.z, S.p.x, S.p.z)) wake();
        f.mk.lidG.rotation.x = -0.04 - 0.03 * Math.sin(S.time * 2); f.mk.eyeM.opacity = 0;
        return;
      }
      f.mk.eyeM.opacity = 1;
      if (f.wind > 0) {
        turnTo(f, S.p.x, S.p.z, dt, 2.5); f.wind -= dt;
        f.mk.lidG.rotation.x = -1.1 * (1 - f.wind / C.windup);
        if (f.wind <= 0) {
          f.rec = C.recover; S2.chomp({ x: f.x, z: f.z }); K.S.shake = Math.max(K.S.shake, 0.12);
          if (h && d < C.reach && inFront(f, S.p.x, S.p.z, C.arc)) K.hurt(K.$t('미믹에게 물렸어요'));
        }
      } else if (f.rec > 0) { f.rec -= dt; f.mk.lidG.rotation.x = -1.1 * Math.max(0, f.rec / C.recover); }
      else {
        turnTo(f, S.p.x, S.p.z, dt, C.turn);
        f.mk.lidG.rotation.x = -0.25 - 0.1 * Math.sin(S.time * 9);
        if (h && d < C.attackAt && inFront(f, S.p.x, S.p.z, rad(50))) { f.wind = C.windup; S2.creak({ x: f.x, z: f.z }); }
        f.farT = d > C.sleep || !h ? f.farT + dt : 0;
        if (f.farT > C.sleepAfter) { f.state = 'patrol'; f.mk.lidG.rotation.x = 0; } // 다시 궤짝인 척
      }
      place();
    };
    f.view = () => {
      const S = K.S, away = S.era !== 'now';
      f.ghost.visible = f.alive && away && ringPassed(f.x, f.z);
      f.ghost.position.copy(f.mk.g.position); f.ghost.rotation.copy(f.mk.g.rotation);
      // 미는 동안 미끄러지듯
      ch.vx += (C2(ch.i) - ch.vx) * 0.35; ch.vz += (C2(ch.j) - ch.vz) * 0.35; ch.vy += ((ch.sunk ? -1.0 : 0) - ch.vy) * 0.2;
      ch.past.g.position.set(ch.vx, ch.vy, ch.vz);
      const a = f.arc;
      a.position.set(f.x, 0.07, f.z); a.rotation.y = f.yaw;
      const k = f.alive && f.wind > 0 ? 1 - f.wind / C.windup : 0;
      a.material.opacity = f.alive && f.wind > 0 ? 0.2 + 0.4 * k : 0; a.scale.setScalar(C.reach * (0.5 + 0.5 * k)); a.material.depthTest = !away;
    };
    f.onStab = info => {
      const behind = fromBehind(f, info, 60);
      // 등 뒤, 또는 궤짝인 척하는 동안 옆에서 넘어오며 기습(준비된 전환만). 앞은 늘 이빨
      const side = info.shift && prepared() && f.state !== 'alert' && !inFront(f, f.x + info.tx, f.z + info.tz, rad(60));
      if (behind || side) {
        f.alive = false; f.mk.lidG.rotation.x = -0.6; f.mk.eyeM.opacity = 0;
        K.sfx.crumble({ x: f.x, z: f.z }); killFx(f, behind ? 'back' : 'shift', { msg: K.$t(behind ? '등 뒤에서 한 방' : '궤짝인 척하던 미믹을 기습!') });
        K.FX.debris(f.x, 0.6, f.z, { n: 8, color: ['#4f4232', '#3a3226'], speed: 3, up: 3, size: 0.12 });
        K.killed(f, behind ? 'back' : 'shift'); return 'kill';
      }
      wake(); f.rec = 0; f.wind = C.windup * 0.7; f.yaw = Math.atan2(info.tx, info.tz);
      return blocked(f, info, K.$t('이빨에 막혔어요 — 어제 궤짝을 밀어 보세요'), 1.1);
    };
    f.boltHit = b => { if (inFront(f, b.x, b.z, rad(80))) return true; return false; };
    // 어제의 궤짝 밀기: 걸어서 밀면 한 칸. 구덩이로 밀면 빠진다
    ch.tryPush = (dt) => {
      const S = K.S;
      // 미믹이 사라져도 어제의 궤짝은 남는다(엄폐물·발판으로 계속 밀 수 있음)
      if (ch.sunk || S.era !== 'past' || S.roll > 0 || S.falling > 0 || S.trans || S.down) { ch.pushT = 0; return; }
      const cx = C2(ch.i), cz = C2(ch.j), dx = S.p.x - cx, dz = S.p.z - cz, vx = S.vel.x, vz = S.vel.z;
      let dir = null;
      if (Math.abs(dz) < 0.95 && Math.abs(dx) < 1 + 0.36 + 0.12 && Math.abs(dx) > 0.6 && -Math.sign(dx) * vx > 2.2) dir = [-Math.sign(dx), 0];
      else if (Math.abs(dx) < 0.95 && Math.abs(dz) < 1 + 0.36 + 0.12 && Math.abs(dz) > 0.6 && -Math.sign(dz) * vz > 2.2) dir = [0, -Math.sign(dz)];
      if (!dir) { ch.pushT = Math.max(0, ch.pushT - dt * 2); return; }
      ch.pushT += dt;
      if (ch.pushT < C.push) return;
      ch.pushT = 0;
      const ti = ch.i + dir[0], tj = ch.j + dir[1];
      const busy = K.crates.some(c => c.i === ti && c.j === tj && !c.sunk) || chests.some(o => o !== ch && !o.sunk && o.i === ti && o.j === tj);
      if (busy || K.solid('past', ti, tj)) { if (!ch.warned) { ch.warned = true; K.toast(K.$t('그쪽으로는 안 밀려요')); } return; }
      ch.warned = false;
      ch.i = ti; ch.j = tj; K.sfx.scrape({ x: C2(ti), z: C2(tj) });
      K.FX.dust(C2(ti), 0.2, C2(tj), { n: 6, color: K.FXC.past.dust, speed: 1, up: 0.6, size: 0.45, alpha: 0.4 });
      if (f.alive) { f.x = C2(ti); f.z = C2(tj); } // 오늘의 미믹은 어제 궤짝이 놓인 자리에 있다
      if (!K.floorAt('past', ti, tj)) { ch.sunk = true; K.sfx.crateSink({ x: C2(ti), z: C2(tj) }); vanish('sunk', K.$t('궤짝이 어제의 구덩이에 빠졌어요 — 오늘의 미믹도 없어요')); }
      else if (!f.alive) { /* 미믹은 이미 없다 — 궤짝만 움직인다 */ }
      else if (K.ch('now', ti, tj) === '#' || K.solid('now', ti, tj)) vanish('crushed', K.$t('오늘엔 그 자리가 벽이라 미믹이 깔렸어요'));
      else if (!K.floorAt('now', ti, tj)) vanish('fall', K.$t('오늘엔 그 자리가 구덩이라 미믹이 떨어졌어요'));
      else if (f.state === 'alert') { f.state = 'patrol'; f.wind = 0; f.rec = 0; }
      place();
    };
    return f;
  },
};
EXT.on('update', (dt) => { for (const c of chests) if (c.tryPush) c.tryPush(dt); });

/* ───────── 쥐구멍 · 쥐 떼 ───────── */
const NEST = { every: 1.7, max: 6, total: 14, start: 3, sealR: 1.7 };
const NEST_E = { every: 1.1, max: 8, total: 20, start: 4 };
const RAT = { run: 3.7, r: 0.22, bite: 0.55, gnaw: 1.1, kill: 1.8, killHalf: rad(55) };
let gnaw = 0, gnawSnd = 0;
EXT.on('roomLoad', () => { gnaw = 0; });
function makeRat(K) {
  const THREE = K.THREE, g = new THREE.Group(), fur = mat('#9a8a7e', { emissive: '#2a1c14', emissiveIntensity: 1 }), pink = mat('#e0a0a0', { emissive: '#301010' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur); body.scale.set(0.8, 0.7, 1.4); body.position.y = 0.14; g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), fur); head.rotation.x = Math.PI / 2; head.position.set(0, 0.15, 0.27); g.add(head);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 4), pink); tail.rotation.x = Math.PI / 2 + 0.3; tail.position.set(0, 0.1, -0.38); g.add(tail);
  for (const x of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), glowMat('#ff5040', { opacity: 1 })); e.position.set(x, 0.2, 0.33); g.add(e); }
  return g;
}
function spawnRat(K, nest, x, z) {
  const f = { t2: true, kind: 't2-rat', era: 'now', x, z, yaw: Math.random() * 6.28, r: RAT.r, alive: true, optional: true, solidBody: false, state: 'alert', stun: 0, nest,
    speed: RAT.run * (0.85 + Math.random() * 0.3), replan: Math.random() * 0.3, step: null, t: Math.random() * 10, scat: 0, sx: 0, sz: 0 };
  f.mk = makeRat(K); K.groups.now.add(f.mk);
  f.ghost = ghostCopy(f.mk);
  f.update = dt => {
    if (!f.alive) return;
    const S = K.S;
    if (f.stun > 0) { f.stun -= dt; return; }
    f.t += dt;
    const d = pdist(f), h = here(f);
    if (f.scat > 0) { f.scat -= dt; moveTo(f, f.x + f.sx, f.z + f.sz, 4.5, dt, 10); }
    else {
      f.replan -= dt;
      if (f.replan <= 0) { f.replan = 0.35; f.step = nextStep(f, cellOf(S.p.x), cellOf(S.p.z)); }
      const jig = Math.sin(f.t * 7 + f.x) * 0.4;
      const tgt = f.step && d > 1.6 ? f.step : [S.p.x + Math.cos(f.t * 3 + f.z) * 0.3, S.p.z + jig * 0.3];
      if (h || f.step) moveTo(f, tgt[0], tgt[1], d < 0.45 ? 0.5 : f.speed, dt, 12);
      // 서로 너무 붙지 않게
      for (const o of t2Foes()) if (o !== f && o.kind === 't2-rat' && o.alive) { const ex = f.x - o.x, ez = f.z - o.z, e = Math.hypot(ex, ez); if (e < 0.32 && e > 1e-4) { f.x += ex / e * (0.32 - e) * 0.5; f.z += ez / e * (0.32 - e) * 0.5; } }
    }
    if (h && d < RAT.bite) f.biting = true; else f.biting = false;
    f.mk.position.set(f.x, Math.abs(Math.sin(f.t * 22)) * 0.03, f.z); f.mk.rotation.y = f.yaw;
  };
  f.view = () => { const away = K.S.era !== 'now'; f.ghost.visible = f.alive && away && ringPassed(f.x, f.z); f.ghost.position.copy(f.mk.position); f.ghost.rotation.copy(f.mk.rotation); };
  f.onStab = () => { // 앞쪽 부채꼴의 쥐를 한꺼번에
    const S = K.S, fx = Math.sin(S.face), fz = Math.cos(S.face);
    let n = 0;
    for (const o of t2Foes()) {
      if (o.kind !== 't2-rat' || !o.alive || o.era !== S.era) continue;
      const dx = o.x - S.p.x, dz = o.z - S.p.z, dd = Math.hypot(dx, dz);
      if (o === f || (dd < RAT.kill && (dx * fx + dz * fz) / Math.max(dd, 0.01) > Math.cos(RAT.killHalf))) { ratDie(K, o); n++; }
    }
    if (n > 1) K.toast(K.$t('쥐 {0}마리를 한 번에', n), 1);
    return 'kill-front';
  };
  f.boltHit = () => { ratDie(K, f); return true; };
  K.addFoe(f);
  return f;
}
function ratDie(K, o) {
  o.alive = false; o.mk.visible = false; S2.ratDie({ x: o.x, z: o.z });
  K.FX.sparks(o.x, 0.3, o.z, { n: 5, color: ['#c06060', '#ffd0d0'], speed: 2, up: 1.5, size: 0.08 });
  K.killed(o, 'stab');
}
// 쥐가 물어뜯는 것: 붙어 있는 쥐 수만큼 빨리 찬다 → 다 차면 하트 1, 붙어 있던 쥐는 흩어진다
EXT.on('update', (dt, K) => {
  const rats = t2Foes().filter(o => o.kind === 't2-rat' && o.alive && o.biting);
  if (rats.length) {
    gnaw += dt * rats.length; gnawSnd -= dt;
    if (gnawSnd <= 0) { gnawSnd = 0.18; S2.squeak({ x: rats[0].x, z: rats[0].z }); }
    if (gnaw >= RAT.gnaw) {
      gnaw = 0;
      if (K.hurt(K.$t('쥐 떼에 물렸어요'))) { for (const o of t2Foes()) if (o.kind === 't2-rat' && o.alive && pdist(o) < 1.6) { const d = Math.max(pdist(o), 0.01); o.scat = 0.6; o.sx = (o.x - K.S.p.x) / d * 3; o.sz = (o.z - K.S.p.z) / d * 3; } }
    }
  } else gnaw = Math.max(0, gnaw - dt * 0.8);
});
EXT.foes['t2-nest'] = {
  name: N('쥐구멍'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, NEST, elite ? NEST_E : {}, def.max ? { max: def.max } : {}, def.rats != null ? { start: def.rats } : {});
    const [i0, j0] = def.at;
    const f = { t2: true, kind: 't2-nest', era: 'now', x: C2(i0), z: C2(j0), yaw: 0, r: 0.5, alive: true, solidBody: false, state: 'patrol', stun: 0, elite, spawnT: C.every * 0.5, made: 0, sealed: false };
    const THREE = K.THREE;
    // 오늘: 구멍(검은 원 + 돌 테두리 + 눈)
    f.hole = new THREE.Group();
    const pit = new THREE.Mesh(discGeo(), new THREE.MeshBasicMaterial({ color: '#050404' })); pit.scale.setScalar(0.62); pit.position.y = 0.03; f.hole.add(pit);
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), mat('#5a5650')); s.position.set(Math.cos(a) * 0.68, 0.08, Math.sin(a) * 0.68); s.rotation.set(a, a * 2, 0); f.hole.add(s); }
    f.eyes = []; for (let k = 0; k < 2; k++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glowMat('#ff4030', { opacity: 1 })); e.position.set(k ? 0.12 : -0.12, 0.06, k ? 0.1 : -0.15); f.hole.add(e); f.eyes.push(e); }
    f.hole.position.set(f.x, 0, f.z); K.groups.now.add(f.hole);
    f.ghost = ghostCopy(f.hole); f.ghost.position.copy(f.hole.position);
    // 어제: 바닥 틈 + 기대 놓인 납작한 돌 (E로 밀어 막는다)
    f.crack = new THREE.Mesh(discGeo(), new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.85 })); f.crack.scale.set(0.45, 1, 0.3); f.crack.position.set(f.x, 0.03, f.z);
    f.slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.8), mat('#8a7f6a')); f.slab.position.set(f.x + 0.9, 0.45, f.z); f.slab.rotation.z = 1.05;
    K.groups.past.add(f.crack, f.slab);
    f.lid = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.14, 10), mat('#4e5a40')); f.lid.position.set(f.x, 0.07, f.z); f.lid.visible = false; K.groups.now.add(f.lid);
    f.mark = decal(ringGeo(0.85, 1), '#ffd27a', { order: 6 }); f.mark.position.set(f.x, 0.09, f.z); f.mark.scale.setScalar(C.sealR);
    for (let k = 0; k < C.start; k++) { const a = k / Math.max(1, C.start) * 6.28; const [x, z] = [f.x + Math.cos(a) * 0.9, f.z + Math.sin(a) * 0.9]; spawnRat(K, f, K.stand('now', cellOf(x), cellOf(z)) ? x : f.x, K.stand('now', cellOf(x), cellOf(z)) ? z : f.z); f.made++; }
    f.update = dt => {
      if (!f.alive) return;
      const S = K.S;
      f.spawnT -= dt;
      const live = t2Foes().filter(o => o.kind === 't2-rat' && o.alive && o.nest === f).length;
      if (f.spawnT <= 0) {
        f.spawnT = C.every;
        if (live < C.max && f.made < C.total && pdist(f) < 16) { spawnRat(K, f, f.x + (Math.random() - 0.5) * 0.4, f.z + (Math.random() - 0.5) * 0.4); f.made++; S2.scurry({ x: f.x, z: f.z }); }
      }
      for (const e of f.eyes) e.visible = Math.sin(S.time * 2.3 + e.position.x * 20) > -0.7;
    };
    f.view = () => {
      const S = K.S, away = S.era !== 'now';
      f.ghost.visible = f.alive && away && ringPassed(f.x, f.z);
      // 어제에서 막을 자리(금빛 고리) — 가까이 가면 밝게
      f.mark.visible = f.alive && S.era === 'past';
      if (f.mark.visible) { const near = pdist(f) < C.sealR; f.mark.material.opacity = near ? 0.65 : 0.3 + 0.1 * Math.sin(S.time * 3); }
    };
    f.onStab = () => { K.toast(K.$t('쥐구멍은 찔러도 소용없어요 — 어제 같은 자리에서 E로 막으세요'), 2); return 'blocked'; };
    f.seal = () => {
      if (!f.alive) return;
      f.alive = false; f.sealed = true;
      f.slab.position.set(f.x, 0.08, f.z); f.slab.rotation.set(0, 0.4, 0); f.crack.visible = false;
      f.hole.visible = false; f.lid.visible = true; f.ghost.visible = false; f.mark.visible = false;
      S2.seal({ x: f.x, z: f.z }); K.FX.dust(f.x, 0.2, f.z, { n: 12, color: K.FXC.past.dust });
      K.killed(f, 'sealed');
      K.toast(K.$t('어제 막은 구멍 — 오늘엔 쥐가 더 안 나와요'), 2.2);
    };
    return f;
  },
};
const nearNest = K => { const S = K.S; if (S.era !== 'past' || S.falling > 0 || S.trans || S.down) return null; return t2Foes().find(o => o.kind === 't2-nest' && o.alive && pdist(o) < (o.elite ? NEST_E.sealR || NEST.sealR : NEST.sealR)) || null; };
EXT.on('prompt', () => (nearNest(T2.K) ? T2.K.$t('E 쥐구멍 막기 (오늘의 구멍도 막혀요)') : undefined));
EXT.on('interact', () => { const n = nearNest(T2.K); if (!n) return undefined; n.seal(); return 'seal'; });
// 사냥개는 shift 훅으로 따라온다
EXT.on('shift', (from, to) => { for (const f of t2Foes()) if (f.onShift) f.onShift(from, to); });
