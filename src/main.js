// 어제의 성채 (Yesterkeep) — 프로토타입 1단계
// 3/4 탑다운 카메라, 이동/구르기, ASCII 방 로더(던전 조각 배치), 시대 전환(고리 디졸브 + 충돌 교체 + 다른 시대 윤곽),
// 레버/문 연결. 테스트 훅은 window.__yk.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { SHIFT, ERA_U, eraMaterial, eraPlain } from './eramat.js';
import { ROOMS } from './rooms.js';
import { LOOKS, RIG_URL, EXTRA_ANIMS_URL, DAGGER_URL, loadLook, assemble, prepClips, Animator } from './hero.js';
import { loadGolem, buildGolem, GCLIP, GOLEM_LOOK, BOSS_LOOK } from './golem.js';
import { music } from './music.js';
import { fx as FX } from './fx.js'; // 타격감 이펙트 (지역 변수 fx와 겹치지 않게 FX)

const HERO_LOOK = 'rogueF', GUARD_LOOK = 'guardM'; // 플레이어 / 경비병 외형 (hero.js LOOKS)
const CHAR = { rig: null, clips: null, dagger: null, hero: null, guard: null, golem: null }; // 불러 둔 캐릭터 재료 (golem은 첫 방 뒤 백그라운드)

THREE.Cache.enabled = true;

/* ───────── 상수 ───────── */
const T = 2;                 // 한 칸 (m)
const WALL_H = 4, LOW_H = 1; // 뒤쪽 벽 / 카메라 쪽(남쪽) 낮은 벽
const PR = 0.36;             // 플레이어 반지름
const SPEED = 5.2;
const ROLL_T = 0.34, ROLL_SPEED = 11, ROLL_CD = 0.8, ROLL_INV = 0.3;
const SHIFT_CD = 0.5, RING_SPEED = 30;
const GHOST_RANGE = 6;
const CAM_PITCH = THREE.MathUtils.degToRad(55), CAM_DIST = 16; // 기획 14m → 800×600 화면에서 방이 너무 좁게 보여 16m
const ERAS = ['past', 'now'];
const other = e => (e === 'past' ? 'now' : 'past');

/* ───────── 렌더러 · 장면 ───────── */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000');
scene.fog = new THREE.Fog('#000', 18, 44);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 90);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const hemi = new THREE.HemisphereLight('#fff', '#222', 1);
const sun = new THREE.DirectionalLight('#fff', 1);
sun.position.set(-6, 14, 8);
scene.add(hemi, sun, sun.target);
const LIGHT_POOL = 8;
const pool = [];
for (let i = 0; i < LIGHT_POOL; i++) {
  const l = new THREE.PointLight('#ffb060', 0, 11, 2);
  l.position.set(0, -50, 0);
  scene.add(l);
  pool.push(l);
}
// 시대별 조명
const LOOK = {
  past: { sky: new THREE.Color('#ffe0b0'), ground: new THREE.Color('#4a3020'), hemi: 0.75, sun: new THREE.Color('#ffd49a'), sunI: 1.5, fog: new THREE.Color('#1e140b'), exp: 1.2 },
  now: { sky: new THREE.Color('#9fb8dc'), ground: new THREE.Color('#1c2434'), hemi: 0.8, sun: new THREE.Color('#b3ccff'), sunI: 1.5, fog: new THREE.Color('#0a1019'), exp: 1.2 },
};

// 구덩이 아래 어둠
const abyss = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#000', fog: false }));
abyss.rotation.x = -Math.PI / 2;
abyss.position.y = -6;
scene.add(abyss);
FX.init(scene, camera); // 알갱이·파편·바닥 금·순간 빛 (src/fx.js) — 빛 하나를 미리 넣어 두어 첫 컴파일에 들어가게

/* ───────── 화면(HUD) ───────── */
const $ = id => document.getElementById(id);
const hud = { hearts: $('hearts'), eraName: document.querySelector('#era .name'), eraSub: document.querySelector('#era .sub'), cd: document.querySelector('#era .cd i'),
  title: $('roomTitle'), hint: $('hint'), prompt: $('prompt'), toast: $('toast'), fade: $('fade'), flash: $('flash'), loading: $('loading'), loadBar: document.querySelector('#loading .bar i'),
  end: $('endCard'), endStats: $('endStats'),
  shards: $('shards'), obj: $('obj'), down: $('down'), ptime: document.querySelector('#era .ptime'), gate: $('gate'), gateLbl: document.querySelector('#gate .lbl'), gateBar: document.querySelector('#gate .bar i'),
  boss: $('boss'), bossName: document.querySelector('#boss .name'), bossPips: document.querySelector('#boss .pips'), bossFollow: document.querySelector('#boss .follow') };
let toastT = 0, titleT = 0;
function toast(msg, sec = 1.8) { hud.toast.textContent = msg; hud.toast.style.opacity = 1; toastT = sec; }
function drawHearts() {
  let s = ''; for (let i = 0; i < 5; i++) s += `<span class="${i < S.hearts ? '' : 'off'}" style="color:#ff5d6c">♥</span>`; hud.hearts.innerHTML = s;
  hud.shards.textContent = SHARD_TOTAL ? `⌛ ${S.got.size} / ${SHARD_TOTAL}` : '';
}
function drawEra() {
  document.body.classList.toggle('past', S.era === 'past');
  document.body.classList.toggle('now', S.era === 'now');
  hud.eraName.textContent = S.era === 'past' ? $t('어제') : $t('오늘');
  hud.eraSub.textContent = S.era === 'past' ? $t('황금기의 성채') : $t('무너진 성채');
}
// 화면 번쩍임은 CSS 전환 대신 update()에서 줄인다 (탭이 가려져 프레임이 멈춰도 상태가 맞게)
let flashA = 0;
function screenFlash(color, a = 0.35) { hud.flash.style.background = color; flashA = a; hud.flash.style.opacity = a; }

/* ───────── 소리 (WebAudio로 간단히 합성) ───────── */
let AC = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  if (AC) music.attach(AC); // 배경 음악은 첫 입력(소리 허락) 뒤에 시작 (src/music.js)
  return AC;
}
// 배경 음악에 지금 상황을 알린다: 쫓기는 중 · 보스 페이즈(0 없음 · 1 · 2 · -1 쓰러뜨림) · 되감는 중
function musicTick(dt) {
  const b = bosses[0];
  const boss = !b || b.state === 'dormant' ? 0 : !b.alive ? -1 : b.hp <= BOSS.phase2 ? 2 : 1;
  const danger = !b && enemies().some(g => g.alive && g.state === 'alert' && g.era === S.era);
  music.update(dt, { danger, boss, down: !!S.down });
}

/* ───────── 타격감 이펙트 (src/fx.js) — 11/12 밤 개발자님: "이펙트가 부족해서 밋밋하다" ───────── */
// 시대마다 먼지·불꽃·돌·빛 색 (어제 = 따뜻한 금빛, 오늘 = 차가운 청회색)
const FXC = {
  past: { dust: '#dcc296', spark: ['#ffe2a0', '#ffb347'], rock: ['#b39a74', '#8c7658'], glow: ['#ffd27a', '#fff0c0'], light: '#ffb060' },
  now: { dust: '#b0bac9', spark: ['#d8f8ff', '#7fe8ff'], rock: ['#8a919c', '#5e646e'], glow: ['#7fe8ff', '#d8f8ff'], light: '#9fd8ff' },
};
// 무거운 것이 땅에 닿음: 먼지 고리 · 돌 조각 · 불꽃 · 바닥 금 · 빛 · 카메라 펀치 (big = 세기 배율)
function impactFx(x, z, E, r = 1.8, big = 1) {
  const c = FXC[E];
  FX.dustRing(x, z, r, { color: c.dust, n: Math.round(22 * big), speed: 3 + r });
  FX.debris(x, 0.2, z, { n: Math.round(8 * big), color: c.rock, speed: 2.5 + r, up: 5 });
  FX.sparks(x, 0.3, z, { n: Math.round(7 * big), color: ['#ffb060', '#ff7a3a'], speed: 5, up: 5 });
  FX.crack(x, z, r * 0.85);
  FX.flash(x, 1.4, z, c.light, 5 * big);
  FX.punch(0.4 * big);
}
// 칼이 단단한 데 막힘: 맞닿은 자리에서 하얀 불꽃
function clangFx(tx, tz) {
  const x = (S.p.x + tx) / 2, z = (S.p.z + tz) / 2;
  FX.sparks(x, 1.1, z, { n: 14, color: ['#ffffff', '#ffe2a0'], speed: 6, up: 3, size: 0.12, life: 0.3 });
  FX.flash(x, 1.3, z, '#fff2d0', 2.5); FX.punch(0.2);
}
// 성채지기가 시간을 건너와 나타남 / 구덩이에서 올라옴: 빛 알갱이 기둥 + 먼지 + 빛
function arriveFx(b, E) {
  FX.motes(b.x, 0.2, b.z, { n: 34, color: FXC[E].glow, speed: 1.8, up: 3.2, spread: 0.7, life: 1.0 });
  FX.dustRing(b.x, b.z, 1.2, { color: FXC[E].dust, n: 16, speed: 3.5 });
  FX.flash(b.x, 1.6, b.z, FXC[E].light, 4); FX.punch(0.25);
}
// 성채지기 등을 찔렀다: 불꽃 · 돌 부스러기 · 하얀 빛 · 몸 번쩍 · 체력 막대 흔들림
function hitFx(b) {
  const x = b.x + (S.p.x - b.x) * 0.35, z = b.z + (S.p.z - b.z) * 0.35, c = FXC[b.era];
  FX.sparks(x, 1.5, z, { n: 30, color: c.spark.concat('#ffffff'), speed: 8, up: 4, size: 0.24 });
  FX.sparks(x, 1.5, z, { n: 3, color: '#fff6e0', speed: 0.4, up: 0, size: 1.1, life: 0.16, g: 0, drag: 0, spread: 0.1 }); // 맞닿은 자리 하얀 번쩍
  FX.debris(x, 1.4, z, { n: 7, color: c.rock, speed: 3, up: 3, size: 0.09, dir: [b.x - S.p.x, b.z - S.p.z], cone: 1.2 });
  FX.flash(x, 1.6, z, '#fff0c8', 6); FX.punch(0.75);
  b.fxFlash = 1;
  hud.boss.classList.remove('hit'); void hud.boss.offsetWidth; hud.boss.classList.add('hit');
}
// 성채지기가 쓰러짐: 큰 먼지 · 파편 · 금빛 알갱이가 솟고 길게 멈칫
function deathFx(b) {
  const c = FXC[b.era];
  impactFx(b.x, b.z, b.era, 2.4, 2);
  FX.debris(b.x, 1.5, b.z, { n: 26, color: c.rock, speed: 5, up: 6, size: 0.16 });
  FX.motes(b.x, 0.5, b.z, { n: 90, color: c.glow, speed: 2.4, up: 3.5, spread: 1.2, life: 2.2, size: 0.15 });
  FX.flash(b.x, 2, b.z, c.light, 12); FX.punch(1.2);
  S.hitstop = 0.55; // 쓰러지는 순간을 길게
}
// 매 프레임: 알갱이·파편 + 성채지기 몸의 빛(예비동작이면 차오르고, 찔리면 번쩍) + 2페이즈 불씨
let fxLit = [];
function fxTick(dt) {
  FX.update(dt);
  for (const m of fxLit) m.emissiveIntensity = m.userData.e0; // 지난 프레임에 밝힌 재질을 되돌린다 (골렘 재질을 같이 쓰므로 남겨 두면 안 됨)
  fxLit = [];
  const b = bosses[0];
  if (!b || !b.parts || !b.alive) return;
  b.fxFlash = Math.max(0, (b.fxFlash || 0) - dt * 7);
  const wind = b.wind > 0 ? 1 - b.wind / Math.max(0.01, b.windMax) : b.sweep && b.sweep.ph === 'wind' ? 1 - b.sweep.t / BOSS.sweep.windup : 0;
  const add = wind * wind * 1.1 + b.fxFlash * 2.6;
  if (add > 0.01) for (const o of b.parts) { const m = o.material; if (m.userData.e0 == null) m.userData.e0 = m.emissiveIntensity; m.emissiveIntensity = m.userData.e0 + add; fxLit.push(m); }
  if (b.p2 && b.era === S.era && !b.fall && Math.random() < dt * 26) FX.motes(b.x + (Math.random() - 0.5) * 1.3, 0.5 + Math.random() * 2, b.z + (Math.random() - 0.5) * 1.3, { n: 1, color: ['#ff6a3a', '#ffb060'], speed: 0.4, up: 1.8, life: 1.1, size: 0.12 });
}
function noiseBuf(a, sec) { const b = a.createBuffer(1, Math.floor(a.sampleRate * sec), a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
const sfx = {
  tone(f0, f1, sec, type = 'sine', vol = 0.2, delay = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + sec);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + sec + 0.05);
  },
  noise(sec, f0, f1, vol = 0.2, q = 1.2) {
    const a = ac(); if (!a) return;
    const t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf(a, sec); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + sec);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    s.connect(f).connect(g).connect(a.destination); s.start(t);
  },
  shift(to) {
    if (to === 'past') { this.noise(0.5, 600, 4000, 0.18); this.tone(523, 784, 0.5, 'triangle', 0.08); this.tone(784, 1046, 0.6, 'sine', 0.05, 0.08); }
    else { this.noise(0.5, 3000, 400, 0.18); this.tone(392, 262, 0.55, 'triangle', 0.08); this.tone(196, 131, 0.6, 'sine', 0.06, 0.06); }
  },
  thunk() { this.tone(140, 50, 0.22, 'sine', 0.35); this.noise(0.12, 300, 120, 0.25, 0.8); },
  lever() { this.tone(900, 500, 0.06, 'square', 0.05); this.tone(320, 180, 0.12, 'triangle', 0.12, 0.05); },
  door() { this.noise(0.9, 250, 600, 0.12, 4); this.tone(110, 90, 0.8, 'sawtooth', 0.025); },
  fall() { this.tone(500, 80, 0.7, 'triangle', 0.12); },
  roll() { this.noise(0.22, 900, 300, 0.08); },
  hurt() { this.tone(330, 110, 0.25, 'square', 0.08); this.noise(0.15, 2000, 500, 0.15); },
  swish() { this.noise(0.14, 1800, 5000, 0.12, 2); },
  kill() { this.noise(0.18, 600, 200, 0.25, 1.5); this.tone(180, 60, 0.3, 'sine', 0.3); this.tone(880, 1320, 0.25, 'triangle', 0.05, 0.08); },
  clang() { this.tone(1400, 900, 0.18, 'square', 0.06); this.tone(2100, 1500, 0.22, 'triangle', 0.05); },
  alarm() { this.tone(660, 660, 0.12, 'square', 0.07); this.tone(880, 880, 0.14, 'square', 0.07, 0.14); this.tone(660, 660, 0.12, 'square', 0.07, 0.3); },
  windup() { this.noise(0.35, 300, 1200, 0.07, 1); },
  slam() { this.tone(90, 40, 0.4, 'sine', 0.4); this.noise(0.3, 400, 80, 0.3, 0.7); },
  crumble() { this.noise(0.7, 900, 120, 0.3, 0.8); this.tone(120, 50, 0.5, 'sine', 0.25); },
  rewind() { this.noise(0.6, 4000, 300, 0.12, 1.5); this.tone(880, 220, 0.6, 'sine', 0.06, 0.05); this.tone(660, 165, 0.6, 'triangle', 0.04, 0.1); },
  scrape() { this.noise(0.25, 200, 450, 0.2, 3); this.tone(70, 55, 0.2, 'sine', 0.15); },
  exit() { this.tone(523, 1046, 0.4, 'triangle', 0.07); this.tone(659, 1318, 0.5, 'sine', 0.05, 0.1); },
  // 성채지기
  wake() { this.tone(70, 42, 1.3, 'sawtooth', 0.09); this.noise(1.1, 260, 70, 0.3, 0.7); this.tone(55, 35, 1.4, 'sine', 0.35, 0.1); },
  arrive(to) { if (to === 'past') { this.tone(784, 523, 0.35, 'triangle', 0.07); } else { this.tone(523, 262, 0.35, 'triangle', 0.07); } this.tone(110, 45, 0.45, 'sine', 0.4); this.noise(0.35, 500, 90, 0.25, 0.8); },
  charge() { this.noise(0.6, 150, 900, 0.14, 1.2); this.tone(60, 120, 0.6, 'sawtooth', 0.05); },
  dash() { this.noise(0.45, 900, 180, 0.3, 0.9); this.tone(130, 55, 0.4, 'sine', 0.3); },
  crack() { this.tone(240, 80, 0.3, 'square', 0.06); this.noise(0.35, 3200, 500, 0.22, 1.5); },
  bossFall() { this.tone(320, 40, 1.3, 'triangle', 0.16); this.noise(0.9, 700, 90, 0.25, 0.8); },
};

/* ───────── 조각(GLB) 불러오기 ───────── */
const BASE = 'assets/fab/Fantastic_Dungeon_Pack/meshes/';
const PIECES = {
  floor: 'modular/floor/pivotEdge/MOD_Floor_01_E_straight_tiny',
  wall: 'modular/wall/oneSided/MOD_Wall_01_O_straight_med_half',
  wallLow: 'modular/wall/oneSided/MOD_Wall_01_O_straight_small_half',
  column: 'modular/column/MOD_Column_01_med',
  columnSmall: 'modular/column/MOD_Column_01_small',
  colBase: 'modular/column/MOD_Column_01_base',
  colCapital: 'modular/column/MOD_Column_01_capital',
  cover: 'modular/trim/wallCover/pivotEdge/MOD_WallCover_01_E_straight_half_R',
  stairs: 'modular/stairs/stairs/MOD_Stairs_01_E_straight_4_half',
  trapdoor: 'props/traps/SM_PROP_trapdoor_dungeon_01',
  plate: 'props/traps/SM_PROP_trap_floor_dungeon_02',
  spikePlate: 'props/traps/SM_PROP_trap_floor_dungeon_04',
  spikes: 'props/traps/SM_PROP_trap_floor_spikes_dungeon_04',
  arrow: 'props/tools/SM_PROP_weapon_arrow_dungeon',
  arrowPart: 'props/traps/SM_PROP_trap_arrow_part_dungeon_01',
  blade: 'props/traps/SM_PROP_trap_blade_dungeon_01',
  bladePart: 'props/traps/SM_PROP_trap_blade_part_dungeon_01',
  chain: 'props/light/SM_PROP_chain_small_dungeon_01',
  bars: 'props/construct/SM_PROP_bars_wall_dungeon_01',
  doorway: 'props/construct/SM_PROP_bars_doorway_dungeon_01',
  door: 'props/construct/SM_PROP_bars_door_dungeon_01',
  lever: 'props/traps/SM_PROP_lever_dungeon_01',
  leverHandle: 'props/traps/SM_PROP_lever_handle_dungeon_01',
  bridge: 'props/construct/SM_PROP_woodbridge_dungeon_09',
  bridgeBroken: 'props/construct/SM_PROP_woodbridge_dungeon_07',
  bonePile: 'props/environment/SM_PROP_skeleton_bone_pile_dungeon',
  skull: 'props/environment/SM_PROP_skeleton_skull_dungeon',
  bone: 'props/environment/SM_PROP_skeleton_bone_dungeon_01',
  flag: 'props/fabrics/SM_PROP_flag_dungeon_04',
  rug: 'props/fabrics/SM_PROP_rug_dungeon_04',
  candelabra: 'props/light/SM_PROP_candle_dungeon_13',
  candles: 'props/light/SM_PROP_candle_dungeon_02',
  torch: 'props/light/SM_PROP_torch_wall_dungeon',
  brazier: 'props/light/SM_PROP_brazier_dungeon_02',
  crate: 'props/container/SM_PROP_crate_dungeon_01',
  barrel: 'props/container/SM_PROP_barrel_dungeon_01',
};
for (let i = 1; i <= 8; i++) {
  PIECES['stone' + i] = `modular/floor/oneSided/MOD_Floor_01_O_singlestone_${i}`;
  PIECES['broken' + i] = `modular/floor/oneSided/MOD_Floor_01_O_singlestone_broken_${i}`;
}
for (let i = 1; i <= 4; i++) {
  PIECES['debris' + i] = `props/environment/SM_PROP_debris_stones_dungeon_0${i}`;
  PIECES['web' + i] = `props/environment/SM_PROP_spiderweb_dungeon_0${i}`;
}
const piece = {}; // 이름 → [{ geo, mat, m }]
const loader = new GLTFLoader();
function primsOf(g) {
  g.scene.updateMatrixWorld(true);
  const prims = [];
  g.scene.traverse(o => { if (o.isMesh) prims.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); });
  return prims;
}
async function loadPieces() {
  const names = Object.keys(PIECES);
  const total = names.length + LOOKS[HERO_LOOK].parts.length + LOOKS[GUARD_LOOK].parts.length + 3;
  let done = 0;
  const tick = () => { done++; hud.loadBar.style.width = Math.round(done / total * 100) + '%'; };
  const heroP = (async () => {
    try {
      const [rig, extra, dagger] = await Promise.all([RIG_URL, EXTRA_ANIMS_URL, DAGGER_URL].map(u => loader.loadAsync(u).then(g => { tick(); return g; })));
      CHAR.rig = rig.scene; CHAR.clips = prepClips(rig, extra); CHAR.dagger = dagger.scene;
      const [hp, gp] = await Promise.all([loadLook(loader, HERO_LOOK), loadLook(loader, GUARD_LOOK)]);
      CHAR.hero = hp; CHAR.guard = gp;
      LOOKS[HERO_LOOK].parts.forEach(tick); LOOKS[GUARD_LOOK].parts.forEach(tick);
      return assemble(hp, CHAR.rig, CHAR.dagger);
    } catch (e) { console.warn('character load failed, using capsule', e); return null; }
  })();
  await Promise.all(names.map(async name => {
    piece[name] = primsOf(await loader.loadAsync(BASE + PIECES[name] + '.glb'));
    tick();
  }));
  const h = await heroP;
  if (h) useHero(h);
}

/* ───────── 방 상태 ───────── */
const S = {
  ready: false, roomIdx: 0, room: null, W: 0, H: 0, era: 'now', eraW: 1,
  p: new THREE.Vector3(), py: 0, vel: new THREE.Vector3(), face: 0,
  roll: 0, rollCd: 0, rollDir: new THREE.Vector3(0, 0, 1),
  shiftCd: 0, ring: null,
  hearts: 5, falling: 0, fallVy: 0, invuln: 0, lastSafe: { i: 0, j: 0 }, safeHist: [], safeT: -1, start: { x: 0, z: 0 }, roomFails: 0,
  lever: false, doorOpen: false, doorAnim: 0, leverAnim: 0,
  shifts: 0, falls: 0, blocked: 0, time: 0, roomTime: 0,
  trans: null, shake: 0, flashT: 0, ended: false,
  gateT: 0, pushT: 0, hurts: 0, got: new Set(), // 시간 문 남은 시간(어제의 시간), 상자 미는 중, 함정 피해 수, 모은 조각
  stabT: 0, stabHit: false, shiftStrike: 0, hitstop: 0, kills: 0, // 찌르기, 전환 기습 남은 시간, 맞춘 순간 멈칫
  pastTime: 0, alarms: 0, alarmed: false, runPast: 0, runStars: 0, // 점수: 이 방에서 어제에 머문 시간, 경보 수 / 전체 합계
  roomHurt: 0, bossPending: false, // 이 방에서 맞거나 떨어진 횟수(보스 방 ★★) / 보스 모델을 기다리는 중
};
/* 확장 장치 (11/9): 발판 p → 시간 문 G, 가시 ^ (어제만 작동), 밀 수 있는 상자 c, 모래시계 조각 s */
const GATE_HOLD = 2.6;                       // 발판을 밟으면 문이 열려 있는 시간 — 어제에 있을 때만 줄어든다
const gateHold = () => (S.room && S.room.gateHold) || GATE_HOLD; // 방마다 바꿀 수 있음
const SPIKE = { down: 1.0, warn: 0.3, up: 1.0 }; // 가시 주기 (어제의 시간). 내려감+경고 1.3초 = 구르기 포함 최대 약 8.7m
const SPIKE_P = SPIKE.down + SPIKE.warn + SPIKE.up;
let crates = [], gates = [], spikes = [], plates = [], shards = [];
/* 붙잡기 함정 2차 (11/9): 화살 A, 매달린 뗏목 M/m, 진자 칼날 Y — 모두 그 시대에 있을 때만 움직인다 */
const ARROW = { speed: 6.5, interval: 1.8, warm: 8 };        // 화살: 초당 6.5m, 1.8초마다(간격 11.7m), 방에 들어올 때 8초어치 미리 날려 둠
const BLADE = { piv: 3.8, len: 2.3, amp: THREE.MathUtils.degToRad(50), period: 2.0 }; // 칼날 끝이 1.75m 아래로 내려오면 위험
const RAFT = { speed: 2.6, pause: 0.6 };                       // 뗏목: 선로 끝에서 0.6초 쉬고 되돌아감
let launchers = [], arrows = [], blades = [], rafts = [];
let ghostActors = null; // 다른 시대에 멈춰 있는 화살·칼날의 붉은 윤곽
const crateAt = (i, j) => crates.find(c => c.i === i && c.j === j) || null;
function spikeState(sp) { const t = ((sp.t % SPIKE_P) + SPIKE_P) % SPIKE_P; return t < SPIKE.down ? 'down' : t < SPIKE.down + SPIKE.warn ? 'warn' : 'up'; }
const shardId = (room, s) => `${room.id}:${s.era}:${s.i},${s.j}`;
const SHARD_TOTAL = ROOMS.reduce((n, r) => n + (r.shards || []).length + ['past', 'now'].reduce((m, E) => m + (r[E].join('').match(/[s$&]/g) || []).length, 0), 0);
const G = { past: [], now: [] }; // 글자 그리드 [j][i]
let world = null;                // 방마다 새로 만드는 Group
const groups = { past: null, now: null };
const ghosts = { past: null, now: null }; // ghosts[E] = E 시대의 윤곽 (다른 시대에 있을 때 보임)
let dyn = {};                    // 움직이는 조각 (문, 레버 손잡이, 출구 표시)
let lightSpecs = { past: [], now: [] };
let entities = [];               // { era, t, update(dt, e) } — 현재 시대 것만 갱신된다
let interactables = [];

