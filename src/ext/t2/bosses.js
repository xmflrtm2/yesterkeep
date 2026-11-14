// T2 2차 — 층 끝 문지기(미니 보스) 둘.
//
//  쌍둥이 간수 (1층 문지기, t2-twin ×2): 형은 어제(금빛 갑옷·장검), 아우는 오늘(녹슨 갑옷·망치). 각자 하트 2칸.
//    시간 규칙 = "맹세": 하나가 쓰러지면 남은 쪽이 4초 뒤 되살린다 — 그 4초는 남은 쪽 시대에 있을 때만 간다.
//    → 둘 다 1칸까지 깎아 둔 뒤, 하나를 쓰러뜨리고 그 시대에 머문 채 다른 쪽 멈춘 등 뒤로 가서 넘어오며 끝낸다.
//    앞·옆은 막히고(받아치기), 등 뒤 한 방 = 1칸 + 1초 휘청. 등·옆에 붙어 있으면 휘두르기(둘레).
//    형: 베기(앞 부채꼴) · 돌진 찌르기(붉은 줄, 벽에 박히면 1.3초 등이 열림) · 휘두르기
//    아우: 내려찍기(앞 부채꼴) · 땅울림(바깥으로 퍼지는 붉은 띠 — 다른 시대로 가면 띠가 그 자리에 멈춘다) · 휘두르기
//
//  거미 여왕 (2층 문지기, t2-queen + 어제의 알 t2-egg): 오늘에만 있다. 하트 3칸.
//    시간 규칙 = "어제의 알 = 오늘의 새끼": 알마다 오늘에 새끼 거미가 있고, 여왕이 맞을 때마다 깨지지 않은 알에서 하나씩 더 나온다.
//    어제로 가서 알을 깨 두면 그 새끼도 없다. 여왕의 거미줄은 오늘에만 있다 → 걸리면 어제로 빠져나간다.
//    덮치기(붉은 착지 원 — 옆으로 비키면 착지 뒤 1.1초 등이 열림) · 거미줄 쏘기(하얀 줄, 맞으면 묶임) · 물기 · 다리 휘두르기(둘레)
import { EXT } from '../../ext.js';
import { T2, cellOf, C2, other, pdist, fwd, here, inFront, fromBehind, los, rayLen, turnTo, moveTo, nextStep, nearestStand,
  fail, decal, ringGeo, discGeo, arcGeo, laneGeo, buildHuman, ghostCopy, ringPassed, mat, glowMat, blocked, killFx, t2Foes, prepared, kill } from './core.js';
import { S2 } from './sfx.js';
import { spawnRat } from './beasts.js';

const N = k => k;
const rad = T2.rad;
const CLIP = { idle: 'AS_Idle_Combat_Seq', walk: 'AS_Walk_Loop_F_0_Seq', run: 'AS_Run_Loop_F_0_Seq', atk: 'AS_Combo_Attack_02_01_Seq', atk1: 'AS_Combo_Attack_01_01_Seq', skill: 'AS_Skill_02_Seq',
  hit: 'AS_Hit_F_Seq', down: 'AS_Knock_Down_Death_F_Seq', parry: 'AS_Parry_L_Seq' };
const inRun = () => EXT.run && EXT.run.active && EXT.run.active();
const bossSand = () => { if (inRun() && EXT.run.addSand) EXT.run.addSand(1.5, 'boss'); };

