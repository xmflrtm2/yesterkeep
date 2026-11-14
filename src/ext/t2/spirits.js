// T2 몬스터 — 혼령 둘: 메아리 · 망령.
//   메아리: 내가 지나온 길을 그 시대에서 몇 초 늦게 그대로 걷는다(벽·구덩이 무시). 그 시계는 메아리의 시대에 있을 때만 간다.
//           그래서 다른 시대에서 걸은 길도 돌아오면 따라 걷는다. 닿으면 아프다. 발판(p)을 밟아 주기도 한다.
//           등 뒤에서만 흩어진다 → 내가 지나온 길로 앞질러 돌아가 등을 찌른다.
//   망령: 한 시대(기본 오늘)에 있고 그 시대에선 거의 안 보인다(서리 알갱이·속삭임만). 다른 시대에서 보면 붉게 또렷하다.
//         벽을 지나 다가와 닿으면 아프다. 칼은 그냥 지나간다. 그 시대로 넘어오는 순간 몸이 겹치면(푸른 원 안) 흩어진다.
import { EXT } from '../../ext.js';
import { T2, cellOf, C2, other, pdist, here, fromBehind, turnToYaw, decal, ringGeo, discGeo, ghostCopy, ringPassed, mat, glowMat, killFx, t2Foes, fail, prepared, stayHere, kill, thrownToStab } from './core.js';
import { S2 } from './sfx.js';

const N = k => k;
const rad = T2.rad;

/* ───────── 내 발자취 (메아리가 따라 걷는 길) ───────── */
let trail = [];
EXT.on('roomLoad', (room, K) => { trail = [{ x: K.S.p.x, z: K.S.p.z, t: K.S.time }]; });
EXT.on('update', (dt, K) => {
  const S = K.S, last = trail[trail.length - 1];
  if (S.falling > 0 || S.trans) return;
  if (!last || S.time - last.t >= 0.05) { trail.push({ x: S.p.x, z: S.p.z, t: S.time }); if (trail.length > 2400) trail.splice(0, 400); }
});
function trailAt(h) {
  if (!trail.length) return null;
  if (h <= trail[0].t) return { x: trail[0].x, z: trail[0].z, i: 0 };
  let lo = 0, hi = trail.length - 1;
  if (h >= trail[hi].t) return { x: trail[hi].x, z: trail[hi].z, i: hi };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (trail[m].t <= h) lo = m; else hi = m; }
  const a = trail[lo], b = trail[hi], k = (h - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, i: lo };
}