const ch = (era, i, j) => (j < 0 || j >= S.H || i < 0 || i >= S.W ? '#' : G[era][j][i]);
const SOLID_CH = new Set(['#', '|', '*', 'b']);
function solid(era, i, j) {
  const c = ch(era, i, j);
  if (c === 'D') return !S.doorOpen;
  if (c === 'G') return !(S.gateT > 0);
  if (SOLID_CH.has(c)) return true;
  // 상자: 어제는 그 칸을 막는다(구덩이에 빠졌으면 바닥). 오늘의 썩은 상자는 바닥 위면 막고, 구덩이 위면 발판
  const cr = crates.length ? crateAt(i, j) : null;
  if (cr && !cr.sunk) return era === 'past' ? true : c !== '_';
  return false;
}
function floorAt(era, i, j) {
  const c = ch(era, i, j);
  if (c === '#') return false;
  if (c === '_') { const cr = crates.length ? crateAt(i, j) : null; return !!cr && (era === 'now' || cr.sunk); }
  return true;
}
const stand = (era, i, j) => floorAt(era, i, j) && !solid(era, i, j);
const safeCell = (era, i, j) => stand(era, i, j) && !(era === 'past' && ch(era, i, j) === '^') && ch(era, i, j) !== 'G';
const isOpen = (era, i, j) => i >= 0 && j >= 0 && i < S.W && j < S.H && ch(era, i, j) !== '#';
const isLowBase = (era, i, j) => ch(era, i, j) === '#' && isOpen(era, i, j - 1);
function wallH(era, i, j) {
  if (ch(era, i, j) !== '#') return 0;
  if (isOpen(era, i, j - 1)) return LOW_H; // 북쪽이 트였으면 카메라 쪽 벽 → 낮게
  if ((isLowBase(era, i - 1, j) || isLowBase(era, i + 1, j)) && !isOpen(era, i, j + 1)) return LOW_H; // 낮은 벽 줄의 모서리
  return WALL_H;
}
const cellOf = v => Math.floor(v / T);
function rnd(i, j, s = 0) {
  let h = Math.imul(i + 1013, 374761393) ^ Math.imul(j + 7919, 668265263) ^ Math.imul(s + 31, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ───────── 배치 (조각별 InstancedMesh로 묶기) ───────── */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function mat4(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}
// 바닥돌 조각(1m, 모서리가 원점)을 가운데 기준으로 돌려 놓기
const _c = new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5);
const stoneM = (x, y, z, ry, rx = 0, rz = 0) => mat4(x, y, z, ry, 1, 1, 1, rx, rz).multiply(_c);
class Batch {
  constructor(era) { this.era = era; this.lists = new Map(); }
  add(name, m) { if (!piece[name]) { console.warn('no piece', name); return; } let l = this.lists.get(name); if (!l) this.lists.set(name, (l = [])); l.push(m); }
  flush(group) {
    for (const [name, list] of this.lists) {
      for (const pr of piece[name]) {
        const im = new THREE.InstancedMesh(pr.geo, eraMaterial(pr.mat, this.era), list.length);
        list.forEach((m, k) => im.setMatrixAt(k, _m.multiplyMatrices(m, pr.m)));
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        im.name = name;
        group.add(im);
      }
    }
  }
}
function makeMesh(name, era) {
  const g = new THREE.Group();
  for (const pr of piece[name]) {
    const me = new THREE.Mesh(pr.geo, eraMaterial(pr.mat, era));
    me.applyMatrix4(pr.m);
    g.add(me);
  }
  return g;
}

// 벽 윗면과 효과용 공통 지오메트리
const capGeo = new THREE.PlaneGeometry(T, T).rotateX(-Math.PI / 2);
const capMat = { past: eraPlain('past', { color: '#1a140f', roughness: 1 }), now: eraPlain('now', { color: '#12141a', roughness: 1 }) };

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTex();
// 달빛 줄기: 가장자리와 위아래로 갈수록 흐려지는 가산 원뿔
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#a8c8ff') } },
  vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; varying float vF; void main(){ float v = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y)); gl_FragColor = vec4(uColor, v * vF * vF * 0.13); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const flameMat = new THREE.SpriteMaterial({ map: GLOW, color: '#ffb347', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

/* ───────── 방 만들기 ───────── */
function buildEra(era) {
  const group = new THREE.Group();
  group.name = 'era-' + era;
  const b = new Batch(era);
  const caps = [];
  const backFaces = []; // 남쪽을 보는 높은 벽면 (횃불·깃발 자리)
  const lights = [];
  const face = (i, j, dir, h, below) => {
    // dir: 0=S(+z) 1=E(+x) 2=W(-x) / 조각은 x 0..2, y 0..h, z=0 평면에서 +z를 본다
    const x0 = i * T, z0 = j * T;
    const ry = [0, Math.PI / 2, -Math.PI / 2][dir];
    const px = [x0, x0 + T, x0][dir], pz = [z0 + T, z0 + T, z0][dir];
    if (h === WALL_H) b.add('wall', mat4(px, 0, pz, ry));
    else b.add('wallLow', mat4(px, h - 2, pz, ry));
    if (below) b.add('wall', mat4(px, -4, pz, ry));
  };
  for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) {
    const c = ch(era, i, j);
    const x0 = i * T, z0 = j * T, cx = x0 + 1, cz = z0 + 1;
    if (c === '#') {
      const h = wallH(era, i, j);
      caps.push(mat4(cx, h + 0.002, cz));
      // 윗면 가장자리 갓돌: 트인 쪽(또는 더 낮은 벽 쪽) 모서리마다. 조각은 -z 쪽이 바깥으로 0.15m 나온다
      [[0, 1, Math.PI, x0 + T, z0 + T], [1, 0, -Math.PI / 2, x0 + T, z0], [-1, 0, Math.PI / 2, x0, z0 + T], [0, -1, 0, x0, z0]].forEach(([di, dj, ry, px, pz]) => {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= S.W || nj >= S.H) return;
        if (ch(era, ni, nj) === '#' && wallH(era, ni, nj) >= h) return;
        b.add('cover', mat4(px, h, pz, ry));
      });
      const nb = [[0, 1], [1, 0], [-1, 0]];
      nb.forEach(([di, dj], dir) => {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= S.W || nj >= S.H) return;
        const n = ch(era, ni, nj);
        const pit = n === '_' || n === '=' || n === '>';
        if (n !== '#') face(i, j, dir, h, pit);
        else if (wallH(era, ni, nj) < h) face(i, j, dir, h, false);
        if (dir === 0 && h === WALL_H && n !== '#' && !pit) backFaces.push({ i, j });
      });
      continue;
    }
    // 바닥
    if (c !== '_' && c !== '=' && c !== '>') b.add('floor', mat4(x0, 0, z0));
    if (c === '_' || c === '=' || c === '>') {
      // 구덩이(와 출구 계단 구멍) 둘레: 북/동/서쪽 바닥 가장자리 아래로 벽면 + 깨진 돌 조각
      [[0, -1, 0], [1, 0, 2], [-1, 0, 1]].forEach(([di, dj, dir]) => {
        const n = ch(era, i + di, j + dj);
        if (n === '#' || n === '_' || n === '=' || n === '>') return;
        // 이웃 칸의 구덩이 쪽 면 (이웃 기준 방향)
        const ni = i + di, nj = j + dj;
        const x1 = ni * T, z1 = nj * T;
        const ry = [0, Math.PI / 2, -Math.PI / 2][dir];
        const px = [x1, x1 + T, x1][dir], pz = [z1 + T, z1 + T, z1][dir];
        b.add('wall', mat4(px, -4.5, pz, ry));
        if (c === '_') {
          // 깨진 바닥돌이 구덩이 가장자리에 걸쳐 있다 (돌 중심을 가장자리 조금 안쪽에)
          for (let k = 0; k < 2; k++) {
            const r = rnd(i, j, 10 + k + dir * 3);
            const along = 0.5 + k * 1.0 + (r - 0.5) * 0.3, inward = 0.12 + r * 0.22;
            let sx, sz;
            if (dir === 0) { sx = x0 + along; sz = z0 + inward; } else if (dir === 2) { sx = x0 + T - inward; sz = z0 + along; } else { sx = x0 + inward; sz = z0 + along; }
            b.add('broken' + (1 + Math.floor(r * 8)), stoneM(sx, -0.03 - r * 0.05, sz, Math.floor(r * 4) * Math.PI / 2 + (r - 0.5) * 0.5, (r - 0.5) * 0.2, (r - 0.5) * 0.25));
          }
        }
      });
    }
    if (c === '=') {
      // 같은 줄에 이어진 다리 구간을 한 번에 깐다 (구간 왼쪽 끝에서만)
      if (ch(era, i - 1, j) !== '=') {
        let n = 0; while (ch(era, i + n, j) === '=') n++;
        const len = n * T, k = Math.max(1, Math.round(len / 4)), seg = len / k;
        for (let s = 0; s < k; s++) b.add('bridge', mat4(x0 + seg * (s + 0.5), -0.09, cz, Math.PI / 2, 0.74, 1, seg / 4.05));
      }
    }
    if (c === ',') {
      for (let k = 0; k < 3; k++) {
        const r = rnd(i, j, 20 + k);
        b.add('broken' + (1 + Math.floor(r * 8)), stoneM(x0 + 0.5 + r, 0.0, z0 + 0.5 + rnd(i, j, 30 + k), r * 6.28));
      }
      if (rnd(i, j, 40) < 0.6) b.add('debris1', mat4(cx + (rnd(i, j, 41) - 0.5), 0, cz + (rnd(i, j, 42) - 0.5), rnd(i, j, 43) * 6.28, 0.8));
    }
    if (c === '%') {
      // 무너진 벽: 양옆에 돌무더기, 가운데는 지나갈 수 있게
      b.add('debris4', mat4(x0 + 0.25, 0, cz + 0.2, 0.7, 0.75, 0.9, 0.75));
      b.add('debris3', mat4(x0 + T - 0.3, 0, cz - 0.3, 2.1, 0.7));
      b.add('debris2', mat4(cx + 0.2, 0, z0 + T - 0.25, 4.0, 0.55));
      b.add('broken3', mat4(cx - 0.4, 0.0, cz - 0.6, 1.2));
    }
    if (c === '*') {
      // 어제: 받침 + 기둥 + 머리돌 / 오늘: 받침 + 부러진 밑동 + 돌무더기
      b.add('colBase', mat4(cx, 0, cz));
      if (era === 'past') { b.add('column', mat4(cx, 0, cz)); b.add('colCapital', mat4(cx, 3.9 + 0.61, cz)); }
      else { b.add('columnSmall', mat4(cx, 0, cz, 0.4)); b.add('debris3', mat4(cx + 0.6, 0, cz + 0.5, 1.3, 0.7)); }
    }
    if (c === 'b') {
      b.add('barrel', mat4(cx - 0.45, 0, cz - 0.2, 0.3, 1.3));
      b.add('barrel', mat4(cx + 0.5, 0, cz - 0.35, 1.7, 1.3));
      b.add('crate', mat4(cx - 0.1, 0, cz + 0.55, 1.57, 1.4));
      b.add('crate', mat4(cx + 0.1, 0.58, cz + 0.45, 1.4, 1.3));
      b.add('barrel', mat4(cx + 0.55, 0, cz + 0.55, 0.9, 1.2));
    }
    if (c === '|') {
      const ew = isOpen(era, i, j - 1) || isOpen(era, i, j + 1);
      if (ew) b.add('bars', mat4(cx, 0, z0 + T - 0.14));
      else b.add('bars', mat4(cx, 0, cz, Math.PI / 2));
    }
    if (c === 'D') {
      const g = new THREE.Group();
      const frame = makeMesh('doorway', era);
      g.add(frame);
      const hinge = new THREE.Group();
      hinge.position.set(0.89, 0, 0);
      hinge.add(makeMesh('door', era));
      g.add(hinge);
      g.position.set(cx, 0, z0 + T - 0.14);
      group.add(g);
      (dyn.doors = dyn.doors || []).push(hinge);
    }
    if (c === 'L') {
      const g = new THREE.Group();
      const base = makeMesh('lever', era);
      base.rotation.y = Math.PI / 2;
      g.add(base);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.22, 0);
      pivot.add(makeMesh('leverHandle', era));
      g.add(pivot);
      g.position.set(cx, 0, cz - 0.3);
      group.add(g);
      (dyn.levers = dyn.levers || []).push(pivot);
      if (era === ERAS[0]) interactables.push({ type: 'lever', i, j, x: cx, z: cz - 0.3 });
    }
    if (c === '>') {
      // 출구: 바닥에 뚫린 계단 구멍 + 뚜껑 문틀 + 아래에서 올라오는 빛
      b.add('stairs', mat4(x0, 0, z0));
      b.add('trapdoor', mat4(cx, 0, cz));
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: era === 'past' ? '#ffd27a' : '#8ff0ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 3, 24, 1, true), beamMat.clone());
      beam.material.uniforms.uColor.value = new THREE.Color(era === 'past' ? '#ffcf70' : '#7fe8ff');
      beam.position.y = 0.4;
      g.add(ring, beam);
      g.position.set(cx, 0, cz);
      group.add(g);
      (dyn.exits = dyn.exits || []).push(g);
      lights.push({ x: cx, y: 1.4, z: cz, color: era === 'past' ? '#ffc870' : '#7fe0ff', I: 6, d: 7 });
    }
    if (c === '^') {
      // 가시 바닥: 어제는 주기적으로 솟고(동적), 오늘은 녹슬어 반쯤 박힌 채 멈춰 있다
      b.add('spikePlate', mat4(cx, 0.0, cz));
      if (era === 'past') {
        const m = makeMesh('spikes', era); m.scale.set(1.3, 1, 1.3); m.position.set(cx, -0.72, cz);
        group.add(m);
        const sp = spikes.find(s => s.i === i && s.j === j && s.era === era);
        if (sp) sp.mesh = m;
      } else b.add('spikes', mat4(cx, -0.5, cz, 0.2, 1.3, 1, 1.3, 0.06, -0.05));
    }
    if (c === 'p') {
      const m = makeMesh('plate', era); m.position.set(cx, 0.02, cz);
      group.add(m);
      const pl = plates.find(s => s.i === i && s.j === j && s.era === era);
      if (pl) pl.mesh = m;
    }
    if (c === 'G') {
      // 시간 문: 문틀은 고정, 창살이 바닥 속으로 내려가며 열린다
      const ew = isOpen(era, i, j - 1) || isOpen(era, i, j + 1);
      const g = new THREE.Group();
      g.add(makeMesh('doorway', era));
      const bars = makeMesh('bars', era);
      g.add(bars);
      if (ew) g.position.set(cx, 0, z0 + T - 0.14); else { g.position.set(cx, 0, cz); g.rotation.y = Math.PI / 2; }
      group.add(g);
      const gt = gates.find(s => s.i === i && s.j === j && s.era === era);
      if (gt) gt.bars = bars;
    }
    // 장식: 시대마다 다르게 (같은 칸이면 늘 같은 결과)
    const plain = c === '.' || c === '@';
    if (plain) {
      const nW = ch(era, i - 1, j) === '#', nE = ch(era, i + 1, j) === '#', nN = ch(era, i, j - 1) === '#';
      const fullN = nN && wallH(era, i, j - 1) === WALL_H;
      if (era === 'now') {
        if (fullN && (nW || nE)) b.add('web1', mat4(nW ? x0 + 0.05 : x0 + T - 0.05, 2.0, z0 + 0.05, nW ? 0 : -Math.PI / 2, 1.1));
        const r = rnd(i, j, 50);
        if (r < 0.06) b.add('skull', mat4(cx + rnd(i, j, 51) - 0.5, 0, cz + rnd(i, j, 52) - 0.5, r * 90));
        else if (r < 0.12) b.add('bonePile', mat4(cx + rnd(i, j, 53) - 0.5, 0, cz + rnd(i, j, 54) - 0.5, r * 70));
        else if (r < 0.2 && (nW || nE || nN)) b.add('debris' + (1 + Math.floor(rnd(i, j, 55) * 2)), mat4(nW ? x0 + 0.5 : nE ? x0 + T - 0.5 : cx, 0, nN ? z0 + 0.5 : cz, r * 40, 0.8));
        else if (r < 0.32) b.add('broken' + (1 + Math.floor(rnd(i, j, 56) * 8)), stoneM(x0 + 0.5 + rnd(i, j, 57), 0.0, z0 + 0.5 + rnd(i, j, 58), r * 50));
      } else {
        if (fullN && (nW || nE) && rnd(i, j, 60) < 0.7) {
          const x = nW ? x0 + 0.5 : x0 + T - 0.5, z = z0 + 0.5;
          b.add('candelabra', mat4(x, 0, z, rnd(i, j, 61) * 6.28));
          lights.push({ x, y: 1.9, z: z + 0.2, color: '#ffb35a', I: 7, d: 7, flick: true });
          addFlame(group, x, 1.78, z, 0.45);
        }
        if (rnd(i, j, 62) < 0.05) b.add('candles', mat4(cx + rnd(i, j, 63) - 0.5, 0, cz + rnd(i, j, 64) - 0.5, rnd(i, j, 65) * 6.28));
      }
    }
  }
  // 뒤쪽 벽면: 횃불(두 시대 모두, 어제만 불이 켜짐)과 깃발(어제) / 거미줄(오늘)
  backFaces.sort((a, b2) => a.j - b2.j || a.i - b2.i);
  backFaces.forEach((f, k) => {
    const cx = f.i * T + 1, zf = f.j * T + T;
    if (k % 4 === 1) {
      b.add('torch', mat4(cx, 2.4, zf + 0.13));
      if (era === 'past') {
        lights.push({ x: cx, y: 2.9, z: zf + 0.9, color: '#ff9e45', I: 12, d: 10, flick: true });
        addFlame(group, cx, 2.78, zf + 0.32, 0.8);
      }
    } else if (k % 4 === 3) {
      if (era === 'past') b.add('flag', mat4(cx, 3.75, zf + 0.02));
      else if (rnd(f.i, f.j, 70) < 0.6) b.add('web2', mat4(cx + 0.2, 2.6, zf + 0.02, 0, 0.9));
    }
  });
  if (caps.length) {
    const im = new THREE.InstancedMesh(capGeo, capMat[era], caps.length);
    caps.forEach((m, k) => im.setMatrixAt(k, m));
    im.frustumCulled = false;
    group.add(im);
  }
  b.flush(group);
  // 상자: 어제는 새 상자, 오늘은 같은 자리의 썩은 상자 (자리는 두 시대 공통)
  for (const cr of crates) {
    const m = makeMesh('crate', era);
    m.scale.set(2.4, era === 'past' ? 2.2 : 1.8, 1.6);
    const holder = new THREE.Group(); holder.add(m);
    group.add(holder);
    cr.mesh[era] = holder;
  }
  // 화살 발사구: 벽면에 붙은 쇠판 (어제는 반짝이는 새것, 오늘은 녹슨 채 그대로)
  for (const l of launchers) {
    const cx = l.i * T + 1 + l.dx * 1.02, cz = l.j * T + 1 + l.dz * 1.02;
    const m = makeMesh('arrowPart', era);
    m.position.set(cx, 1.1, cz); m.rotation.set(Math.PI / 2, Math.atan2(l.dx, l.dz), 0, 'YXZ'); m.scale.setScalar(2.4);
    group.add(m);
  }
  // 진자 칼날: 천장 들보 + 축 + 칼날 (어제만 흔들림, 오늘은 들보만 남고 칼날은 녹슬어 떨어져 있음)
  for (const bl of blades) {
    const cx = bl.i * T + 1, cz = bl.j * T + 1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, T, 8).rotateZ(Math.PI / 2), capMat[era]); // 벽에서 벽으로 건너간 쇠 축
    if (bl.axis === 'z') beam.rotation.y = Math.PI / 2;
    beam.position.set(cx, BLADE.piv + 0.05, cz);
    group.add(beam);
    if (era === bl.era) {
      // 바닥의 칼날 줄: 칼날이 키 높이 아래로 내려올수록 붉게 (위에서 내려다볼 때 위험한 순간이 보이게)
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(bl.axis === 'x' ? T : 1.1, bl.axis === 'x' ? 1.1 : T).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ff8a1a', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
      strip.position.set(cx, 0.03, cz);
      group.add(strip);
      bl.strip = strip;
    }
    if (era !== bl.era) {
      // 다른 시대: 들보만 남고 칼날은 바닥 구석에 떨어져 있다 (그 칸이 구덩이면 안 보이게 아래로)
      const fallen = makeMesh('blade', era); fallen.rotation.set(Math.PI / 2, 0.5, 0); fallen.position.set(cx - 0.6, floorAt(era, bl.i, bl.j) ? 0.1 : -3, cz + 0.7);
      group.add(fallen); continue;
    }
    const pivot = new THREE.Group(); pivot.position.set(cx, BLADE.piv, cz);
    const blade = makeMesh('blade', era); if (bl.axis === 'z') blade.rotation.y = Math.PI / 2;
    pivot.add(blade);
    const mount = makeMesh('bladePart', era); mount.position.set(cx, BLADE.piv + 0.05, cz);
    group.add(pivot, mount);
    bl.pivot = pivot;
  }
  // 매달린 뗏목: 판자 + 네 귀퉁이 사슬 (어제만, 선로를 왕복)
  for (const r of rafts) if (r.era === era) {
    const g = new THREE.Group();
    const deck = makeMesh('bridge', era); deck.rotation.y = r.axis === 'x' ? Math.PI / 2 : 0; deck.scale.set(0.72, 1, 0.49); deck.position.y = -0.09;
    g.add(deck);
    for (const [sx, sz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) { const c = makeMesh('chain', era); c.position.set(sx, 0, sz); c.scale.set(1, 2.2, 1); g.add(c); }
    g.position.set(r.x, 0, r.z);
    group.add(g);
    r.mesh = g;
  }
  // 모래시계 조각
  for (const s of shards) if (s.era === era) { s.mesh = makeShard(era); s.mesh.position.set(s.i * T + 1, 0.9, s.j * T + 1); group.add(s.mesh); }
  // 오늘: 무너진 천장으로 들어오는 달빛 (구덩이가 있으면 그 위)
  if (era === 'now') {
    let px = S.W, pz = S.H, n = 0, sx = 0, sz = 0;
    for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) if (ch('now', i, j) === '_') { sx += i; sz += j; n++; }
    if (n) { px = sx / n; pz = sz / n; } else { px = S.W / 2 - 0.5; pz = S.H / 2 - 0.5; }
    const x = px * T + 1, z = pz * T + 1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 10, 32, 1, true), beamMat);
    beam.position.set(x - 1.2, 3, z - 1.6);
    beam.rotation.z = 0.12; beam.rotation.x = 0.18;
    group.add(beam);
    lights.push({ x: x - 0.6, y: 5, z: z - 0.8, color: '#9cc0ff', I: 22, d: 14 });
  }
  return { group, lights };
}

// 모래시계 조각 (코드로 만든 작은 모래시계 + 빛)
const shardGlassMat = new THREE.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffb640', emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.92 });
const shardFrameMat = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.6, metalness: 0.5 });
const shardGlowMat = new THREE.SpriteMaterial({ map: GLOW, color: '#ffcf6a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
function makeShard() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const cone = new THREE.ConeGeometry(0.17, 0.26, 12);
  const top = new THREE.Mesh(cone, shardGlassMat); top.position.y = 0.13; top.rotation.x = Math.PI;
  const bot = new THREE.Mesh(cone, shardGlassMat); bot.position.y = -0.13;
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), shardFrameMat); capT.position.y = 0.28;
  const capB = capT.clone(); capB.position.y = -0.28;
  spin.add(top, bot, capT, capB);
  for (let k = 0; k < 3; k++) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 6), shardFrameMat); const a = k / 3 * Math.PI * 2; rod.position.set(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19); spin.add(rod); }
  const glow = new THREE.Sprite(shardGlowMat); glow.scale.setScalar(1.4);
  g.add(spin, glow);
  g.userData.spin = spin;
  return g;
}

function addFlame(group, x, y, z, s) {
  const f = new THREE.Sprite(flameMat);
  f.position.set(x, y, z);
  f.scale.setScalar(s);
  group.add(f);
  entities.push({ era: group.name === 'era-past' ? 'past' : 'now', t: Math.random() * 10, update(dt, e) { e.t += dt; const k = 1 + Math.sin(e.t * 17) * 0.08 + Math.sin(e.t * 7.3) * 0.06; f.scale.setScalar(s * k); } });
}

/* ───────── 다른 시대 윤곽 (주변 6m) ───────── */
const ghostGroundMat = new THREE.ShaderMaterial({
  uniforms: { uPlayer: { value: new THREE.Vector3() }, uRange: { value: GHOST_RANGE }, uTime: { value: 0 }, uAlpha: { value: 1 } },
  vertexShader: /* glsl */`
    attribute vec4 aEdge; // 이웃이 같은 종류면 1 (그쪽 선은 안 그림): x=북 y=동 z=남 w=서
    varying vec2 vUv; varying vec3 vCol; varying vec3 vW; varying vec4 vEdge;
    void main() {
      vUv = uv; vCol = instanceColor; vEdge = aEdge;
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uPlayer; uniform float uRange; uniform float uTime; uniform float uAlpha;
    varying vec2 vUv; varying vec3 vCol; varying vec3 vW; varying vec4 vEdge;
    void main() {
      // uv: x 0(서)→1(동), y 0(남)→1(북)  (PlaneGeometry를 눕힌 것)
      float big = 9.0;
      float eN = mix(1.0 - vUv.y, big, vEdge.x), eE = mix(1.0 - vUv.x, big, vEdge.y), eS = mix(vUv.y, big, vEdge.z), eW = mix(vUv.x, big, vEdge.w);
      float e = min(min(eN, eE), min(eS, eW));
      float line = 1.0 - smoothstep(0.018, 0.04, e);
      float dash = step(0.35, fract((vW.x + vW.z) * 1.6 - uTime * 0.6));
      float dist = length(vW.xz - uPlayer.xz);
      float fade = 1.0 - smoothstep(uRange - 2.2, uRange, dist);
      float a = (line * (0.55 + 0.35 * dash) + 0.07) * fade * uAlpha;
      if (a < 0.003) discard;
      gl_FragColor = vec4(vCol, a);
    }`,
  transparent: true, depthWrite: false, depthTest: false,
});
const ghostBoxMat = new THREE.ShaderMaterial({
  uniforms: { uPlayer: ghostGroundMat.uniforms.uPlayer, uRange: ghostGroundMat.uniforms.uRange, uAlpha: { value: 1 } },
  vertexShader: /* glsl */`
    varying vec2 vUv; varying vec3 vCol; varying vec3 vW;
    void main() {
      vUv = uv;
      #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
      #else
      vCol = vec3(1.0);
      #endif
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uPlayer; uniform float uRange; uniform float uAlpha;
    varying vec2 vUv; varying vec3 vCol; varying vec3 vW;
    void main() {
      float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float line = 1.0 - smoothstep(0.012, 0.03, e);
      float dist = length(vW.xz - uPlayer.xz);
      float fade = 1.0 - smoothstep(uRange - 2.2, uRange, dist);
      float a = (line * 0.6 + 0.04) * fade * uAlpha;
      if (a < 0.003) discard;
      gl_FragColor = vec4(vCol, a);
    }`,
  transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
});
const ghostQuadGeo = new THREE.PlaneGeometry(T * 0.96, T * 0.96).rotateX(-Math.PI / 2);
const ghostBoxGeo = new THREE.BoxGeometry(T * 0.94, 2.2, T * 0.94).translate(0, 1.1, 0);
const COL = { floor: new THREE.Color('#33f0d8'), pit: new THREE.Color('#ff4a5a'), wall: new THREE.Color('#fff0cc') };

function cellKind(E, i, j) {
  const O = other(E);
  if (ch(E, i, j) === 'G' || ch(O, i, j) === 'G') return null; // 시간 문은 상태가 바뀌므로 updateMech에서 따로 그린다
  if (solid(E, i, j) && !solid(O, i, j)) return 'wall';
  if (stand(E, i, j) && !stand(O, i, j)) return 'floor';
  if (!floorAt(E, i, j) && !solid(E, i, j) && stand(O, i, j)) return 'pit';
  return null;
}
function buildGhosts() {
  for (const E of ERAS) {
    if (ghosts[E]) { world.remove(ghosts[E]); ghosts[E].traverse(o => o.isInstancedMesh && o.dispose()); }
    const g = new THREE.Group();
    g.name = 'ghost-' + E;
    const quads = [], boxes = [];
    for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) {
      const k = cellKind(E, i, j);
      if (k === 'wall') boxes.push({ i, j });
      else if (k) quads.push({ i, j, k });
    }
    if (quads.length) {
      const im = new THREE.InstancedMesh(ghostQuadGeo, ghostGroundMat, quads.length);
      const edge = new Float32Array(quads.length * 4);
      quads.forEach((q, n) => {
        im.setMatrixAt(n, mat4(q.i * T + 1, 0.05, q.j * T + 1));
        im.setColorAt(n, COL[q.k]);
        const same = (di, dj) => (cellKind(E, q.i + di, q.j + dj) === q.k ? 1 : 0);
        edge.set([same(0, -1), same(1, 0), same(0, 1), same(-1, 0)], n * 4);
      });
      im.geometry = ghostQuadGeo.clone();
      im.geometry.setAttribute('aEdge', new THREE.InstancedBufferAttribute(edge, 4));
      im.frustumCulled = false; im.renderOrder = 5;
      g.add(im);
    }
    if (boxes.length) {
      const im = new THREE.InstancedMesh(ghostBoxGeo, ghostBoxMat, boxes.length);
      boxes.forEach((q, n) => { im.setMatrixAt(n, mat4(q.i * T + 1, 0, q.j * T + 1)); im.setColorAt(n, COL.wall); });
      im.frustumCulled = false; im.renderOrder = 6;
      g.add(im);
    }
    g.userData.cells = { quads, boxes };
    g.visible = false;
    ghosts[E] = g;
    world.add(g);
  }
  syncGhostVis();
}
function syncGhostVis() { for (const E of ERAS) if (ghosts[E]) ghosts[E].visible = E !== S.era && !S.ring; }

