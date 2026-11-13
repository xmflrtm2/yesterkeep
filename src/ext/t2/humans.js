// T2 몬스터 — 어제의 사람 적 셋: 방패병 · 석궁병 · 시간 마법사.
// 셋 다 경비병처럼 어제에만 있고(오늘에선 멈춘 붉은 윤곽 + 멈춘 시야), 시야 → 의심 → 경보 규칙은 경비와 같다.
// 다른 점은 "어떻게 잡느냐"가 시간 전환과 얽혀 있다는 것:
//   방패병: 귀가 밝아 3.2m 안이면 곧바로 돌아선다 → 같은 시대에선 등을 못 잡는다. 오늘에서 등 뒤로 가 어제로 넘어온 순간(돌아서기 전 ≈0.5초)만 통한다.
//           앞·옆은 기습이든 뭐든 방패에 막힌다. 시간 충격(경직)도 안 먹힌다.
//   석궁병: 멀리서 붉은 조준선 → 화살. 화살은 어제에서만 날고 오늘로 가면 공중에 멈춘다(붉게). 가까이 가면 어느 쪽에서 찔러도 쓰러진다.
//   시간 마법사: 쓰러진 동료(경비·골렘·T2 적)를 되살린다. 그 시계는 어제에 있을 때만 간다. 가까이 오면 순간이동으로 피한다 — 시간 충격(경직)으로 붙잡아 찌른다.
import { EXT } from '../../ext.js';
import { T2, cellOf, C2, other, pdist, fwd, here, inFront, fromBehind, sees, los, rayLen, turnTo, turnToYaw, moveTo, nextStep, nearestStand,
  fail, raiseAlarm, decal, ringGeo, discGeo, arcGeo, laneGeo, makeCone, updateCone, paintCone, makeMark, paintMark, buildHuman, ghostCopy,
  ringPassed, mat, glowMat, blocked, killFx, t2Foes, prepared } from './core.js';
import { S2 } from './sfx.js';

const N = k => k;
const rad = T2.rad;
const CLIP = { idle: 'AS_Idle_Combat_Seq', walk: 'AS_Walk_Loop_F_0_Seq', run: 'AS_Run_Loop_F_0_Seq', atk: 'AS_Combo_Attack_02_01_Seq', skill: 'AS_Skill_02_Seq', hit: 'AS_Hit_F_Seq',
  die: 'AS_Hit_Death_Seq', dieBack: 'AS_Knock_Down_Death_F_Seq', parry: 'AS_Parry_L_Seq', calm: 'AS_Idle_Seq' };