/* ───────── 공용: 머리 위 하트 칸 ───────── */
function pipTex(K, hp, max, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const x = c.getContext('2d');
  for (let k = 0; k < max; k++) { const cx = 64 + (k - (max - 1) / 2) * 30; x.beginPath(); x.arc(cx, 16, 11, 0, 6.29); x.fillStyle = k < hp ? color : 'rgba(40,40,40,0.8)'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke(); }
  const t = new K.THREE.CanvasTexture(c); t.colorSpace = K.THREE.SRGBColorSpace; return t;
}
function makePips(K, f, color) {
  const s = new K.THREE.Sprite(new K.THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.renderOrder = 9; K.world.add(s);
  f.pips = s; f.pipColor = color; f.pipHp = -1;
  return s;
}
function updatePips(K, f, y) {
  if (f.pipHp !== f.bossHp) { if (f.pips.material.map) f.pips.material.map.dispose(); f.pips.material.map = pipTex(K, Math.max(0, f.bossHp), f.hpMax, f.pipColor); f.pips.material.needsUpdate = true; f.pipHp = f.bossHp; }
  f.pips.position.set(f.x, y, f.z);
}
function banner(K, text, sub) { K.toast(K.$t(text) + (sub ? ' — ' + K.$t(sub) : ''), 3.2); }

/* ───────── 쌍둥이 간수 ───────── */
const TW = {
  hp: 2, r: 0.55, turn: 4.0, react: 0.35, snap: 6, wake: 9.5, oath: 4.0, stagger: 1.0, behindSpin: 0.35,
  elder: { scale: 1.35, run: 3.1, slash: { w: 0.55, r: 2.5, half: 60, rec: 0.7 }, lunge: { w: 0.7, lock: 0.2, speed: 11, min: 3.5, max: 9, cd: 3.2, stuck: 1.3, rec: 0.6 }, spin: { w: 0.5, r: 2.7, rec: 0.7 } },
  younger: { scale: 1.45, run: 2.3, slam: { w: 0.85, r: 2.7, half: 60, rec: 0.9 }, quake: { w: 0.6, speed: 6.5, r0: 0.8, r1: 8.5, band: 0.9, cd: 4.2, min: 3.0, max: 8.5 }, spin: { w: 0.6, r: 2.7, rec: 0.8 } },
};
const pairs = {};
// 방을 다시 열면(R·쓰러져 다시) 지난 판의 쌍둥이가 남아 있다 → 지금 방의 적만 남긴다 (예전엔 짝 목록을 통째로 지워 새 쌍둥이의 맹세가 끊겼다)
EXT.on('roomLoad', () => { for (const k of Object.keys(pairs)) pairs[k] = pairs[k].filter(f => T2.K.extFoes.includes(f)); });
function makeSword(K) {
  const g = new K.THREE.Group(), steel = mat('#d8d4c8', { metalness: 0.8, roughness: 0.3 }), gold = mat('#d8a840', { metalness: 0.8, roughness: 0.35 });
  const blade = new K.THREE.Mesh(new K.THREE.BoxGeometry(0.07, 0.025, 1.25), steel); blade.position.z = 0.75; g.add(blade);
  const guard = new K.THREE.Mesh(new K.THREE.BoxGeometry(0.34, 0.05, 0.06), gold); guard.position.z = 0.12; g.add(guard);
  const grip = new K.THREE.Mesh(new K.THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), gold); grip.rotation.x = Math.PI / 2; g.add(grip);
  return g;
}
function makeHammer(K) {
  const g = new K.THREE.Group(), wood = mat('#5a4636'), iron = mat('#6a6e6a', { metalness: 0.6, roughness: 0.5 });
  const h = new K.THREE.Mesh(new K.THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), wood); h.rotation.x = Math.PI / 2; h.position.z = 0.5; g.add(h);
  const head = new K.THREE.Mesh(new K.THREE.BoxGeometry(0.5, 0.3, 0.3), iron); head.position.z = 1.1; g.add(head);
  return g;
}
// 무기는 몸통(holder)에 붙이고 공격 단계에 맞춰 직접 휘두른다 (손뼈의 축척·방향에 기대지 않게)
function poseWeapon(f, k) {
  const w = f.weapon, a = f.act, sc = f.sc;
  w.position.set(0.42 * sc, 1.0 * sc, 0.3 * sc);
  let rx = -0.35, ry = 0.15, rz = 0;
  if (a) {
    const t = a.ph === 'wind' ? Math.min(1, a.t / a.w) : 1;
    if (a.k === 'slash') { if (a.ph === 'wind') { ry = -1.3 * t; rx = -0.8 * t; } else { ry = 1.2; rx = -0.1; } }
    else if (a.k === 'slam') { if (a.ph === 'wind') rx = -2.4 * t; else rx = 0.55; }
    else if (a.k === 'spin') { if (a.ph === 'wind') { ry = -1.6 * t; } else { ry = -1.6 + Math.min(1, (a.t - a.w) / 0.25) * 6.28; rx = -1.3; } }
    else if (a.k === 'lunge') { rx = -1.45; ry = 0; w.position.z = (0.3 + (a.ph === 'dash' ? 0.5 : 0)) * sc; }
    else if (a.k === 'quake') { if (a.ph === 'wind') rx = -2.6 * t; else rx = 0.7; }
  } else if (f.stagger > 0) { rx = 0.4; ry = 0.6; }
  if (!f.alive) { rx = 1.2; ry = 0.9; w.position.y = 0.35 * sc; }
  w.rotation.set(rx, ry, rz, 'YXZ');
}
EXT.foes['t2-twin'] = {
  name: N('쌍둥이 간수'),
  spawn(def, K) {
    const role = def.role === 'younger' ? 'younger' : 'elder', R = TW[role];
    const era = def.era || (role === 'elder' ? 'past' : 'now');
    const [i0, j0] = def.at;
    const f = { t2: true, kind: 't2-twin', role, era, x: C2(i0), z: C2(j0), yaw: rad(def.face || 0), r: TW.r, alive: true, bossHp: TW.hp, hpMax: TW.hp, state: 'sleep',
      stun: 0, wind: 0, act: null, rec: 0, stagger: 0, behindT: 0, heard: 0, cd: { lunge: 1.5, quake: 2.0 }, oathT: 0, pair: def.pair || 'A', tagY: 3.4, hearsAlarm: false };
    pairs[f.pair] = (pairs[f.pair] || []).filter(o => K.extFoes.includes(o)); pairs[f.pair].push(f); // 새 방의 첫 쌍둥이면 지난 판 것은 빠진다
    const look = role === 'elder' ? { base: 'guard', scale: R.scale, tint: { Armor: '#f0c050', Shoulders: '#e0a830', Pants: '#5a3a20', Boots: '#4a3018' } }
      : { base: 'guard', scale: R.scale, tint: { Armor: '#6e7c6a', Shoulders: '#56604f', Pants: '#3a3a34', Boots: '#2e2c28' }, glow: ['#101408', 1] };
    f.m = buildHuman(look, era, 't2-twin-' + role);
    if (f.m) { f.holder = f.m.holder; f.ani = f.m.ani; f.ani.loop(CLIP.idle, 0); }
    else { f.holder = new K.THREE.Group(); const b = new K.THREE.Mesh(new K.THREE.CapsuleGeometry(0.5, 1.4, 4, 10), mat(role === 'elder' ? '#e0b040' : '#6e7c6a')); b.position.y = 1.2; f.holder.add(b); K.groups[era].add(f.holder); f.ghostBody = ghostCopy(f.holder); }
    f.weapon = role === 'elder' ? makeSword(K) : makeHammer(K); f.sc = R.scale;
    f.weapon.scale.setScalar(R.scale * 0.85); f.holder.add(f.weapon);
    if (f.m) { const gw = ghostCopy(f.weapon); gw.visible = true; f.m.ghost.add(gw); f.weaponGhost = gw; gw.matrixAutoUpdate = false; }
    // 바닥 예고
    f.cone = decal(arcGeo(60), '#ff3a20'); f.spinD = decal(ringGeo(0.86, 1), '#ff5a2a', { order: 5 }); f.lane = decal(laneGeo(), '#ff3020', { order: 5 });
    f.band = null; f.oathRing = decal(ringGeo(0.85, 1), '#7fe8ff', { depthTest: false, order: 7 });
    for (const d of [f.cone, f.spinD, f.lane, f.oathRing]) d.visible = false;
    makePips(K, f, role === 'elder' ? '#ffd060' : '#a8c890');
    const partner = () => (pairs[f.pair] || []).find(o => o !== f);
    const place = () => { f.holder.position.set(f.x, 0, f.z); f.holder.rotation.y = f.yaw; };
    const play = (n, fade = 0.2, sp = 1) => { if (f.ani) f.ani.loop(n, fade, sp); };
    const wake = () => {
      for (const o of pairs[f.pair] || []) if (o.state === 'sleep') { o.state = 'alert'; S2.roar({ x: o.x, z: o.z }); }
      if (!T2.twinBanner) { T2.twinBanner = true; banner(K, '1층 문지기 — 쌍둥이 간수', '하나가 쓰러지면 남은 쪽이 4초 뒤 되살려요'); }
    };
    f.wakeUp = wake;
    const start = (k, wmul = 1) => {
      const A = R[k] || TW[role][k];
      f.act = { k, t: 0, w: A.w * wmul, A, hit: false, ph: 'wind' };
      f.behindT = 0;
      if (k === 'lunge') { f.act.aim = f.yaw; }
      if (f.ani) f.ani.once(k === 'spin' ? CLIP.skill : k === 'lunge' ? CLIP.atk1 : CLIP.atk, { speed: k === 'slam' ? 0.9 : 1.2, dur: A.w * wmul + 0.4 });
      if (k === 'quake' || k === 'slam') S2.roar({ x: f.x, z: f.z }); else S2.bigSwing({ x: f.x, z: f.z });
    };
    const hurtPlayer = msg => K.hurt(K.$t(msg));
    const stepAct = dt => {
      const S = K.S, a = f.act, A = a.A, d = pdist(f), h = here(f);
      a.t += dt;
      if (a.k === 'slash' || a.k === 'slam') {
        if (a.t < a.w * 0.6) turnTo(f, S.p.x, S.p.z, dt, 2.5);
        if (a.ph === 'wind' && a.t >= a.w) {
          a.ph = 'rec'; K.impactFx(f.x + Math.sin(f.yaw) * 1.4, f.z + Math.cos(f.yaw) * 1.4, f.era, a.k === 'slam' ? 1.6 : 0.9, a.k === 'slam' ? 1 : 0.5);
          if (a.k === 'slam') { K.sfx.slam({ x: f.x, z: f.z }); S.shake = Math.max(S.shake, 0.3); } else S2.bigSwing({ x: f.x, z: f.z });
          if (h && d < A.r && inFront(f, S.p.x, S.p.z, rad(A.half))) hurtPlayer(a.k === 'slam' ? '망치에 맞았어요' : '장검에 베였어요');
        }
        if (a.ph === 'rec' && a.t >= a.w + A.rec) f.act = null;
      } else if (a.k === 'spin') {
        if (a.ph === 'wind' && a.t >= a.w) {
          a.ph = 'rec'; S2.bigSwing({ x: f.x, z: f.z }); K.FX.dustRing(f.x, f.z, A.r, { n: 18, color: K.FXC[f.era].dust, speed: 2, alpha: 0.5 });
          if (h && d < A.r) hurtPlayer('휘두르기에 맞았어요');
        }
        if (a.ph === 'rec' && a.t >= a.w + A.rec) f.act = null;
      } else if (a.k === 'lunge') {
        if (a.ph === 'wind') {
          if (a.t < a.w - A.lock) { turnTo(f, S.p.x, S.p.z, dt, 5); a.aim = f.yaw; }
          if (a.t >= a.w) { a.ph = 'dash'; a.len = Math.min(A.max, d + 2); a.gone = 0; S2.pounce({ x: f.x, z: f.z }); }
        } else if (a.ph === 'dash') {
          const step = A.speed * dt, ux = Math.sin(a.aim), uz = Math.cos(a.aim);
          const nx = f.x + ux * (step + f.r), nz = f.z + uz * (step + f.r);
          if (!K.stand(f.era, cellOf(nx), cellOf(nz))) {
            a.ph = 'stuck'; a.t = 0; S.shake = Math.max(S.shake, 0.3); K.sfx.clang({ x: f.x, z: f.z }); K.clangFx(f.x + ux, f.z + uz);
            if (f.ani) f.ani.once(CLIP.hit, { speed: 0.7, dur: A.stuck });
            if (h) K.toast(K.$t('벽에 박혔어요 — 등 뒤로!'), 1.2);
          } else {
            f.x += ux * step; f.z += uz * step; a.gone += step;
            if (!a.hit && h && pdist(f) < 1.1) { a.hit = true; hurtPlayer('돌진 찌르기에 맞았어요'); }
            if (a.gone >= a.len) { a.ph = 'rec'; a.t = 0; }
          }
        } else if (a.ph === 'stuck') { if (a.t >= A.stuck) { f.act = null; f.cd.lunge = A.cd; } }
        else if (a.ph === 'rec') { if (a.t >= A.rec) { f.act = null; f.cd.lunge = A.cd; } }
      } else if (a.k === 'quake') {
        if (a.ph === 'wind') { if (a.t < a.w * 0.5) turnTo(f, S.p.x, S.p.z, dt, 3); if (a.t >= a.w) { a.ph = 'wave'; a.r = A.r0; K.impactFx(f.x, f.z, f.era, 2.2, 1.2); S2.quake({ x: f.x, z: f.z }); S.shake = Math.max(S.shake, 0.35); } }
        else if (a.ph === 'wave') {
          a.r += A.speed * dt;
          if (!a.hit && h && Math.abs(d - a.r) < A.band / 2 + 0.36) { a.hit = true; hurtPlayer('땅울림에 맞았어요'); }
          if (a.r >= A.r1) { f.act = null; f.cd.quake = A.cd; }
        }
      }
    };
    const down = how => {
      if (!kill(K, f, how)) return;
      f.act = null; f.stagger = 0;
      if (f.ani) { f.ani.onceLeft = 0; f.ani.once(CLIP.down, { speed: 1.1, hold: true }); }
      S2.bossHit({ x: f.x, z: f.z }); killFx(f, how, { big: 1.5 });
      const p = partner();
      if (p && p.alive) {
        p.oathT = TW.oath; S2.oath({ x: f.x, z: f.z });
        const where = p.era === 'now' ? '오늘' : '어제';
        K.toast(K.$t(f.role === 'elder' ? '형이 쓰러졌어요 — {0}의 아우가 {1}초 뒤 되살려요' : '아우가 쓰러졌어요 — {0}의 형이 {1}초 뒤 되살려요', K.$t(where), TW.oath), 3);
      } else K.toast(K.$t('쌍둥이 간수를 함께 쓰러뜨렸어요!'), 2.6);
    };
    f.hurtBoss = (how, o = {}) => {
      if (!f.alive) return;
      if (f.state === 'sleep') wake();
      f.bossHp--; bossSand(); f.hitAt = K.S.time;
      S2.bossHit({ x: f.x, z: f.z }); K.S.hitstop = Math.max(K.S.hitstop, 0.12); K.FX.sparks(f.x, 1.4, f.z, { n: 18, color: K.FXC[f.era].spark }); K.FX.punch(0.35);
      if (f.bossHp <= 0) { down(how); return; }
      f.act = null; f.stagger = TW.stagger; f.wind = 0;
      if (f.ani) f.ani.once(CLIP.hit, { speed: 0.9, dur: TW.stagger });
      K.toast(K.$t(o.relic ? '문지기에게 한 칸 — 던진 것도 한 칸뿐' : '한 칸! 남은 쪽도 1칸까지 깎아 두세요'), 1.8);
    };
    f.revive = () => {
      f.alive = true; f.counted = false; f._dying = false; f.bossHp = TW.hp; f.stagger = 0.9; f.act = null; f.oathT = 0;
      K.S.kills = Math.max(0, K.S.kills - 1);
      if (f.ani) { f.ani.onceLeft = 0; f.ani.loop(CLIP.idle, 0.4); }
      S2.roar({ x: f.x, z: f.z }); K.FX.motes(f.x, 0.5, f.z, { n: 40, color: ['#7fe8ff', '#ffffff'], speed: 2.5, up: 3, life: 1.2 });
      K.toast(K.$t('맹세로 되살아났어요 — 둘을 함께 쓰러뜨려야 해요'), 2.4); fail();
    };
    f.onShift = (from, to) => {
      if (to === f.era && f.alive) f.heard = 0; // 다른 시대에 있는 동안 멈춰 있던 값이 남지 않게
      if (to !== f.era || !f.alive || f.state === 'sleep') return;
      // 급히 오가면 그 기척에 이미 돌아서 있다 (방패병과 같은 연타 막기)
      if (!prepared() && pdist(f) < 4.5 && !f.act && f.stagger <= 0) { f.yaw = Math.atan2(K.S.p.x - f.x, K.S.p.z - f.z); f.heard = TW.react + 1; }
    };
    f.update = dt => {
      if (f.ani) f.ani.update(dt);
      const S = K.S;
      // 맹세: 짝이 쓰러져 있으면 내 시대의 시간으로 4초 뒤 되살린다
      const p = partner();
      if (f.alive && p && !p.alive && f.oathT > 0) { f.oathT -= dt; if (f.oathT <= 0) { p.revive(); } }
      if (!f.alive) return;
      f.stun = 0; // 시간 충격 안 먹음
      const d = pdist(f), h = here(f);
      if (f.state === 'sleep') { if (h && d < TW.wake) wake(); place(); return; }
      for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
      if (f.hold > 0) { f.hold -= dt; turnTo(f, S.p.x, S.p.z, dt, 2); play(CLIP.idle, 0.2); place(); return; } // 맞힌 뒤 한숨
      if (f.stagger > 0) {
        f.stagger -= dt;
        if (f.stagger <= 0 && h && d < TW[role].spin.r + 0.2) start('spin', 0.9); // 휘청이 끝나면 곁의 적을 쓸어낸다
        place(); return;
      }
      if (f.act) { stepAct(dt); place(); return; }
      // 듣기: 3.5m 안이면 반응 시간 뒤 돌아선다
      const heard = h && d < 3.5 && los(f.era, f.x, f.z, S.p.x, S.p.z);
      f.heard = heard ? f.heard + dt : 0;
      if (!h) { play(CLIP.idle); place(); return; }
      const front = inFront(f, S.p.x, S.p.z, rad(55));
      if (d < 2.4) {
        if (!front) { f.behindT += dt; if (f.heard > TW.react) turnTo(f, S.p.x, S.p.z, dt, TW.snap); if (f.behindT > TW.behindSpin) start('spin'); }
        else start(role === 'elder' ? 'slash' : 'slam');
        play(CLIP.idle, 0.15);
      } else {
        f.behindT = 0;
        const ok = los(f.era, f.x, f.z, S.p.x, S.p.z);
        if (role === 'elder' && d > R.lunge.min && d < R.lunge.max && f.cd.lunge <= 0 && ok && front) start('lunge');
        else if (role === 'younger' && d > R.quake.min && d < R.quake.max && f.cd.quake <= 0) start('quake');
        else {
          const tgt = nextStep(f, cellOf(S.p.x), cellOf(S.p.z));
          const [tx, tz] = tgt && d > 2.4 ? tgt : [S.p.x, S.p.z];
          moveTo(f, tx, tz, d < 2.0 ? 0 : R.run, dt, 0);
          turnTo(f, S.p.x, S.p.z, dt, f.heard > TW.react ? TW.snap : TW.turn);
          play(d < 2.0 ? CLIP.idle : CLIP.run, 0.15, 0.9);
        }
      }
      place();
    };
    f.view = () => {
      const S = K.S, away = f.era !== S.era, a = f.act;
      poseWeapon(f);
      const gh = f.m ? f.m.ghost : f.ghostBody;
      if (gh) { gh.visible = away && (f.alive || true) && ringPassed(f.x, f.z) && f.state !== 'gone'; if (!f.m) { gh.position.copy(f.holder.position); gh.rotation.copy(f.holder.rotation); } }
      if (f.weaponGhost && gh && gh.visible) { f.weapon.updateWorldMatrix(true, true); f.weaponGhost.matrix.copy(f.weapon.matrixWorld); f.weaponGhost.matrixWorldNeedsUpdate = true; f.weaponGhost.children.forEach((c, i) => { c.matrixAutoUpdate = true; }); }
      f.pips.visible = f.alive && f.state !== 'sleep' && (!away || ringPassed(f.x, f.z));
      updatePips(K, f, 3.3);
      // 예고: 다른 시대에서도 멈춘 채 보인다(옅게)
      const show = (m, on) => { m.visible = on; if (on) m.material.depthTest = !away; };
      const k = a && a.ph === 'wind' ? Math.min(1, a.t / a.w) : 0;
      show(f.cone, !!a && (a.k === 'slash' || a.k === 'slam') && a.ph === 'wind');
      if (f.cone.visible) { f.cone.position.set(f.x, 0.07, f.z); f.cone.rotation.y = f.yaw; f.cone.scale.setScalar(a.A.r * (0.4 + 0.6 * k)); f.cone.material.opacity = (away ? 0.25 : 0.2) + 0.45 * k; }
      show(f.spinD, !!a && a.k === 'spin' && a.ph === 'wind');
      if (f.spinD.visible) { f.spinD.position.set(f.x, 0.08, f.z); f.spinD.scale.setScalar(a.A.r); f.spinD.material.opacity = 0.25 + 0.55 * k; }
      show(f.lane, !!a && a.k === 'lunge' && (a.ph === 'wind' || a.ph === 'dash'));
      if (f.lane.visible) { const L = Math.min(a.A.max, rayLen(f.era, f.x, f.z, Math.sin(a.aim), Math.cos(a.aim), a.A.max)); f.lane.position.set(f.x, 0.09, f.z); f.lane.rotation.y = a.aim; f.lane.scale.set(1.2, 1, L); f.lane.material.opacity = a.t >= a.w - a.A.lock || a.ph === 'dash' ? 0.6 : 0.2 + 0.25 * k; }
      // 땅울림 띠
      const wave = a && a.k === 'quake' && a.ph === 'wave';
      if (wave) {
        if (f.band) { f.band.geometry.dispose(); f.band.parent && f.band.parent.remove(f.band); }
        f.band = decal(new K.THREE.RingGeometry(Math.max(0.01, a.r - a.A.band / 2), a.r + a.A.band / 2, 72).rotateX(-Math.PI / 2), '#ff3a20', { order: 6 });
        f.band.position.set(f.x, 0.09, f.z); f.band.material.opacity = away ? 0.4 : 0.7; f.band.material.depthTest = !away;
      } else if (f.band) { f.band.geometry.dispose(); f.band.parent && f.band.parent.remove(f.band); f.band = null; }
      if (a && a.k === 'quake' && a.ph === 'wind') { show(f.spinD, true); f.spinD.position.set(f.x, 0.08, f.z); f.spinD.scale.setScalar(a.A.r0 + 1.4 * k); f.spinD.material.color.set('#ffb040'); f.spinD.material.opacity = 0.3 + 0.5 * k; }
      else f.spinD.material.color.set('#ff5a2a');
      // 맹세 고리: 쓰러진 쪽 둘레에 줄어드는 고리 (두 시대 모두에서)
      const p = partner();
      const oath = !f.alive && p && p.alive && p.oathT > 0;
      f.oathRing.visible = oath;
      if (oath) { const kk = p.oathT / TW.oath; f.oathRing.position.set(f.x, 0.1, f.z); f.oathRing.scale.setScalar(0.6 + 1.6 * kk); f.oathRing.material.color.set(kk < 0.35 ? '#ff5a5a' : '#7fe8ff'); f.oathRing.material.opacity = 0.75; }
    };
    f.onStab = info => {
      if (!f.alive) return 'miss';
      if (f.state === 'sleep') wake();
      // 맞은 뒤 1.1초는 안 맞는다 (휘청이는 사이 두 번 찔러 두 칸을 한꺼번에 빼던 것 — 11/15 직접 플레이)
      if (K.S.time - (f.hitAt || -9) < 1.1) { S2.parry({ x: f.x, z: f.z }); K.clangFx(f.x, f.z); if (!info.thrown) K.toast(K.$t('막 맞은 문지기는 잠깐 버텨요 — 다음 틈을'), 1.2); return 'immune'; }
      const behind = fromBehind(f, info, 70);
      if (behind && (!info.shift || prepared() || info.thrown)) { f.hurtBoss(info.shift ? 'shift' : 'back'); return 'boss-hit'; }
      // 앞·옆: 막고 받아친다
      f.yaw = Math.atan2(info.tx, info.tz);
      if (!f.act && f.stagger <= 0 && !info.thrown) start(role === 'elder' ? 'slash' : 'slam', 0.8);
      S2.parry({ x: f.x, z: f.z }); fail();
      return blocked(f, info, K.$t('갑옷에 막혔어요 — 등 뒤를'), 1.2);
    };
    f.onExternalKill = () => {};
    // 플레이어를 맞힌 뒤 1.3초는 공격을 멈춘다 (되감기 뒤 바로 또 맞지 않게. 시간 충격을 안 먹어 main.js의 멈칫이 지워지므로 따로)
    f.onPlayerHurt = () => { if (f.act && f.act.k !== 'quake') f.act = null; f.hold = 1.3; };
    place();
    return f;
  },
};