/* ───────── 메아리 ───────── */
const ECHO = { delay: 2.4, catchUp: 0.8, touch: 0.72, knock: 1.6, emerge: 0.6 };
const ECHO_E = { delay: 1.6, catchUp: 1.1, touch: 0.85 };
let echoMat = null;
EXT.foes['t2-echo'] = {
  name: N('메아리'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, ECHO, elite ? ECHO_E : {}, def.delay ? { delay: def.delay } : {});
    const THREE = K.THREE, S = K.S;
    const f = { t2: true, kind: 't2-echo', era: def.era || 'past', x: S.p.x, z: S.p.z, yaw: 0, r: 0.35, alive: true, solidBody: false, state: 'patrol', stun: 0, elite,
      h: null, moving: 0, out: false, hearsAlarm: false };
    // 몸: 플레이어(도적) 파츠를 빛나는 반투명으로
    if (!echoMat) echoMat = { n: new THREE.MeshStandardMaterial({ color: '#9ff4ff', emissive: '#3fd6ff', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.5 }),
      e: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ff9a2a', emissiveIntensity: 0.9, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.5 }) };
    if (K.CHAR.hero && K.CHAR.rig) {
      const { rig, meshes } = K.assemble(K.CHAR.hero, K.CHAR.rig, K.CHAR.dagger);
      for (const sm of meshes) { sm.material = elite ? echoMat.e : echoMat.n; sm.renderOrder = 3; }
      f.holder = new THREE.Group(); f.holder.add(rig); f.ani = new K.Animator(rig, K.CHAR.clips); f.ani.loop('AS_Idle_Seq', 0);
      f.ghost = new THREE.Group();
      for (const sm of meshes) { const gm = new THREE.SkinnedMesh(sm.geometry, K.guardGhostMat); f.ghost.add(gm); gm.bind(sm.skeleton, sm.bindMatrix); gm.frustumCulled = false; gm.renderOrder = 8; }
      f.ghost.visible = false; K.world.add(f.ghost);
    } else {
      f.holder = new THREE.Group(); const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10), elite ? echoMat.e : echoMat.n); b.position.y = 0.8; f.holder.add(b);
      f.ghost = ghostCopy(f.holder);
    }
    K.groups[f.era].add(f.holder);
    // 나올 자리 표시 (방 시작 자리): 흐린 고리
    f.gate = decal(ringGeo(0.7, 1), elite ? '#ffb050' : '#7fe8ff', { order: 5 }); f.gate.position.set(S.p.x, 0.08, S.p.z);
    f.mist = 0;
    const pos = () => trailAt(f.h);
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      if (!f.alive) return;
      if (f.stun > 0) { f.stun -= dt; } // 시간 충격: 잠깐 멈칫
      if (f.h == null) f.h = trail.length ? trail[0].t : S.time;
      // 나오기 전: 방에 들어온 뒤 delay초(이 시대 시간)를 기다린다
      if (!f.out) { f.wait = (f.wait || 0) + dt; if (f.wait < C.delay) { place(); return; } f.out = true; f.outT = 0; S2.echoHum({ x: f.x, z: f.z }); K.FX.motes(f.x, 0.6, f.z, { n: 18, color: ['#9ff4ff', '#ffffff'], speed: 1.5, up: 1.6, life: 0.8 }); }
      f.outT += dt;
      if (f.stun <= 0) {
        const lag = S.time - f.h, rate = 1 + Math.min(C.catchUp, Math.max(0, (lag - C.delay - 0.4) / 2.5));
        f.h = Math.min(f.h + rate * dt, S.time - C.delay);
      }
      const p = pos(), px = f.x, pz = f.z;
      if (p) { f.x = p.x; f.z = p.z; }
      const mv = Math.hypot(f.x - px, f.z - pz);
      f.moving += ((mv / Math.max(dt, 1e-4)) - f.moving) * Math.min(1, dt * 10);
      if (mv > 0.002) turnToYaw(f, Math.atan2(f.x - px, f.z - pz), dt, 14);
      if (f.ani) { if (f.moving > 0.8) f.ani.loop('AS_Run_Loop_F_0_Seq', 0.15, Math.max(0.7, f.moving / 5.2)); else f.ani.loop('AS_Idle_Seq', 0.25); }
      // 닿으면 아프다 → 메아리는 내 길 위로 조금 물러난다
      if (f.outT > ECHO.emerge && here(f) && pdist(f) < C.touch && S.invuln <= 0 && K.hurt(K.$t('메아리에 닿았어요 — 내가 지나온 길을 따라와요'))) f.h -= C.knock;
      // 발판을 밟아 준다 (그 시대의 p 칸)
      const ci = cellOf(f.x), cj = cellOf(f.z);
      if (K.ch(f.era, ci, cj) === 'p') {
        const hold = (S.room && S.room.gateHold) || 2.6;
        if (S.gateT < hold - 0.05) { if (S.gateT <= 0) { K.sfx.plate({ x: f.x, z: f.z }); K.toast(K.$t('메아리가 발판을 밟았어요')); } S.gateT = hold; }
      }
      place();
    };
    const place = () => { f.holder.position.set(f.x, 0, f.z); f.holder.rotation.y = f.yaw; };
    place();
    f.view = dt => {
      const away = f.era !== K.S.era;
      // 적을 만들 때는 아직 지난 방 자리라서, 나오기 전엔 늘 이 방의 시작 자리(발자취 처음)에 둔다
      if (!f.out && trail.length) { f.x = trail[0].x; f.z = trail[0].z; f.gate.position.set(f.x, 0.08, f.z); place(); }
      f.holder.visible = f.alive && f.out;
      if (f.out && echoMat) { const k = Math.min(1, (f.outT || 0) / ECHO.emerge); (elite ? echoMat.e : echoMat.n).opacity = 0.15 + 0.4 * k; }
      f.ghost.visible = f.alive && away && ringPassed(f.x, f.z) && f.out;
      if (!f.ani) { f.ghost.position.copy(f.holder.position); f.ghost.rotation.copy(f.holder.rotation); }
      // 나올 자리 고리: 이 시대 시간으로 delay초 동안 안쪽으로 줄어든다(다 줄면 나옴)
      f.gate.visible = f.alive && !f.out;
      f.gate.scale.setScalar(Math.max(0.15, 1 - (f.wait || 0) / C.delay));
      f.gate.material.opacity = 0.35 + 0.2 * Math.sin(K.S.time * 4);
      f.gate.material.depthTest = !away;
      if (f.alive && f.out && !away) { f.mist -= dt; if (f.mist <= 0) { f.mist = 0.12; K.FX.motes(f.x, 0.9, f.z, { n: 2, color: elite ? ['#ffd28a'] : ['#9ff4ff'], speed: 0.4, up: 0.6, life: 0.6, size: 0.12 }); } }
    };
    f.onStab = info => {
      if (!f.out) return 'miss';
      if (fromBehind(f, info, 70)) {
        if (!kill(K, f, 'back')) return 'armor';
        f.holder.visible = false; f.ghost.visible = false;
        S2.echoBreak({ x: f.x, z: f.z }); K.FX.motes(f.x, 0.9, f.z, { n: 40, color: elite ? ['#ffd28a', '#ffffff'] : ['#9ff4ff', '#ffffff'], speed: 3.5, up: 2, life: 1 });
        killFx(f, 'back', { msg: K.$t('메아리를 흩었어요'), color: ['#9ff4ff', '#ffffff'] });
        return 'kill-back';
      }
      K.FX.motes(f.x, 1, f.z, { n: 10, color: ['#9ff4ff'], speed: 2, up: 1, life: 0.5 }); S2.echoHum({ x: f.x, z: f.z });
      fail();
      K.toast(K.$t('메아리는 등 뒤에서만 — 내가 지나온 길로 앞질러 가세요'), 1.8);
      return 'blocked';
    };
    f.revive = () => { f.alive = true; f.counted = false; f.h -= C.delay; K.S.kills = Math.max(0, K.S.kills - 1); };
    return f;
  },
};
// T3 장치가 "누가 발판을 밟고 있나"를 물을 때: 메아리 자리도 알려 준다 (EXT.t2.pressers(era) → [{x,z}])
EXT.t2 = EXT.t2 || {};
EXT.t2.pressers = era => t2Foes().filter(f => f.kind === 't2-echo' && f.alive && f.out && f.era === era).map(f => ({ x: f.x, z: f.z }));