/* ───────── 공용 바탕: 순찰·시야·의심·추격 ───────── */
function base(def, K, kind, look, cfg) {
  const path = (def.path || [def.at]).map(([i, j]) => [C2(i), C2(j)]);
  const f = {
    t2: true, kind, era: def.era || 'past', x: path[0][0], z: path[0][1], yaw: 0, r: cfg.r || 0.42, elite: !!def.elite,
    path, wp: path.length > 1 ? 1 : 0, dirStep: 1, wait: def.wait ?? 1.0, waitT: def.wait ?? 1.0, faceYaw: def.face != null ? rad(def.face) : null,
    alive: true, state: 'patrol', sus: 0, lost: 0, stun: 0, wind: 0, rec: 0, replan: 0, step: null, hmm: false, cfg, def, hearsAlarm: true,
  };
  if (path.length > 1) f.yaw = Math.atan2(path[1][0] - f.x, path[1][1] - f.z); else if (f.faceYaw != null) f.yaw = f.faceYaw;
  f.m = buildHuman(look, f.era, kind + (f.elite ? '-e' : ''));
  if (f.m) { f.holder = f.m.holder; f.ani = f.m.ani; f.ani.loop(path.length > 1 ? CLIP.walk : CLIP.idle, 0); }
  else { // 파츠를 못 불렀으면 기둥 모양으로라도
    f.holder = new K.THREE.Group(); const b = new K.THREE.Mesh(new K.THREE.CapsuleGeometry(0.35, 1.0, 4, 10), mat(cfg.color || '#888')); b.position.y = 0.9; f.holder.add(b);
    K.groups[f.era].add(f.holder); f.ghostBody = ghostCopy(f.holder);
  }
  f.mark = makeMark(f.holder, 2.25 * (look.scale || 1));
  f.cone = makeCone();
  f.hearAlarm = () => { if (f.alive && f.state !== 'alert') { f.state = 'alert'; f.sus = 1; f.lost = 0; } };
  return f;
}
function place(f) { f.holder.position.set(f.x, 0, f.z); f.holder.rotation.y = f.yaw; }
function play(f, name, fade = 0.2, speed = 1) { if (f.ani) f.ani.loop(name, fade, speed); }
/** 시야·의심. 반환: 보이는가 */
function senseSight(f, dt, range, half, near = 2.0, far = 0.55) {
  const K = T2.K, S = K.S, d = pdist(f);
  const seen = here(f) && sees(f, S.p.x, S.p.z, range, half);
  if (f.state !== 'alert') {
    if (seen) {
      f.sus = Math.min(1, f.sus + K.THREE.MathUtils.lerp(near, far, Math.min(1, d / range)) * dt);
      if (f.sus >= 0.25 && !f.hmm) { f.hmm = true; K.sfx.hmm({ x: f.x, z: f.z }); }
    } else { f.sus = Math.max(0, f.sus - 0.35 * dt); if (f.sus <= 0) f.hmm = false; }
    if (f.sus >= 1) alert(f);
  } else {
    f.lost = seen ? 0 : f.lost + dt;
    if (f.lost > (f.cfg.lose || 5) && f.wind <= 0 && f.rec <= 0) { f.state = 'patrol'; f.sus = 0.5; f.step = null; }
  }
  return seen;
}
function alert(f) {
  if (!f.alive || f.state === 'alert') return;
  f.state = 'alert'; f.sus = 1; f.lost = 0; f.replan = 0;
  raiseAlarm(f, T2.K.$t(f.cfg.alarmMsg || '들켰어요! 오늘로 피하세요'));
}
function patrol(f, dt, walk) {
  if (f.path.length > 1) {
    const [tx, tz] = f.path[f.wp];
    if (f.waitT > 0 && Math.hypot(tx - f.x, tz - f.z) < 0.2) {
      f.waitT -= dt; play(f, CLIP.idle, 0.25);
      if (f.waitT <= 0) { if (f.wp + f.dirStep >= f.path.length || f.wp + f.dirStep < 0) f.dirStep *= -1; f.wp += f.dirStep; }
    } else { if (moveTo(f, tx, tz, walk, dt)) f.waitT = f.wait; play(f, CLIP.walk, 0.25); }
  } else {
    const [hx, hz] = f.path[0];
    if (Math.hypot(hx - f.x, hz - f.z) > 0.2) { moveTo(f, hx, hz, walk, dt); play(f, CLIP.walk, 0.25); }
    else { if (f.faceYaw != null) turnToYaw(f, f.faceYaw, dt, 3); play(f, CLIP.idle, 0.25); }
  }
}
function chase(f, dt, speed, stop) {
  const S = T2.K.S, d = pdist(f);
  f.replan -= dt;
  if (f.replan <= 0) { f.replan = 0.3; f.step = nextStep(f, cellOf(S.p.x), cellOf(S.p.z)); }
  const tgt = f.step && d > 2.2 ? f.step : [S.p.x, S.p.z];
  if (here(f) || f.step) moveTo(f, tgt[0], tgt[1], d < stop ? 0 : speed, dt);
  play(f, d < stop ? CLIP.idle : CLIP.run, 0.15);
}
/** 매 프레임 보이기: 다른 시대면 멈춘 붉은 몸 + 붉은 멈춘 시야, 아니면 진짜 몸 */
function viewCommon(f, range, half) {
  const K = T2.K, away = f.era !== K.S.era;
  const gh = f.m ? f.m.ghost : f.ghostBody;
  if (gh) { gh.visible = away && f.alive && ringPassed(f.x, f.z); if (!f.m) { gh.position.copy(f.holder.position); gh.rotation.copy(f.holder.rotation); } }
  paintCone(f.cone, f, away);
  if (f.alive) updateCone(f.cone, f, range, half);
  paintMark(f.mark, f);
  return away;
}
/** 쓰러짐: 동작 · 오늘의 해골(어제 쓰러졌으면) · 처치 */
function die(f, how, msg) {
  const K = T2.K;
  f.alive = false; f.wind = 0; f.rec = 0; f.aimT = 0;
  if (f.ani) { f.ani.onceLeft = 0; f.ani.once(how === 'back' ? CLIP.dieBack : CLIP.die, { speed: 1.3, hold: true }); }
  f.mark.visible = false; f.cone.visible = false;
  K.sfx.kill({ x: f.x, z: f.z });
  killFx(f, how, { msg });
  if (f.era === 'past' && !f.bones) { f.bones = K.makeMesh('bonePile', 'now'); f.bones.position.set(f.x, 0, f.z); f.bones.rotation.y = f.yaw; K.groups.now.add(f.bones); }
  f.diedAt = K.S.time;
  K.killed(f, how);
}
/** 시간 마법사가 되살릴 때 */
function reviveHuman(f) {
  const K = T2.K;
  f.alive = true; f.counted = false; f.state = 'patrol'; f.sus = 0.6; f.wind = 0; f.rec = 0; f.stun = 0.9; f.lost = 0; f.aimT = 0;
  if (f.ani) { f.ani.onceLeft = 0; f.ani.loop(CLIP.idle, 0.4); }
  if (f.bones) { f.bones.parent && f.bones.parent.remove(f.bones); f.bones = null; }
  K.S.kills = Math.max(0, K.S.kills - 1);
}