// 막혔을 때 번쩍이는 상자
const flashMat = new THREE.MeshBasicMaterial({ color: '#ff6a5a', transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const flashBox = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 2.6, T).translate(0, 1.3, 0), flashMat, 6);
flashBox.frustumCulled = false; flashBox.renderOrder = 7; flashBox.count = 0;
scene.add(flashBox);

/* ───────── 전환 고리 효과 ───────── */
const ringFx = new THREE.Group();
const ringMat = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const ringGround = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96, 1), ringMat);
ringGround.rotation.x = -Math.PI / 2; ringGround.position.y = 0.08;
const ringWallMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#fff') }, uA: { value: 1 } },
  vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1.0 - vY) * (1.0 - vY) * 0.35 * uA); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const ringWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.2, 96, 1, true).translate(0, 1.6, 0), ringWallMat);
ringFx.add(ringGround, ringWall);
ringFx.visible = false;
scene.add(ringFx);

/* ───────── 플레이어 (회색 박스 대역: 캡슐) ───────── */
const player = new THREE.Group();
const body = new THREE.Group();
const cloakMat = new THREE.MeshStandardMaterial({ color: '#3c5350', roughness: 0.85 });
const skinMat = new THREE.MeshStandardMaterial({ color: '#e8c9a8', roughness: 0.7 });
const trimMat = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.5, metalness: 0.4 });
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 6, 14), cloakMat); torso.position.y = 0.66;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skinMat); head.position.y = 1.38;
const hood = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.42, 14), cloakMat); hood.position.set(0, 1.55, -0.04); hood.rotation.x = -0.25;
const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.32), trimMat); nose.position.set(0, 0.95, 0.3); // 바라보는 쪽 표시 (벨트 버클)
// body는 허리 높이(BODY_Y)를 축으로 돈다(구르기). 내용물은 그만큼 내려 둔다.
const BODY_Y = 0.55;
const capsule = new THREE.Group();
capsule.position.y = -BODY_Y;
capsule.add(torso, head, hood, nose);
body.add(capsule);
player.add(body);
// 벽 뒤에 가려지면 윤곽만 보이게
// 불투명 단계에서 세상(0) → 윤곽(1) → 캐릭터(2) 순으로 그린다. 윤곽이 캐릭터보다 먼저 그려져야
// 캐릭터 자신(옷 안쪽 몸 등)에 가려진 부분이 비치지 않는다. 그래서 transparent 대신 가산 혼합을 쓴다.
const xrayMat = new THREE.MeshBasicMaterial({ color: '#7fb6d8', blending: THREE.AdditiveBlending, opacity: 0.45, depthFunc: THREE.GreaterDepth, depthWrite: false });
for (const m of [torso, head, hood, nose]) m.renderOrder = 2;
for (const m of [torso, head, hood]) { const x = new THREE.Mesh(m.geometry, xrayMat); x.position.copy(m.position); x.rotation.copy(m.rotation); x.renderOrder = 1; capsule.add(x); }
// 모듈 캐릭터(불러오면 캡슐 대신)
const HERO_YAW = 0; // 모델이 바라보는 방향 보정
let hero = null, heroAnim = null;
function useHero(h) {
  if (hero) body.remove(hero.rig);
  hero = h; heroAnim = new Animator(h.rig, CHAR.clips);
  heroAnim.loop('AS_Idle_Seq', 0);
  h.rig.position.y = -BODY_Y;
  h.rig.rotation.y = HERO_YAW;
  for (const sm of h.meshes) {
    sm.renderOrder = 2;
    if (sm.material.alphaTest > 0) continue; // 머리카락 카드는 윤곽에서 뺀다
    const x = new THREE.SkinnedMesh(sm.geometry, xrayMat);
    h.rig.add(x);
    x.bind(sm.skeleton, sm.bindMatrix);
    x.renderOrder = 1; x.frustumCulled = false;
  }
  body.add(h.rig);
  capsule.visible = false;
}
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: GLOW, color: '#000', transparent: true, opacity: 0.55, depthWrite: false }));
blob.position.y = 0.03;
scene.add(player, blob);

/* ───────── 방 불러오기 ───────── */
function loadRoom(idx) {
  idx = ((idx % ROOMS.length) + ROOMS.length) % ROOMS.length;
  const room = ROOMS[idx];
  S.roomIdx = idx; S.room = room;
  S.H = room.past.length; S.W = room.past[0].length;
  for (const E of ERAS) {
    if (room[E].length !== S.H || room[E].some(r => r.length !== S.W)) console.error('room size mismatch', room.id, E);
    G[E] = room[E].map(r => [...r]);
  }
  // 움직이는 장치 꺼내기: 상자(두 시대 공통 자리)·조각은 바닥 글자로 바꾸고 따로 기억, 가시·발판·문은 글자 그대로 두고 상태만
  crates = []; gates = []; spikes = []; plates = []; shards = [];
  launchers = []; arrows = []; blades = []; rafts = [];
  const trackCells = {};
  S.gateT = 0; S.pushT = 0;
  for (const E of ERAS) for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) {
    const c = G[E][j][i];
    if (c === 'c') { G[E][j][i] = '.'; if (!crateAt(i, j)) crates.push({ i, j, sunk: false, vx: i * T + 1, vz: j * T + 1, vy: 0, mesh: {} }); }
    else if (c === 's' || c === '$' || c === '&') {
      // 조각: s = 바닥 위, $ = 어제의 가시 위, & = 구덩이 위(상자를 밀어 넣어야 닿음)
      G[E][j][i] = c === 's' ? '.' : c === '$' ? '^' : '_';
      const s = { era: E, i, j };
      if (!S.got.has(shardId(room, s))) shards.push(s);
      if (c === '$' && E === 'past') spikes.push({ era: E, i, j, t: (room.spikePhase ? room.spikePhase(i, j) : i * 0.45) % SPIKE_P, vy: -0.72 });
    }
    else if (c === '^' && E === 'past') spikes.push({ era: E, i, j, t: (room.spikePhase ? room.spikePhase(i, j) : i * 0.45) % SPIKE_P, vy: -0.72 });
    else if (c === 'p') plates.push({ era: E, i, j });
    else if (c === 'G') gates.push({ era: E, i, j, a: 0 });
    else if (c === 'A') { G[E][j][i] = '#'; launchers.push({ era: E, i, j, t: room.arrowPhase ? room.arrowPhase(i, j) : j * 0.4, dx: 0, dz: 0 }); }
    else if (c === 'Y') { G[E][j][i] = '.'; blades.push({ era: E, i, j, t: room.bladePhase ? room.bladePhase(i, j) : 0, axis: 'x' }); }
    else if (c === 'M' || c === 'm') { G[E][j][i] = '_'; (trackCells[E] = trackCells[E] || new Set()).add(i + ',' + j); if (c === 'M') rafts.push({ era: E, i, j }); }
  }
  // 화살 발사구는 트인 쪽으로 쏜다 / 칼날은 복도를 가로질러 흔들린다 / 뗏목은 이어진 선로를 왕복
  for (const l of launchers) {
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (ch(l.era, l.i + dx, l.j + dz) !== '#') { l.dx = dx; l.dz = dz; break; }
  }
  for (const bl of blades) bl.axis = (isOpen(bl.era, bl.i, bl.j - 1) || isOpen(bl.era, bl.i, bl.j + 1)) && !isOpen(bl.era, bl.i - 1, bl.j) ? 'x' : 'z';
  for (const r of rafts) {
    const tc = trackCells[r.era];
    const horiz = tc.has((r.i - 1) + ',' + r.j) || tc.has((r.i + 1) + ',' + r.j);
    let a = horiz ? r.i : r.j, b = a;
    while (tc.has(horiz ? (a - 1) + ',' + r.j : r.i + ',' + (a - 1))) a--;
    while (tc.has(horiz ? (b + 1) + ',' + r.j : r.i + ',' + (b + 1))) b++;
    Object.assign(r, { axis: horiz ? 'x' : 'z', a: a * T + 1, b: b * T + 1, fixed: (horiz ? r.j : r.i) * T + 1, wait: 0 });
    r.pos = (horiz ? r.i : r.j) * T + 1;
    r.dir = r.b - r.pos >= r.pos - r.a ? 1 : -1;
    r.x = horiz ? r.pos : r.fixed; r.z = horiz ? r.fixed : r.pos;
  }
  for (const [E, i, j] of room.shards || []) { const s = { era: E, i, j }; if (!S.got.has(shardId(room, s))) shards.push(s); }
  if (world) {
    scene.remove(world);
    world.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  }
  world = new THREE.Group();
  scene.add(world);
  dyn = {}; entities = []; interactables = [];
  lightSpecs = { past: [], now: [] };
  S.lever = false; S.doorOpen = false; S.doorAnim = 0; S.leverAnim = 0;
  ghosts.past = ghosts.now = null; ghostActors = null;
  for (const E of ERAS) {
    const { group, lights } = buildEra(E);
    groups[E] = group;
    lightSpecs[E] = lights;
    world.add(group);
  }
  // 장치의 시계는 그 장치가 있는 시대에 있을 때만 간다 (떠난 시대는 멈춘다)
  for (const sp of spikes) entities.push({ era: sp.era, t: 0, update(dt) { sp.t += dt; } });
  // 창살 칸에 몸이 걸쳐 있는 동안은 닫히지 않는다 (11/12: 지나가는 중에 닫혀 문 앞으로 밀려나 갇힌 것처럼 보였다)
  if (gates.length) entities.push({ era: gates[0].era, t: 0, update(dt) { if (S.gateT > 0) S.gateT = Math.max(gates.some(g => g.era === S.era && overlapCell(g.i, g.j)) ? 0.01 : 0, S.gateT - dt); } });
  for (const cr of crates) placeCrate(cr, true);
  for (const E of ERAS) if (launchers.some(l => l.era === E)) {
    const ent = { era: E, t: 0, update(dt) { stepArrows(E, dt, false); } };
    entities.push(ent);
    for (let k = 0; k < ARROW.warm * 30; k++) stepArrows(E, 1 / 30, true); // 들어오자마자 화살이 날아다니고 있게
  }
  for (const bl of blades) entities.push({ era: bl.era, t: 0, update(dt) { bl.t += dt; } });
  for (const r of rafts) entities.push({ era: r.era, t: 0, update(dt) { stepRaft(r, dt); } });
  buildGhostDyn();
  buildGhostActors();
  S.pastTime = 0; S.alarms = 0; S.alarmed = false; S.stabT = 0; S.shiftStrike = 0; S.hitstop = 0;
  spawnGuards(room);
  spawnGolems(room);
  spawnBoss(room);
  S.roomHurt = 0;
  if (room.boss) S.hearts = 5;
  music.setSong(room.boss ? 'boss' : 'keep');
  // 시작 위치
  let si = 1, sj = 1;
  for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) if (G[room.startEra][j][i] === '@') { si = i; sj = j; }
  S.p.set(si * T + 1, 0, sj * T + 1); S.py = 0; S.vel.set(0, 0, 0); S.face = 0; S.roll = 0;
  S.falling = 0; S.invuln = 0; S.lastSafe = { i: si, j: sj };
  S.start = { x: S.p.x, z: S.p.z }; S.safeHist = [{ x: S.p.x, z: S.p.z, era: room.startEra, t: -1 }]; S.safeT = -1; S.roomFails = 0; S.tipShown = false;
  if (S.ring) finishRing();
  setEraInstant(room.startEra);
  buildGhosts();
  camTarget.copy(S.p);
  // 방마다 카메라 거리 (보스 방은 넓게 본다). 안개도 그만큼 뒤로
  const cd = room.cam || CAM_DIST;
  camOff.set(0, Math.sin(CAM_PITCH) * cd, Math.cos(CAM_PITCH) * cd);
  scene.fog.near = 18 + cd - CAM_DIST; scene.fog.far = 44 + cd - CAM_DIST;
  S.roomTime = 0;
  hud.title.innerHTML = `${$t(room.name)}<small>${idx + 1} / ${ROOMS.length}</small>`;
  hud.title.style.opacity = 1; titleT = 2.6;
  hud.hint.textContent = $t(room.hint); hud.hint.classList.remove('tip');
  toastT = 0; hud.toast.style.opacity = 0;
  drawHearts();
  return room.id;
}
function setEraInstant(e) {
  S.era = e; S.eraW = e === 'now' ? 1 : 0;
  for (const E of ERAS) { groups[E].visible = E === e; ERA_U[E].side.value = -1; }
  SHIFT.radius.value = 1e5;
  drawEra(); syncGhostVis(); applyLook(S.eraW);
  music.setEra(e);
}

/* ───────── 시대 전환 ───────── */
function overlapSolids(era, x, z, r) {
  const hits = [];
  for (let j = cellOf(z - r); j <= cellOf(z + r); j++) for (let i = cellOf(x - r); i <= cellOf(x + r); i++) {
    if (!solid(era, i, j)) continue;
    const nx = Math.max(i * T, Math.min(x, i * T + T)), nz = Math.max(j * T, Math.min(z, j * T + T));
    if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) hits.push({ i, j });
  }
  return hits;
}
function tryShift() {
  if (!S.ready || S.falling > 0 || S.trans || S.ended || S.down) return 'busy';
  if (S.shiftCd > 0) return 'cooldown';
  const to = other(S.era);
  const hits = overlapSolids(to, S.p.x, S.p.z, PR * 0.9);
  if (hits.length) {
    S.blocked++; roomFail(); S.shiftCd = 0.25; S.shake = 0.3; S.flashT = 0.55;
    hits.slice(0, 6).forEach((h, n) => flashBox.setMatrixAt(n, mat4(h.i * T + 1, 0, h.j * T + 1)));
    flashBox.count = Math.min(6, hits.length); flashBox.instanceMatrix.needsUpdate = true;
    sfx.thunk(); screenFlash('#ff3b30', 0.12);
    toast(to === 'past' ? $t('어제는 그 자리가 막혀 있어요') : $t('오늘은 그 자리가 막혀 있어요'));
    return 'blocked';
  }
  startRing(S.era, to);
  S.era = to; S.shiftCd = SHIFT_CD; S.shifts++;
  S.shiftStrike = 0.6; // 전환 기습: 다른 시대로 넘어온 직후 0.6초 (어제의 경비, 오늘의 골렘 모두)
  // 시간 충격: 나타난 자리 3m(GUARD.shock) 안의 경비는 0.6초 얼어붙는다 (그 사이에 찌르면 앞에서도 한 방)
  for (const g of enemies()) if (g.alive && g.era === to && g.kind !== 'boss' && Math.hypot(g.x - S.p.x, g.z - S.p.z) < GUARD.shock) { g.stun = 0.6; if (g.anim) g.anim.once('AS_Hit_F_Seq', { speed: 1.2, dur: 0.6 }); }
  sfx.shift(to); drawEra(); syncGhostVis();
  music.setEra(to); // 떠난 시대의 노래는 그 박자에 멈추고, 이 시대의 노래가 멈췄던 자리에서 이어진다
  FX.motes(S.p.x, 0.4, S.p.z, { n: 22, color: FXC[to].glow, speed: 2.6, up: 1.6, life: 0.9, spread: 0.4 }); // 넘어온 시대 빛 알갱이
  screenFlash(to === 'past' ? '#ffd27a' : '#7fe8ff', 0.1);
  return stand(to, cellOf(S.p.x), cellOf(S.p.z)) || onRaft() ? 'ok' : 'fall';
}
function startRing(from, to) {
  if (S.ring) finishRing();
  const o = S.p;
  let max = 0;
  for (const [x, z] of [[0, 0], [S.W * T, 0], [0, S.H * T], [S.W * T, S.H * T]]) max = Math.max(max, Math.hypot(x - o.x, z - o.z));
  S.ring = { r: 0, max: max + 2, from, to };
  SHIFT.origin.value.set(o.x, 0, o.z);
  SHIFT.radius.value = 0;
  ERA_U[to].side.value = -1; ERA_U[from].side.value = 1;
  groups[to].visible = true; groups[from].visible = true;
  const col = ERA_U[to].glow.value;
  ringMat.color.copy(col); ringWallMat.uniforms.uColor.value.copy(col);
  ringFx.position.set(o.x, 0, o.z); ringFx.visible = true;
  syncGhostVis();
}
function finishRing() {
  if (!S.ring) return;
  groups[S.ring.from].visible = false;
  ERA_U[S.ring.from].side.value = -1;
  SHIFT.radius.value = 1e5;
  S.ring = null; ringFx.visible = false;
  syncGhostVis();
}
function updateRing(dt) {
  if (!S.ring) return;
  const R = S.ring;
  R.r += dt * RING_SPEED * (0.55 + Math.min(1, R.r / 6) * 0.6);
  SHIFT.radius.value = R.r;
  const s = Math.max(0.01, R.r);
  ringGround.scale.set(s, s, 1);
  ringWall.scale.set(s, 1, s);
  const a = 1 - Math.min(1, R.r / R.max);
  ringMat.opacity = 0.85 * (0.4 + 0.6 * a); ringWallMat.uniforms.uA.value = 0.4 + 0.6 * a;
  if (R.r >= R.max) finishRing();
}
function applyLook(w) {
  const A = LOOK.past, B = LOOK.now;
  hemi.color.copy(A.sky).lerp(B.sky, w); hemi.groundColor.copy(A.ground).lerp(B.ground, w);
  hemi.intensity = A.hemi + (B.hemi - A.hemi) * w;
  sun.color.copy(A.sun).lerp(B.sun, w); sun.intensity = A.sunI + (B.sunI - A.sunI) * w;
  sun.position.set(-6 + 13 * w, 14 - w, 8 - 3 * w); // 어제: 왼쪽 앞 따뜻한 빛 / 오늘: 오른쪽 위 달빛 (둘 다 뒤쪽 벽을 비춘다)
  scene.fog.color.copy(A.fog).lerp(B.fog, w);
  renderer.toneMappingExposure = A.exp + (B.exp - A.exp) * w;
}
function updateLights(dt) {
  const target = S.era === 'now' ? 1 : 0;
  S.eraW += Math.sign(target - S.eraW) * Math.min(Math.abs(target - S.eraW), dt / 0.45);
  applyLook(S.eraW);
  // 플레이어에게 가까운 순으로 풀에 배정
  const all = [];
  for (const E of ERAS) {
    const w = E === 'now' ? S.eraW : 1 - S.eraW;
    if (w <= 0.001) continue;
    for (const L of lightSpecs[E]) all.push({ L, w, d: (L.x - S.p.x) ** 2 + (L.z - S.p.z) ** 2 });
  }
  all.sort((a, b) => a.d - b.d);
  for (let k = 0; k < LIGHT_POOL; k++) {
    const l = pool[k], it = all[k];
    if (!it) { l.intensity = 0; continue; }
    const fl = it.L.flick ? 1 + Math.sin(S.time * 13 + it.L.x * 3) * 0.08 + Math.sin(S.time * 5.1 + it.L.z) * 0.07 : 1;
    l.position.set(it.L.x, it.L.y, it.L.z); l.color.set(it.L.color); l.distance = it.L.d; l.intensity = it.L.I * it.w * fl;
  }
}

/* ───────── 입력 ───────── */
const keys = new Set();
const virt = { x: 0, z: 0, on: false };
// e.code가 비어 오는 경우(일부 가상 키보드·자동화 도구)는 e.key로 맞춘다
function codeOf(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (k === 'Shift') return 'ShiftLeft';
  if (k === ' ') return 'Space';
  if (k.startsWith('Arrow')) return k;
  if (k.length === 1 && /[a-z]/i.test(k)) return 'Key' + k.toUpperCase();
  return k;
}
addEventListener('keydown', e => {
  const code = codeOf(e);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  ac();
  keys.add(code);
  if (e.repeat) return;
  if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyL') tryShift();
  if (code === 'Space' || code === 'KeyK') startRoll();
  if (code === 'KeyE') interact();
  if (code === 'KeyJ' || code === 'KeyF') stab();
  if (code === 'KeyR' && S.ready && !S.trans && !S.ended) { restartRoom(false); toast($t('방을 처음부터')); }
  if (code === 'KeyM') toast(music.toggle() ? $t('음악 켬') : $t('음악 끔'), 1.2);
});
addEventListener('pointerdown', e => { if (e.button === 0 && e.target === renderer.domElement) { ac(); stab(); } });
addEventListener('keyup', e => keys.delete(codeOf(e)));
addEventListener('blur', () => keys.clear());
function inputDir() {
  if (virt.on) return [virt.x, virt.z];
  let x = 0, z = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  const l = Math.hypot(x, z);
  return l ? [x / l, z / l] : [0, 0];
}

/* ───────── 플레이어 ───────── */
function startRoll() {
  if (!S.ready || S.rollCd > 0 || S.falling > 0 || S.trans || S.ended || S.down) return false;
  const [x, z] = inputDir();
  if (x || z) S.rollDir.set(x, 0, z); else S.rollDir.set(Math.sin(S.face), 0, Math.cos(S.face));
  S.roll = ROLL_T; S.rollCd = ROLL_CD; S.invuln = Math.max(S.invuln, ROLL_INV);
  S.face = Math.atan2(S.rollDir.x, S.rollDir.z);
  if (heroAnim) { const c = CHAR.clips.AS_Roll_F_0_Seq; heroAnim.once('AS_Roll_F_0_Seq', { speed: c ? c.duration / (ROLL_T + 0.25) : 1, dur: ROLL_T + 0.05 }); }
  sfx.roll();
  FX.dust(S.p.x, 0.1, S.p.z, { n: 7, speed: 1.6, up: 0.4, size: 0.4, alpha: 0.35, color: FXC[S.era].dust });
  return true;
}
function resolve() {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (let j = cellOf(S.p.z - PR); j <= cellOf(S.p.z + PR); j++) for (let i = cellOf(S.p.x - PR); i <= cellOf(S.p.x + PR); i++) {
      if (!solid(S.era, i, j)) continue;
      const x0 = i * T, z0 = j * T;
      const nx = Math.max(x0, Math.min(S.p.x, x0 + T)), nz = Math.max(z0, Math.min(S.p.z, z0 + T));
      let dx = S.p.x - nx, dz = S.p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= PR * PR) continue;
      if (d2 < 1e-8) { // 중심이 칸 안: 가장 가까운 변으로
        const l = S.p.x - x0, r = x0 + T - S.p.x, u = S.p.z - z0, w = z0 + T - S.p.z, m = Math.min(l, r, u, w);
        if (m === l) S.p.x = x0 - PR; else if (m === r) S.p.x = x0 + T + PR; else if (m === u) S.p.z = z0 - PR; else S.p.z = z0 + T + PR;
      } else {
        const d = Math.sqrt(d2), push = PR - d;
        S.p.x += dx / d * push; S.p.z += dz / d * push;
      }
      moved = true;
    }
    if (!moved) break;
  }
}
function startFall() {
  S.falling = 0.8; S.fallVy = 0; S.falls++; S.roll = 0; S.roomHurt++;
  sfx.fall(); roomFail();
}
// 같은 방에서 두 번 실패하면(추락·피해·막힘·경보) 더 구체적인 2단계 힌트를 연다
function roomFail() {
  S.roomFails++;
  if (S.roomFails >= 2 && S.room && S.room.tip && !S.tipShown) {
    S.tipShown = true;
    hud.hint.textContent = $t(S.room.tip); hud.hint.classList.add('tip');
  }
}
// 부활 자리: "직전에 서 있던 곳"으로 (그때의 시대까지 함께). 예전에는 지금 시대에서 가장 가까운 칸으로 보내서
// 구덩이 건너편에 태어나 퍼즐을 건너뛸 수 있었다. 0.2초마다 안전하게 서 있던 위치를 시대와 함께 기억해 두고,
// 0.5초 이상 지난 것 중 지금도 안전한 곳으로 돌아간다. 없으면 방 시작 자리.
const SAFE_EVERY = 0.2, SAFE_KEEP = 40;
function noteSafe() {
  if (S.time - S.safeT < SAFE_EVERY || S.falling > 0 || S.trans) return;
  S.safeT = S.time;
  S.safeHist.push({ x: S.p.x, z: S.p.z, era: S.era, t: S.time });
  if (S.safeHist.length > SAFE_KEEP) S.safeHist.shift();
}
const stillSafe = h => safeCell(h.era, cellOf(h.x), cellOf(h.z)) && !overlapSolids(h.era, h.x, h.z, PR * 0.9).length;
// 깨어 있는 적 바로 옆(그 시대에서 3m 안)으로는 되돌아가지 않는다 — 돌아오자마자 또 맞으면 되감기 의미가 없다
const nearFoe = h => enemies().some(g => g.alive && g.era === h.era && Math.hypot(g.x - h.x, g.z - h.z) < 3.0);
function respawnSafe() {
  let pick = null;
  const H = S.safeHist, old = h => S.time - h.t >= 0.5;
  for (const ok of [h => old(h) && !nearFoe(h), h => !nearFoe(h), () => true])
    for (let k = H.length - 1; k >= 0 && !pick; k--) if (stillSafe(H[k]) && ok(H[k])) pick = H[k];
  if (!pick) pick = { x: S.start.x, z: S.start.z, era: S.room.startEra };
  // 그 칸의 한가운데로 (가장자리에 서 있었으면 또 떨어지기 쉬워서)
  const cx = cellOf(pick.x) * T + 1, cz = cellOf(pick.z) * T + 1;
  const center = { x: cx, z: cz, era: pick.era };
  const at = stillSafe(center) ? center : pick;
  S.p.set(at.x, 0, at.z); S.py = 0; S.vel.set(0, 0, 0);
  if (pick.era !== S.era) { if (S.ring) finishRing(); setEraInstant(pick.era); }
  S.safeHist = S.safeHist.filter(h => h.t <= pick.t); // 돌아간 뒤의 기록은 버린다
  S.invuln = 1.2;
}
/* 쓰러짐 → 되감기 → 직전 자리에서 다시. 그동안 세상은 멈춘다(적·함정·시계 모두). 하트가 다 떨어지면 방 처음부터 */
const DOWN = { fadeIn: 0.35, move: 0.6, end: 1.15 };
function startDown(kind) {
  S.down = { t: 0, kind, moved: false };
  S.vel.set(0, 0, 0); S.roll = 0; S.stabT = 0;
  if (heroAnim && kind !== 'fall') heroAnim.once('AS_Hit_Death_Seq', { speed: 1.6, hold: true });
  sfx.rewind();
}
function stepDown(dt) {
  const d = S.down;
  d.t += dt;
  const a = d.t < DOWN.fadeIn ? d.t / DOWN.fadeIn : d.t < DOWN.move ? 1 : Math.max(0, 1 - (d.t - DOWN.move) / (DOWN.end - DOWN.move));
  hud.down.style.opacity = a;
  if (!d.moved && d.t >= DOWN.move) {
    d.moved = true;
    // 쓰러진 자세(hold)를 풀고 일어선다 — 하트를 다 잃어 방을 처음부터 할 때도 (11/12 전엔 이 길에서 안 풀려 쓰러진 채 걸어 다녔다)
    if (heroAnim) { heroAnim.onceLeft = 0; heroAnim.loop('AS_Idle_Seq', 0.05); }
    if (S.hearts <= 0) { restartRoom(true); S.down = { t: DOWN.move, kind: 'dead', moved: true }; return; }
    S.falling = 0; S.py = 0;
    respawnSafe(); drawHearts();
  }
  if (d.t >= DOWN.end) { S.down = null; hud.down.style.opacity = 0; }
}
function updatePlayer(dt) {
  if (S.falling > 0) {
    S.falling -= dt; S.fallVy -= 26 * dt; S.py += S.fallVy * dt;
    if (S.falling <= 0) {
      S.falling = 0.001; // 되감기가 끝날 때까지 떨어진 채로
      S.hearts--; drawHearts();
      screenFlash('#ff3b30', 0.25);
      startDown('fall');
    }
    return;
  }
  let [ix, iz] = S.trans ? [0, 0] : inputDir();
  let vx, vz;
  if (S.roll > 0) {
    S.roll -= dt;
    vx = S.rollDir.x * ROLL_SPEED; vz = S.rollDir.z * ROLL_SPEED;
    S.vel.set(vx * 0.45, 0, vz * 0.45);
  } else {
    const k = 1 - Math.exp(-dt * 16), sp = S.stabT > 0 ? SPEED * 0.2 : SPEED; // 찌르는 동안은 거의 멈춤
    S.vel.x += (ix * sp - S.vel.x) * k; S.vel.z += (iz * sp - S.vel.z) * k;
    vx = S.vel.x; vz = S.vel.z;
    if (ix || iz) {
      const want = Math.atan2(ix, iz);
      let d = want - S.face; d = Math.atan2(Math.sin(d), Math.cos(d));
      S.face += d * (1 - Math.exp(-dt * 16));
    }
  }
  S.p.x += vx * dt; S.p.z += vz * dt;
  resolve();
  if (S.era === 'past' && S.roll <= 0 && crates.length) tryPushCrate(ix, iz, dt);
  else {
    S.pushT = 0;
    // 오늘의 썩은 상자를 밀려고 하면 알려 준다
    if (S.era === 'now' && crates.length && (ix || iz) && toastT <= 0) {
      const f = crateInFront(ix, iz);
      if (f && solid('now', f.cr.i, f.cr.j)) toast($t('썩어서 안 밀려요 — 어제로 가서 미세요')); // 구덩이 위 발판인 상자는 밟고 지나가는 것
    }
  }
  const ci = cellOf(S.p.x), cj = cellOf(S.p.z);
  if (!floorAt(S.era, ci, cj)) { if (!onRaft()) startFall(); }
  else if (safeCell(S.era, ci, cj)) { S.lastSafe = { i: ci, j: cj }; noteSafe(); }
}
function restartRoom(dead) {
  if (dead) { S.hearts = 5; toast($t('처음부터 다시')); }
  loadRoom(S.roomIdx);
  return S.room.id;
}
function hurt(msg) {
  if (S.invuln > 0 || S.falling > 0 || S.trans || S.down) return false;
  S.hearts--; S.hurts++; S.roomHurt++; roomFail();
  sfx.hurt(); screenFlash('#ff3b30', 0.3); S.shake = 0.25; S.hitstop = 0.12;
  FX.sparks(S.p.x, 1.0, S.p.z, { n: 14, color: ['#ff6a6a', '#ffd0d0'], speed: 4, up: 3 }); FX.punch(0.3);
  if (msg) toast(msg);
  drawHearts();
  startDown('hurt');
  return true;
}