/* ───────── 망령 ───────── */
const WRAITH = { drift: 1.15, lunge: 3.0, lungeAt: 2.4, lungeT: 0.8, touch: 0.75, killR: 1.0, recoil: 3.0, cool: 1.6, startle: 3.0 };
const WRAITH_E = { drift: 1.5, lunge: 3.6, killR: 0.85 };
function makeWraith(K, elite) {
  const THREE = K.THREE, g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: elite ? '#ffd9a0' : '#cfe8ff', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 10, 1, true), m); robe.position.y = 1.0; g.add(robe);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), m); hood.position.y = 1.85; g.add(hood);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), m); arm.position.set(s * 0.45, 1.2, 0.25); arm.rotation.set(1.1, 0, s * 0.4); g.add(arm); }
  const eyeM = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeM); e.position.set(s, 1.86, 0.26); g.add(e); }
  return { g, m, eyeM };
}
EXT.foes['t2-wraith'] = {
  name: N('망령'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, WRAITH, elite ? WRAITH_E : {});
    const [i0, j0] = def.at;
    // fall: 칼 대상이 아니다(칼이 그냥 지나감). solidBody: 몸에 부딪히지 않는다
    const f = { t2: true, kind: 't2-wraith', era: def.era || 'now', x: C2(i0), z: C2(j0), yaw: 0, r: 0.4, alive: true, solidBody: false, fall: 'ghost', state: 'patrol', stun: 0, elite,
      lungeT: 0, cool: 0, mist: 0, whisperT: 1 + Math.random() * 2, bob: Math.random() * 6, hearsAlarm: false };
    f.mk = makeWraith(K, elite); K.groups[f.era].add(f.mk.g);
    f.ghost = ghostCopy(f.mk.g);
    f.ghost.traverse(o => { if (o.isMesh) o.material = K.guardGhostMat; });
    f.kill = decal(ringGeo(0.9, 1), '#7fe8ff', { depthTest: false, order: 7 }); // 다른 시대에서: 이 안에서 넘어오면 흩어진다
    f.killFill = decal(discGeo(), '#7fe8ff', { depthTest: false, order: 6 });
    f.update = dt => {
      if (!f.alive) return;
      f.stun = 0; // 시간 충격으로 멈추지 않는다 (흩어지는 건 겹쳐 넘어올 때뿐)
      const S = K.S, d = pdist(f), h = here(f);
      f.bob += dt;
      if (!h) return;
      f.cool = Math.max(0, f.cool - dt);
      const dx = S.p.x - f.x, dz = S.p.z - f.z, u = Math.max(d, 0.01);
      let sp = C.drift;
      if (f.cool > 0) sp = -1.6; // 닿은 뒤 물러남
      else if (f.lungeT > 0) { f.lungeT -= dt; sp = C.lunge; }
      else if (d < C.lungeAt) { f.lungeT = C.lungeT; S2.wail({ x: f.x, z: f.z }); }
      f.x += dx / u * sp * dt; f.z += dz / u * sp * dt;
      f.yaw = Math.atan2(dx, dz);
      // 방 밖으로는 안 나간다
      f.x = Math.max(1, Math.min(S.W * 2 - 1, f.x)); f.z = Math.max(1, Math.min(S.H * 2 - 1, f.z));
      if (d < C.touch && f.cool <= 0 && K.hurt(K.$t('망령에 닿았어요 — 다른 시대에서 보고, 겹쳐 넘어오세요'))) { f.cool = C.cool; f.lungeT = 0; }
      f.whisperT -= dt; if (f.whisperT <= 0) { f.whisperT = 2.2 + Math.random() * 1.5; S2.whisper({ x: f.x, z: f.z }); }
      f.mk.g.position.set(f.x, 0.1 + Math.sin(f.bob * 2) * 0.08, f.z); f.mk.g.rotation.y = f.yaw;
    };
    f.mk.g.position.set(f.x, 0.1, f.z);
    f.view = dt => {
      const S = K.S, away = f.era !== S.era, d = pdist(f);
      // 제 시대에서는 거의 안 보인다: 가까워질수록, 덤벼들 때 조금 더
      const vis = away ? 0 : 0.05 + (d < 3.5 ? 0.22 * (1 - d / 3.5) : 0) + (f.lungeT > 0 ? 0.12 : 0) + 0.03 * Math.sin(S.time * 7 + f.bob);
      f.mk.m.opacity = vis; f.mk.eyeM.opacity = Math.min(1, vis * 3);
      f.mk.g.visible = f.alive;
      f.ghost.visible = f.alive && away && ringPassed(f.x, f.z);
      f.ghost.position.copy(f.mk.g.position); f.ghost.rotation.copy(f.mk.g.rotation);
      const showK = f.alive && away && ringPassed(f.x, f.z);
      f.kill.visible = f.killFill.visible = showK;
      if (showK) {
        // 고리는 이 시대에 온 지 PREP초 동안 안쪽에서부터 차오른다 → 다 차야 겹쳐 넘어올 때 흩어진다 (연타 방지가 눈에 보이게)
        const inside = d < C.killR, arm = Math.min(1, stayHere() / T2.PREP);
        f.kill.position.set(f.x, 0.1, f.z); f.kill.scale.setScalar(C.killR * (0.35 + 0.65 * arm)); f.kill.material.opacity = arm < 1 ? 0.3 : inside ? 0.9 : 0.5;
        f.killFill.position.set(f.x, 0.09, f.z); f.killFill.scale.setScalar(C.killR * arm); f.killFill.material.opacity = arm < 1 ? 0.04 : inside ? 0.25 + 0.1 * Math.sin(S.time * 10) : 0.07;
      }
      // 서리 알갱이: 제 시대에서도 대충 어디 있는지는 보이게
      if (f.alive && !away) { f.mist -= dt; if (f.mist <= 0) { f.mist = 0.14; K.FX.motes(f.x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random(), f.z + (Math.random() - 0.5) * 0.6, { n: 2, color: elite ? ['#ffe0b0'] : ['#bfe6ff', '#ffffff'], speed: 0.3, up: 0.4, life: 0.9, size: 0.1 }); } }
    };
    f.onStab = () => 'miss';
    f.onShift = (from, to) => {
      if (!f.alive || to !== f.era) return;
      if (pdist(f) < C.killR && prepared()) {
        if (!kill(K, f, 'shift')) return;
        f.mk.g.visible = false; f.ghost.visible = false; f.kill.visible = f.killFill.visible = false;
        S2.disperse({ x: f.x, z: f.z }); K.FX.motes(f.x, 1.0, f.z, { n: 50, color: ['#cfe8ff', '#7fe8ff', '#ffffff'], speed: 4, up: 2.5, life: 1.2 });
        killFx(f, 'shift', { msg: K.$t('겹쳐 넘어와 망령을 흩었어요'), color: ['#cfe8ff', '#ffffff'] });
      } else if (pdist(f) < C.startle && f.cool <= 0) { f.lungeT = C.lungeT; S2.wail({ x: f.x, z: f.z }); } // 어설프게 곁으로 넘어오면 바로 덤벼든다
    };
    f.revive = () => { f.alive = true; f.counted = false; f.cool = 1.5; f.mk.g.visible = true; K.S.kills = Math.max(0, K.S.kills - 1); };
    return f;
  },
};