/* ───────── 방패병 ───────── */
// 등 뒤 창: 반응 react초 + 70°(등 뒤 부채꼴 끝)까지 돌기 = 보통 0.30+0.15 = 0.45초, 정예 0.28+0.14 = 0.42초 (찌르기 판정 0.12초 포함해 Shift 뒤 0.25초 안에 J)
const SHIELD = { walk: 1.4, run: 2.7, turn: 8, range: 6.5, half: rad(50), hear: 3.2, react: 0.30, windup: 0.5, recover: 0.8, reach: 1.9, arc: rad(55), lose: 6 };
const SHIELD_E = { turn: 8.5, range: 8, hear: 4.6, react: 0.28, windup: 0.42 };
function makeShieldMesh(K) {
  const g = new K.THREE.Group();
  const face = new K.THREE.Mesh(new K.THREE.BoxGeometry(0.95, 1.35, 0.1), mat('#56657a', { metalness: 0.6, roughness: 0.45 }));
  const rim = new K.THREE.Mesh(new K.THREE.BoxGeometry(1.05, 1.45, 0.06), mat('#b8a26a', { metalness: 0.7, roughness: 0.4 })); rim.position.z = -0.04;
  const boss = new K.THREE.Mesh(new K.THREE.SphereGeometry(0.13, 12, 8), mat('#d8c27a', { metalness: 0.8, roughness: 0.3 })); boss.position.z = 0.07;
  g.add(rim, face, boss);
  g.position.set(-0.12, 1.0, 0.46);
  return g;
}
EXT.foes['t2-shield'] = {
  name: N('방패병'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, SHIELD, elite ? SHIELD_E : {}, { alarmMsg: '방패병이 알아챘어요!', color: '#56657a', lose: 6 });
    const f = base(def, K, 't2-shield', { base: 'guard', scale: elite ? 1.14 : 1.08, tint: elite ? { Armor: '#ffd36a', Shoulders: '#e0a830', Pants: '#3a3550' } : { Armor: '#5d7ea8', Shoulders: '#4a6a96', Pants: '#2a3550' } }, C);
    f.shield = makeShieldMesh(K); f.holder.add(f.shield);
    if (f.m) { f.shieldGhost = ghostCopy(f.shield); f.m.ghost.add(f.shieldGhost); f.shieldGhost.visible = true; }
    f.heard = 0;
    f.bashArc = decal(arcGeo(rad(55) * 180 / Math.PI), '#ff3a20');
    place(f); updateCone(f.cone, f, C.range, C.half);
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      if (!f.alive) return;
      f.stun = 0; // 버티고 선다: 시간 충격이 안 먹힌다
      const S = K.S, d = pdist(f), h = here(f);
      const seen = senseSight(f, dt, C.range, C.half, 2.2, 0.6);
      // 귀: 3.2m(정예 4.6) 안이면 반응 시간 뒤 곧장 돌아선다 (벽 너머는 못 들음)
      // 경보 중이면 어디 있든 쫓는다(같은 시대에서 빙빙 돌기로 등을 못 잡게). 넘어온 순간엔 heard가 0부터라 반응 시간만큼 틈이 있다
      const heard = h && (f.state === 'alert' || (d < C.hear && los(f.era, f.x, f.z, S.p.x, S.p.z)));
      f.heard = heard ? f.heard + dt : 0;
      if (f.wind > 0) {
        turnTo(f, S.p.x, S.p.z, dt, 5);
        f.wind -= dt;
        if (f.wind <= 0) {
          f.rec = C.recover; S2.bash({ x: f.x, z: f.z }); K.impactFx(f.x + Math.sin(f.yaw) * 1.1, f.z + Math.cos(f.yaw) * 1.1, f.era, 0.8, 0.4);
          if (h && d < C.reach && inFront(f, S.p.x, S.p.z, C.arc) && K.hurt(K.$t('방패에 부딪혔어요'))) { /* 되감기가 자리를 옮긴다 */ }
        }
      } else if (f.rec > 0) { f.rec -= dt; if (f.heard > C.react) turnTo(f, S.p.x, S.p.z, dt, C.turn); } // 받아친 뒤에도 그대로 돌아선다 (같은 시대에서 빙빙 돌기로는 못 잡게)
      else if (f.state === 'alert') {
        if (h && d < C.reach - 0.25 && inFront(f, S.p.x, S.p.z, rad(70))) { f.wind = C.windup; S2.shieldUp({ x: f.x, z: f.z }); if (f.ani) f.ani.once(CLIP.atk, { speed: 1.3, dur: C.windup + C.recover }); }
        else { chase(f, dt, C.run, 1.5); if (f.heard > C.react || seen) turnTo(f, S.p.x, S.p.z, dt, C.turn); }
      } else if (f.heard > C.react) {
        // 경보 전이어도 소리 나는 쪽으로 홱 돌아선다 (이 때문에 같은 시대에선 등 뒤를 못 잡는다)
        if (f.heard - dt <= C.react) S2.shieldUp({ x: f.x, z: f.z });
        turnTo(f, S.p.x, S.p.z, dt, C.turn); f.sus = Math.max(f.sus, 0.45); play(f, CLIP.idle, 0.15);
      } else if (f.sus > 0.3) { turnTo(f, S.p.x, S.p.z, dt, 3); play(f, CLIP.idle, 0.2); }
      else patrol(f, dt, C.walk);
      place(f);
    };
    f.view = () => {
      viewCommon(f, C.range, C.half);
      const a = f.bashArc;
      a.position.set(f.x, 0.07, f.z); a.rotation.y = f.yaw;
      const k = f.alive && f.wind > 0 ? 1 - f.wind / C.windup : 0;
      a.material.opacity = f.alive && f.wind > 0 ? 0.15 + 0.4 * k : 0; a.scale.setScalar(C.reach * (0.4 + 0.6 * k));
      a.material.depthTest = f.era === K.S.era;
    };
    f.onStab = info => {
      if (fromBehind(f, info, 70)) { die(f, info.shift ? 'shift' : 'back', K.$t(info.shift ? '전환 기습!' : '등 뒤에서 한 방')); return 'kill-back'; }
      // 앞·옆: 기습이어도 방패. 받아치기
      if (f.state !== 'alert') alert(f);
      f.yaw = Math.atan2(info.tx, info.tz); f.rec = 0; f.wind = C.windup * 0.8; S2.shieldUp({ x: f.x, z: f.z });
      if (f.ani) f.ani.once(CLIP.parry, { speed: 1.4, dur: 0.45 });
      fail();
      return blocked(f, info, K.$t('방패에 막혔어요 — 오늘에서 등 뒤로 돌아가 넘어오세요'), 1.2);
    };
    f.revive = () => { reviveHuman(f); f.heard = 0; };
    f.onPlayerHurt = () => { f.rec = Math.max(f.rec, 1.3); }; // 친 뒤 방패를 고쳐 잡는다 (stun은 안 먹으므로)
    // 급히 오가면(다른 시대에 0.6초도 안 머물고 돌아오면) 그 기척을 듣고 이미 돌아서 있다 → Shift 연타로는 등을 못 잡는다
    f.onShift = (from, to) => {
      if (to !== f.era || !f.alive || prepared() || pdist(f) > C.hear + 1) return;
      f.yaw = Math.atan2(K.S.p.x - f.x, K.S.p.z - f.z); f.heard = C.react + 1; S2.shieldUp({ x: f.x, z: f.z });
    };
    // 석궁 화살: 앞이면 방패에 박히고, 등에 맞으면 쓰러진다 (석궁병이 동료를 쏘게 만들 수 있다)
    f.boltHit = b => {
      if (inFront(f, b.x - b.dx * 2, b.z - b.dz * 2, rad(80))) { S2.boltHit({ x: f.x, z: f.z }); return true; }
      die(f, 'bolt', K.$t('동료의 화살이 방패병의 등에 꽂혔어요')); return true;
    };
    return f;
  },
};