/* ───────── 거미 여왕 · 어제의 알 ───────── */
const QN = { hp: 3, r: 0.95, run: 3.4, near: 4.0, far: 6.5, wake: 11, stagger: 0.9, behindSwipe: 0.25,
  pounce: { w: 0.75, lock: 0.25, air: 0.5, r: 1.45, min: 3.0, max: 8.5, cd: 2.6, rec: 1.1 },
  web: { w: 0.6, speed: 13, min: 3, max: 11, cd: 4.5, root: 1.4 },
  bite: { w: 0.42, r: 2.0, half: 70, rec: 0.6 }, swipe: { w: 0.45, r: 2.5, rec: 0.6 } };
let eggs = [];
EXT.on('roomLoad', () => { eggs = eggs.filter(e => T2.K.extFoes.includes(e)); T2.root = 0; });
function makeQueen(K) {
  const THREE = K.THREE, g = new THREE.Group();
  const shell = mat('#3a2448', { emissive: '#160a1e', emissiveIntensity: 1, roughness: 0.5 }), leg = mat('#2a1a32', { roughness: 0.6 });
  const body = new THREE.Group(); g.add(body);
  const ab = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), shell); ab.scale.set(1, 0.75, 1.25); ab.position.set(0, 0.95, -0.9); body.add(ab);
  // 등의 모래시계 무늬 (빛남) — 등 뒤가 어디인지 바로 보이게
  const hg = new THREE.Group(); hg.position.set(0, 1.62, -0.95); body.add(hg);
  const gm = glowMat('#ffae3a', { opacity: 1 });
  const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 3), gm); t1.rotation.x = Math.PI / 2; t1.position.z = 0.16; hg.add(t1);
  const t2m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 3), gm); t2m.rotation.x = -Math.PI / 2; t2m.position.z = -0.16; hg.add(t2m);
  const ce = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), shell); ce.scale.set(1, 0.7, 1); ce.position.set(0, 0.8, 0.35); body.add(ce);
  for (const sx of [-0.14, 0.14]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), mat('#e8dcc0')); fang.rotation.x = Math.PI; fang.position.set(sx, 0.55, 0.8); body.add(fang); }
  for (let k = 0; k < 6; k++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), glowMat('#ff3a3a', { opacity: 1 })); e.position.set(-0.17 + (k % 3) * 0.17, 1.02 + Math.floor(k / 3) * 0.08, 0.78); body.add(e); }
  const legs = [];
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.35, 0.85, 0.5 - k * 0.32); hip.rotation.y = s * (0.9 - k * 0.45); body.add(hip);
    const up = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.09, 0.09), leg); up.position.set(s * 0.5, 0.25, 0); up.rotation.z = s * 0.5; hip.add(up);
    const lo = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), leg); lo.position.set(s * 0.98, -0.25, 0); lo.rotation.z = s * -0.25; hip.add(lo);
    legs.push({ hip, s, k });
  }
  return { g, body, legs, hg };
}
EXT.foes['t2-queen'] = {
  name: N('거미 여왕'),
  spawn(def, K) {
    const [i0, j0] = def.at;
    const f = { t2: true, kind: 't2-queen', era: 'now', x: C2(i0), z: C2(j0), y: 0, yaw: rad(def.face || 0), r: QN.r, alive: true, bossHp: QN.hp, hpMax: QN.hp, state: 'sleep',
      stun: 0, wind: 0, act: null, stagger: 0, flee: 0, behindT: 0, side: 1, cd: { pounce: 1.2, web: 2.5 }, gait: 0, tagY: 3.0, hearsAlarm: false, spawnedFor: new Set() };
    f.mk = makeQueen(K); K.groups.now.add(f.mk.g);
    f.ghost = ghostCopy(f.mk.g);
    f.landD = decal(discGeo(), '#ff3020', { order: 5 }); f.landR = decal(ringGeo(0.9, 1), '#ff3020', { order: 6 });
    f.cone = decal(arcGeo(70), '#ff3a20'); f.swipeD = decal(ringGeo(0.86, 1), '#ff5a2a', { order: 5 }); f.lane = decal(laneGeo(), '#f0f0ff', { order: 5 });
    for (const d of [f.landD, f.landR, f.cone, f.swipeD, f.lane]) d.visible = false;
    f.webs = [];
    makePips(K, f, '#ffae3a');
    const place = () => { f.mk.g.position.set(f.x, f.y, f.z); f.mk.g.rotation.y = f.yaw; };
    const wake = () => { if (f.state !== 'sleep') return; f.state = 'alert'; S2.screech({ x: f.x, z: f.z }); banner(K, '2층 문지기 — 거미 여왕', '어제의 알이 오늘의 새끼가 돼요'); };
    // 알 하나 = 오늘의 새끼 하나 (방에 들어올 때 + 여왕이 맞을 때마다)
    const hatch = (why) => {
      let n = 0;
      for (const e of eggs) {
        if (!e.alive) continue;
        const [i, j] = nearestStand('now', cellOf(e.x), cellOf(e.z));
        const sp = spawnRat(K, e, C2(i) + (Math.random() - 0.5) * 0.4, C2(j) + (Math.random() - 0.5) * 0.4, 'spider');
        e.kids.push(sp); n++;
      }
      if (n && why === 'hit') K.toast(K.$t('어제의 알에서 새끼 {0}마리 — 알을 깨 두면 안 나와요', n), 2.2);
      return n;
    };
    f.hatch = hatch;
    const start = (k) => {
      const A = QN[k];
      f.act = { k, t: 0, w: A.w, A, ph: 'wind', hit: false };
      f.behindT = 0;
      if (k === 'pounce') { f.act.tx = K.S.p.x; f.act.tz = K.S.p.z; S2.screech({ x: f.x, z: f.z }); }
      else if (k === 'web') { f.act.aim = Math.atan2(K.S.p.x - f.x, K.S.p.z - f.z); }
      else S2.creak({ x: f.x, z: f.z });
    };
    const stepAct = dt => {
      const S = K.S, a = f.act, A = a.A, d = pdist(f), h = here(f);
      a.t += dt;
      if (a.k === 'pounce') {
        if (a.ph === 'wind') {
          turnTo(f, S.p.x, S.p.z, dt, 6);
          if (a.t < a.w - A.lock) { a.tx = S.p.x; a.tz = S.p.z; }
          if (a.t >= a.w) {
            const [ti, tj] = K.stand('now', cellOf(a.tx), cellOf(a.tz)) ? [cellOf(a.tx), cellOf(a.tz)] : nearestStand('now', cellOf(a.tx), cellOf(a.tz));
            if (!K.stand('now', cellOf(a.tx), cellOf(a.tz))) { a.tx = C2(ti); a.tz = C2(tj); }
            a.ph = 'air'; a.t = 0; a.fx = f.x; a.fz = f.z; f.yaw = Math.atan2(a.tx - f.x, a.tz - f.z); S2.pounce({ x: f.x, z: f.z });
          }
        } else if (a.ph === 'air') {
          const k = Math.min(1, a.t / A.air);
          f.x = a.fx + (a.tx - a.fx) * k; f.z = a.fz + (a.tz - a.fz) * k; f.y = 4 * 1.6 * k * (1 - k);
          if (k >= 1) {
            a.ph = 'rec'; a.t = 0; f.y = 0; S2.land({ x: f.x, z: f.z }); K.impactFx(f.x, f.z, 'now', 1.6, 1); S.shake = Math.max(S.shake, 0.3);
            if (h && Math.hypot(S.p.x - f.x, S.p.z - f.z) < A.r) K.hurt(K.$t('여왕이 덮쳤어요 — 옆으로 비키면 등이 열려요'));
          }
        } else if (a.ph === 'rec' && a.t >= A.rec) { f.act = null; f.cd.pounce = A.cd; }
      } else if (a.k === 'web') {
        if (a.ph === 'wind') { turnTo(f, S.p.x, S.p.z, dt, 4); if (a.t < a.w - 0.2) a.aim = f.yaw; if (a.t >= a.w) { a.ph = 'done'; fireWeb(a.aim); f.act = null; f.cd.web = A.cd; } }
      } else if (a.k === 'bite') {
        if (a.t < a.w * 0.5) turnTo(f, S.p.x, S.p.z, dt, 4);
        if (a.ph === 'wind' && a.t >= a.w) { a.ph = 'rec'; S2.chomp({ x: f.x, z: f.z }); if (h && d < A.r && inFront(f, S.p.x, S.p.z, rad(A.half))) K.hurt(K.$t('여왕에게 물렸어요')); }
        if (a.ph === 'rec' && a.t >= a.w + A.rec) f.act = null;
      } else if (a.k === 'swipe') {
        if (a.ph === 'wind' && a.t >= a.w) { a.ph = 'rec'; S2.bigSwing({ x: f.x, z: f.z }); K.FX.dustRing(f.x, f.z, A.r, { n: 16, color: K.FXC.now.dust, speed: 2, alpha: 0.5 }); if (h && d < A.r) K.hurt(K.$t('다리에 쓸렸어요')); }
        if (a.ph === 'rec' && a.t >= a.w + A.rec) f.act = null;
      }
    };
    // 거미줄: 오늘에만 있다. 맞으면 묶이고, 어제로 가면 풀린다
    const fireWeb = aim => {
      const w = { x: f.x + Math.sin(aim) * 1.0, z: f.z + Math.cos(aim) * 1.0, dx: Math.sin(aim), dz: Math.cos(aim), gone: 0, done: false };
      w.mesh = new K.THREE.Mesh(new K.THREE.SphereGeometry(0.22, 10, 8), glowMat('#f4f4ff', { opacity: 0.9, blending: K.THREE.NormalBlending }));
      w.mesh.position.set(w.x, 1.0, w.z); K.groups.now.add(w.mesh);
      w.ghost = ghostCopy(w.mesh);
      f.webs.push(w); S2.webShot({ x: f.x, z: f.z });
    };
    const stepWebs = dt => {
      const S = K.S;
      for (const w of f.webs) {
        if (w.done) continue;
        const st = QN.web.speed * dt; w.x += w.dx * st; w.z += w.dz * st; w.gone += st;
        if (!K.stand('now', cellOf(w.x), cellOf(w.z)) && K.ch('now', cellOf(w.x), cellOf(w.z)) === '#' || w.gone > QN.web.max + 2) w.done = true;
        if (!w.done && here(f) && Math.hypot(S.p.x - w.x, S.p.z - w.z) < 0.6 && S.invuln <= 0) {
          w.done = true; T2.root = QN.web.root; T2.rootAt = { x: S.p.x, z: S.p.z };
          K.toast(K.$t('거미줄에 묶였어요 — 어제로 가면 풀려요'), 1.8); S2.webShot({ x: S.p.x, z: S.p.z });
        }
        w.mesh.position.set(w.x, 1.0, w.z);
        if (w.done) { w.mesh.parent && w.mesh.parent.remove(w.mesh); w.ghost.parent && w.ghost.parent.remove(w.ghost); }
      }
      f.webs = f.webs.filter(w => !w.done);
    };
    f.hurtBoss = (how, o = {}) => {
      if (!f.alive) return;
      wake();
      f.bossHp--; bossSand(); f.hitAt = K.S.time;
      S2.screech({ x: f.x, z: f.z }); S2.bossHit({ x: f.x, z: f.z }); K.S.hitstop = Math.max(K.S.hitstop, 0.12);
      K.FX.sparks(f.x, 1.4, f.z, { n: 18, color: ['#ffae3a', '#ffe0a0'] }); K.FX.punch(0.35);
      if (f.bossHp <= 0) {
        if (!kill(K, f, how)) return;
        f.act = null; f.mk.body.rotation.z = Math.PI * 0.9; f.mk.g.position.y = 0.4;
        killFx(f, how, { big: 1.6, msg: K.$t('거미 여왕을 쓰러뜨렸어요!') });
        for (const e of eggs) for (const s of e.kids) if (s.alive) { s.alive = false; s.mk.visible = false; } // 남은 새끼는 흩어진다
        return;
      }
      f.act = null; f.stagger = QN.stagger; f.flee = 0.8;
      hatch('hit');
      if (o.relic) K.toast(K.$t('문지기에게 한 칸 — 던진 것도 한 칸뿐'), 1.6);
    };
    f.update = dt => {
      if (!f.alive) return;
      const S = K.S, d = pdist(f), h = here(f);
      f.stun = 0;
      stepWebs(dt);
      if (f.state === 'sleep') { if (h && d < QN.wake) wake(); place(); return; }
      for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
      f.gait += dt * 8;
      if (f.stagger > 0) { f.stagger -= dt; place(); return; }
      if (f.hold > 0) { f.hold -= dt; turnTo(f, S.p.x, S.p.z, dt, 2); place(); return; } // 맞힌 뒤 한숨
      if (f.flee > 0) { f.flee -= dt; const u = Math.max(d, 0.01); moveTo(f, f.x - (S.p.x - f.x) / u * 2, f.z - (S.p.z - f.z) / u * 2, QN.run * 1.2, dt, 0, (i, j) => K.stand('now', i, j)); place(); return; }
      if (f.act) { stepAct(dt); place(); return; }
      if (!h) { place(); return; }
      const front = inFront(f, S.p.x, S.p.z, rad(60));
      if (d < 2.8) {
        // 곁에 붙으면 홱 돌아서고(6 rad/s) 0.25초면 다리를 휘두른다 — 같은 시대에서 빙빙 돌며 등을 잡지 못하게 (11/15 빙빙 봇이 9초 만에 이겼다)
        if (!front) { f.behindT += dt; turnTo(f, S.p.x, S.p.z, dt, 6); if (f.behindT > QN.behindSwipe) start('swipe'); }
        else if (d < 2.3) start('bite'); else turnTo(f, S.p.x, S.p.z, dt, 6);
      } else {
        f.behindT = 0;
        const ok = los('now', f.x, f.z, S.p.x, S.p.z);
        if (d > QN.pounce.min && d < QN.pounce.max && f.cd.pounce <= 0 && ok) start('pounce');
        else if (d > QN.web.min && d < QN.web.max && f.cd.web <= 0 && ok) start('web');
        else {
          // 거리를 두고 옆으로 돈다
          const ang = Math.atan2(f.x - S.p.x, f.z - S.p.z) + f.side * 0.55, want = d < QN.near ? QN.far : d > QN.far ? QN.near + 0.5 : d;
          const tx = S.p.x + Math.sin(ang) * want, tz = S.p.z + Math.cos(ang) * want;
          if (!K.stand('now', cellOf(tx), cellOf(tz))) f.side = -f.side;
          moveTo(f, tx, tz, QN.run, dt, 0, (i, j) => K.stand('now', i, j));
          turnTo(f, S.p.x, S.p.z, dt, 4);
        }
      }
      place();
    };
    f.view = () => {
      const S = K.S, away = S.era !== 'now', a = f.act;
      f.ghost.visible = f.alive && away && ringPassed(f.x, f.z);
      f.ghost.position.copy(f.mk.g.position); f.ghost.rotation.copy(f.mk.g.rotation);
      f.pips.visible = f.alive && f.state !== 'sleep' && (!away || ringPassed(f.x, f.z));
      updatePips(K, f, 2.9 + f.y);
      // 다리 걷기
      for (const L of f.mk.legs) L.hip.rotation.x = f.alive ? Math.sin(f.gait + L.k * 1.3 + (L.s > 0 ? Math.PI : 0)) * (f.act || f.stagger > 0 ? 0.05 : 0.3) : 0.6;
      // 모래시계 무늬: 등이 열렸으면 밝게 깜빡, 닫혔으면 흐리게
      const op = f.alive && f.isOpen();
      f.mk.hg.children.forEach(c => { c.material.opacity = op ? 0.75 + 0.25 * Math.sin(S.time * 14) : 0.18; });
      f.mk.hg.scale.setScalar(op ? 1.35 : 1);
      const k = a && a.ph === 'wind' ? Math.min(1, a.t / a.w) : 0;
      const pw = !!a && a.k === 'pounce' && (a.ph === 'wind' || a.ph === 'air');
      f.landD.visible = f.landR.visible = pw;
      if (pw) { for (const m of [f.landD, f.landR]) { m.position.set(a.tx, 0.08, a.tz); m.scale.setScalar(a.A.r); m.material.depthTest = !away; } f.landD.material.opacity = 0.1 + 0.35 * (a.ph === 'air' ? 1 : k); f.landR.material.opacity = 0.5 + 0.4 * k; }
      f.cone.visible = !!a && a.k === 'bite' && a.ph === 'wind';
      if (f.cone.visible) { f.cone.position.set(f.x, 0.07, f.z); f.cone.rotation.y = f.yaw; f.cone.scale.setScalar(a.A.r * (0.5 + 0.5 * k)); f.cone.material.opacity = 0.2 + 0.4 * k; f.cone.material.depthTest = !away; }
      f.swipeD.visible = !!a && a.k === 'swipe' && a.ph === 'wind';
      if (f.swipeD.visible) { f.swipeD.position.set(f.x, 0.08, f.z); f.swipeD.scale.setScalar(a.A.r); f.swipeD.material.opacity = 0.25 + 0.55 * k; f.swipeD.material.depthTest = !away; }
      f.lane.visible = !!a && a.k === 'web' && a.ph === 'wind';
      if (f.lane.visible) { const L = rayLen('now', f.x, f.z, Math.sin(a.aim), Math.cos(a.aim), QN.web.max); f.lane.position.set(f.x, 0.09, f.z); f.lane.rotation.y = a.aim; f.lane.scale.set(0.5, 1, L); f.lane.material.opacity = 0.2 + 0.4 * k; f.lane.material.depthTest = !away; }
      for (const w of f.webs) { w.mesh.visible = !away; w.ghost.visible = away; w.ghost.position.copy(w.mesh.position); }
    };
    f.onStab = info => {
      if (!f.alive) return 'miss';
      wake();
      if (K.S.time - (f.hitAt || -9) < 1.1) { S2.parry({ x: f.x, z: f.z }); K.clangFx(f.x, f.z); return 'immune'; }
      const behind = fromBehind(f, info, 70);
      // 등(모래시계 무늬)은 공격이 끝난 직후·휘청일 때만 열린다 — 무늬가 밝게 빛난다 (11/15: 같은 시대에서 빙빙 도는 봇이 12초 만에 이겼다)
      if (behind && !f.isOpen()) { S2.parry({ x: f.x, z: f.z }); K.clangFx(f.x, f.z); if (!info.thrown) K.toast(K.$t('다리가 등을 막아요 — 공격이 끝난 뒤 무늬가 빛날 때'), 1.6); fail(); return 'guarded'; }
      if (behind && (!info.shift || prepared() || info.thrown)) { f.hurtBoss(info.shift ? 'shift' : 'back'); return 'boss-hit'; }
      f.yaw = Math.atan2(info.tx, info.tz);
      if (!f.act && f.stagger <= 0 && !info.thrown) start('bite');
      fail();
      return blocked(f, info, K.$t('독니에 막혔어요 — 등의 모래시계 무늬를'), 1.2);
    };
    f.onExternalKill = () => {};
    f.onPlayerHurt = () => { if (f.act && f.act.ph !== 'air') f.act = null; f.hold = 1.2; };
    f.isOpen = () => f.stagger > 0 || f.hold > 0 || (!!f.act && (f.act.ph === 'rec' || (f.act.k === 'web' && f.act.ph === 'wind')));
    place();
    // 알에서 첫 새끼들 (알이 먼저 생기도록 다음 프레임에)
    f.firstHatch = true;
    return f;
  },
};
// 방이 다 지어진 뒤(알·여왕 모두 생긴 뒤) 첫 새끼
EXT.on('roomLoad', (room, K) => { for (const q of t2Foes()) if (q.kind === 't2-queen' && q.firstHatch) { q.firstHatch = false; q.hatch('start'); } });