/* ───────── 확장 장치: 상자 밀기 · 발판과 시간 문 · 가시 · 조각 ───────── */
// 상자는 어제에서만 걸어서 민다(한 칸씩). 밀려 들어갈 칸이 어제의 구덩이면 빠져서 메워진다.
// 밀고 있는 상자 찾기: 누르는 방향의 주축 → 안 되면 다른 축. 상자 칸에 붙어 있고 대략 줄이 맞으면(0.95m 안)
function crateInFront(ix, iz) {
  const ci = cellOf(S.p.x), cj = cellOf(S.p.z);
  const axes = Math.abs(ix) >= Math.abs(iz) ? [[Math.sign(ix), 0], [0, Math.sign(iz)]] : [[0, Math.sign(iz)], [Math.sign(ix), 0]];
  for (const ax of axes) {
    if (!ax[0] && !ax[1]) continue;
    const cr = crateAt(ci + ax[0], cj + ax[1]);
    if (!cr || cr.sunk) continue;
    const cx = (ci + ax[0]) * T + 1, cz = (cj + ax[1]) * T + 1;
    const gap = ax[0] ? Math.abs(cx - S.p.x) - 1 : Math.abs(cz - S.p.z) - 1;
    const off = ax[0] ? Math.abs(cz - S.p.z) : Math.abs(cx - S.p.x);
    if (gap <= PR + 0.12 && off <= 0.95) return { cr, ax, cx, cz };
  }
  return null;
}
function tryPushCrate(ix, iz, dt) {
  if (!ix && !iz) { S.pushT = 0; return; }
  const f = crateInFront(ix, iz);
  if (!f || f.cr.moving > 0) { S.pushT = 0; return; }
  const { cr, ax, cx, cz } = f;
  // 미는 동안 상자 줄 가운데로 살짝 끌어당겨 준다 (빗겨 서 있어도 밀리게)
  if (ax[0]) S.p.z += (cz - S.p.z) * Math.min(1, dt * 10); else S.p.x += (cx - S.p.x) * Math.min(1, dt * 10);
  S.pushT += dt;
  if (S.pushT < 0.12) return;
  S.pushT = 0;
  const ti = cr.i + ax[0], tj = cr.j + ax[1];
  const tc = ch('past', ti, tj);
  const blocked = tc === '#' || solid('past', ti, tj) || 'GDpL>'.includes(tc) || shards.some(s => !s.got && s.era === 'past' && s.i === ti && s.j === tj);
  if (blocked) { sfx.thunk(); if (toastT <= 0) toast($t('그쪽으로는 안 밀려요')); S.pushT = -0.5; return; }
  cr.i = ti; cr.j = tj; cr.moving = 0.2;
  if (tc === '_' || (tc === '=' && false)) { cr.sunk = true; toast($t('상자가 구덩이를 메웠어요')); }
  sfx.scrape();
  buildGhosts();
}
function placeCrate(cr, instant) {
  const tx = cr.i * T + 1, tz = cr.j * T + 1;
  const k = instant ? 1 : 0.35;
  cr.vx += (tx - cr.vx) * k; cr.vz += (tz - cr.vz) * k;
  const nowPit = ch('now', cr.i, cr.j) === '_';
  const ty = cr.sunk ? -0.88 : 0;
  cr.vy += (ty - cr.vy) * (instant ? 1 : 0.25);
  if (cr.mesh.past) cr.mesh.past.position.set(cr.vx, cr.vy, cr.vz);
  if (cr.mesh.now) {
    // 오늘: 구덩이 위면 비스듬히 박혀 발판, 바닥 위면 기울어진 썩은 상자
    const n = cr.mesh.now;
    n.position.set(cr.vx, cr.sunk ? -0.9 : nowPit ? -0.62 : 0, cr.vz);
    n.rotation.set(nowPit && !cr.sunk ? 0.12 : 0.05, 0.3, nowPit && !cr.sunk ? -0.08 : 0.1);
  }
}
/* 화살: 발사구마다 ARROW.interval초마다 한 발. 그 시대에 있을 때만 날고(멈춘 화살은 공중에 그대로), 벽·닫힌 문·상자에 닿으면 사라진다 */
function spawnArrow(l, ahead) {
  const a = { era: l.era, x: l.i * T + 1 + l.dx * (1.05 + ahead), z: l.j * T + 1 + l.dz * (1.05 + ahead), dx: l.dx, dz: l.dz };
  const m = new THREE.Group();
  const body = makeMesh('arrow', l.era); body.scale.setScalar(2.4); body.rotation.y = ARROW_YAW;
  const trail = new THREE.Mesh(trailGeo, trailMat.past); // 날아온 쪽으로 빛 꼬리 (탑다운에서 가는 화살이 잘 보이게)
  m.add(body, trail);
  m.rotation.y = Math.atan2(l.dx, l.dz);
  m.position.set(a.x, 1.1, a.z);
  groups[l.era].add(m);
  a.mesh = m;
  if (ghostActors) addArrowGhost(a);
  arrows.push(a);
}
const ARROW_YAW = Math.PI; // 화살 모델의 촉이 -z를 향함
// 꼬리: 화살 뒤로 1.8m, 끝으로 갈수록 흐려지는 가산 띠 (화살 진행 방향 = 로컬 +z)
const trailGeo = new THREE.PlaneGeometry(0.16, 1.8).rotateX(-Math.PI / 2).translate(0, 0, -1.2);
function makeTrailMat(color, a) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: a } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float e = 1.0 - abs(vUv.x - 0.5) * 2.0; float k = 1.0 - vUv.y; gl_FragColor = vec4(uColor, k * k * e * uA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const trailMat = { past: makeTrailMat('#ffe2a8', 1.4), ghost: (() => { const m = makeTrailMat('#ff4a4a', 1.4); m.depthTest = false; return m; })() };
function stepArrows(E, dt, warm) {
  for (const l of launchers) {
    if (l.era !== E) continue;
    l.t += dt;
    while (l.t >= ARROW.interval) { l.t -= ARROW.interval; spawnArrow(l, l.t * ARROW.speed); }
  }
  for (let k = arrows.length - 1; k >= 0; k--) {
    const a = arrows[k];
    if (a.era !== E) continue;
    a.x += a.dx * ARROW.speed * dt; a.z += a.dz * ARROW.speed * dt;
    let gone = solid(E, cellOf(a.x + a.dx * 0.3), cellOf(a.z + a.dz * 0.3));
    if (!gone && !warm && S.era === E && S.falling <= 0 && Math.abs(a.x - S.p.x) < PR + 0.12 && Math.abs(a.z - S.p.z) < PR + 0.12 && hurt($t('화살에 맞았어요'))) gone = true;
    if (gone) { a.mesh.parent && a.mesh.parent.remove(a.mesh); if (a.ghost) a.ghost.parent && a.ghost.parent.remove(a.ghost); arrows.splice(k, 1); continue; }
    a.mesh.position.set(a.x, 1.1, a.z);
  }
}
/* 뗏목: 선로 양 끝을 왕복. 그 시대에 서 있으면 같이 실려 간다. 떠나 있으면 그 자리에 멈춰 있다 */
function stepRaft(r, dt) {
  const px = r.x, pz = r.z;
  if (r.wait > 0) r.wait -= dt;
  else {
    r.pos += r.dir * RAFT.speed * dt;
    if (r.pos >= r.b) { r.pos = r.b; r.dir = -1; r.wait = RAFT.pause; } else if (r.pos <= r.a) { r.pos = r.a; r.dir = 1; r.wait = RAFT.pause; }
  }
  r.x = r.axis === 'x' ? r.pos : r.fixed; r.z = r.axis === 'z' ? r.pos : r.fixed;
  if (S.era === r.era && S.falling <= 0 && Math.abs(S.p.x - px) < 1 && Math.abs(S.p.z - pz) < 1) { S.p.x += r.x - px; S.p.z += r.z - pz; resolve(); }
  if (r.mesh) r.mesh.position.set(r.x, 0, r.z);
}
const onRaft = () => rafts.some(r => r.era === S.era && Math.abs(S.p.x - r.x) < 1 && Math.abs(S.p.z - r.z) < 1);
/* 진자 칼날: 칼날 끝이 키 높이(1.75m)보다 내려온 구간이 플레이어와 겹치면 피해 */
const bladeAngle = bl => BLADE.amp * Math.sin(2 * Math.PI * bl.t / BLADE.period);
function bladeHits(bl) {
  const th = bladeAngle(bl);
  if (BLADE.piv - BLADE.len * Math.cos(th) > 1.75) return false;
  const cx = bl.i * T + 1, cz = bl.j * T + 1;
  const off1 = (BLADE.piv - 1.75) * Math.tan(th), off2 = BLADE.len * Math.sin(th);
  const lo = Math.min(off1, off2) - 0.55, hi = Math.max(off1, off2) + 0.55;
  const along = bl.axis === 'x' ? S.p.x - cx : S.p.z - cz, across = bl.axis === 'x' ? S.p.z - cz : S.p.x - cx;
  return Math.abs(across) < 0.2 + PR && along > lo - PR && along < hi + PR;
}
// 다른 시대에 멈춰 있는 화살·칼날: 같은 모양의 붉은 반투명 (벽 너머로도 보임, 주변 GHOST_RANGE 안)
const ghostRedMat = new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
function ghostOf(name) {
  const g = new THREE.Group();
  for (const pr of piece[name]) { const me = new THREE.Mesh(pr.geo, ghostRedMat); me.applyMatrix4(pr.m); me.renderOrder = 8; g.add(me); }
  return g;
}
function addArrowGhost(a) {
  a.ghost = new THREE.Group();
  const body = ghostOf('arrow'); body.scale.setScalar(2.6); body.rotation.y = ARROW_YAW;
  const trail = new THREE.Mesh(trailGeo, trailMat.ghost); trail.renderOrder = 8;
  a.ghost.add(body, trail); a.ghost.rotation.y = a.mesh.rotation.y;
  ghostActors.add(a.ghost);
}
function buildGhostActors() {
  ghostActors = new THREE.Group(); ghostActors.name = 'ghost-actors';
  world.add(ghostActors);
  for (const a of arrows) addArrowGhost(a);
  for (const bl of blades) {
    const pv = new THREE.Group(); pv.position.set(bl.i * T + 1, BLADE.piv, bl.j * T + 1);
    const g = ghostOf('blade'); if (bl.axis === 'z') g.rotation.y = Math.PI / 2;
    pv.add(g); ghostActors.add(pv); bl.ghost = pv;
  }
}
const nearP = (x, z, r = GHOST_RANGE + 1) => (x - S.p.x) ** 2 + (z - S.p.z) ** 2 < r * r;
function updateActors() {
  for (const bl of blades) {
    const th = bladeAngle(bl);
    if (bl.pivot) { if (bl.axis === 'x') bl.pivot.rotation.z = th; else bl.pivot.rotation.x = th; }
    if (bl.strip) { const low = 1 - Math.min(1, Math.max(0, (Math.abs(th) - 0.3) / 0.5)); bl.strip.material.opacity = 0.08 + 0.55 * low * low; }
    if (bl.ghost) { if (bl.axis === 'x') bl.ghost.rotation.z = th; else bl.ghost.rotation.x = th; bl.ghost.visible = bl.era !== S.era && !S.ring && nearP(bl.i * T + 1, bl.j * T + 1); }
    if (S.era === bl.era && !S.trans && S.falling <= 0 && bladeHits(bl)) hurt($t('칼날에 베였어요'));
  }
  for (const a of arrows) if (a.ghost) { a.ghost.position.set(a.x, 1.1, a.z); a.ghost.visible = a.era !== S.era && !S.ring && nearP(a.x, a.z); }
}
const ghostDynGeo = ghostQuadGeo.clone();
let ghostDyn = null;
function buildGhostDyn() {
  if (ghostDyn) { scene.remove(ghostDyn); ghostDyn.dispose(); ghostDyn = null; }
  const n = gates.length + spikes.length + rafts.length;
  if (!n) return;
  ghostDyn = new THREE.InstancedMesh(ghostDynGeo, ghostGroundMat, n);
  if (!ghostDynGeo.getAttribute('aEdge') || ghostDynGeo.getAttribute('aEdge').count < n) ghostDynGeo.setAttribute('aEdge', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(n, 64) * 4), 4));
  for (let k = 0; k < n; k++) ghostDyn.setColorAt(k, COL.pit);
  ghostDyn.frustumCulled = false; ghostDyn.renderOrder = 6;
  scene.add(ghostDyn);
}
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const COL_WARN = new THREE.Color('#ffae3a');
function updateMech(dt) {
  const ci = cellOf(S.p.x), cj = cellOf(S.p.z);
  const busy = S.falling > 0 || S.trans;
  // 발판: 밟고 있는 동안 문 시간을 가득 채운다
  for (const pl of plates) {
    const on = !busy && S.era === pl.era && ci === pl.i && cj === pl.j;
    if (on && S.gateT < gateHold() - 0.05) { if (S.gateT <= 0) { sfx.lever(); sfx.door(); toast($t('어딘가에서 창살이 내려갔어요')); } S.gateT = gateHold(); }
    if (pl.mesh) pl.mesh.position.y += ((S.gateT > 0 ? -0.05 : 0.02) - pl.mesh.position.y) * Math.min(1, dt * 12);
  }
  // 문: 창살이 바닥 속으로 내려간다. 닫힐 때 문 칸에 서 있으면 밀려난다(resolve)
  for (const g of gates) {
    g.a += ((S.gateT > 0 ? 1 : 0) - g.a) * Math.min(1, dt * 10);
    if (g.bars) g.bars.position.y = -3.05 * g.a;
  }
  // 가시: 어제의 시간에서만 움직인다
  for (const sp of spikes) {
    const st = spikeState(sp);
    const ty = st === 'up' ? 0 : st === 'warn' ? -0.48 : -0.72;
    sp.vy += (ty - sp.vy) * Math.min(1, dt * (st === 'up' ? 30 : 10));
    if (sp.mesh) sp.mesh.position.y = sp.vy;
    if (!busy && st === 'up' && S.era === sp.era && ci === sp.i && cj === sp.j) hurt($t('가시에 찔렸어요'));
  }
  // 상자 미끄러짐
  for (const cr of crates) { if (cr.moving > 0) cr.moving -= dt; placeCrate(cr, false); }
  // 화살·칼날 모습과 칼날 피해, 다른 시대의 멈춘 모습
  updateActors();
  // 조각 줍기
  for (const s of shards) {
    if (s.got || !s.mesh) continue;
    s.mesh.userData.spin.rotation.y += dt * 1.8;
    s.mesh.position.y = 0.9 + Math.sin(S.time * 2.4 + s.i) * 0.08;
    if (!busy && S.era === s.era && ci === s.i && cj === s.j) {
      s.got = true; S.got.add(shardId(S.room, s)); s.mesh.visible = false;
      sfx.exit(); toast($t('모래시계 조각 {0} / {1}', S.got.size, SHARD_TOTAL)); drawHearts();
    }
  }
  // 다른 시대에 멈춰 있는 장치를 윤곽으로: 열린 문 = 청록, 솟은 가시 = 빨강, 곧 솟을 가시 = 주황
  if (ghostDyn) {
    let k = 0;
    for (const g of gates) {
      const show = g.era !== S.era && !S.ring && S.gateT > 0;
      ghostDyn.setMatrixAt(k, show ? mat4(g.i * T + 1, 0.06, g.j * T + 1) : _zero);
      ghostDyn.setColorAt(k++, COL.floor);
    }
    for (const sp of spikes) {
      const st = spikeState(sp);
      const show = sp.era !== S.era && !S.ring && st !== 'down';
      ghostDyn.setMatrixAt(k, show ? mat4(sp.i * T + 1, 0.07, sp.j * T + 1, 0, 0.9) : _zero);
      ghostDyn.setColorAt(k++, st === 'up' ? COL.pit : COL_WARN);
    }
    for (const r of rafts) {
      // 멈춘 뗏목 자리 = 저쪽 시대엔 여기 바닥이 있음 (칸에 안 맞춰 실제 위치 그대로)
      const show = r.era !== S.era && !S.ring;
      ghostDyn.setMatrixAt(k, show ? mat4(r.x, 0.08, r.z) : _zero);
      ghostDyn.setColorAt(k++, COL.floor);
    }
    ghostDyn.instanceMatrix.needsUpdate = true;
    if (ghostDyn.instanceColor) ghostDyn.instanceColor.needsUpdate = true;
  }
  // 문 시간 표시 (어제를 떠나 있으면 '멈춤')
  if (gates.length && S.gateT > 0) {
    hud.gate.style.display = 'block';
    hud.gateBar.style.width = (100 * S.gateT / gateHold()) + '%';
    hud.gateLbl.textContent = $t('창살 {0}초', S.gateT.toFixed(1)) + (S.era !== gates[0].era ? ' · ' + $t('멈춤') : '');
    hud.gate.classList.toggle('frozen', S.era !== gates[0].era);
  } else hud.gate.style.display = 'none';
}
function drawPlayer(dt) {
  player.position.set(S.p.x, S.py, S.p.z);
  player.rotation.y = S.face;
  const fall = S.falling > 0 ? Math.max(0.2, S.falling / 0.8) : 1;
  body.scale.setScalar(fall);
  if (S.roll > 0 && !hero) {
    // 구르기(캡슐 대역일 때만): 허리 축으로 앞으로 한 바퀴 + 웅크림. 캐릭터는 단검 팩의 구르기 동작을 쓴다
    const t = 1 - S.roll / ROLL_T;
    body.rotation.x = t * Math.PI * 2; body.rotation.z = 0;
    body.position.y = BODY_Y - Math.sin(t * Math.PI) * 0.18;
    const sq = 1 - Math.sin(t * Math.PI) * 0.3;
    body.scale.set(fall, fall * sq, fall);
  } else {
    body.rotation.x = 0;
    const sp = Math.hypot(S.vel.x, S.vel.z);
    if (hero) { body.position.y = BODY_Y; body.rotation.z = 0; } // 달리기 흔들림은 동작이 맡는다
    else {
      body.position.y = BODY_Y + Math.abs(Math.sin(S.time * 11)) * 0.06 * Math.min(1, sp / SPEED);
      body.rotation.z = Math.sin(S.time * 11) * 0.05 * Math.min(1, sp / SPEED);
    }
  }
  // 무적 깜빡임
  player.visible = !(S.invuln > 0 && S.roll <= 0 && Math.floor(S.time * 14) % 2 === 0);
  blob.position.set(S.p.x, 0.03, S.p.z);
  blob.visible = S.falling <= 0 && floorAt(S.era, cellOf(S.p.x), cellOf(S.p.z));
}