/* ───────── 석궁병 + 화살 ───────── */
const XBOW = { walk: 1.3, turn: 4, range: 10, half: rad(26), alertHalf: rad(75), aim: 0.8, lock: 0.25, close: 2.6, closeAim: 0.55, reload: 1.3, bolt: 13, lose: 4 };
const XBOW_E = { range: 11.5, aim: 0.62, closeAim: 0.45, fan: 3 };
let bolts = [];
EXT.on('roomLoad', () => { bolts = []; });
function makeCrossbow(K) {
  const g = new K.THREE.Group(), wood = mat('#6b4a2a'), iron = mat('#5b5b60', { metalness: 0.6, roughness: 0.4 });
  const stock = new K.THREE.Mesh(new K.THREE.BoxGeometry(0.09, 0.09, 0.75), wood); stock.position.z = 0.1;
  const bow = new K.THREE.Mesh(new K.THREE.TorusGeometry(0.42, 0.03, 6, 16, Math.PI), iron); bow.rotation.x = Math.PI / 2; bow.rotation.z = Math.PI; bow.position.z = 0.42; bow.scale.set(1, 0.5, 1);
  g.add(stock, bow);
  g.position.set(0.18, 1.2, 0.3);
  return g;
}
function makeBolt(K) {
  const g = new K.THREE.Group();
  const body = K.makeMesh('arrow', 'past'); body.scale.setScalar(2.4); body.rotation.y = Math.PI; g.add(body);
  const trail = new K.THREE.Mesh(laneGeo(), glowMat('#ffd9a0', { opacity: 0.55 })); trail.scale.set(0.12, 1, 1.6); trail.rotation.y = Math.PI; trail.position.y = 0; g.add(trail);
  return g;
}
function fireBolt(f, yaw) {
  const K = T2.K;
  const b = { era: f.era, x: f.x + Math.sin(yaw) * 0.7, z: f.z + Math.cos(yaw) * 0.7, dx: Math.sin(yaw), dz: Math.cos(yaw), speed: f.cfg.bolt, from: f, stuck: 0, gone: false };
  b.mesh = makeBolt(K); b.mesh.rotation.y = yaw; b.mesh.position.set(b.x, 1.15, b.z); K.world.add(b.mesh);
  b.ghost = ghostCopy(b.mesh); b.ghost.rotation.y = yaw;
  bolts.push(b);
  return b;
}
// 화살은 자기 시대에 있을 때만 난다 (떠나면 공중에 멈춤)
EXT.on('update', (dt, K) => {
  const S = K.S;
  for (let k = bolts.length - 1; k >= 0; k--) {
    const b = bolts[k];
    if (b.era !== S.era) continue;
    if (b.stuck > 0) { b.stuck -= dt; if (b.stuck <= 0) { b.mesh.parent && b.mesh.parent.remove(b.mesh); b.ghost.parent && b.ghost.parent.remove(b.ghost); bolts.splice(k, 1); } continue; }
    const step = b.speed * dt, n = Math.max(1, Math.ceil(step / 0.3));
    for (let s = 0; s < n && !b.stuck; s++) {
      b.x += b.dx * step / n; b.z += b.dz * step / n;
      const ci = cellOf(b.x + b.dx * 0.25), cj = cellOf(b.z + b.dz * 0.25);
      if (K.solid(b.era, ci, cj) && !'|G'.includes(K.ch(b.era, ci, cj))) { // 벽·상자에 박힘 (창살은 지나감)
        b.stuck = 1.2; S2.boltHit({ x: b.x, z: b.z });
        K.FX.sparks(b.x, 1.1, b.z, { n: 6, color: K.FXC[b.era].spark, speed: 3, up: 2, size: 0.14, dir: [-b.dx, -b.dz], cone: 1.2 });
        break;
      }
      // 다른 T2 적에 맞으면 (방패 앞이면 막힘)
      for (const o of t2Foes()) {
        if (o === b.from || !o.alive || o.era !== b.era || o.fall || !o.boltHit) continue;
        if (Math.hypot(o.x - b.x, o.z - b.z) < (o.r || 0.45) + 0.1 && o.boltHit(b)) { b.stuck = 0.6; break; }
      }
      if (b.stuck) break;
      if (S.falling <= 0 && !S.down && Math.abs(b.x - S.p.x) < 0.48 && Math.abs(b.z - S.p.z) < 0.48 && K.hurt(K.$t('석궁에 맞았어요'))) { b.stuck = 0.01; break; }
    }
    if (Math.hypot(b.x - S.p.x, b.z - S.p.z) > 60) b.stuck = 0.01;
    b.mesh.position.set(b.x, 1.15, b.z);
  }
});
EXT.on('frame', (dt, K) => {
  for (const b of bolts) {
    const away = b.era !== K.S.era;
    b.mesh.visible = !away; b.ghost.visible = away && ringPassed(b.x, b.z);
    b.ghost.position.set(b.x, 1.15, b.z);
  }
});
EXT.foes['t2-xbow'] = {
  name: N('석궁병'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, XBOW, elite ? XBOW_E : {}, { alarmMsg: '석궁병이 겨눠요! 조준선을 피하세요' });
    const f = base(def, K, 't2-xbow', { base: 'guard', scale: 0.97, dagger: false, tint: elite ? { Armor: '#e8c050', Shoulders: '#b08020', Pants: '#3a3020' } : { Armor: '#5d7a3a', Shoulders: '#4a6030', Pants: '#3a3020' } }, C);
    f.bow = makeCrossbow(K); f.holder.add(f.bow);
    if (f.m) { const gb = ghostCopy(f.bow); gb.visible = true; f.m.ghost.add(gb); }
    f.aimT = 0; f.aimYaw = 0; f.reload = 0; f.lastSeen = null;
    f.lines = [0, 1, 2].slice(0, C.fan || 1).map(() => decal(laneGeo(), '#ff2a1a', { order: 5 }));
    place(f); updateCone(f.cone, f, C.range, C.half);
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      if (!f.alive) return;
      if (f.stun > 0) { f.stun -= dt; place(f); return; } // 시간 충격: 조준도 멈춘다
      const S = K.S, d = pdist(f), h = here(f);
      const half = f.state === 'alert' ? C.alertHalf : C.half;
      const seen = senseSight(f, dt, C.range * (f.state === 'alert' ? 1.15 : 1), half, 2.6, 0.9);
      if (seen) f.lastSeen = [S.p.x, S.p.z];
      f.reload = Math.max(0, f.reload - dt);
      if (f.state === 'alert') {
        const aimFull = d < C.close ? C.closeAim : C.aim;
        if (f.aimT > 0) {
          // 조준: 마지막 lock초는 겨눈 방향이 고정된다
          if (f.aimT < aimFull - C.lock) { if (seen) { turnTo(f, S.p.x, S.p.z, dt, 6); f.aimYaw = f.yaw; } }
          f.aimT += dt;
          if (f.aimT >= aimFull) {
            const n = C.fan || 1;
            for (let k = 0; k < n; k++) fireBolt(f, f.aimYaw + (k - (n - 1) / 2) * rad(11));
            S2.shoot({ x: f.x, z: f.z }); K.FX.dust(f.x + Math.sin(f.aimYaw), 1.1, f.z + Math.cos(f.aimYaw), { n: 3, speed: 0.8, up: 0.2, size: 0.35, alpha: 0.35, color: K.FXC[f.era].dust });
            f.aimT = 0; f.reload = C.reload;
            if (f.ani) f.ani.once(CLIP.hit, { speed: 1.6, dur: 0.35 });
          }
          play(f, CLIP.idle, 0.15);
        } else if (seen && f.reload <= 0) { f.aimT = 0.0001; f.aimYaw = f.yaw; S2.aim({ x: f.x, z: f.z }); }
        else if (h && d < C.close) {
          // 너무 가까우면 뒤로 물러선다(조준은 계속)
          const bx = f.x - (S.p.x - f.x) / Math.max(d, 0.01), bz = f.z - (S.p.z - f.z) / Math.max(d, 0.01);
          moveTo(f, bx, bz, 1.6, dt, 0); turnTo(f, S.p.x, S.p.z, dt, 6); play(f, CLIP.walk, 0.2, -1);
        } else if (f.lastSeen) { turnTo(f, f.lastSeen[0], f.lastSeen[1], dt, C.turn); play(f, CLIP.idle, 0.2); }
      } else if (f.sus > 0.3) { turnTo(f, S.p.x, S.p.z, dt, 3); play(f, CLIP.idle, 0.2); f.aimT = 0; }
      else { patrol(f, dt, C.walk); f.aimT = 0; }
      place(f);
    };
    f.view = () => {
      const away = viewCommon(f, C.range, C.half);
      const aimFull = pdist(f) < C.close ? C.closeAim : C.aim;
      const on = f.alive && f.aimT > 0 && (!away || ringPassed(f.x, f.z));
      f.lines.forEach((ln, k) => {
        ln.visible = on;
        if (!on) return;
        const n = f.lines.length, yaw = f.aimYaw + (k - (n - 1) / 2) * rad(11);
        const L = rayLen(f.era, f.x, f.z, Math.sin(yaw), Math.cos(yaw), 24);
        const locked = f.aimT >= aimFull - C.lock;
        ln.position.set(f.x, 0.09, f.z); ln.rotation.y = yaw; ln.scale.set(locked ? 0.22 : 0.1, 1, L);
        ln.material.opacity = away ? 0.35 : (locked ? 0.75 : 0.25 + 0.3 * f.aimT / aimFull);
        ln.material.depthTest = !away;
      });
    };
    f.onStab = info => {
      const how = fromBehind(f, info, 70) ? 'back' : info.shift ? 'shift' : 'front';
      die(f, how, K.$t(how === 'front' ? '석궁병은 가까이에선 약해요' : how === 'shift' ? '전환 기습!' : '등 뒤에서 한 방'));
      return 'kill-' + how;
    };
    f.boltHit = () => { die(f, 'bolt', K.$t('동료의 화살에 맞았어요')); return true; };
    f.revive = () => reviveHuman(f);
    return f;
  },
};