function makeEgg(K) {
  const THREE = K.THREE, g = new THREE.Group();
  const shell = mat('#e8e0cc', { emissive: '#3a2a10', emissiveIntensity: 0.6, roughness: 0.4 }), vein = glowMat('#ffae3a', { opacity: 0.8 });
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, e = new THREE.Mesh(new THREE.SphereGeometry(0.2 + (k % 2) * 0.05, 10, 8), shell); e.position.set(Math.cos(a) * 0.25, 0.22 + (k % 3) * 0.08, Math.sin(a) * 0.25); g.add(e); }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), vein); core.position.y = 0.35; g.add(core);
  const web = new THREE.Mesh(discGeo(), new THREE.MeshBasicMaterial({ color: '#f0f0f0', transparent: true, opacity: 0.25, depthWrite: false })); web.scale.setScalar(0.7); web.position.y = 0.03; g.add(web);
  return g;
}
EXT.foes['t2-egg'] = {
  name: N('거미 알'),
  spawn(def, K) {
    const [i0, j0] = def.at;
    const f = { t2: true, kind: 't2-egg', era: 'past', x: C2(i0), z: C2(j0), yaw: 0, r: 0.45, alive: true, optional: true, solidBody: false, state: 'patrol', stun: 0, kids: [] };
    f.mk = makeEgg(K); f.mk.position.set(f.x, 0, f.z); K.groups.past.add(f.mk);
    f.ghost = ghostCopy(f.mk); f.ghost.position.copy(f.mk.position);
    eggs.push(f);
    f.view = () => { f.ghost.visible = f.alive && K.S.era !== 'past' && ringPassed(f.x, f.z); f.mk.children[6].material.opacity = 0.5 + 0.4 * Math.sin(K.S.time * 3 + f.x); };
    const crack = how => {
      if (!kill(K, f, how)) return;
      f.mk.visible = false; f.ghost.visible = false;
      S2.eggCrack({ x: f.x, z: f.z }); K.FX.debris(f.x, 0.3, f.z, { n: 8, color: ['#e8e0cc', '#c8b890'], speed: 2, up: 2, size: 0.08 }); K.FX.motes(f.x, 0.4, f.z, { n: 12, color: ['#ffae3a'], speed: 1.5, up: 1, life: 0.6 });
      let n = 0;
      for (const s of f.kids) if (s.alive) { s.alive = false; s.counted = true; s.mk.visible = false; s.ghost.visible = false; n++; }
      K.toast(K.$t(n ? '어제 알을 깼어요 — 오늘의 새끼 {0}마리도 없어요' : '어제 알을 깼어요 — 여왕이 맞아도 여기선 안 나와요', n), 2);
    };
    f.onStab = info => { crack(info.shift ? 'shift' : 'back'); return 'kill'; };
    f.onExternalKill = () => { f.mk.visible = false; f.ghost.visible = false; for (const s of f.kids) if (s.alive) { s.alive = false; s.mk.visible = false; } };
    return f;
  },
};
// 거미줄에 묶임: 그 자리에 붙잡힌다. 어제로 가면(오늘에만 있는 줄이라) 풀린다
EXT.on('update', (dt, K) => {
  if (!(T2.root > 0)) return;
  const S = K.S;
  if (S.era !== 'now' || S.down || S.falling > 0) { T2.root = 0; return; }
  T2.root -= dt; S.vel.set(0, 0, 0); S.p.x = T2.rootAt.x; S.p.z = T2.rootAt.z; S.roll = 0;
});
EXT.on('shift', () => { T2.root = 0; });
EXT.on('hurt', () => { T2.root = 0; });