/* ───────── 상호작용 · 연결 오브젝트 ───────── */
function nearestInteract() {
  let best = null, bd = 1.7 * 1.7;
  for (const it of interactables) {
    const d = (it.x - S.p.x) ** 2 + (it.z - S.p.z) ** 2;
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
function interact() {
  if (!S.ready || S.falling > 0 || S.trans || S.ended) return 'busy';
  const it = nearestInteract();
  if (!it) return 'none';
  if (it.type === 'lever') {
    if (S.era === 'now') { sfx.thunk(); toast($t('녹이 슬어 꿈쩍도 하지 않아요')); return 'rusted'; }
    const want = !S.lever;
    if (!want) { // 닫으려는데 문 칸에 서 있으면 안 닫는다
      const door = findChar('D');
      if (door && overlapCell(door.i, door.j)) { toast($t('문 사이에 서 있어요')); return 'blocked'; }
    }
    S.lever = want; S.doorOpen = want;
    sfx.lever(); setTimeout(() => sfx.door(), 120);
    toast(want ? $t('어딘가에서 문이 열렸어요') : $t('문이 닫혔어요'));
    buildGhosts();
    return want ? 'opened' : 'closed';
  }
  return 'none';
}
function findChar(c) { for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) if (G.past[j][i] === c || G.now[j][i] === c) return { i, j }; return null; }
function overlapCell(i, j) { const nx = Math.max(i * T, Math.min(S.p.x, i * T + T)), nz = Math.max(j * T, Math.min(S.p.z, j * T + T)); return (S.p.x - nx) ** 2 + (S.p.z - nz) ** 2 < PR * PR; }
function updateLinked(dt) {
  // 문과 레버는 두 시대 공통 상태 → 두 시대 모두에서 같은 모습으로 움직인다
  const td = S.doorOpen ? 1 : 0, tl = S.lever ? 1 : 0;
  S.doorAnim += Math.sign(td - S.doorAnim) * Math.min(Math.abs(td - S.doorAnim), dt / 0.8);
  S.leverAnim += Math.sign(tl - S.leverAnim) * Math.min(Math.abs(tl - S.leverAnim), dt / 0.25);
  const ease = t => t * t * (3 - 2 * t);
  for (const h of dyn.doors || []) h.rotation.y = ease(S.doorAnim) * 1.75; // 카메라 쪽(남쪽)으로 젖혀 열린 게 보이게
  for (const p of dyn.levers || []) p.rotation.z = 0.6 - ease(S.leverAnim) * 1.2;
  for (const g of dyn.exits || []) { g.children[0].scale.setScalar(1 + Math.sin(S.time * 3) * 0.06); g.rotation.y = S.time * 0.5; }
}

/* ───────── 경비병 — 어제에만 있다 (기획서 18장 "어제의 암살자") ─────────
   순찰하다 시야 부채꼴(벽에 가려짐) 안의 플레이어를 보면 의심이 차고, 다 차면 경보 → 쫓아와 찌른다.
   어제를 떠나면 그 자리에 멈추고, 오늘에서는 붉은 윤곽 + 멈춘 시야로 보인다.
   등 뒤에서 찌르면 한 방. 앞·옆은 막힌다. 어제로 돌아온 직후 0.6초(전환 기습)에는 경보 전이면 어느 방향이든 한 방. */
// sus: 의심이 차는 속도(초당) 가까이 → 멀리. 1.5m ≈ 0.6초, 7m ≈ 1.5초면 들킴 (사람 반응 0.25초 + 피할 틈)
// shock: 어제로 나타난 자리에서 이 거리 안의 경비는 0.6초 얼어붙음 = 찌르기 돌진 거리(3m)와 같게
const GUARD = { walk: 1.5, run: 4.0, turn: 7, r: 0.42, range: 7.5, half: THREE.MathUtils.degToRad(42), windup: 0.55, recover: 0.75, reach: 1.75, hear: 7, lose: 5,
  susNear: 2.0, susFar: 0.55, shock: 3.0, lunge: 3.0 };
let guards = [];
const guardGhostMat = new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.4, depthTest: false, depthWrite: false });
const CONE_N = 24;
const coneMat = { calm: '#fff1b8', sus: '#ffb340', alert: '#ff4030' };
function makeCone() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_N + 2) * 3), 3));
  const idx = []; for (let k = 1; k <= CONE_N; k++) idx.push(0, k, k + 1);
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: coneMat.calm, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 4;
  return m;
}
function markTex(txt, col) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.font = 'bold 52px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = '#000'; x.strokeText(txt, 32, 34); x.fillStyle = col; x.fillText(txt, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const MARK = { sus: markTex('?', '#ffd04a'), alert: markTex('!', '#ff4a3a') };
const shockRingGeo = new THREE.RingGeometry(GUARD.shock - 0.07, GUARD.shock, 72);
const shockRingMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
// 벽·닫힌 상자에 시야가 막힌다 (창살·창살 문은 비쳐 보인다)
const opaque = (era, i, j) => solid(era, i, j) && !'|DG'.includes(ch(era, i, j));
function rayLen(era, x, z, dx, dz, max) {
  for (let d = 0.25; d <= max; d += 0.2) if (opaque(era, cellOf(x + dx * d), cellOf(z + dz * d))) return Math.max(0.2, d - 0.2);
  return max;
}
const gFwd = g => [Math.sin(g.yaw), Math.cos(g.yaw)];
function canSee(g, px, pz) {
  const dx = px - g.x, dz = pz - g.z, d = Math.hypot(dx, dz);
  if (d > GUARD.range || d < 0.01) return d < 0.01;
  const [fx, fz] = gFwd(g);
  if ((dx * fx + dz * fz) / d < Math.cos(GUARD.half)) return false;
  return rayLen(g.era, g.x, g.z, dx / d, dz / d, d) >= d - 0.05;
}
function updateCone(g) {
  const pos = g.cone.geometry.attributes.position, a = pos.array;
  a[0] = g.x; a[1] = 0.06; a[2] = g.z;
  for (let k = 0; k <= CONE_N; k++) {
    const ang = g.yaw - GUARD.half + (2 * GUARD.half * k) / CONE_N, dx = Math.sin(ang), dz = Math.cos(ang);
    const L = rayLen(g.era, g.x, g.z, dx, dz, GUARD.range);
    a[(k + 1) * 3] = g.x + dx * L; a[(k + 1) * 3 + 1] = 0.06; a[(k + 1) * 3 + 2] = g.z + dz * L;
  }
  pos.needsUpdate = true;
  g.cone.geometry.computeBoundingSphere();
}
function turnTo(g, tx, tz, dt, rate = GUARD.turn) {
  const want = Math.atan2(tx - g.x, tz - g.z);
  let d = want - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  return Math.abs(d);
}
function moveGuard(g, tx, tz, speed, dt) { return moveEnemy(g, tx, tz, speed, dt, GUARD.r, GUARD.turn); }
function moveEnemy(g, tx, tz, speed, dt, R, turn) {
  const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  turnTo(g, tx, tz, dt, turn);
  const s = Math.min(d, speed * dt);
  g.x += dx / d * s; g.z += dz / d * s;
  // 벽에 붙지 않게 칸 단위로 밀어내기
  for (let j = cellOf(g.z - R); j <= cellOf(g.z + R); j++) for (let i = cellOf(g.x - R); i <= cellOf(g.x + R); i++) {
    if (stand(g.era, i, j)) continue;
    const nx = Math.max(i * T, Math.min(g.x, i * T + T)), nz = Math.max(j * T, Math.min(g.z, j * T + T));
    const ex = g.x - nx, ez = g.z - nz, e = Math.hypot(ex, ez);
    if (e < R && e > 1e-6) { g.x += ex / e * (R - e); g.z += ez / e * (R - e); }
  }
  return d < 0.15;
}
// 경비병 쪽에서 플레이어 칸으로 가는 다음 칸 (어제의 서 있을 수 있는 칸으로만, 너비 우선)
function nextStep(g, ti, tj) {
  const si = cellOf(g.x), sj = cellOf(g.z);
  if (si === ti && sj === tj) return null;
  const W = S.W, prev = new Int32Array(W * S.H).fill(-1), q = [si + sj * W];
  prev[si + sj * W] = si + sj * W;
  while (q.length) {
    const c = q.shift(), ci = c % W, cj = (c - ci) / W;
    if (ci === ti && cj === tj) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj, n = ni + nj * W;
      if (ni < 0 || nj < 0 || ni >= W || nj >= S.H || prev[n] >= 0 || !stand(g.era, ni, nj)) continue;
      prev[n] = c; q.push(n);
    }
  }
  let c = ti + tj * W;
  if (prev[c] < 0) return null;
  while (prev[c] !== si + sj * W) c = prev[c];
  const ci = c % W;
  return [ci * T + 1, ((c - ci) / W) * T + 1];
}
function spawnGuards(room) {
  guards = [];
  if (!room.guards || !CHAR.guard) return;
  for (const def of room.guards) {
    const path = def.path.map(([i, j]) => [i * T + 1, j * T + 1]);
    const { rig, meshes } = assemble(CHAR.guard, CHAR.rig, CHAR.dagger);
    const holder = new THREE.Group(); holder.add(rig);
    const g = { kind: 'guard', era: 'past', x: path[0][0], z: path[0][1], yaw: 0, path, wp: path.length > 1 ? 1 : 0, dirStep: 1, wait: def.wait ?? 1.0, waitT: def.wait ?? 1.0,
      faceYaw: def.face != null ? THREE.MathUtils.degToRad(def.face) : null, state: 'patrol', sus: 0, lost: 0, wind: 0, rec: 0, replan: 0, step: null,
      alive: true, holder, rig, meshes, anim: new Animator(rig, CHAR.clips) };
    if (path.length > 1) g.yaw = Math.atan2(path[1][0] - g.x, path[1][1] - g.z); else if (g.faceYaw != null) g.yaw = g.faceYaw;
    g.anim.loop(path.length > 1 ? 'AS_Walk_Loop_F_0_Seq' : 'AS_Idle_Combat_Seq', 0);
    groups.past.add(holder);
    g.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: MARK.sus, depthTest: false, transparent: true }));
    g.mark.scale.setScalar(0.7); g.mark.position.y = 2.25; g.mark.visible = false; g.mark.renderOrder = 9;
    holder.add(g.mark);
    // 오늘에서 보이는 멈춘 모습: 같은 뼈대에 묶인 붉은 반투명 몸 + 멈춘 시야
    g.ghost = new THREE.Group();
    for (const sm of meshes) { const gm = new THREE.SkinnedMesh(sm.geometry, guardGhostMat); g.ghost.add(gm); gm.bind(sm.skeleton, sm.bindMatrix); gm.frustumCulled = false; gm.renderOrder = 8; }
    ghostActors.add(g.ghost);
    g.cone = makeCone(); world.add(g.cone);
    // 오늘에서만 보이는 푸른 원 = 시간 충격 범위(3m). 이 안에서 어제로 가면 경비가 얼어붙는다
    g.shockRing = new THREE.Mesh(shockRingGeo, shockRingMat); g.shockRing.rotation.x = -Math.PI / 2; g.shockRing.renderOrder = 7;
    world.add(g.shockRing);
    guards.push(g);
    entities.push({ era: 'past', t: 0, update(dt) { stepGuard(g, dt); } });
    placeGuard(g); updateCone(g);
  }
}
function placeGuard(g) { g.holder.position.set(g.x, 0, g.z); g.holder.rotation.y = g.yaw; }
function alertGuard(g, cause) {
  if (!g.alive) return;
  if (g.state !== 'alert') {
    g.state = 'alert'; g.sus = 1; g.lost = 0; g.replan = 0;
    if (!S.alarmed) { S.alarmed = true; S.alarms++; roomFail(); sfx.alarm(); toast($t('들켰어요! 오늘로 피하세요')); }
    // 가까운 동료도 소리를 듣는다
    for (const o of guards) if (o !== g && o.alive && o.state !== 'alert' && Math.hypot(o.x - g.x, o.z - g.z) < GUARD.hear) { o.sus = 0.99; o.state = 'alert'; o.lost = 0; }
  }
}
function stepGuard(g, dt) {
  g.anim.update(dt);
  if (!g.alive) return;
  if (g.stun > 0) { g.stun -= dt; placeGuard(g); updateCone(g); return; } // 시간 충격으로 얼어붙음
  const dx = S.p.x - g.x, dz = S.p.z - g.z, dist = Math.hypot(dx, dz);
  const here = S.era === g.era && S.falling <= 0 && !S.trans;
  const seen = here && canSee(g, S.p.x, S.p.z);
  if (g.state !== 'alert') {
    if (seen) {
      const rate = THREE.MathUtils.lerp(GUARD.susNear, GUARD.susFar, Math.min(1, dist / GUARD.range));
      g.sus = Math.min(1, g.sus + rate * dt);
    } else g.sus = Math.max(0, g.sus - 0.35 * dt);
    if (g.sus >= 1) alertGuard(g, 'seen');
  }
  if (g.state === 'alert') {
    g.lost = seen ? 0 : g.lost + dt;
    if (g.lost > GUARD.lose && g.wind <= 0 && g.rec <= 0) { g.state = 'patrol'; g.sus = 0.5; g.step = null; } // 놓치면 순찰로 돌아감
  }
  if (g.wind > 0) {
    // 찌르기 예비동작: 플레이어 쪽으로 몸을 돌린다. 끝나는 순간 닿으면 피해
    turnTo(g, S.p.x, S.p.z, dt, 4);
    g.wind -= dt;
    if (g.wind <= 0) {
      g.rec = GUARD.recover;
      const [fx, fz] = gFwd(g);
      if (here && dist < GUARD.reach && (dx * fx + dz * fz) / Math.max(dist, 0.01) > Math.cos(THREE.MathUtils.degToRad(70))) hurt($t('경비병에게 찔렸어요'));
    }
  } else if (g.rec > 0) g.rec -= dt;
  else if (g.state === 'alert') {
    // 찌를 수 있는 거리면 바로 예비동작 (멈추는 거리 1.3보다 길게 — 서로 노려보기만 하는 일이 없게)
    if (here && dist < GUARD.reach - 0.15) { g.wind = GUARD.windup; g.anim.once('AS_Combo_Attack_02_01_Seq', { speed: 1.5, dur: GUARD.windup + GUARD.recover }); sfx.windup(); }
    else {
      g.replan -= dt;
      if (g.replan <= 0) { g.replan = 0.3; g.step = nextStep(g, cellOf(S.p.x), cellOf(S.p.z)); }
      const tgt = g.step && dist > 2.2 ? g.step : [S.p.x, S.p.z];
      if (here || g.step) moveGuard(g, tgt[0], tgt[1], dist < 1.3 ? 0 : GUARD.run, dt);
      g.anim.loop(dist < 1.3 ? 'AS_Idle_Combat_Seq' : 'AS_Run_Loop_F_0_Seq', 0.15);
    }
  } else if (g.sus > 0.3) {
    // 수상함: 멈춰서 플레이어 쪽을 본다
    turnTo(g, S.p.x, S.p.z, dt, 3);
    g.anim.loop('AS_Idle_Combat_Seq', 0.2);
  } else if (g.path.length > 1) {
    const [tx, tz] = g.path[g.wp];
    if (g.waitT > 0 && Math.hypot(tx - g.x, tz - g.z) < 0.2) {
      g.waitT -= dt; g.anim.loop('AS_Idle_Combat_Seq', 0.25);
      if (g.waitT <= 0) { if (g.wp + g.dirStep >= g.path.length || g.wp + g.dirStep < 0) g.dirStep *= -1; g.wp += g.dirStep; }
    } else {
      if (moveGuard(g, tx, tz, GUARD.walk, dt)) g.waitT = g.wait;
      g.anim.loop('AS_Walk_Loop_F_0_Seq', 0.25);
    }
  } else {
    // 한 자리 보초: 원래 자리로 돌아가 정해진 쪽을 본다
    const [hx, hz] = g.path[0];
    if (Math.hypot(hx - g.x, hz - g.z) > 0.2) { moveGuard(g, hx, hz, GUARD.walk, dt); g.anim.loop('AS_Walk_Loop_F_0_Seq', 0.25); }
    else { if (g.faceYaw != null) { let d = g.faceYaw - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); g.yaw += Math.sign(d) * Math.min(Math.abs(d), 3 * dt); } g.anim.loop('AS_Idle_Combat_Seq', 0.25); }
  }
  placeGuard(g); updateCone(g);
}
function killGuard(g, how) {
  g.alive = false; g.wind = 0; g.rec = 0;
  g.anim.once(how === 'back' ? 'AS_Knock_Down_Death_F_Seq' : 'AS_Hit_Death_Seq', { speed: 1.3, hold: true });
  g.mark.visible = false; g.cone.visible = false;
  S.kills++; S.hitstop = 0.1; S.shake = 0.25;
  sfx.kill();
  FX.sparks(g.x, 1.2, g.z, { n: 12, color: FXC[g.era].spark }); FX.dust(g.x, 0.2, g.z, { n: 8, color: FXC[g.era].dust }); FX.punch(0.25);
  toast(how === 'back' ? $t('등 뒤에서 한 방') : $t('전환 기습!'), 1.2);
  // 어제 쓰러진 자리에 오늘은 해골이 남는다
  const bones = makeMesh('bonePile', 'now'); bones.position.set(g.x, 0, g.z); bones.rotation.y = g.yaw; groups.now.add(bones);
  // 다른 경비가 쓰러지는 걸 보면 바로 경보
  for (const o of guards) if (o.alive && o.state !== 'alert' && canSee(o, g.x, g.z)) alertGuard(o, 'body');
  if (!enemies().some(o => o.alive)) roomCleared();
}
// 방의 적을 다 쓰러뜨림. 출구 앞에 닫힌 창살이 있으면 "출구가 열렸어요" 대신 발판으로 열라고 알리고, 힌트도 발판 요령으로 바꾼다
// (11/12: 초소에서 "열렸다"는데 창살이 닫혀 있어 버그처럼 보였다)
function roomCleared() {
  const gated = gates.length > 0 && S.gateT <= 0;
  toast(gated ? $t('모두 쓰러뜨렸어요 — 이제 발판으로 창살을 여세요') : $t('출구가 열렸어요'), gated ? 2.8 : 2);
  sfx.door();
  if (gated && S.room.gateTip) { hud.hint.textContent = $t(S.room.gateTip); hud.hint.classList.add('tip'); S.tipShown = true; }
}
// 찌르기: 앞쪽 1.6m·60° 안의 가장 가까운 경비 한 명
function stab() {
  if (!S.ready || S.stabT > 0 || S.falling > 0 || S.roll > 0 || S.trans || S.ended || S.down) return 'busy';
  // 가까운 경비 쪽으로 몸을 돌려 준다(탑다운에서 조준 보조)
  let best = null, bd = GUARD.lunge;
  for (const g of enemies()) if (g.alive && g.era === S.era && !g.fall) { const d = Math.hypot(g.x - S.p.x, g.z - S.p.z); if (d < bd) { bd = d; best = g; } }
  if (best) S.face = Math.atan2(best.x - S.p.x, best.z - S.p.z);
  S.stabT = 0.4; S.stabHit = false;
  if (heroAnim) heroAnim.once('AS_Combo_Attack_01_01_Seq', { speed: 2.4, dur: 0.4 });
  sfx.swish();
  return 'ok';
}
function resolveStab() {
  const fx = Math.sin(S.face), fz = Math.cos(S.face);
  let tgt = null, bd = GUARD.lunge;
  for (const g of enemies()) {
    if (!g.alive || g.era !== S.era || g.fall) continue;
    const dx = g.x - S.p.x, dz = g.z - S.p.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / Math.max(d, 0.01) > Math.cos(THREE.MathUtils.degToRad(60))) { bd = d; tgt = g; }
  }
  if (!tgt) return 'miss';
  // 찌르기 돌진: 3m 안이면 1.1m 앞까지 확 붙는다 (동작이 가려 준다)
  if (bd > 1.2) { const k = (bd - 1.1) / bd; S.p.x += (tgt.x - S.p.x) * k; S.p.z += (tgt.z - S.p.z) * k; resolve(); }
  const [gx, gz] = gFwd(tgt), tx = S.p.x - tgt.x, tz = S.p.z - tgt.z, td = Math.max(Math.hypot(tx, tz), 0.01);
  const behind = (tx * gx + tz * gz) / td < Math.cos(THREE.MathUtils.degToRad(110));
  if (tgt.kind === 'boss') {
    // 성채지기: 등 뒤면 1칸. 앞·옆은 튕기고(휘청이는 중이 아니면) 내려찍기로 받아친다
    if (behind) return 'boss-' + hitBoss(tgt, 'back');
    wakeBoss(tgt);
    if (tgt.daze <= 0 && tgt.stagger <= 0 && tgt.wind <= 0 && tgt.rec <= 0 && !tgt.charge && tgt.stun <= 0) startSlam(tgt);
    S.p.x += tx / td * 1.1; S.p.z += tz / td * 1.1; resolve();
    sfx.clang(); S.shake = 0.2; clangFx(tgt.x, tgt.z);
    toast($t('돌이 단단해요 — 등 뒤를 노리세요'), 1.2);
    return 'blocked';
  }
  const kill = tgt.kind === 'golem' ? killGolem : killGuard;
  if (behind) { kill(tgt, 'back'); return 'kill-back'; }
  if (S.shiftStrike > 0 && tgt.state !== 'alert') { kill(tgt, 'shift'); return 'kill-shift'; }
  if (tgt.kind === 'golem') {
    // 골렘: 앞이 단단해서 튕겨 나가고, 곧바로 내려찍기로 받아친다
    alertGolem(tgt); tgt.rec = 0; tgt.wind = GOLEM.windup * 0.8; tgt.yaw = Math.atan2(tx, tz);
    S.p.x += tx / td * 1.1; S.p.z += tz / td * 1.1; resolve();
    sfx.clang(); S.shake = 0.2; clangFx(tgt.x, tgt.z);
    toast($t('돌이 단단해요 — 등 뒤를 노리세요'), 1.2);
    return 'blocked';
  }
  // 막힘: 경비가 받아치고 경보, 플레이어는 밀려난다
  tgt.anim.once('AS_Parry_L_Seq', { speed: 1.4, dur: 0.45 });
  alertGuard(tgt, 'parry'); tgt.rec = 0.45; tgt.yaw = Math.atan2(tx, tz);
  S.p.x += tx / td * 0.9; S.p.z += tz / td * 0.9; resolve();
  sfx.clang(); S.shake = 0.15; clangFx(tgt.x, tgt.z);
  toast($t('막혔어요 — 등 뒤를 노리세요'), 1.2);
  return 'blocked';
}
function updateGuardsView() {
  // 오늘(다른 시대)에서는 멈춘 붉은 몸과 멈춘 시야만, 어제에서는 진짜 몸과 움직이는 시야
  for (const g of guards) {
    const away = g.era !== S.era;
    g.ghost.visible = away && !S.ring && g.alive;
    g.cone.visible = g.alive && (!S.ring || !away);
    g.shockRing.visible = away && !S.ring && g.alive && g.state !== 'alert'; // 경보 중이면 기습이 안 되므로 숨김
    g.shockRing.position.set(g.x, 0.07, g.z);
    // 원 안에 서 있으면 밝게 = "지금 가면 얼어붙는다"
    shockRingMat.opacity = 0.35 + 0.15 * Math.sin(S.time * 4);
    if (away && Math.hypot(g.x - S.p.x, g.z - S.p.z) < GUARD.shock) g.shockRing.scale.setScalar(1 + 0.03 * Math.sin(S.time * 10));
    else g.shockRing.scale.setScalar(1);
    const m = g.cone.material;
    if (away) { m.color.set('#ff5a5a'); m.opacity = 0.16; m.depthTest = false; }
    else { m.color.set(g.state === 'alert' ? coneMat.alert : g.sus > 0.05 ? coneMat.sus : coneMat.calm); m.opacity = g.state === 'alert' ? 0.22 : 0.12 + g.sus * 0.14; m.depthTest = true; }
    g.mark.visible = g.alive && (g.state === 'alert' || g.sus > 0.05);
    g.mark.material.map = g.state === 'alert' ? MARK.alert : MARK.sus;
    g.mark.scale.setScalar(g.state === 'alert' ? 0.8 : 0.4 + g.sus * 0.4);
  }
  // 경비 수 표시
  const all = enemies();
  if (all.length && !bosses.length) { hud.obj.style.display = 'block'; hud.obj.textContent = $t('적 {0} / {1}', all.filter(g => !g.alive).length, all.length); }
  else hud.obj.style.display = 'none';
}
// 플레이어와 같은 시대의 살아 있는 경비병과는 부딪힌다
function pushFromGuards() {
  for (const g of enemies()) {
    if (!g.alive || g.era !== S.era || g.fall) continue;
    const dx = S.p.x - g.x, dz = S.p.z - g.z, d = Math.hypot(dx, dz), m = PR + (g.kind === 'boss' ? BOSS.r : g.kind === 'golem' ? GOLEM.r : GUARD.r);
    if (d < m && d > 1e-4) { S.p.x = g.x + dx / d * m; S.p.z = g.z + dz / d * m; }
  }
}

/* ───────── 돌 골렘 — 오늘에만 있다 ─────────
   망치와 큰 방패를 든 돌 기사(StoneGolem 팩, src/golem.js). 모델을 아직 못 받았으면 코드로 만든 돌덩이 몸으로 대신한다.
   시야 대신 둘레 4.5m를 느낀다(벽에 가려짐).
   느리지만 앞이 단단하다: 앞·옆 찌르기는 튕겨 나가고 바로 내려찍기로 받아친다. 등 뒤 한 방 / 전환 기습이면 무너진다.
   내려찍기는 0.85초 예비동작(바닥에 붉은 원이 자람) 뒤 둘레 2.4m 전부(망치를 들고 뛰어올라 내려찍음). 어제로 가면 그 자세 그대로 멈춘다(어제에서는 붉은 윤곽). */