/* ───────── 시간 마법사 ───────── */
const MAGE = { range: 7, half: rad(60), near: 2.4, blinkCd: 2.2, revive: 5.0, walk: 1.2, lose: 6 };
const MAGE_E = { revive: 3.2, near: 3.0, blinkCd: 1.6 };
/** 되살릴 수 있는 쓰러진 동료 목록 */
function corpses(K, self) {
  const out = [];
  for (const g of K.guards) if (!g.alive) out.push(g);
  for (const g of K.golems) if (!g.alive && g.anim) out.push(g);
  for (const f of t2Foes()) if (!f.alive && f !== self && f.revive && f.kind !== 't2-mage' && !f.gone) out.push(f);
  return out;
}
function reviveAny(K, g) {
  if (g.t2) { g.revive(); return; }
  g.alive = true; g.state = 'patrol'; g.sus = 0.6; g.wind = 0; g.rec = 0; g.stun = 0.9; g.lost = 0; g.step = null;
  if (g.kind === 'guard') { g.anim.onceLeft = 0; g.anim.loop('AS_Idle_Combat_Seq', 0.4); }
  else if (g.kind === 'golem' && g.anim) { g.anim.onceLeft = 0; g.anim.loop(K.GCLIP.idle, 0.4); }
  K.S.kills = Math.max(0, K.S.kills - 1);
}
function makeOrb(K) {
  const g = new K.THREE.Group();
  const core = new K.THREE.Mesh(new K.THREE.SphereGeometry(0.12, 12, 8), glowMat('#c89bff', { opacity: 1 }));
  const halo = new K.THREE.Mesh(new K.THREE.SphereGeometry(0.24, 12, 8), glowMat('#8a4dff', { opacity: 0.35 }));
  g.add(core, halo); g.position.set(0.32, 1.45, 0.32);
  return g;
}
EXT.foes['t2-mage'] = {
  name: N('시간 마법사'),
  spawn(def, K) {
    const elite = !!def.elite, C = Object.assign({}, MAGE, elite ? MAGE_E : {}, { alarmMsg: '마법사가 경비를 불렀어요!' });
    const f = base(def, K, 't2-mage', { base: 'hero', scale: 1.0, dagger: false, tint: elite ? { Hood: '#ffd060', Shirt: '#e0b040', Pants: '#3a2560' } : { Hood: '#6a35b0', Shirt: '#7a48c0', Pants: '#3a2560', Boots: '#2a1840' } }, C);
    f.orb = makeOrb(K); f.holder.add(f.orb);
    f.blinkCd = 0; f.revT = new Map(); f.target = null;
    f.blinkSpots = (def.blink || []).map(([i, j]) => [C2(i), C2(j)]);
    f.rune = decal(ringGeo(0.85, 1), '#b07aff'); f.runeFill = decal(discGeo(), '#8a4dff');
    f.beam = decal(laneGeo(), '#c89bff', { order: 5 });
    f.rune.visible = f.runeFill.visible = f.beam.visible = false;
    place(f); updateCone(f.cone, f, C.range, C.half);
    const blink = () => {
      const S = K.S;
      let best = null, bd = -1;
      const cand = f.blinkSpots.length ? f.blinkSpots : (() => { const o = []; for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) if (K.stand(f.era, i, j)) o.push([C2(i), C2(j)]); return o; })();
      for (const [x, z] of cand) {
        const d = Math.hypot(x - S.p.x, z - S.p.z), dm = Math.hypot(x - f.x, z - f.z);
        if (dm < 1 || d < 4.5) continue;
        const score = Math.min(d, 9) - (d > 9 ? (d - 9) * 0.3 : 0) + Math.random() * 0.5;
        if (score > bd && !K.enemies().some(o => o !== f && o.alive && o.era === f.era && Math.hypot(o.x - x, o.z - z) < 1)) { bd = score; best = [x, z]; }
      }
      if (!best) return false;
      K.FX.motes(f.x, 1.0, f.z, { n: 26, color: ['#c89bff', '#8a4dff'], speed: 3, up: 1.5, life: 0.7 });
      S2.blink({ x: f.x, z: f.z });
      f.x = best[0]; f.z = best[1]; f.yaw = Math.atan2(S.p.x - f.x, S.p.z - f.z);
      f.path = [[f.x, f.z]]; f.wp = 0; f.faceYaw = f.yaw;
      K.FX.motes(f.x, 1.0, f.z, { n: 26, color: ['#c89bff', '#8a4dff'], speed: 2.4, up: 1.5, life: 0.8 });
      f.blinkCd = C.blinkCd;
      return true;
    };
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      if (!f.alive) return;
      f.orb.position.y = 1.45 + Math.sin(K.S.time * 3) * 0.06;
      if (f.stun > 0) { f.stun -= dt; place(f); return; } // 시간 충격: 굳어서 순간이동도 못 한다
      const S = K.S, d = pdist(f), h = here(f);
      f.blinkCd = Math.max(0, f.blinkCd - dt);
      senseSight(f, dt, C.range, C.half, 2.4, 0.7);
      // 가까이 오면 피한다 (보이든 안 보이든 — 기척)
      if (h && d < C.near && f.blinkCd <= 0) { if (f.state !== 'alert') alert(f); blink(); }
      // 되살리기: 쓰러진 동료 하나를 골라 그 시계를 돌린다 (이 시계는 어제에 있을 때만 간다)
      const list = corpses(K, f);
      if (!list.includes(f.target)) f.target = null;
      if (!f.target && list.length) f.target = list.reduce((a, b) => ((f.revT.get(b) || 0) > (f.revT.get(a) || 0) ? b : a), list[0]);
      if (f.target) {
        const t = (f.revT.get(f.target) || 0) + dt;
        f.revT.set(f.target, t);
        if (Math.floor((t - dt) / 1.2) !== Math.floor(t / 1.2)) S2.chant({ x: f.x, z: f.z });
        turnTo(f, f.target.x, f.target.z, dt, 3);
        play(f, CLIP.idle, 0.2);
        if (t >= C.revive) {
          reviveAny(K, f.target); f.revT.delete(f.target);
          S2.revive({ x: f.target.x, z: f.target.z });
          K.FX.motes(f.target.x, 0.3, f.target.z, { n: 40, color: ['#c89bff', '#ffffff'], speed: 2, up: 3, life: 1.2 });
          K.toast(K.$t('마법사가 쓰러진 적을 되살렸어요 — 마법사부터!'), 2.2); fail();
          f.target = null;
        }
      } else if (f.state === 'alert') { if (h) turnTo(f, S.p.x, S.p.z, dt, 4); play(f, CLIP.idle, 0.2); }
      else if (f.sus > 0.3) { turnTo(f, S.p.x, S.p.z, dt, 3); play(f, CLIP.idle, 0.2); }
      else patrol(f, dt, C.walk);
      place(f);
    };
    f.view = () => {
      viewCommon(f, C.range, C.half);
      const t = f.alive && f.target, show = !!t && (f.era === K.S.era || ringPassed(f.x, f.z));
      f.rune.visible = f.runeFill.visible = f.beam.visible = show;
      if (!show) return;
      const k = (f.revT.get(t) || 0) / C.revive;
      f.rune.position.set(t.x, 0.08, t.z); f.rune.scale.setScalar(1.1); f.rune.material.opacity = 0.5 + 0.3 * Math.sin(K.S.time * 6);
      f.runeFill.position.set(t.x, 0.075, t.z); f.runeFill.scale.setScalar(Math.max(0.01, 1.1 * k)); f.runeFill.material.opacity = 0.35;
      const dx = t.x - f.x, dz = t.z - f.z;
      f.beam.position.set(f.x, 0.1, f.z); f.beam.rotation.y = Math.atan2(dx, dz); f.beam.scale.set(0.12, 1, Math.hypot(dx, dz)); f.beam.material.opacity = 0.25 + 0.15 * Math.sin(K.S.time * 9);
      for (const m of [f.rune, f.runeFill, f.beam]) m.material.depthTest = false;
    };
    f.onStab = info => {
      if (fromBehind(f, info, 70)) { die(f, 'back', K.$t('등 뒤에서 한 방')); return 'kill-back'; }
      if (f.stun > 0 || info.shift) { die(f, 'shift', K.$t('전환 기습!')); return 'kill-shift'; }
      if (f.state !== 'alert') alert(f);
      if (blink()) { K.toast(K.$t('마법사가 피했어요 — 오늘에서 다가가 넘어오며 찌르세요'), 1.8); fail(); return 'dodged'; }
      die(f, 'front'); return 'kill-front';
    };
    f.boltHit = () => { die(f, 'bolt', K.$t('동료의 화살에 맞았어요')); return true; };
    // 마법사는 서로를 되살리지 않는다 (마법사 둘 = 끝없는 되살리기가 되지 않게)
    return f;
  },
};