// slamR 2.4: 앞에서 찔러 튕겨 나간 자리(2.2m)도 닿는다 → 가만히 있으면 맞고, 구르거나 시대를 바꾸면 피한다
const GOLEM = { walk: 1.1, run: 2.6, turn: 3.2, r: 0.6, sense: 4.5, susNear: 1.6, susFar: 0.7, windup: 0.85, recover: 0.9, slamR: 2.4, attackAt: 1.9, lose: 6 };
let golems = [], bosses = [];
const enemies = () => guards.concat(golems, bosses);
const golemGhostMat = new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.38, depthTest: false, depthWrite: false });
const golemEyeMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff' });
const senseRingGeo = new THREE.RingGeometry(GOLEM.sense - 0.08, GOLEM.sense, 80);
function makeGolemBody() {
  const stone = eraMaterial(piece.colBase[0].mat, 'now');
  const box = (w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone); m.position.set(x, y, z); m.userData.mat = stone; parent.add(m); return m; };
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const pelvis = box(0.8, 0.34, 0.56, 0, 0, 0, hips);
  const chest = new THREE.Group(); chest.position.y = 0.2; hips.add(chest);
  const torso = box(1.18, 0.86, 0.78, 0, 0.5, 0, chest);
  const head = box(0.5, 0.42, 0.48, 0, 1.15, 0.06, chest);
  for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), golemEyeMat); e.position.set(sx, 1.18, 0.31); e.userData.mat = golemEyeMat; chest.add(e); }
  const arm = side => {
    const sh = new THREE.Group(); sh.position.set(side * 0.78, 0.82, 0); chest.add(sh);
    box(0.36, 0.62, 0.36, 0, -0.3, 0, sh);
    const fist = box(0.5, 0.56, 0.5, 0, -0.86, 0.02, sh);
    return sh;
  };
  const leg = side => { const hp = new THREE.Group(); hp.position.set(side * 0.27, -0.05, 0); hips.add(hp); box(0.38, 0.86, 0.42, 0, -0.43, 0, hp); return hp; };
  const parts = { root, hips, chest, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  parts.meshes = []; root.traverse(o => { if (o.isMesh) parts.meshes.push(o); });
  return parts;
}
// 골렘 재질: 팩 텍스처가 어두운 돌이라 오늘의 밤 조명에 묻힌다 → 조금 밝히고, 바탕색을 은은한 발광으로도 써서 윤곽이 읽히게
const golemMats = new Map();
function golemMat(src) {
  let m = golemMats.get(src);
  if (!m) {
    const c = src.clone();
    c.color.multiplyScalar(1.5);
    if (c.map) { c.emissiveMap = c.map; c.emissive.set('#b4c2d8'); c.emissiveIntensity = 0.35; }
    m = eraMaterial(c, 'now'); golemMats.set(src, m);
  }
  return m;
}
function spawnGolems(room) {
  golems = [];
  if (!room.golems) return;
  for (const def of room.golems) {
    const path = def.path.map(([i, j]) => [i * T + 1, j * T + 1]);
    const g = { kind: 'golem', era: 'now', x: path[0][0], z: path[0][1], yaw: 0, path, wp: path.length > 1 ? 1 : 0, dirStep: 1, wait: def.wait ?? 1.2, waitT: def.wait ?? 1.2,
      faceYaw: def.face != null ? THREE.MathUtils.degToRad(def.face) : null, state: 'patrol', sus: 0, lost: 0, wind: 0, rec: 0, replan: 0, step: null, stun: 0, walkT: 0,
      alive: true, crumble: null };
    if (path.length > 1) g.yaw = Math.atan2(path[1][0] - g.x, path[1][1] - g.z); else if (g.faceYaw != null) g.yaw = g.faceYaw;
    if (CHAR.golem) {
      // 모델: 오늘 무리에 넣으면 시대 전환(고리 디졸브·숨김)을 성 조각과 똑같이 탄다
      const m = buildGolem(CHAR.golem, golemMat);
      g.holder = new THREE.Group(); m.rig.scale.setScalar(GOLEM_LOOK.scale); g.holder.add(m.rig);
      g.rig = m.rig; g.meshes = m.meshes; g.weapons = m.weapons;
      g.anim = new Animator(m.rig, CHAR.golem.clips);
      g.anim.loop(path.length > 1 ? GCLIP.walk : GCLIP.idle, 0, path.length > 1 ? GOLEM_LOOK.walkSpeed : 1);
      groups.now.add(g.holder);
      // 어제에서 보이는 멈춘 모습: 같은 뼈대에 묶인 붉은 반투명 몸 + 무기(무기는 매 프레임 위치를 베낌)
      g.ghost = new THREE.Group();
      for (const sm of m.meshes) { const gm = new THREE.SkinnedMesh(sm.geometry, golemGhostMat); g.ghost.add(gm); gm.bind(sm.skeleton, sm.bindMatrix); gm.frustumCulled = false; gm.renderOrder = 8; }
      g.ghostWeapons = m.weapons.map(w => { const gm = new THREE.Mesh(w.geometry, golemGhostMat); gm.matrixAutoUpdate = false; gm.frustumCulled = false; gm.renderOrder = 8; g.ghost.add(gm); return gm; });
      ghostActors.add(g.ghost);
    } else {
      const b = makeGolemBody();
      g.body = b; g.holder = b.root;
      world.add(g.holder);
    }
    g.senseRing = new THREE.Mesh(senseRingGeo, new THREE.MeshBasicMaterial({ color: '#b8d4ff', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.senseRing.rotation.x = -Math.PI / 2; g.senseRing.renderOrder = 4; world.add(g.senseRing);
    g.shockRing = new THREE.Mesh(shockRingGeo, shockRingMat); g.shockRing.rotation.x = -Math.PI / 2; g.shockRing.renderOrder = 7; world.add(g.shockRing);
    g.slamRing = new THREE.Mesh(new THREE.CircleGeometry(GOLEM.slamR, 48), new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.slamRing.rotation.x = -Math.PI / 2; g.slamRing.renderOrder = 4; world.add(g.slamRing);
    g.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: MARK.sus, depthTest: false, transparent: true }));
    g.mark.scale.setScalar(0.7); g.mark.visible = false; g.mark.renderOrder = 9; world.add(g.mark); // 두 시대 모두에서 보임
    golems.push(g);
    entities.push({ era: 'now', t: 0, update(dt) { stepGolem(g, dt); } });
    placeGuard(g);
  }
}
function golemSees(g) {
  const dx = S.p.x - g.x, dz = S.p.z - g.z, d = Math.hypot(dx, dz);
  if (d > GOLEM.sense) return false;
  return d < 0.01 || rayLen(g.era, g.x, g.z, dx / d, dz / d, d) >= d - 0.05;
}
function alertGolem(g) {
  if (!g.alive || g.state === 'alert') return;
  g.state = 'alert'; g.sus = 1; g.lost = 0; g.replan = 0;
  if (!S.alarmed) { S.alarmed = true; S.alarms++; roomFail(); sfx.alarm(); toast($t('골렘이 깨어났어요! 어제로 피하세요')); }
}
// 모델 동작: 대기 / 걷기 / 추격. 내려찍기는 attack4의 내려찍는 순간(1.55초)이 예비동작 끝에 오게 중간부터 빠르게
function animGolem(g, dt, mode) {
  const a = g.anim, L = GOLEM_LOOK;
  if (mode === 'wind' || mode === 'slam') {
    if (mode === 'wind' && !g.swing) { g.swing = true; a.once(GCLIP.slam, { fade: 0.12, speed: L.slamSpeed, from: Math.max(0, L.slamHit - (g.wind + dt) * L.slamSpeed) }); }
  } else {
    g.swing = false;
    if (mode === 'walk') a.loop(GCLIP.walk, 0.25, L.walkSpeed);
    else if (mode === 'run') a.loop(GCLIP.run, 0.2, L.runSpeed);
    else a.loop(GCLIP.idle, 0.3);
  }
  a.update(dt);
}
function poseGolem(g, dt, mode) {
  if (g.anim) { animGolem(g, dt, mode); return; }
  const b = g.body;
  if (mode === 'walk' || mode === 'run') {
    g.walkT += dt * (mode === 'run' ? 6.5 : 3.6);
    const s = Math.sin(g.walkT), amp = mode === 'run' ? 0.55 : 0.38;
    b.legL.rotation.x = s * amp; b.legR.rotation.x = -s * amp;
    b.armL.rotation.x = -s * amp * 0.8; b.armR.rotation.x = s * amp * 0.8;
    b.hips.position.y = 0.92 + Math.abs(Math.cos(g.walkT)) * 0.06;
    b.chest.rotation.z = s * 0.05;
  } else if (mode === 'wind') {
    const k = 1 - Math.max(0, g.wind) / GOLEM.windup; // 0 → 1
    b.armL.rotation.x = b.armR.rotation.x = -2.7 * k; b.chest.rotation.x = -0.25 * k;
    b.legL.rotation.x = b.legR.rotation.x = 0; b.hips.position.y = 0.92 - 0.08 * k;
  } else if (mode === 'slam') {
    const k = Math.min(1, (GOLEM.recover - g.rec) / 0.15); // 빠르게 내려침
    b.armL.rotation.x = b.armR.rotation.x = -2.7 + 3.4 * k; b.chest.rotation.x = 0.35 * k; b.hips.position.y = 0.84;
  } else { // idle
    const s = Math.sin(S.time * 1.5 + g.x);
    b.legL.rotation.x += (0 - b.legL.rotation.x) * Math.min(1, dt * 8); b.legR.rotation.x += (0 - b.legR.rotation.x) * Math.min(1, dt * 8);
    b.armL.rotation.x += (0.08 * s - b.armL.rotation.x) * Math.min(1, dt * 6); b.armR.rotation.x += (-0.08 * s - b.armR.rotation.x) * Math.min(1, dt * 6);
    b.chest.rotation.x += (0 - b.chest.rotation.x) * Math.min(1, dt * 6); b.hips.position.y = 0.92 + s * 0.015;
  }
}
function stepGolem(g, dt) {
  if (!g.alive) { if (g.anim) g.anim.update(dt); else stepCrumble(g, dt); return; }
  // 시간 충격: 그 자세로 얼어붙어 떤다 (모델은 동작을 멈춤)
  if (g.stun > 0) { g.stun -= dt; if (g.anim) g.rig.rotation.z = Math.sin(S.time * 40) * 0.02; else g.body.chest.rotation.z = Math.sin(S.time * 40) * 0.06; placeGuard(g); return; }
  if (g.anim) g.rig.rotation.z = 0;
  const dx = S.p.x - g.x, dz = S.p.z - g.z, dist = Math.hypot(dx, dz);
  const here = S.era === g.era && S.falling <= 0 && !S.trans;
  const sensed = here && golemSees(g);
  if (g.state !== 'alert') {
    if (sensed) g.sus = Math.min(1, g.sus + THREE.MathUtils.lerp(GOLEM.susNear, GOLEM.susFar, Math.min(1, dist / GOLEM.sense)) * dt);
    else g.sus = Math.max(0, g.sus - 0.3 * dt);
    if (g.sus >= 1) alertGolem(g);
  } else {
    g.lost = sensed ? 0 : g.lost + dt;
    if (g.lost > GOLEM.lose && g.wind <= 0 && g.rec <= 0) { g.state = 'patrol'; g.sus = 0.4; g.step = null; }
  }
  if (g.wind > 0) {
    turnTo(g, S.p.x, S.p.z, dt, 1.5);
    g.wind -= dt; poseGolem(g, dt, 'wind');
    if (g.wind <= 0) {
      g.rec = GOLEM.recover; S.shake = Math.max(S.shake, 0.22); sfx.slam();
      if (here && dist < GOLEM.slamR) hurt($t('골렘에게 맞았어요'));
    }
  } else if (g.rec > 0) { g.rec -= dt; poseGolem(g, dt, 'slam'); }
  else if (g.state === 'alert') {
    if (here && dist < GOLEM.attackAt) { g.wind = GOLEM.windup; sfx.windup(); }
    else {
      g.replan -= dt;
      if (g.replan <= 0) { g.replan = 0.35; g.step = nextStep(g, cellOf(S.p.x), cellOf(S.p.z)); }
      const tgt = g.step && dist > 2.2 ? g.step : [S.p.x, S.p.z];
      moveEnemy(g, tgt[0], tgt[1], dist < 1.5 ? 0 : GOLEM.run, dt, GOLEM.r, GOLEM.turn);
      poseGolem(g, dt, dist < 1.5 ? 'idle' : 'run');
    }
  } else if (g.sus > 0.3) { turnTo(g, S.p.x, S.p.z, dt, 2); poseGolem(g, dt, 'idle'); }
  else if (g.path.length > 1) {
    const [tx, tz] = g.path[g.wp];
    if (g.waitT > 0 && Math.hypot(tx - g.x, tz - g.z) < 0.25) {
      g.waitT -= dt; poseGolem(g, dt, 'idle');
      if (g.waitT <= 0) { if (g.wp + g.dirStep >= g.path.length || g.wp + g.dirStep < 0) g.dirStep *= -1; g.wp += g.dirStep; }
    } else { if (moveEnemy(g, tx, tz, GOLEM.walk, dt, GOLEM.r, GOLEM.turn)) g.waitT = g.wait; poseGolem(g, dt, 'walk'); }
  } else {
    const [hx, hz] = g.path[0];
    if (Math.hypot(hx - g.x, hz - g.z) > 0.25) { moveEnemy(g, hx, hz, GOLEM.walk, dt, GOLEM.r, GOLEM.turn); poseGolem(g, dt, 'walk'); }
    else { if (g.faceYaw != null) { let d = g.faceYaw - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); g.yaw += Math.sign(d) * Math.min(Math.abs(d), 2 * dt); } poseGolem(g, dt, 'idle'); }
  }
  placeGuard(g);
}
// 무너짐: 몸의 돌덩이가 흩어져 바닥에 쌓인다 (오늘에만 남는 잔해)
function killGolem(g, how) {
  g.alive = false; g.wind = 0; g.rec = 0; g.mark.visible = false;
  S.kills++; S.hitstop = 0.12; S.shake = 0.35;
  sfx.crumble(); toast(how === 'back' ? $t('등 뒤에서 무너뜨렸어요') : $t('전환 기습!'), 1.2);
  impactFx(g.x, g.z, g.era, 1.2, 0.8);
  if (g.anim) {
    // 등 뒤면 앞으로 엎어지고, 기습이면 뒤로 넘어간다. 마지막 자세로 오늘에만 남는다
    g.rig.rotation.z = 0; g.stun = 0;
    g.anim.onceLeft = 0; g.anim.once(how === 'back' ? GCLIP.dieBack : GCLIP.dieFront, { fade: 0.1, hold: true });
  } else {
  g.holder.updateMatrixWorld(true);
  g.crumble = [];
  for (const m of g.body.meshes) {
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    m.matrixWorld.decompose(wp, wq, ws);
    world.attach(m);
    const out = new THREE.Vector3(m.position.x - g.x, 0, m.position.z - g.z).normalize().multiplyScalar(1.5 + Math.random() * 1.5);
    g.crumble.push({ m, v: new THREE.Vector3(out.x, 2 + Math.random() * 2, out.z), w: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3), floor: (m.geometry.parameters ? m.geometry.parameters.height : 0.3) * 0.4 });
  }
  }
  for (const o of enemies()) if (o !== g && o.alive && o.era === g.era && o.state !== 'alert' && o.kind === 'golem' && Math.hypot(o.x - g.x, o.z - g.z) < GOLEM.sense) alertGolem(o);
  if (!enemies().some(o => o.alive)) roomCleared();
}
function stepCrumble(g, dt) {
  if (!g.crumble) return;
  let moving = false;
  for (const c of g.crumble) {
    if (c.v.lengthSq() < 0.001 && c.m.position.y <= c.floor + 0.001) continue;
    moving = true;
    c.v.y -= 14 * dt;
    c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
    if (c.m.position.y < c.floor) { c.m.position.y = c.floor; c.v.multiplyScalar(0.3); c.v.y = Math.abs(c.v.y) < 0.6 ? 0 : -c.v.y * 0.3; c.w.multiplyScalar(0.5); if (c.v.lengthSq() < 0.05) c.v.set(0, 0, 0); }
  }
  if (!moving) g.crumble = null;
}
function updateGolemsView() {
  const away = S.era !== 'now';
  for (const g of golems) {
    // 어제에서는 멈춘 붉은 윤곽, 오늘에서는 진짜 돌
    const wantGhost = away && !S.ring;
    if (g.anim) {
      // 모델은 오늘 무리 안에 있어 시대 숨김은 저절로. 고스트는 같은 뼈대를 쓰고, 무기만 위치를 베낀다
      g.ghost.visible = wantGhost && g.alive;
      if (g.ghost.visible) { g.holder.updateMatrixWorld(true); g.weapons.forEach((w, k) => { g.ghostWeapons[k].matrix.copy(w.matrixWorld); g.ghostWeapons[k].matrixWorldNeedsUpdate = true; }); }
    } else if (g.ghostOn !== wantGhost) {
      g.ghostOn = wantGhost;
      const list = g.crumble ? g.crumble.map(c => c.m) : g.body.meshes;
      for (const m of g.alive ? g.body.meshes : list) m.material = wantGhost ? golemGhostMat : m.userData.mat;
    }
    if (!g.anim) {
      g.holder.visible = g.alive || !away;
      if (!g.alive && g.crumble === null) for (const m of g.body.meshes) m.visible = !away; // 잔해는 오늘에만
    }
    g.mark.position.set(g.x, g.anim ? GOLEM_LOOK.height + 0.45 : 2.75, g.z);
    g.senseRing.visible = g.alive && (!away || !S.ring);
    g.senseRing.position.set(g.x, 0.05, g.z);
    const sm = g.senseRing.material;
    if (away) { sm.color.set('#ff5a5a'); sm.opacity = 0.12; sm.depthTest = false; }
    else { sm.color.set(g.state === 'alert' ? coneMat.alert : g.sus > 0.05 ? coneMat.sus : '#b8d4ff'); sm.opacity = g.state === 'alert' ? 0.3 : 0.16 + g.sus * 0.15; sm.depthTest = true; }
    g.shockRing.visible = away && !S.ring && g.alive && g.state !== 'alert';
    g.shockRing.position.set(g.x, 0.07, g.z);
    g.slamRing.position.set(g.x, 0.06, g.z);
    g.slamRing.material.opacity = g.alive && g.wind > 0 ? 0.12 + 0.35 * (1 - g.wind / GOLEM.windup) : 0;
    g.slamRing.scale.setScalar(g.wind > 0 ? 0.3 + 0.7 * (1 - g.wind / GOLEM.windup) : 1);
    g.mark.visible = g.alive && (g.state === 'alert' || g.sus > 0.05);
    g.mark.material.map = g.state === 'alert' ? MARK.alert : MARK.sus;
    g.mark.scale.setScalar(g.state === 'alert' ? 0.8 : 0.4 + g.sus * 0.4);
  }
}

/* ───────── 성채지기 — 공격하는 순간에만 시간을 놓치는 보스 (기획서 19장, 11/12 오후 고침) ─────────
   모델은 골렘과 같은 StoneGolem(1.6배). 뼈대 하나가 시대를 옮겨 다닌다: 오늘 = 돌, 어제 = 금박.
   내가 다른 시대로 가면 떠난 시대에 그 자세로 멈춘다. 평소엔 quick초 만에 따라와 **내 쪽을 보고** 나타난다 → Shift만 눌러서는 등을 못 잡는다.
   공격(내려찍기·휘두르기 예비동작, 돌진) 중에 바꾸면 = 시간 회피: 그 동작에 묶여 follow초 뒤, 멈춘 자리·방향 그대로 나타나 하던 공격을 마저 한다.
   그 사이 등 뒤로 가 있으면 찌를 수 있고, 그 자리가 이쪽에서 구덩이면 떨어진다(2칸). 시간 충격(전환 직후 경직)은 안 먹힌다.
   내려찍기는 앞 120°(등 뒤는 안전), 등·옆에 붙어 있으면 몸을 돌려 휘두른다(둘레). 3칸 이하: 묶여도 더 빨리 따라오고, 나타날 때 충격파
   11/12 밤 패턴 정리(기획서 19장 패턴 표): 오늘 = 무겁게 기다렸다 크게(멀면 땅 가르기), 어제 = 몰아붙임(돌진, 휘두르기 → 돌진).
   2페이즈: 내려찍기가 2연타, 오늘엔 무너지는 천장(돌은 오늘에만 떨어지고, 어제로 가 있는 동안 공중에 멈춘다), 어제엔 돌진 3연속.
   공격 하나하나의 예비동작이 곧 Shift 틈이다 (b.wind = 내려찍기·천장·땅 가르기 예비동작, b.slamKind로 구분) */
const BOSS = {
  hp: 6, phase2: 3,
  follow: 1.5, follow2: 1.2,  // 공격에 묶였을 때 따라오는 데 걸리는 시간 = 시간 회피의 틈
  quick: 0.35,                // 평소에 따라오는 시간
  appear: 0.3, appear2: 0.6,  // 평소에 나타난 뒤 못 움직이는 시간 (2페이즈는 끝에 충격파)
  rise: 0.7,                  // 구덩이에서 올라온 뒤 휘청 (같은 방향 = 등이 열림)
  hurtCd: 1.0, stagger: 0.9, knock: 0.9, r: 0.8,
  wake: 7, fallDmg: 2, fallBack: 1.6, shock: 2.3,
  front: THREE.MathUtils.degToRad(60), // 내려찍기가 닿는 앞쪽 반각
  // combo = 2페이즈 두 번째 내려찍기의 예비동작(초)
  now: { run: 1.9, turn: 3.0, windup: 0.85, recover: 1.0, slamR: 2.7, attackAt: 2.3, combo: 0.6 },
  past: { run: 3.3, turn: 4.5, windup: 0.6, recover: 0.8, slamR: 2.5, attackAt: 2.1, combo: 0.45 },
  sweep: { near: 2.5, after: 0.3, windup: 0.5, r: 2.4, recover: 0.8, cd: 1.2, hit: 1.3, far: 3.5 }, // 등·옆에 after초 붙어 있으면 휘두름. hit = attack2에서 휘두르는 순간(초). 휘두른 뒤 far m 넘게 떨어져 있으면 어제는 돌진, 오늘은 땅 가르기로 잇는다
  // 돌진: 겨눈 자리를 over m 지나칠 때까지(최대 len). 2페이즈는 chain번 잇달아(두 번째부터 chainTele초 겨눔). afterSweep = 휘두르기에 이은 돌진의 겨눔
  charge: { min: 3.5, max: 10, tele: 0.6, speed: 12, over: 3.0, len: 12, hitW: 1.15, wallStun: 1.4, recover: 0.7, cd: 2.6, chain: 3, chainTele: 0.42, chainRec: 0.3, afterSweep: 0.5 },
  combo: { gap: 0.35, pivot: 0.3, turn: 8 }, // 2연타: 첫 내려찍기 뒤 gap초 → pivot초 동안 빠르게(turn rad/s) 몸을 돌리며 두 번째 예비동작
  // 땅 가르기(오늘): min~max m 떨어져 있으면 망치로 땅을 쳐 금을 보낸다. 겨누다가 마지막 lock초는 고정, 금은 초속 speed m, 너비 ±w, 지나간 뒤 live m까지만 닿는다
  fissure: { min: 4.5, max: 11, windup: 0.9, afterSweep: 0.7, lock: 0.3, w: 0.8, speed: 14, live: 1.4, recover: 1.1, cd: 3.5, first: 4.0 }, // first: 깨어난 뒤 첫 땅 가르기까지(첫 공격은 내려찍기로 배우게)
  // 무너지는 천장(2페이즈 오늘): windup초 예비동작 + fall초 뒤 돌. 내 발밑 하나(마지막 track초 전까지 따라옴) + n개. 돌은 오늘에만 있고, 어제로 가 있는 동안 멈춘다(돌아오면 최소 resume초)
  // ring = 내리치는 순간 둘레 충격파 반지름, recover = 그 뒤 회복(등 뒤로 갈 틈)
  quake: { windup: 1.1, fall: 0.55, n: 6, r: 1.35, track: 0.35, cd: 9, resume: 0.6, drop: 7, ring: 2.8, recover: 1.4 },
  // 가까이(앞)에서 고르는 공격의 박자: 시대·페이즈마다 이 순서로 돈다. 'slam'은 2페이즈면 2연타 → 부채꼴(등 뒤로)과 줄(옆으로)을 읽어야 한다
  beat: { now: ['slam', 'slam', 'fissure'], past: ['slam', 'charge'], now2: ['slam', 'fissure'], past2: ['slam', 'charge'] },
};
const bossLocked = b => b.wind > 0 || (b.sweep && b.sweep.ph === 'wind') || (b.charge && b.charge.ph !== 'rec');
const bossFollow = b => (bossLocked(b) ? (b.hp <= BOSS.phase2 ? BOSS.follow2 : BOSS.follow) : BOSS.quick);
const inFrontOf = (b, x, z, half) => { const [fx, fz] = gFwd(b), dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); return d < 0.01 || (dx * fx + dz * fz) / d > Math.cos(half); };
// 어제의 금박 몸: 돌 텍스처 위에 금빛을 곱하고 은은히 빛나게
const bossGoldMats = new Map();
function bossGoldMat(src) {
  let m = bossGoldMats.get(src);
  if (!m) {
    const c = src.clone();
    c.color.set('#ffc76a').multiplyScalar(1.7);
    c.metalness = 0.35; c.roughness = 0.42;
    if (c.map) { c.emissiveMap = c.map; c.emissive.set('#ffae3a'); c.emissiveIntensity = 0.45; }
    m = eraMaterial(c, 'past'); bossGoldMats.set(src, m);
  }
  return m;
}
const ringGeo1 = new THREE.RingGeometry(0.9, 1, 72);
const discGeo1 = new THREE.CircleGeometry(1, 56);
const laneGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); // 앞(+z)으로 뻗는 띠
// 등 뒤 구역: 찌르기가 '등 뒤'로 들어가는 140°(앞에서 110° 넘게) × 몸 밖~돌진 거리 3m. 바닥에 눕히면 θ=90°가 뒤(-z)
const backGeo = new THREE.RingGeometry(1.05, GUARD.lunge, 40, 1, Math.PI / 2 - THREE.MathUtils.degToRad(70), THREE.MathUtils.degToRad(140)).rotateX(-Math.PI / 2);
// 내려찍기 범위: 앞 120° 부채꼴 (θ=-90°가 앞(+z))
const frontGeo = new THREE.CircleGeometry(1, 40, -Math.PI / 2 - BOSS.front, 2 * BOSS.front).rotateX(-Math.PI / 2);
laneGeo.userData.flat = backGeo.userData.flat = frontGeo.userData.flat = true;
function decal(geo, color) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  if (!geo.userData.flat) m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4; m.visible = false; world.add(m);
  return m;
}
function placeBoss(b) { b.holder.position.set(b.x, b.py, b.z); b.holder.rotation.y = b.yaw; }
function setBossEra(b, E) {
  b.era = E; groups[E].add(b.holder);
  for (const o of b.parts) o.material = o.userData.eraMats[E];
}
function spawnBoss(room) {
  bosses = []; S.bossPending = false;
  hud.boss.style.display = 'none';
  if (!room.boss) return;
  if (!CHAR.golem) { S.bossPending = true; return; } // 모델을 아직 받는 중 → update()에서 다시 부른다
  const def = room.boss;
  const b = { kind: 'boss', era: def.era || 'now', x: def.at[0] * T + 1, z: def.at[1] * T + 1, py: 0, yaw: THREE.MathUtils.degToRad(def.face || 0),
    hp: BOSS.hp, state: 'dormant', alive: true, sus: 0, wind: 0, rec: 0, stun: 0, daze: 0, stagger: 0, hurtCd: 0, followT: 0,
    fall: null, charge: null, chargeCd: 1.2, sweep: null, sweepCd: 0, flankT: 0, dazeMax: 0, rising: false, replan: 0, step: null, shockArm: false, burst: null, hpShown: -1,
    slamKind: 'slam', windMax: 1, combo: 0, pivot: 0, fissLen: 0, crack: null, fissCd: BOSS.fissure.first, quakeCd: 0, chainLeft: 0, p2: false, seen: {}, used: {}, beat: { now: 0, past: 0 } };
  bossRocks = [];
  const m = buildGolem(CHAR.golem, src => src);
  m.rig.scale.setScalar(BOSS_LOOK.scale);
  b.rig = m.rig; b.meshes = m.meshes; b.weapons = m.weapons; b.parts = m.meshes.concat(m.weapons);
  for (const o of b.parts) { const src = o.material; o.userData.eraMats = { now: golemMat(src), past: bossGoldMat(src) }; }
  b.holder = new THREE.Group(); b.holder.add(m.rig);
  b.anim = new Animator(m.rig, CHAR.golem.clips);
  b.anim.loop(GCLIP.idle, 0);
  setBossEra(b, b.era);
  // 다른 시대에서 보이는 멈춘 모습 (골렘과 같은 붉은 윤곽)
  b.ghost = new THREE.Group();
  for (const sm of m.meshes) { const gm = new THREE.SkinnedMesh(sm.geometry, golemGhostMat); b.ghost.add(gm); gm.bind(sm.skeleton, sm.bindMatrix); gm.frustumCulled = false; gm.renderOrder = 8; }
  b.ghostWeapons = m.weapons.map(w => { const gm = new THREE.Mesh(w.geometry, golemGhostMat); gm.matrixAutoUpdate = false; gm.frustumCulled = false; gm.renderOrder = 8; b.ghost.add(gm); return gm; });
  b.ghost.visible = false; ghostActors.add(b.ghost);
  b.followRing = decal(ringGeo1, '#7fe8ff');  // 도착 시계: 줄어드는 고리 (구덩이 위면 붉게)
  b.slamRing = decal(frontGeo, '#ff4a2a');   // 내려찍기 범위 (앞 120°)
  b.shockRing = decal(ringGeo1, '#ff6a3a');  // 둘레 공격 범위: 휘두르기 · 2페이즈 나타날 때 충격파
  b.burstRing = decal(ringGeo1, '#ffffff');  // 도착·충격파 번쩍
  b.chargeLine = decal(laneGeo, '#ff3a20');  // 돌진 길
  b.fissLine = decal(laneGeo, '#ff9a2a');    // 땅 가르기 길 (주황)
  b.crackLine = decal(laneGeo, '#ffb050');   // 땅 가르기 금 (지나가는 중)
  b.backArc = decal(backGeo, '#7fe8ff');     // 등 뒤 구역 (멈춰 있거나 휘청일 때)
  hud.bossName.textContent = $t('성채지기');
  bosses.push(b);
  entities.push({ era: 'both', t: 0, update(dt) { stepBoss(b, dt); stepRocks(dt); } });
  placeBoss(b);
}
// 너비 우선으로 가장 가까운 설 수 있는 칸의 가운데 (벽 너머도 찾는다). avoid(i, j)이면 건너뜀
function nearestStand(era, i0, j0, avoid) {
  const seen = new Set([i0 + ',' + j0]), q = [[i0, j0]];
  while (q.length) {
    const [i, j] = q.shift();
    if (stand(era, i, j) && !(avoid && avoid(i, j))) return [i * T + 1, j * T + 1];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = ni + ',' + nj;
      if (ni < 0 || nj < 0 || ni >= S.W || nj >= S.H || seen.has(k)) continue;
      seen.add(k); q.push([ni, nj]);
    }
  }
  return [S.start.x, S.start.z];
}
// 몸 앞 가장자리(R)가 막힌 칸(벽·기둥) 또는 바닥 없는 칸에 닿기 전까지 갈 수 있는 거리 (몸 너비 세 줄로 본다)
function bodyRay(era, x, z, dx, dz, max, R) {
  for (let d = 0; d <= max; d += 0.1) {
    for (const off of [-R * 0.7, 0, R * 0.7]) {
      const i = cellOf(x + dx * (d + R) - dz * off), j = cellOf(z + dz * (d + R) + dx * off);
      if (solid(era, i, j) || ch(era, i, j) === '#') return { d, wall: true };
      if (!floorAt(era, i, j)) return { d, wall: false };
    }
  }
  return { d: max, wall: false };
}
function wakeBoss(b) {
  if (b.state !== 'dormant') return;
  b.state = 'alert'; b.stagger = 1.0;
  b.anim.once(GCLIP.stagger, { fade: 0.1, speed: 1.8, dur: 1.0 });
  sfx.wake(); S.shake = Math.max(S.shake, 0.45);
  impactFx(b.x, b.z, b.era, 1.4, 0.6); FX.motes(b.x, 0.5, b.z, { n: 24, color: FXC[b.era].glow, spread: 0.8 });
  toast($t('성채지기가 깨어났어요'), 2.2);
}
function bossBurst(b, color, r = 3.2) { b.burst = { t: 0, r }; b.burstRing.material.color.set(color); b.burstRing.position.set(b.x, 0.09, b.z); }
// 망치를 드는 공격 셋 (같은 attack4 동작, 바닥 예고로 구분): 'slam' 앞 120° 부채꼴 · 'quake' 무너지는 천장 · 'fissure' 땅 가르기(주황 줄)
function startSlam(b, kind = 'slam', windup = null) {
  const P = BOSS[b.era], L = GOLEM_LOOK;
  const w = windup != null ? windup : kind === 'quake' ? BOSS.quake.windup : kind === 'fissure' ? BOSS.fissure.windup : P.windup;
  b.wind = b.windMax = w; b.slamKind = kind; b.pivot = 0; bossUse(b, kind);
  const speed = Math.min(L.slamSpeed, L.slamHit / w); // 예비동작이 길면 동작을 늘인다 (내려찍는 순간 = 예비동작 끝)
  b.anim.once(GCLIP.slam, { fade: 0.12, speed, from: Math.max(0, L.slamHit - w * speed), dur: w + (kind === 'fissure' ? BOSS.fissure.recover : kind === 'quake' ? BOSS.quake.recover : P.recover) });
  sfx.windup();
}
// 2페이즈 내려찍기는 2연타: 첫 번째가 닿으면 gap초 뒤, 빠르게 몸을 돌리며 두 번째(짧은 예비동작)
function startComboSlam(b) { b.combo = 0; startSlam(b, 'combo', BOSS[b.era].combo); b.slamKind = 'slam'; b.pivot = BOSS.combo.pivot; }
// 어떤 공격을 몇 번 썼는지 (시험 훅으로 패턴이 고르게 나오는지 잰다). 'slam:now' 처럼 시대도 붙인다
function bossUse(b, k) { const key = k + ':' + b.era; b.used[key] = (b.used[key] || 0) + 1; }
// 땅 가르기: 몸에서 내 쪽으로 뻗는 주황 줄. 구덩이는 건너가고 이 시대의 벽·기둥에서 멈춘다 (기둥 뒤 = 엄폐)
function fissureLen(b) {
  const [fx, fz] = gFwd(b), F = BOSS.fissure;
  for (let d = 0.6; d <= F.max; d += 0.2) { const i = cellOf(b.x + fx * d), j = cellOf(b.z + fz * d); if (solid(b.era, i, j) || ch(b.era, i, j) === '#') return d; }
  return F.max;
}
function startFissure(b, windup) {
  startSlam(b, 'fissure', windup); b.fissLen = fissureLen(b);
  if (!b.seen.fissure) { b.seen.fissure = true; toast($t('땅 가르기 — 주황 줄에서 비키거나, 예고 중에 Shift'), 2.2); }
}
function stepCrack(b, dt, here) {
  const F = BOSS.fissure, c = b.crack;
  const d0 = c.d; c.d = Math.min(c.len, c.d + F.speed * dt);
  if (c.d > d0) { // 금이 달려가는 끝에서 먼지·돌이 튄다
    const tx = c.x + c.dx * c.d, tz = c.z + c.dz * c.d;
    FX.dust(tx, 0.1, tz, { n: 2, speed: 1.4, up: 1.4, size: 0.45, alpha: 0.5, color: FXC[b.era].dust });
    if (Math.random() < 0.35) FX.debris(tx, 0.1, tz, { n: 1, color: FXC[b.era].rock, speed: 1.5, up: 4, size: 0.1 });
    if (Math.random() < 0.22) FX.crack(tx, tz, 0.7, undefined, { life: 1.6, alpha: 0.6 });
  }
  if (c.d >= c.len) c.done = (c.done || 0) + dt;
  if (c.done > 0.35) { b.crack = null; return; }
  if (c.hit || !here) return;
  // 내 위치를 금 줄에 투영: 앞쪽 거리 t, 옆 거리 s. 금 끝이 막 지나간 곳(live m)까지만 닿는다
  const px = S.p.x - c.x, pz = S.p.z - c.z, t = px * c.dx + pz * c.dz, s = Math.abs(px * c.dz - pz * c.dx);
  if (s < F.w && t > 0 && t <= c.d && t >= Math.min(d0, c.d) - F.live) { c.hit = true; hurt($t('땅이 갈라졌어요')); }
}
// 무너지는 천장(2페이즈, 오늘): 돌 자리는 오늘 바닥에만. 돌은 오늘 무리에 있어서 오늘에서만 보이고, 오늘에 있을 때만 시간이 흐른다
let bossRocks = [];
let rocksAway = false;
const rockGeo = new THREE.DodecahedronGeometry(0.62, 0);
const rockMat = eraPlain('now', { color: '#6f655b', roughness: 0.95 });
function startQuake(b) {
  const Q = BOSS.quake;
  b.quakeCd = Q.cd; b.combo = 0;
  startSlam(b, 'quake');
  const spots = [[S.p.x, S.p.z, true]];
  for (let k = 0; spots.length < Q.n + 1 && k < 300; k++) {
    const i = 1 + Math.floor(Math.random() * (S.W - 2)), j = 1 + Math.floor(Math.random() * (S.H - 2));
    if (!stand('now', i, j)) continue;
    const x = i * T + 1 + (Math.random() - 0.5) * 0.8, z = j * T + 1 + (Math.random() - 0.5) * 0.8;
    if (Math.hypot(x - b.x, z - b.z) < 2.8 || spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 2.9)) continue;
    spots.push([x, z, false]);
  }
  for (const [x, z, track] of spots) {
    const r = { x, z, track, t: Q.windup + Q.fall + (track ? 0 : Math.random() * 0.25), done: 0 };
    r.disc = new THREE.Mesh(discGeo1, new THREE.MeshBasicMaterial({ color: '#ff2a40', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    r.ring = new THREE.Mesh(ringGeo1, new THREE.MeshBasicMaterial({ color: '#ff5a6a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [r.disc, r.ring]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 4; groups.now.add(m); }
    r.rock = new THREE.Mesh(rockGeo, rockMat); r.rock.visible = false; r.rock.rotation.set(Math.random() * 3, Math.random() * 3, 0); groups.now.add(r.rock);
    bossRocks.push(r);
  }
  S.shake = Math.max(S.shake, 0.25); sfx.crumble();
  if (!b.seen.quake) { b.seen.quake = true; toast($t('천장이 무너져요 — 붉은 원에서 나오거나 어제로 피하세요'), 2.4); }
}
function stepRocks(dt) {
  if (!bossRocks.length) return;
  const Q = BOSS.quake, b = bosses[0];
  if (S.era !== 'now') { rocksAway = true; return; } // 어제로 가 있으면 오늘의 돌은 공중에 멈춘다
  if (rocksAway) { rocksAway = false; for (const r of bossRocks) if (!r.done) r.t = Math.max(r.t, Q.resume); } // 돌아오면 멈춘 순간부터 (피할 틈은 남긴다)
  const here = S.falling <= 0 && !S.trans;
  for (const r of bossRocks) {
    if (r.done) {
      r.done += dt; r.rock.position.y = 0.35 - r.done * 0.5;
      r.disc.material.opacity = Math.max(0, 0.5 - r.done); r.ring.material.opacity = 0;
      continue;
    }
    r.t -= dt;
    if (r.track && b && b.alive && b.era === 'now' && b.slamKind === 'quake' && b.wind > Q.track) { r.x = S.p.x; r.z = S.p.z; }
    const k = Math.max(0, Math.min(1, 1 - (r.t - Q.fall) / Q.windup)); // 예고: 점점 진해진다
    r.disc.position.set(r.x, 0.065, r.z); r.disc.scale.setScalar(Q.r * (0.4 + 0.6 * k)); r.disc.material.opacity = 0.12 + 0.3 * k + (r.t < Q.fall ? 0.15 : 0);
    r.ring.position.set(r.x, 0.07, r.z); r.ring.scale.setScalar(Q.r); r.ring.material.opacity = 0.35 + 0.4 * k;
    r.rock.visible = r.t < Q.fall;
    r.rock.position.set(r.x, 0.35 + Q.drop * Math.max(0, r.t) / Q.fall, r.z);
    if (r.t <= 0) {
      r.done = 1e-3; r.rock.visible = true; r.rock.position.y = 0.35;
      S.shake = Math.max(S.shake, 0.3); sfx.thunk();
      impactFx(r.x, r.z, 'now', 1.0, 0.45);
      if (here && Math.hypot(S.p.x - r.x, S.p.z - r.z) < Q.r) hurt($t('무너진 돌에 맞았어요'));
    }
  }
  for (const r of bossRocks) if (r.done > 1.2) { groups.now.remove(r.disc, r.ring, r.rock); r.gone = true; }
  bossRocks = bossRocks.filter(r => !r.gone);
}
function clearRocks() { for (const r of bossRocks) if (groups.now) groups.now.remove(r.disc, r.ring, r.rock); bossRocks = []; rocksAway = false; }
// 공격을 다 내려놓는다 (평소 도착·구덩이·쓰러짐)
function bossCalm(b) { b.wind = 0; b.rec = 0; b.sweep = null; b.combo = 0; b.pivot = 0; b.crack = null; b.chainLeft = 0; if (b.charge) endCharge(b); }
// 몸에서 (x, z)까지 시야가 트였는지
const bossClear = (b, d, ux, uz) => rayLen(b.era, b.x, b.z, ux, uz, d) >= d - 0.05;
// 3칸 이하가 되는 순간 (찌르기든 구덩이든): 붉게 번쩍, 천장은 바로 쓸 수 있게
function bossPhase2(b) {
  b.p2 = true; b.quakeCd = 0; b.fissCd = Math.min(b.fissCd, 1); b.chargeCd = Math.min(b.chargeCd, 0.8);
  screenFlash('#ff5a3a', 0.22); S.shake = Math.max(S.shake, 0.4);
  toast($t('성채지기가 화났어요 — 이제 두 번씩 쳐요'), 2.4);
}
// 휘두르기: 등·옆에 붙어 있으면 몸을 돌리며 둘레를 친다 (빙빙 돌며 등 잡기 막기)
function startSweep(b) {
  const W = BOSS.sweep;
  b.sweep = { ph: 'wind', t: W.windup }; bossUse(b, 'sweep');
  b.anim.once(GCLIP.sweep, { fade: 0.1, speed: 1, from: Math.max(0, W.hit - W.windup), dur: W.windup + W.recover });
  sfx.windup();
}
function stepSweep(b, dt, dist, here) {
  const W = BOSS.sweep, w = b.sweep;
  w.t -= dt;
  if (w.ph === 'wind') {
    turnTo(b, S.p.x, S.p.z, dt, 4); // 휘두르려고 돌아서는 중 = 등이 없다 (찌르기가 안 통함, hitBoss)
    if (w.t <= 0) {
      w.ph = 'rec'; w.t = W.recover;
      S.shake = Math.max(S.shake, 0.3); sfx.slam(); bossBurst(b, '#ff5030', W.r);
      FX.dustRing(b.x, b.z, W.r * 0.6, { color: FXC[b.era].dust, n: 26, speed: 6 }); FX.sparks(b.x, 1.0, b.z, { n: 12, color: FXC[b.era].spark, speed: 7, up: 2 }); FX.punch(0.35);
      if (here && dist < W.r) hurt($t('성채지기가 휘둘렀어요'));
    }
  } else {
    if (w.t > W.recover - 0.3) turnTo(b, S.p.x, S.p.z, dt, 9); // 휘두르며 몸을 돌린다
    if (w.t <= 0) {
      b.sweep = null; b.sweepCd = W.cd; b.flankT = 0;
      // 굴러서 떨어졌으면 바로 원거리로 잇는다: 어제 = 돌진, 오늘 = 땅 가르기 (짧은 예고)
      const dx = S.p.x - b.x, dz = S.p.z - b.z, d = Math.hypot(dx, dz);
      if (here && d >= W.far && d <= BOSS.charge.max && bossClear(b, d, dx / d, dz / d)) {
        if (b.era === 'past') { b.chargeCd = 0; startCharge(b, BOSS.charge.afterSweep); }
        else { b.yaw = Math.atan2(dx, dz); startFissure(b, BOSS.fissure.afterSweep); }
      }
    }
  }
}
// 돌진: 2페이즈면 chain번까지 잇달아 (두 번째부터 겨눔이 짧다). 벽에 박히면 거기서 끝
function startCharge(b, tele = BOSS.charge.tele, chain = false) {
  const C = BOSS.charge;
  if (!chain) b.chainLeft = b.hp <= BOSS.phase2 ? C.chain - 1 : 0;
  bossUse(b, chain ? 'chain' : 'charge');
  b.charge = { ph: 'tele', t: tele, tele, dx: 0, dz: 0, went: 0, len: 0, want: C.len, wall: false, hit: false };
  b.anim.once(GCLIP.charge, { fade: 0.15, speed: 0.4 / tele, dur: 99 }); // 웅크리는 앞 0.4초를 예비동작에 늘여 쓴다
  sfx.charge();
}
function endCharge(b) { b.charge = null; b.chargeCd = BOSS.charge.cd; b.anim.onceLeft = 0; }
function stepCharge(b, dt, here) {
  const C = BOSS.charge, c = b.charge;
  if (c.ph === 'tele') {
    c.t -= dt;
    if (c.t > c.tele * 0.35) { turnTo(b, S.p.x, S.p.z, dt, c.tele < C.tele ? 12 : 5); /* 이어지는 돌진은 확 돌아서 다시 겨눈다 */ c.want = Math.min(C.len, Math.hypot(S.p.x - b.x, S.p.z - b.z) + C.over); } // 겨누다가 마지막 0.2초는 방향·길이 고정 → 옆으로 비키면 피한다
    [c.dx, c.dz] = gFwd(b);
    const r = bodyRay(b.era, b.x, b.z, c.dx, c.dz, c.want, BOSS.r); c.len = r.d; c.wall = r.wall;
    if (c.t <= 0) { c.ph = 'dash'; const a = b.anim.act(GCLIP.charge); if (a) a.timeScale = 3; sfx.dash(); }
  } else if (c.ph === 'dash') {
    const s = Math.min(C.speed * dt, c.len - c.went);
    b.x += c.dx * s; b.z += c.dz * s; c.went += s;
    if (s > 0) FX.dust(b.x - c.dx * 0.8, 0.12, b.z - c.dz * 0.8, { n: 2, speed: 1.2, up: 0.5, size: 0.5, alpha: 0.4, color: FXC[b.era].dust }); // 돌진 뒤로 먼지
    if (!c.hit && here && Math.hypot(S.p.x - b.x, S.p.z - b.z) < C.hitW) { c.hit = true; hurt($t('성채지기의 돌진에 받혔어요')); }
    if (c.went >= c.len - 1e-3) {
      if (c.wall) {
        // 벽·기둥에 박힘: 한동안 못 움직인다 (등이 열림)
        endCharge(b); b.chainLeft = 0; b.stagger = C.wallStun;
        b.anim.once(GCLIP.stagger, { fade: 0.05, speed: 1.8 / C.wallStun, dur: C.wallStun });
        S.shake = Math.max(S.shake, 0.4); sfx.slam(); sfx.thunk();
        impactFx(b.x + c.dx * BOSS.r * 1.2, b.z + c.dz * BOSS.r * 1.2, b.era, 1.3, 1.3);
        FX.debris(b.x + c.dx * BOSS.r, 1.2, b.z + c.dz * BOSS.r, { n: 10, color: FXC[b.era].rock, dir: [-c.dx, -c.dz], speed: 4, up: 3 }); // 벽에서 튀는 돌
        toast($t('벽에 박혔어요 — 지금 등 뒤로!'), 1.4);
      } else { c.ph = 'rec'; c.t = b.chainLeft > 0 ? C.chainRec : C.recover; const a = b.anim.act(GCLIP.charge); if (a) a.timeScale = 2; }
    }
  } else if ((c.t -= dt) <= 0) {
    endCharge(b);
    // 2페이즈: 멈추자마자 다시 겨눈다 (너무 가까우면 그만두고 내려찍기로)
    if (b.chainLeft > 0 && here && Math.hypot(S.p.x - b.x, S.p.z - b.z) > 2.6) { b.chainLeft--; startCharge(b, C.chainTele, true); }
    else b.chainLeft = 0;
  }
}
function bossArrive(b) {
  const locked = bossLocked(b), E = S.era, i = cellOf(b.x), j = cellOf(b.z);
  b.followT = 0; b.stun = 0; b.stagger = 0; b.daze = 0; b.rising = false;
  setBossEra(b, E);
  if (locked) {
    // 시간 회피: 공격에 묶인 채, 멈춘 자리·방향 그대로 와서 하던 공격을 마저 한다. 그 칸이 구덩이면 떨어짐
    if (solid(E, i, j)) [b.x, b.z] = nearestStand(E, i, j, (a, c) => a === cellOf(S.p.x) && c === cellOf(S.p.z));
    else if (!floorAt(E, i, j)) { bossCalm(b); startBossFall(b); return; }
    const c = b.charge;
    if (c && c.ph === 'dash') { const r = bodyRay(E, b.x, b.z, c.dx, c.dz, Math.max(0, c.len - c.went), BOSS.r); c.len = c.went + r.d; c.wall = r.wall; } // 이 시대의 벽·구덩이로 남은 길을 다시 잰다
    bossBurst(b, E === 'past' ? '#ffd27a' : '#7fe8ff', 2.4);
    sfx.arrive(E); S.shake = Math.max(S.shake, 0.22); arriveFx(b, E);
    placeBoss(b); return;
  }
  // 평소: 금방 따라와 내 쪽을 보고 나타난다 (Shift만 눌러서는 아무것도 못 얻는다)
  bossCalm(b);
  if (!stand(E, i, j)) [b.x, b.z] = nearestStand(E, i, j, (a, c) => a === cellOf(S.p.x) && c === cellOf(S.p.z));
  b.yaw = Math.atan2(S.p.x - b.x, S.p.z - b.z);
  const ph2 = b.hp <= BOSS.phase2;
  b.daze = b.dazeMax = ph2 ? BOSS.appear2 : BOSS.appear; b.shockArm = ph2;
  b.anim.onceLeft = 0; b.anim.loop(GCLIP.idle, 0.1);
  bossBurst(b, E === 'past' ? '#ffd27a' : '#7fe8ff');
  sfx.arrive(E); S.shake = Math.max(S.shake, 0.22); arriveFx(b, E);
  placeBoss(b);
}
function startBossFall(b) {
  const i = cellOf(b.x), j = cellOf(b.z), pi = cellOf(S.p.x), pj = cellOf(S.p.z);
  b.fall = { t: 0, vy: 0, to: nearestStand(b.era, i, j, (a, c) => Math.abs(a - pi) + Math.abs(c - pj) < 1) };
  b.hp = Math.max(0, b.hp - BOSS.fallDmg); b.hurtCd = 0;
  b.anim.onceLeft = 0; b.anim.once(GCLIP.stagger, { fade: 0.05, speed: 1.2, dur: 9 });
  S.shake = Math.max(S.shake, 0.3); S.hitstop = 0.1; sfx.bossFall();
  FX.dust(b.x, 0.3, b.z, { n: 30, color: FXC[b.era].dust, speed: 3, up: 2.5, size: 0.7 }); FX.debris(b.x, 0.3, b.z, { n: 12, color: FXC[b.era].rock, up: 2 });
  toast(b.hp > 0 ? $t('성채지기가 구덩이에 떨어졌어요!') : $t('성채지기가 시간 속으로 떨어졌어요'), 1.8);
  placeBoss(b);
}
function stepBossFall(b, dt) {
  const f = b.fall;
  f.t += dt; f.vy -= 20 * dt; b.py += f.vy * dt;
  b.anim.update(dt); placeBoss(b);
  b.holder.visible = b.py > -8;
  if (b.hp <= 0 && f.t >= 0.9) { b.fall = null; b.holder.visible = false; killBoss(b, 'fall'); return; }
  if (f.t >= BOSS.fallBack) {
    // 가장 가까운 바닥에서 다시 올라온다 — 같은 방향, 잠깐 휘청
    b.fall = null; b.py = 0; b.holder.visible = true; [b.x, b.z] = f.to;
    b.daze = b.dazeMax = BOSS.rise; b.rising = true; b.shockArm = b.hp <= BOSS.phase2;
    b.anim.onceLeft = 0; b.anim.once(GCLIP.stagger, { fade: 0.05, speed: 1.8 / (BOSS.rise + 0.2), dur: BOSS.rise });
    bossBurst(b, b.era === 'past' ? '#ffd27a' : '#7fe8ff'); sfx.arrive(b.era); arriveFx(b, b.era);
    placeBoss(b);
  }
}
function stepBoss(b, dt) {
  if (b.burst) { b.burst.t += dt; if (b.burst.t > 0.45) b.burst = null; }
  if (!b.alive) { if (b.era === S.era) b.anim.update(dt); return; }
  if (b.fall) { stepBossFall(b, dt); return; } // 떨어지는 중엔 시대와 상관없이
  if (b.era !== S.era) {
    // 떠난 시대에 멈춰 있다 → 내가 있는 시대로 따라온다 (잠들어 있으면 안 옴, 내 시계로 잰다)
    if (b.state === 'dormant' || S.trans) return;
    b.followT += dt;
    if (b.followT >= bossFollow(b)) bossArrive(b);
    return;
  }
  b.followT = 0;
  b.hurtCd = Math.max(0, b.hurtCd - dt); b.chargeCd = Math.max(0, b.chargeCd - dt);
  b.fissCd = Math.max(0, b.fissCd - dt); b.quakeCd = Math.max(0, b.quakeCd - dt);
  const P = BOSS[b.era];
  const dx = S.p.x - b.x, dz = S.p.z - b.z, dist = Math.hypot(dx, dz);
  const here = S.falling <= 0 && !S.trans;
  b.rig.rotation.z = 0;
  if (b.state === 'dormant') { b.anim.update(dt); if (here && dist < BOSS.wake) wakeBoss(b); placeBoss(b); return; }
  b.stun = 0; // 시간 충격은 안 먹힌다
  if (!b.p2 && b.hp <= BOSS.phase2) bossPhase2(b);
  if (b.crack) stepCrack(b, dt, here); // 땅 가르기 금은 회복하는 동안에도 달려간다
  if (b.daze > 0) {
    b.daze -= dt; b.anim.update(dt);
    if (b.daze <= 0) b.rising = false;
    if (b.daze <= 0 && b.shockArm) {
      b.shockArm = false; bossBurst(b, '#ff6a3a', BOSS.shock * 1.15);
      S.shake = Math.max(S.shake, 0.35); sfx.slam();
      if (here && dist < BOSS.shock) hurt($t('충격파에 맞았어요'));
    }
    placeBoss(b); return;
  }
  if (b.stagger > 0) { b.stagger -= dt; b.anim.update(dt); placeBoss(b); return; }
  if (b.charge) { stepCharge(b, dt, here); b.anim.update(dt); placeBoss(b); return; }
  if (b.sweep) { stepSweep(b, dt, dist, here); b.anim.update(dt); placeBoss(b); return; }
  if (b.wind > 0) {
    const kind = b.slamKind;
    if (kind === 'fissure') { if (b.wind > BOSS.fissure.lock) turnTo(b, S.p.x, S.p.z, dt, 5); b.fissLen = fissureLen(b); } // 겨누다가 마지막 lock초는 고정
    else if (b.pivot > 0) { b.pivot -= dt; turnTo(b, S.p.x, S.p.z, dt, BOSS.combo.turn); } // 2연타의 두 번째: 확 돌아선다
    else turnTo(b, S.p.x, S.p.z, dt, b.era === 'past' ? 2.2 : 1.4);
    b.wind -= dt; b.anim.update(dt);
    if (b.wind <= 0) {
      S.shake = Math.max(S.shake, kind === 'quake' ? 0.5 : 0.3); sfx.slam();
      if (kind === 'fissure') {
        const [fx, fz] = gFwd(b);
        b.crack = { x: b.x, z: b.z, dx: fx, dz: fz, d: 0.6, len: b.fissLen, hit: false, done: 0 };
        b.rec = BOSS.fissure.recover; b.fissCd = BOSS.fissure.cd;
        bossBurst(b, '#ff9a2a', 1.6);
        impactFx(b.x + fx * 1.4, b.z + fz * 1.4, b.era, 1.3, 0.8);
      } else if (kind === 'quake') {
        // 천장을 내리치는 한 방은 둘레를 다 친다 (등 뒤도 위험) → 떨어져 있다가, 크게 회복하는 동안 등 뒤로
        const Q = BOSS.quake; bossBurst(b, '#ff6a3a', Q.ring * 1.1);
        impactFx(b.x, b.z, b.era, Q.ring * 0.7, 1.5);
        if (here && dist < Q.ring) hurt($t('충격파에 맞았어요'));
        b.rec = Q.recover;
      } else {
        bossBurst(b, '#ff5030', P.slamR);
        { const [ux, uz] = gFwd(b); impactFx(b.x + ux * 1.6, b.z + uz * 1.6, b.era, 1.7, 1.1); } // 망치가 떨어진 자리
        if (here && dist < P.slamR && inFrontOf(b, S.p.x, S.p.z, BOSS.front)) hurt($t('성채지기에게 맞았어요'));
        b.rec = b.combo > 0 ? BOSS.combo.gap : P.recover;
      }
    }
    placeBoss(b); return;
  }
  if (b.rec > 0) {
    b.rec -= dt; b.anim.update(dt);
    if (b.rec <= 0) {
      // 내려찍기 → 휘두르기: 회복이 끝났을 때 등·옆에 붙어 있으면 곧바로 둘레를 친다 (찌르고 빠지기). 2페이즈 2연타도 등에 있으면 두 번째가 휘두르기
      if (here && dist < BOSS.sweep.near && !inFrontOf(b, S.p.x, S.p.z, BOSS.front)) { b.combo = 0; startSweep(b); }
      else if (b.combo > 0) { if (here) startComboSlam(b); else b.combo = 0; }
    }
    placeBoss(b); return;
  }
  // 고르는 순서: 등·옆에 붙어 있던 시간 → 휘두르기 / 2페이즈 오늘 → 무너지는 천장 / 앞에 있으면 박자(BOSS.beat)대로 내려찍기(2페이즈 2연타)·땅 가르기·돌진
  //            / 어제 멀면 돌진(2페이즈 3연속) / 오늘 멀면 땅 가르기 / 아니면 쫓기
  const front = inFrontOf(b, S.p.x, S.p.z, BOSS.front), ph2 = b.hp <= BOSS.phase2;
  const C = BOSS.charge, F = BOSS.fissure, clear = dist > 0.01 && bossClear(b, dist, dx / dist, dz / dist);
  b.flankT = here && dist < BOSS.sweep.near && !front ? b.flankT + dt : 0;
  b.sweepCd = Math.max(0, b.sweepCd - dt);
  if (here && b.flankT > BOSS.sweep.after && b.sweepCd <= 0) startSweep(b);
  else if (here && ph2 && b.era === 'now' && b.quakeCd <= 0) startQuake(b);
  else if (here && dist < P.attackAt && front) {
    const R = BOSS.beat[b.era + (ph2 ? '2' : '')], pick = R[b.beat[b.era]++ % R.length];
    if (pick === 'fissure') startFissure(b);
    else if (pick === 'charge' && clear) startCharge(b);
    else { b.combo = ph2 ? 1 : 0; startSlam(b); }
  }
  else if (here && b.era === 'past' && b.chargeCd <= 0 && dist > C.min && dist < C.max && clear) startCharge(b);
  else if (here && b.era === 'now' && b.fissCd <= 0 && dist >= F.min && dist <= F.max && clear) startFissure(b);
  else {
    b.replan -= dt;
    if (b.replan <= 0) { b.replan = 0.3; b.step = nextStep(b, cellOf(S.p.x), cellOf(S.p.z)); }
    const tgt = b.step && dist > 2.6 ? b.step : [S.p.x, S.p.z];
    const stop = dist < 1.7 || !here;
    moveEnemy(b, tgt[0], tgt[1], stop ? 0 : P.run, dt, BOSS.r, P.turn);
    if (stop) b.anim.loop(GCLIP.idle, 0.3);
    else if (b.era === 'past') b.anim.loop(GCLIP.run, 0.2, P.run / BOSS_LOOK.jogNat);
    else b.anim.loop(GCLIP.walk, 0.25, P.run / BOSS_LOOK.walkNat);
  }
  b.anim.update(dt);
  placeBoss(b);
}
// 등 찌르기: 1칸. 공격 중(내려찍기·돌진)이면 움찔하지 않고 그대로 친다 — 등 뒤에 붙어 찌르기만 반복할 수 없게
function hitBoss(b, how) {
  if (b.hurtCd > 0) { sfx.clang(); return 'immune'; }
  // 휘두르기 예비동작(둘레 고리) 중엔 돌아서고 있어서 안 통한다 — 빙빙 돌며 찌르기를 막는 공격이므로 (11/12 밤)
  if (b.sweep && b.sweep.ph === 'wind') { sfx.clang(); S.shake = Math.max(S.shake, 0.15); toast($t('휘두르는 중엔 안 통해요 — 고리 밖으로!'), 1.2); return 'immune'; }
  if (b.state === 'dormant') { b.state = 'alert'; sfx.wake(); }
  b.hp -= 1; b.hurtCd = BOSS.hurtCd;
  if (b.hp <= 0) { killBoss(b, how); return 'kill'; }
  const busy = b.wind > 0 || b.rec > 0 || !!b.sweep || (b.charge && b.charge.ph !== 'tele');
  if (b.daze > 0) b.shockArm = false; // 도착하자마자 찌르면 충격파가 취소된다
  if (!busy) {
    if (b.charge) endCharge(b);
    b.daze = 0; b.stagger = BOSS.stagger;
    b.anim.onceLeft = 0; b.anim.once(GCLIP.hit, { fade: 0.06, speed: 1 / BOSS.stagger, dur: BOSS.stagger });
    // 찌른 쪽 반대로 밀려난다 (벽·구덩이 앞에서 멈춤)
    const ux = b.x - S.p.x, uz = b.z - S.p.z, ul = Math.hypot(ux, uz) || 1;
    const r = bodyRay(b.era, b.x, b.z, ux / ul, uz / ul, BOSS.knock, BOSS.r);
    b.x += ux / ul * r.d; b.z += uz / ul * r.d; placeBoss(b);
  }
  S.hitstop = 0.14; S.shake = Math.max(S.shake, 0.35);
  sfx.kill(); sfx.crack(); hitFx(b);
  if (!b.p2 && b.hp <= BOSS.phase2) bossPhase2(b);
  else toast($t('등 뒤에서 한 방'), 1.1);
  return 'hit';
}
function killBoss(b, how) {
  b.alive = false; b.daze = 0; b.stagger = 0; b.shockArm = false;
  bossCalm(b); clearRocks();
  S.kills++; S.hitstop = 0.3; S.shake = 0.7;
  deathFx(b);
  sfx.crumble(); sfx.door();
  screenFlash(b.era === 'past' ? '#ffd27a' : '#7fe8ff', 0.35);
  if (how !== 'fall') { b.anim.onceLeft = 0; b.anim.once(how === 'back' ? GCLIP.dieBack : GCLIP.dieFront, { fade: 0.1, hold: true }); }
  toast($t('성채지기를 쓰러뜨렸어요 — 출구가 열렸어요'), 3);
}
// 시험 훅(__yk.boss)에 더하는 패턴 상태
const bossExtra = b => ({ kind: b.wind > 0 ? b.slamKind : null, windMax: +b.windMax.toFixed(2), combo: b.combo, pivot: +b.pivot.toFixed(2), fissLen: +b.fissLen.toFixed(2),
  crack: b.crack ? { x: b.crack.x, z: b.crack.z, dx: b.crack.dx, dz: b.crack.dz, d: +b.crack.d.toFixed(2) } : null, chainLeft: b.chainLeft, p2: b.p2, quakeCd: +b.quakeCd.toFixed(2), fissCd: +b.fissCd.toFixed(2),
  rocks: bossRocks.filter(r => !r.done).map(r => ({ x: +r.x.toFixed(2), z: +r.z.toFixed(2), t: +r.t.toFixed(2), track: r.track })), used: { ...b.used } });
function updateBossView() {
  const b = bosses[0];
  if (!b) return;
  const here = b.era === S.era;
  // 전환 물결이 보스를 지나가면 바로 윤곽을 보인다 (물결 전체는 1.4초쯤 걸려 1.5초 도착 시계를 다 가려 버림)
  const ringOk = !S.ring || S.ring.r > Math.hypot(b.x - SHIFT.origin.value.x, b.z - SHIFT.origin.value.z) + 1.5;
  b.ghost.visible = b.alive && !here && ringOk;
  if (b.ghost.visible) { b.holder.updateMatrixWorld(true); b.weapons.forEach((w, k) => { b.ghostWeapons[k].matrix.copy(w.matrixWorld); b.ghostWeapons[k].matrixWorldNeedsUpdate = true; }); }
  const eraCol = S.era === 'past' ? '#ffd27a' : '#7fe8ff';
  // 도착 시계: 다른 시대에 멈춰 있는 동안 줄어드는 고리. 그 자리가 이쪽에서 구덩이면 붉게(= 따라오면 떨어진다)
  const fr = b.followRing, following = b.alive && b.state !== 'dormant' && !here && !b.fall && ringOk;
  if (following || (b.alive && b.fall && here)) {
    const k = following ? Math.min(1, b.followT / bossFollow(b)) : Math.min(1, b.fall.t / BOSS.fallBack);
    const [x, z] = following ? [b.x, b.z] : b.fall.to, ci = cellOf(x), cj = cellOf(z);
    const pit = following && bossLocked(b) && !floorAt(S.era, ci, cj) && !solid(S.era, ci, cj); // 평소엔 구덩이를 피해 나타나므로 묶였을 때만
    fr.visible = true; fr.position.set(x, 0.08, z); fr.scale.setScalar(2.8 - 1.9 * k);
    fr.material.color.set(pit ? '#ff4a5a' : eraCol); fr.material.opacity = 0.35 + 0.5 * k;
  } else fr.visible = false;
  const P = BOSS[b.era];
  const fiss = b.wind > 0 && b.slamKind === 'fissure', quake = b.wind > 0 && b.slamKind === 'quake';
  b.slamRing.visible = here && b.alive && b.wind > 0 && !fiss && !quake; // 천장은 부채꼴 대신 둘레 고리(아래)
  if (b.slamRing.visible) { const k = 1 - b.wind / b.windMax; b.slamRing.position.set(b.x, 0.06, b.z); b.slamRing.rotation.y = b.yaw; b.slamRing.scale.setScalar(P.slamR * (0.45 + 0.55 * k)); b.slamRing.material.opacity = 0.3 + 0.45 * k; }
  // 땅 가르기: 주황 줄(겨누는 동안 따라 돌고, 고정되면 진해진다) → 금이 줄을 따라 달려간다
  b.fissLine.visible = here && b.alive && fiss;
  if (fiss) { const k = 1 - b.wind / b.windMax, locked = b.wind <= BOSS.fissure.lock; b.fissLine.position.set(b.x, 0.07, b.z); b.fissLine.rotation.y = b.yaw; b.fissLine.scale.set(BOSS.fissure.w * 2, 1, b.fissLen); b.fissLine.material.opacity = locked ? 0.62 : 0.14 + 0.36 * k; }
  const ck = b.crack;
  b.crackLine.visible = here && b.alive && !!ck;
  if (ck) { b.crackLine.position.set(ck.x, 0.08, ck.z); b.crackLine.rotation.y = Math.atan2(ck.dx, ck.dz); b.crackLine.scale.set(BOSS.fissure.w * 1.3, 1, ck.d); b.crackLine.material.opacity = 0.85 * (1 - (ck.done || 0) / 0.35); }
  const sw = b.sweep && b.sweep.ph === 'wind', shockOn = b.daze > 0 && b.shockArm;
  b.shockRing.visible = here && b.alive && (sw || shockOn || quake);
  if (b.shockRing.visible) { const k = quake ? 1 - b.wind / b.windMax : sw ? 1 - b.sweep.t / BOSS.sweep.windup : 1 - b.daze / Math.max(0.01, b.dazeMax), R = quake ? BOSS.quake.ring : sw ? BOSS.sweep.r : BOSS.shock; b.shockRing.position.set(b.x, 0.07, b.z); b.shockRing.scale.setScalar(R * (0.35 + 0.65 * k)); b.shockRing.material.opacity = 0.25 + 0.5 * k; }
  const c = b.charge;
  b.chargeLine.visible = here && b.alive && !!c && c.ph === 'tele';
  if (b.chargeLine.visible) { const k = 1 - c.t / c.tele; b.chargeLine.position.set(b.x, 0.07, b.z); b.chargeLine.rotation.y = b.yaw; b.chargeLine.scale.set(BOSS.charge.hitW * 2, 1, c.len + BOSS.r); b.chargeLine.material.opacity = 0.12 + 0.4 * k; }
  // 등 뒤 구역: 다른 시대에 멈춰 있을 때(= 도착할 때 등이 될 자리) · 휘청이거나 벽에 박혔을 때
  // 등 뒤 구역: 공격에 묶여 멈춰 있을 때(= 그대로 와서 마저 칠 방향의 반대) · 구덩이에서 올라올 때 · 벽에 박혔을 때 · 내려찍고 회복할 때
  const open = b.alive && !b.fall && b.state !== 'dormant' && ((following && bossLocked(b)) || (here && (b.rising || b.stagger > 0.25 || (b.rec > 0.15 && !b.combo))));
  b.backArc.visible = open;
  if (open) { b.backArc.position.set(b.x, 0.075, b.z); b.backArc.rotation.y = b.yaw; b.backArc.material.color.set(eraCol); b.backArc.material.opacity = 0.3 + 0.1 * Math.sin(S.time * 6); }
  b.burstRing.visible = !!b.burst && here;
  if (b.burst) { const k = b.burst.t / 0.45; b.burstRing.scale.setScalar(0.6 + b.burst.r * k); b.burstRing.material.opacity = 0.9 * (1 - k); }
  // 체력 막대
  const show = b.state !== 'dormant' || !b.alive;
  hud.boss.style.display = show ? 'block' : 'none';
  if (!show) return;
  if (b.hpShown !== b.hp) { b.hpShown = b.hp; let s = ''; for (let k = 0; k < BOSS.hp; k++) s += `<i class="${k < b.hp ? '' : 'off'}"></i>`; hud.bossPips.innerHTML = s; }
  hud.boss.classList.toggle('angry', b.alive && b.hp <= BOSS.phase2);
  hud.boss.classList.toggle('down', !b.alive);
  hud.bossFollow.textContent = !b.alive ? $t('쓰러뜨림') : b.fall ? $t('떨어지는 중…') : following && bossLocked(b) ? $t('공격에 묶여 따라오는 중 {0}초', Math.max(0, bossFollow(b) - b.followT).toFixed(1)) : '';
}

/* ───────── 방 이동 · 점수(어제에서 쓴 시간) ───────── */
const loadBest = () => { try { return JSON.parse(localStorage.getItem('yk-best') || '{}'); } catch (e) { return {}; } };
function roomStars() {
  const r = S.room;
  let st = 1;
  if (r.boss ? !S.roomHurt : !S.alarms) st++;
  if (r.par != null && S.pastTime <= r.par) st++;
  return st;
}
function updateExit() {
  if (S.trans || S.falling > 0) return;
  if (ch(S.era, cellOf(S.p.x), cellOf(S.p.z)) === '>') {
    if (S.bossPending || enemies().some(g => g.alive)) { if (toastT <= 0) toast($t('적이 남아 있어요')); return; }
    sfx.exit();
    // 기록: 이 방에서 어제에 머문 시간과 별
    const st = roomStars(), best = loadBest(), id = S.room.id, prev = best[id];
    if (!prev || S.pastTime < prev.t || st > prev.stars) { best[id] = { t: +S.pastTime.toFixed(2), stars: Math.max(st, prev ? prev.stars : 0) }; try { localStorage.setItem('yk-best', JSON.stringify(best)); } catch (e) { /* 이번만 */ } }
    S.runPast += S.pastTime; S.runStars += st; S.runAlarms = (S.runAlarms || 0) + S.alarms;
    if (S.room.par != null || enemies().length) toast($t('어제 {0}초', S.pastTime.toFixed(1)) + '  ' + '★'.repeat(st) + '☆'.repeat(3 - st), 2.4);
    S.trans = { t: 0, next: S.roomIdx + 1 };
  }
}
function updateTrans(dt) {
  if (!S.trans) return;
  const tr = S.trans;
  tr.t += dt;
  if (!tr.loaded && tr.t >= 0.4) {
    tr.loaded = true;
    if (tr.next >= ROOMS.length) { showEnd(); S.trans = null; hud.fade.style.opacity = 0; return; }
    loadRoom(tr.next);
  }
  hud.fade.style.opacity = tr.t < 0.4 ? tr.t / 0.4 : Math.max(0, 1 - (tr.t - 0.4) / 0.4);
  if (tr.t >= 0.8) { S.trans = null; hud.fade.style.opacity = 0; }
}
function showEnd() {
  S.ended = true;
  const m = Math.floor(S.time / 60), s = Math.floor(S.time % 60);
  // 끝 화면 기록: 점수(어제에서 쓴 초)를 크게, 별·경보, 나머지는 작게. 별 최대 = 방마다 2개(+기준 시간이 있으면 1개)
  const maxStars = ROOMS.reduce((a, r) => a + (r.par != null ? 3 : 2), 0);
  hud.endStats.innerHTML = `<div class="score">${$t('어제에서 쓴 시간 {0}초', S.runPast.toFixed(1))}</div>`
    + `<div>★ ${S.runStars} / ${maxStars} · ${$t('경보 {0}번', S.runAlarms || 0)}</div>`
    + `<div class="small">${$t('걸린 시간 {0}분 {1}초', m, s)} · ${$t('시대 전환 {0}번', S.shifts)} · ${$t('쓰러뜨린 적 {0}', S.kills)}<br>`
    + `${$t('모래시계 조각 {0} / {1}', S.got.size, SHARD_TOTAL)} · ${$t('추락 {0}번', S.falls)} · ${$t('함정 {0}번', S.hurts)}</div>`;
  hud.end.style.display = 'flex';
}
$('endRestart').addEventListener('click', () => {
  hud.end.style.display = 'none';
  S.ended = false; S.hearts = 5; S.shifts = 0; S.falls = 0; S.blocked = 0; S.time = 0; S.hurts = 0; S.got.clear(); S.kills = 0; S.runPast = 0; S.runStars = 0; S.runAlarms = 0;
  loadRoom(0);
});

/* ───────── 매 프레임 ───────── */
const camTarget = new THREE.Vector3();
const camOff = new THREE.Vector3(0, Math.sin(CAM_PITCH) * CAM_DIST, Math.cos(CAM_PITCH) * CAM_DIST);
function animatePlayer(dt) {
  if (!heroAnim) return;
  const sp = S.roll > 0 ? 0 : Math.hypot(S.vel.x, S.vel.z);
  if (S.falling > 0) heroAnim.loop('MM_Fall_Loop', 0.1);
  else if (sp > 0.6) heroAnim.loop('AS_Run_Loop_F_0_Seq', 0.15, Math.max(0.7, sp / SPEED));
  else heroAnim.loop('AS_Idle_Seq', 0.2);
  heroAnim.update(dt);
}
function update(dt) {
  if (S.ended) return;
  if (S.hitstop > 0) { S.hitstop -= dt; dt *= 0.12; } // 찌른 순간 아주 잠깐 멈칫
  if (S.down) { // 되감는 동안은 세상이 멈춘다 (카메라·조명·화면만)
    stepDown(dt); animatePlayer(dt); drawPlayer(dt);
    camTarget.lerp(_v.set(S.p.x, 0, S.p.z), 1 - Math.exp(-dt * 5));
    camera.position.copy(camTarget).add(camOff); camera.lookAt(camTarget.x, 0.6, camTarget.z);
    updateRing(dt); updateLights(dt); updateGuardsView(); updateGolemsView(); updateBossView(); musicTick(dt); fxTick(dt);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.style.opacity = 0; }
    if (flashA > 0) { flashA = Math.max(0, flashA - dt * 0.8); hud.flash.style.opacity = flashA; }
    return;
  }
  S.time += dt; S.roomTime += dt;
  if (S.bossPending && CHAR.golem) spawnBoss(S.room); // 보스 방에 모델보다 먼저 들어왔으면 받는 대로
  if (S.era === 'past' && !S.trans) S.pastTime += dt; // 점수: 어제에서 쓴 시간
  S.shiftCd = Math.max(0, S.shiftCd - dt); S.rollCd = Math.max(0, S.rollCd - dt); S.invuln = Math.max(0, S.invuln - dt); S.shiftStrike = Math.max(0, S.shiftStrike - dt);
  if (S.stabT > 0) { S.stabT -= dt; if (!S.stabHit && S.stabT < 0.28) { S.stabHit = true; resolveStab(); } }
  updatePlayer(dt);
  pushFromGuards();
  updateMech(dt);
  animatePlayer(dt);
  updateLinked(dt);
  updateExit();
  updateTrans(dt);
  // 떠난 시대는 멈춘다: 지금 시대(또는 두 시대 공통) 엔티티만 갱신
  for (const e of entities) if (e.era === 'both' || e.era === S.era) e.update(dt, e);
  updateRing(dt);
  updateLights(dt);
  updateGuardsView(); updateGolemsView(); updateBossView(); musicTick(dt); fxTick(dt);
  hud.ptime.textContent = $t('어제 {0}초', S.pastTime.toFixed(1));
  // 카메라 (조금 늦게 따라옴). 깨어 있는 보스가 있으면 둘 사이 쪽으로 조금 당겨 둘 다 보이게
  _v.set(S.p.x, 0, S.p.z);
  const bb = bosses[0];
  if (bb && bb.alive && bb.state !== 'dormant' && !bb.fall) { const ox = (bb.x - S.p.x) * 0.3, oz = (bb.z - S.p.z) * 0.3, ol = Math.hypot(ox, oz), k = ol > 4 ? 4 / ol : 1; _v.x += ox * k; _v.z += oz * k; }
  camTarget.lerp(_v, 1 - Math.exp(-dt * 5));
  S.shake = Math.max(0, S.shake - dt);
  const sh = S.shake * S.shake * 0.9;
  camera.position.copy(camTarget).add(camOff).add(_s.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
  camera.lookAt(camTarget.x, 0.6, camTarget.z);
  // 카메라 펀치: 큰 타격 순간 시야가 잠깐 좁아진다(확 다가오는 느낌). 끝나면 원래 화각으로
  if (FX.kick > 0 || FX.baseFov) { if (!FX.baseFov) FX.baseFov = camera.fov; camera.fov = FX.baseFov * (1 - FX.kick * 0.07); camera.updateProjectionMatrix(); if (!FX.kick) FX.baseFov = 0; }
  ghostGroundMat.uniforms.uPlayer.value.set(S.p.x, 0, S.p.z);
  ghostGroundMat.uniforms.uTime.value = S.time;
  // HUD
  hud.cd.style.width = (100 * (1 - S.shiftCd / SHIFT_CD)) + '%';
  const it = !S.trans && S.falling <= 0 ? nearestInteract() : null;
  if (it) { hud.prompt.style.display = 'block'; hud.prompt.textContent = S.era === 'past' ? $t('E 레버 당기기') : $t('E 레버 (녹슮)'); } else hud.prompt.style.display = 'none';
  if (flashA > 0) { flashA = Math.max(0, flashA - dt * 0.8); hud.flash.style.opacity = flashA; }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.style.opacity = 0; }
  if (titleT > 0) { titleT -= dt; if (titleT <= 0) hud.title.style.opacity = 0; }
  if (S.flashT > 0) { S.flashT = Math.max(0, S.flashT - dt); flashMat.opacity = (S.flashT / 0.55) * 0.55 * (0.6 + 0.4 * Math.sin(S.time * 40)); if (S.flashT <= 0) flashBox.count = 0; }
}
function render() { drawPlayer(0); renderer.render(scene, camera); }

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!S.ready) return;
  if (!S.paused) update(dt);
  render();
}

/* ───────── 테스트 훅 ───────── */
function stepSim(sec = 0.1, dt = 1 / 60) {
  const n = Math.max(1, Math.round(sec / dt));
  for (let k = 0; k < n; k++) update(dt);
  render();
}
window.__yk = {
  ready: () => S.ready,
  rooms: () => ROOMS.map(r => r.id),
  room(n) { const idx = typeof n === 'string' ? ROOMS.findIndex(r => r.id === n) : n; S.ended = false; S.trans = null; S.down = null; hud.down.style.opacity = 0; hud.fade.style.opacity = 0; hud.end.style.display = 'none'; loadRoom(idx); render(); return this.state(); },
  era(e) { if (e && e !== S.era) { if (S.ring) finishRing(); setEraInstant(e); render(); } return S.era; },
  shift() { const r = tryShift(); render(); return r; },
  finishRing() { finishRing(); render(); },
  tp(i, j) { S.p.set(i * T + 1, 0, j * T + 1); S.vel.set(0, 0, 0); S.falling = 0; S.py = 0; camTarget.copy(S.p); render(); return this.state(); },
  tpw(x, z) { S.p.set(x, 0, z); S.vel.set(0, 0, 0); camTarget.copy(S.p); render(); return this.state(); },
  step(sec = 0.1, dt = 1 / 60) { stepSim(sec, dt); return this.state(); },
  walk(dx, dz, sec = 0.5) { const l = Math.hypot(dx, dz) || 1; virt.on = true; virt.x = dx / l; virt.z = dz / l; stepSim(sec); virt.on = false; virt.x = virt.z = 0; return this.state(); },
  roll(dx, dz) { if (dx || dz) { virt.on = true; const l = Math.hypot(dx, dz); virt.x = dx / l; virt.z = dz / l; } const r = startRoll(); virt.on = false; return r; },
  interact() { const r = interact(); render(); return r; },
  restart() { const r = restartRoom(false); render(); return r; },
  spikeT(t) { for (const sp of spikes) sp.t = t; return spikes.map(sp => spikeState(sp)); }, // 가시 시계 맞추기(테스트용)
  bladeT(t) { for (const bl of blades) bl.t = t; updateActors(); render(); return blades.map(bl => +THREE.MathUtils.radToDeg(bladeAngle(bl)).toFixed(1)); },
  raftPos(p) { for (const r of rafts) { r.pos = p; r.x = r.axis === 'x' ? p : r.fixed; r.z = r.axis === 'z' ? p : r.fixed; if (r.mesh) r.mesh.position.set(r.x, 0, r.z); } render(); return rafts.map(r => [r.x, r.z]); },
  actors() { return { arrows: arrows.map(a => [a.era, +a.x.toFixed(1), +a.z.toFixed(1)]), blades: blades.map(bl => [bl.i, bl.j, bl.axis, +THREE.MathUtils.radToDeg(bladeAngle(bl)).toFixed(1), +bl.t.toFixed(3)]), rafts: rafts.map(r => [+r.x.toFixed(2), +r.z.toFixed(2), r.dir, r.axis]) }; },
  render() { render(); return true; },
  // 개발용: 던전 조각(BASE 기준 경로)을 플레이어 북쪽에 한 줄로 늘어놓아 비교
  async lab(paths, gap = 2.5) {
    const g = new THREE.Group(); g.name = 'lab';
    const old = groups[S.era].getObjectByName('lab'); if (old) groups[S.era].remove(old);
    let x = S.p.x - (paths.length - 1) * gap / 2;
    for (const p of paths) {
      const prims = primsOf(await loader.loadAsync(BASE + p + '.glb'));
      for (const pr of prims) { const me = new THREE.Mesh(pr.geo, eraMaterial(pr.mat, S.era)); me.applyMatrix4(pr.m); me.position.add(_v.set(x, 0, S.p.z - 2.5)); g.add(me); }
      x += gap;
    }
    groups[S.era].add(g); render(); return paths.length;
  },
  stab() { const r = stab(); render(); return r; },
  golems() { return golems.map(g => ({ alive: g.alive, state: g.state, sus: +g.sus.toFixed(2), x: +g.x.toFixed(2), z: +g.z.toFixed(2), cell: [cellOf(g.x), cellOf(g.z)], yawDeg: Math.round(THREE.MathUtils.radToDeg(g.yaw)), wind: +g.wind.toFixed(2), stun: +g.stun.toFixed(2), anim: g.anim ? g.anim.curName.replace('AS_StoneGolem_', '') : 'blocks' })); },
  golemModel: () => !!CHAR.golem,
  boss() { const b = bosses[0]; if (!b) return S.bossPending ? 'pending' : null; return { alive: b.alive, era: b.era, state: b.state, hp: b.hp, x: +b.x.toFixed(2), z: +b.z.toFixed(2), py: +b.py.toFixed(2), cell: [cellOf(b.x), cellOf(b.z)], yawDeg: Math.round(THREE.MathUtils.radToDeg(b.yaw)),
    followT: +b.followT.toFixed(2), daze: +b.daze.toFixed(2), stagger: +b.stagger.toFixed(2), wind: +b.wind.toFixed(2), rec: +b.rec.toFixed(2), stun: +b.stun.toFixed(2), hurtCd: +b.hurtCd.toFixed(2), charge: b.charge ? b.charge.ph : null, sweep: b.sweep ? b.sweep.ph : null, flankT: +b.flankT.toFixed(2), fall: !!b.fall, shockArm: b.shockArm, anim: b.anim.curName.replace('AS_StoneGolem_', ''), ...bossExtra(b) }; },
  bossSet(o) { const b = bosses[0]; if (!b) return null; if (o.x != null) b.x = o.x; if (o.z != null) b.z = o.z; if (o.yawDeg != null) b.yaw = THREE.MathUtils.degToRad(o.yawDeg); if (o.hp != null) b.hp = o.hp; if (o.state) b.state = o.state; if (o.era && o.era !== b.era) setBossEra(b, o.era); placeBoss(b); render(); return this.boss(); },
  guards() { return guards.map(g => ({ alive: g.alive, state: g.state, sus: +g.sus.toFixed(2), x: +g.x.toFixed(2), z: +g.z.toFixed(2), cell: [cellOf(g.x), cellOf(g.z)], yawDeg: Math.round(THREE.MathUtils.radToDeg(g.yaw)), wind: +g.wind.toFixed(2) })); },
  guardSet(k, x, z, yawDeg) { const g = guards[k]; if (!g) return null; g.x = x; g.z = z; if (yawDeg != null) g.yaw = THREE.MathUtils.degToRad(yawDeg); placeGuard(g); updateCone(g); render(); return this.guards()[k]; },
  best() { return loadBest(); },
  heroYaw(r) { if (hero) hero.rig.rotation.y = r; render(); return r; },
  get hero() { return hero; },
  pause(on = true) { S.paused = !!on; return S.paused; }, // 켜 두면 실시간 진행을 멈추고 step()으로만 움직인다 (스크린샷용)
  cam(dist = CAM_DIST, pitchDeg = 55, fov = camera.fov) { const p = THREE.MathUtils.degToRad(pitchDeg); camOff.set(0, Math.sin(p) * dist, Math.cos(p) * dist); camera.fov = fov; camera.updateProjectionMatrix(); stepSim(0.02); return true; },
  cell(i, j, era = S.era) { return { ch: ch(era, i, j), solid: solid(era, i, j), floor: floorAt(era, i, j), ghost: cellKind(era, i, j) }; },
  grid(era = S.era) { return G[era].map(r => r.join('')); },
  ghostCells(era = other(S.era)) { return ghosts[era] && ghosts[era].userData.cells; },
  entities() { return entities.map(e => ({ era: e.era, t: +e.t.toFixed(3) })); },
  state() {
    return {
      room: S.room && S.room.id, roomIdx: S.roomIdx, era: S.era, x: +S.p.x.toFixed(3), z: +S.p.z.toFixed(3), cell: [cellOf(S.p.x), cellOf(S.p.z)],
      hearts: S.hearts, falling: S.falling > 0, shiftCd: +S.shiftCd.toFixed(3), ring: S.ring ? +S.ring.r.toFixed(2) : null,
      lever: S.lever, doorOpen: S.doorOpen, shifts: S.shifts, falls: S.falls, blocked: S.blocked, ended: S.ended, trans: !!S.trans,
      visible: { past: groups.past && groups.past.visible, now: groups.now && groups.now.visible }, ghost: ERAS.filter(E => ghosts[E] && ghosts[E].visible)[0] || null,
      gateT: +S.gateT.toFixed(2), hurts: S.hurts, shards: S.got.size, shardTotal: SHARD_TOTAL,
      crates: crates.map(c => [c.i, c.j, c.sunk]), spikes: spikes.map(sp => [sp.i, sp.j, spikeState(sp)]),
      pastTime: +S.pastTime.toFixed(2), alarms: S.alarms, kills: S.kills, guardsLeft: enemies().filter(g => g.alive).length, shiftStrike: +S.shiftStrike.toFixed(2), stabT: +S.stabT.toFixed(2), face: Math.round(THREE.MathUtils.radToDeg(S.face)),
    };
  },
  S, scene, camera, renderer, THREE,
};

/* ───────── 시작 ───────── */
(async () => {
  try {
    await loadPieces();
  } catch (e) {
    console.error(e);
    hud.loading.firstElementChild.textContent = $t('불러오기에 실패했어요');
    return;
  }
  // ?room=heart 처럼 방 이름(또는 1부터 센 번호)을 주면 그 방에서 시작 (손으로 시험할 때)
  const want = new URLSearchParams(location.search).get('room');
  const startIdx = want ? Math.max(0, /^\d+$/.test(want) ? +want - 1 : ROOMS.findIndex(r => r.id === want)) : 0;
  loadRoom(startIdx);
  // 셰이더를 미리 컴파일해 첫 전환 때 끊기지 않게
  for (const E of ERAS) groups[E].visible = true;
  renderer.compile(scene, camera);
  setEraInstant(S.room.startEra);
  hud.loading.classList.add('done');
  hud.fade.style.opacity = 0;
  S.ready = true;
  render();
  requestAnimationFrame(frame);
  // 골렘 모델(약 1.9MB)은 첫 방(골렘 없음)이 뜬 뒤에 받는다. 골렘 방까지 못 받았으면 코드 몸으로 대신
  loadGolem(loader).then(gm => { CHAR.golem = gm; }).catch(e => console.warn('golem model load failed, using stone blocks', e));
})();
