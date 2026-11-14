// T3 퍼즐 장치 — 공통 바탕. 장치(mech)마다 글자·칸 판정·짓기·갱신·E 대상을 등록하면 여기서 EXT 훅에 나눠 준다.
// 방마다 바뀌는 것은 C(현재 방 기록)에 둔다. 칸 판정(EXT.solidAt/floorAt)은 방을 짓는 도중(buildEra·buildGhosts)에도 불리므로
// 글자 처리기가 불리는 그 순간부터 기록이 살아 있어야 한다 → 글자 처리기에서 방을 열고(begin), roomLoad에서 닫는다(sealed).
import { EXT } from '../../ext.js';
import { S3 } from './sfx3.js';

export const C = {
  room: null, sealed: true,
  cells: new Map(),          // 'E:i,j' → { m: 장치 id, k: 종류, … }
  d: {},                     // 장치 id → 이 방의 장치 데이터
  inv: { seed: 0, key: 0 },  // 들고 있는 것 (시대를 건너도 그대로, 방을 나가면 비움)
  eHeld: false,              // E를 누르고 있는지 (태엽 감기)
  fails: {},                 // 방 id → 실패 수 (R로 다시 시작해도 남는다 → 두 번이면 tip을 처음부터)
  stuck: false, stuckT: 0, has: false, t: 0, once: new Set(),
  dirty: false,              // 칸 판정이 바뀌어 다른 시대 윤곽을 다시 지어야 함
};
export const MECHS = [];
const BY = {};
const ck = (E, i, j) => E + ':' + i + ',' + j;
export const at = (E, i, j) => C.cells.get(ck(E, i, j));
export const put = (E, i, j, v) => C.cells.set(ck(E, i, j), v);
export const both = (i, j, v) => { put('past', i, j, v); put('now', i, j, v); };
export const live = () => !!(EXT.K && C.room && EXT.K.S.room === C.room);
export const K = () => EXT.K;
export const cpos = (i, j) => ({ x: i * 2 + 1, z: j * 2 + 1 });
export const cellOfP = () => [Math.floor(EXT.K.S.p.x / 2), Math.floor(EXT.K.S.p.z / 2)];
export const onCell = (i, j) => { const [a, b] = cellOfP(); return a === i && b === j; };
export const busy = () => { const S = EXT.K.S; return S.falling > 0 || !!S.trans || !!S.down || S.ended; };
export const dist = (x, z) => Math.hypot(EXT.K.S.p.x - x, EXT.K.S.p.z - z);
export const crateAt = (i, j) => EXT.K.crates.find(c => c.i === i && c.j === j) || null;
export const nearest = (list, i, j) => { let best = null, bd = 1e9; for (const o of list) { const d = Math.abs(o.i - i) + Math.abs(o.j - j); if (d < bd) { bd = d; best = o; } } return best; };
// 한 방에서 한 번만 띄우는 안내
export function toastOnce(id, msg, sec = 2.4) { if (C.once.has(id)) return; C.once.add(id); EXT.K.toast(msg, sec); }
export const markDirty = () => { C.dirty = true; };

function begin(room) {
  if (C.room === room && !C.sealed) return;
  C.room = room; C.sealed = false; C.t = 0; C.cells = new Map(); C.inv = { seed: 0, key: 0 }; C.stuck = false; C.stuckT = 0; C.once = new Set(); C.dirty = false;
  for (const m of MECHS) C.d[m.id] = m.fresh();
}
/** 장치 등록. m = { id, fresh(), chars: { 글자: (d, E, i, j, room, K) → 기본 글자 }, solid(x, era, i, j, c), floor(x, era, i, j, c),
 *  load(d, K, room), update(d, dt, K), frame(d, dt, K), shift(d, from, to, K), targets(d, K) → [{ x, z, r, label(), act() }] } */
export function mech(m) {
  MECHS.push(m); BY[m.id] = m;
  for (const [c, fn] of Object.entries(m.chars || {})) EXT.chars[c] = (E, i, j, room, k) => { begin(room); return fn(C.d[m.id], E, i, j, room, k); };
  return m;
}

// ── 칸 판정 ──
EXT.solidAt.push((era, i, j, c) => { if (!live()) return undefined; const x = at(era, i, j); if (!x) return undefined; const m = BY[x.m]; return m.solid ? m.solid(x, era, i, j, c) : undefined; });
EXT.floorAt.push((era, i, j, c) => { if (!live()) return undefined; const x = at(era, i, j); if (!x) return undefined; const m = BY[x.m]; return m.floor ? m.floor(x, era, i, j, c) : undefined; });

// ── 재료 (한 번만 만들어 셰이더를 다시 컴파일하지 않게) ──
const MAT = {};
export function mat(era, name, params) { const k = era + ':' + name; return MAT[k] || (MAT[k] = EXT.K.eraPlain(era, params)); }
// 다른 시대 윤곽용: 벽 너머로도 보이는 가산 반투명
export function gmat(color, op = 0.4) {
  const k = 'g:' + color + ':' + op;
  if (!MAT[k]) { const THREE = EXT.K.THREE; MAT[k] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }); }
  return MAT[k];
}
// 빛 (가산, 깊이 씀 없음). 시대 재질이라 전환 고리가 퍼지는 동안에도 떠나는 시대 쪽에서는 사라진다
// (11/13 직접 플레이: MeshBasic으로 했더니 전환하는 0.5초 동안 오늘의 금 간 바닥 빛·달빛이 어제 화면에 그대로 떴다)
export function emat(era, color, op = 0.8, extra = {}) {
  const THREE = EXT.K.THREE;
  return EXT.K.eraPlain(era, Object.assign({ color: '#000000', emissive: color, emissiveIntensity: 1.6, roughness: 1, metalness: 0, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }, extra));
}
export function lmat(color, op = 0.8, era = 'now') { const k = 'l:' + era + ':' + color + ':' + op; return MAT[k] || (MAT[k] = emat(era, color, op)); }
let GLOW3 = null;
export function glowTex() {
  if (GLOW3) return GLOW3;
  const THREE = EXT.K.THREE, c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  GLOW3 = new THREE.CanvasTexture(c); GLOW3.colorSpace = THREE.SRGBColorSpace; return GLOW3;
}
export function glow(color, size, op = 0.8) {
  const THREE = EXT.K.THREE;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
  s.scale.setScalar(size); return s;
}
export function mesh(geo, m, x = 0, y = 0, z = 0) { const me = new EXT.K.THREE.Mesh(geo, m); me.position.set(x, y, z); return me; }
export function group(...kids) { const g = new EXT.K.THREE.Group(); for (const k of kids) if (k) g.add(k); return g; }
// 다른 시대 윤곽 물체: era = 이 물체가 속한(보여 주는) 시대. 그 시대가 아닐 때 보인다. cond()가 있으면 그것도 참이어야
const ghostList = [];
export function ghostObj(obj, era, cond) { obj.visible = false; obj.renderOrder = 7; obj.traverse(o => { o.renderOrder = 7; }); EXT.K.world.add(obj); ghostList.push({ obj, era, cond, w: EXT.K.world }); return obj; }
function syncGhosts() {
  const S = EXT.K.S, w = EXT.K.world;
  for (let k = ghostList.length - 1; k >= 0; k--) {
    const g = ghostList[k];
    if (g.w !== w) { ghostList.splice(k, 1); continue; } // 방을 새로 지으면(R 포함) 옛 윤곽은 버린다
    g.obj.visible = S.era !== g.era && !S.ring && (!g.cond || g.cond());
  }
}

// ── 화면: 들고 있는 것 · 태엽 시간 · 막힘 알림 (#ext 안에 내 요소) ──
let ui = null;
function makeUi() {
  if (ui) return ui;
  const host = document.getElementById('ext') || document.body;
  const st = document.createElement('style');
  st.textContent = `#t3hud{position:fixed;left:20px;top:100px;font-size:15px;text-shadow:0 2px 4px #000;pointer-events:none;display:flex;flex-direction:column;gap:5px;color:#fff}
#t3hud .row{display:none;align-items:center;gap:6px}#t3hud .row.on{display:flex}
#t3hud .bar{width:90px;height:6px;border-radius:3px;background:#ffffff22;overflow:hidden}#t3hud .bar i{display:block;height:100%;background:#ffd27a}
#t3hud .frozen{color:#7fe8ff}#t3hud .frozen .bar i{background:#7fe8ff}
#t3hud .stuck{color:#ffb3a8;font-weight:700}#t3hud .stuck kbd{border:1px solid #ffb3a8;border-radius:4px;padding:0 6px;margin-right:4px;animation:t3pulse 1s infinite}
@keyframes t3pulse{50%{background:#ffb3a855}}`;
  document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 't3hud';
  el.innerHTML = '<div class="row seed"></div><div class="row key"></div><div class="row spring"><span class="lbl"></span><div class="bar"><i></i></div></div><div class="row stuck"><kbd>R</kbd><span class="lbl"></span></div>';
  el.style.pointerEvents = 'none';
  host.appendChild(el);
  ui = { el, seed: el.querySelector('.seed'), key: el.querySelector('.key'), spring: el.querySelector('.spring'), springLbl: el.querySelector('.spring .lbl'), springBar: el.querySelector('.spring .bar i'), stuck: el.querySelector('.stuck'), stuckLbl: el.querySelector('.stuck .lbl') };
  return ui;
}
// 태엽 시간 표시 (clock.js가 매 프레임 채움): null이면 숨김
export const HUDX = { spring: null };
function drawUi() {
  const u = makeUi(), S = EXT.K.S;
  const show = live() && C.has && !S.ended;
  u.el.style.display = show ? 'flex' : 'none';
  if (!show) return;
  u.seed.classList.toggle('on', C.inv.seed > 0); if (C.inv.seed > 0) u.seed.textContent = '🌰 ' + $t('씨앗 {0}', C.inv.seed);
  u.key.classList.toggle('on', C.inv.key > 0); if (C.inv.key > 0) u.key.textContent = '🗝 ' + $t('열쇠 {0}', C.inv.key);
  const sp = HUDX.spring;
  u.spring.classList.toggle('on', !!sp);
  if (sp) { u.springLbl.textContent = $t('태엽 문 {0}초', sp.t.toFixed(1)) + (sp.frozen ? ' · ' + $t('멈춤') : ''); u.springBar.style.width = (100 * sp.t / sp.max) + '%'; u.spring.classList.toggle('frozen', sp.frozen); }
  u.stuck.classList.toggle('on', C.stuck);
  if (C.stuck) u.stuckLbl.textContent = $t('길이 막혔어요 — R로 다시 시작');
}

// ── E 누르고 있기 (태엽 감기). 시험 도구의 가짜 키 이벤트도 같은 길로 들어온다 ──
addEventListener('keydown', e => { if (e.code === 'KeyE' || (!e.code && (e.key === 'e' || e.key === 'E'))) C.eHeld = true; });
addEventListener('keyup', e => { if (e.code === 'KeyE' || (!e.code && (e.key === 'e' || e.key === 'E'))) C.eHeld = false; });
addEventListener('blur', () => { C.eHeld = false; });

// ── E 대상 고르기: 내 장치 중 가장 가까운 것. 장치 칸은 대개 막혀 있으니 옆 칸 어디에 서 있어도 닿게.
//    없으면 undefined → 기본 레버 처리 ──
export const REACH = 2.45; // 11/13 직접 플레이: 2.15m는 멈추며 미끄러지는 사이 E가 안 닿는 일이 잦았다
export function nearestTarget() {
  if (!live() || busy()) return null;
  let best = null, bd = 1e9;
  for (const m of MECHS) {
    if (!m.targets) continue;
    for (const t of m.targets(C.d[m.id], EXT.K)) {
      const d = dist(t.x, t.z);
      if (d < (t.r || REACH) && d < bd) { bd = d; best = t; }
    }
  }
  return best;
}

// ── 실패 수 (R로 다시 시작해도 남김) ──
function addFail() { if (!C.has || !C.room) return; const id = C.room.id; C.fails[id] = (C.fails[id] || 0) + 1; if (C.fails[id] >= 2) showTip(); }
function showTip() {
  const k = EXT.K, r = C.room;
  if (!r || !r.tip || k.S.tipShown) return;
  k.S.tipShown = true; k.hud.hint.textContent = $t(r.tip); k.hud.hint.classList.add('tip');
}
export const fail = addFail;

// ── 훅 ──
let solverMod = null;
export function useSolver(m) { solverMod = m; }
let wasFalling = false;
EXT.on('roomLoad', (room, k) => {
  begin(room); C.sealed = true;
  C.has = false;
  for (const m of MECHS) { if (m.load) m.load(C.d[m.id], k, room); if (m.count && m.count(C.d[m.id])) C.has = true; }
  if (C.cells.size) C.has = true;
  HUDX.spring = null; wasFalling = false;
  if (solverMod && solverMod.resetStuck) solverMod.resetStuck();
  if (C.has && (C.fails[room.id] || 0) >= 2) showTip();
  if (C.dirty) { C.dirty = false; k.buildGhosts(); }
  drawUi();
});
// 2차(11/15) 런의 모래 바닥: 이 조각을 풀려면 어제에 연달아 pastRun초쯤 있어야 한다(조각마다 chunks.js PAST_RUN).
// 모래가 바닥이면 오늘에서 3초까지만 차오르므로, 모자란 채로 들어오거나 R로 다시 하면 '풀 만큼'까지만 채운다(그 이상은 안 줌)
// 11/16 T1 2차 런의 안내 3단계(수수께끼 → 2번 실패: 조각의 hint → 4번: tip)에서 T3 조각은 hint가 곧 수수께끼라
// 2단계에 바뀌는 게 없고 tip은 4번 실패해야 나왔다(런 직접 플레이: 0.7초의 다리에서 두 번 물려도 같은 줄) → T3 조각은 2단계를 tip으로
EXT.on('roomEnter', room => {
  if (!room || !room.t1riddle || !room.t3chunk || !room.t1tip2 || !room.tip || !room.hint) return;
  if ($t(room.tip) === $t(room.hint)) room.tip = room.t1tip2;
});
export const SANDFLOOR = { on: true, mul: 1.25, add: 1, cap: 12 };
export const sandNeed = room => room && room.pastRun ? Math.min(SANDFLOOR.cap, Math.ceil(room.pastRun * SANDFLOOR.mul + SANDFLOOR.add)) : 0;
EXT.on('roomEnter', room => {
  const run = EXT.run, need = sandNeed(room);
  if (!SANDFLOOR.on || need <= 3 || !run || !run.active || !run.active() || !run.addSand) return;
  const have = run.sand();
  if (have + 0.05 < need && run.addSand(need - have, 't3-puzzle') > 0.05) {
    // R로 다시 하면 main.js의 "방을 처음부터"가 곧바로 덮으므로 조금 뒤에 띄운다
    const r = EXT.K.S.room; setTimeout(() => { if (EXT.K.S.room === r) EXT.K.toast($t('풀 만큼 모래를 채웠어요 ({0}초)', need), 2.6); }, 900);
  }
});
// 11/16 예고: T3 조각 안에서 사냥개가 처음 나를 노릴 때 · 망령이 처음 12m 안에 있을 때(망령은 늘 다가오므로 방에 들어와 0.8초 뒤면 거의 바로) 한 번(방 id마다, R로 다시 해도 반복 안 함).
// 직접 플레이: 밀물 방은 어제로 넘어가 수문을 닫고 둘러보는 3초 사이에, 망령 방은 첫 걸음에 아무 낌새 없이 맞았다
const WARNED = new Set();
function foeTells(k) {
  const r = C.room; if (!r || !r.t3chunk || C.t < 0.8) return;
  for (const f of k.extFoes) {
    if (!f.alive || f.era !== k.S.era) continue;
    let key = null, msg = null;
    if (f.kind === 't2-hound' && f.state === 'alert') { key = 'hound'; msg = $t('사냥개 — 바꾸면 0.7초 뒤 따라와요'); }
    else if (f.kind === 't2-wraith' && Math.hypot(f.x - k.S.p.x, f.z - k.S.p.z) < 12) { key = 'wraith'; msg = $t('무언가 다가와요 — 다른 시대에서 보세요'); }
    if (!key || WARNED.has(r.id + ':' + key)) continue;
    WARNED.add(r.id + ':' + key); k.toast(msg, 2.8); S3.warn({ x: f.x, z: f.z });
  }
}
EXT.on('update', (dt, k) => {
  if (!live() || !C.has) return;
  C.t += dt;
  for (const m of MECHS) if (m.update) m.update(C.d[m.id], dt, k);
  foeTells(k);
  // 2차: 내 장치 칸의 바닥이 사라지면(물이 차오름·뿌리 다리가 사라짐·바닥이 무너짐) 그 위에 서 있던 사냥개는 떨어진다.
  // 사냥개는 시대를 따라올 때만 발밑을 보므로(T2 beasts.js), 다른 시대에서 바꿔 두고 돌아오면 그대로 서 있었다
  for (const f of k.extFoes) {
    if (f.kind !== 't2-hound' || !f.alive || f.fall || f.fallT > 0 || f.follow || f.era !== k.S.era) continue;
    const i = Math.floor(f.x / 2), j = Math.floor(f.z / 2);
    if (at(f.era, i, j) && !k.floorAt(f.era, i, j)) { f.fallT = 0.001; f.fall = true; k.FX.dust(f.x, 0.2, f.z, { n: 12, color: k.FXC[f.era].dust, speed: 2, up: 1.5, size: 0.5 }); }
  }
  // 추락은 hurt 훅이 안 오므로 여기서 센다
  const f = k.S.falling > 0;
  if (f && !wasFalling) addFail();
  wasFalling = f;
  if (C.dirty) { C.dirty = false; k.buildGhosts(); }
  // 막다른 길 알아채기 (보이는 상태에서 출구까지 갈 길이 하나도 없으면 R 안내)
  // 발밑이 막 꺼진 프레임(떨어지기 직전)에는 계산을 시작하지 않는다 — 그 자리에서 "어제로 건널 수 있다"고 기억해 버려 되감긴 뒤에도 막힘을 못 알렸다(11/15)
  if (solverMod && !busy() && k.stand(k.S.era, Math.floor(k.S.p.x / 2), Math.floor(k.S.p.z / 2))) {
    const v = solverMod.stuckTick(3); // 세상이 바뀌었을 때만 다시 풀고, 한 프레임에 3ms씩만
    if (v === true && !C.stuck) { C.stuck = true; k.toast($t('길이 막혔어요 — R로 다시 시작'), 3.2); addFail(); }
    else if (v === false) C.stuck = false;
  }
});
EXT.on('frame', (dt, k) => {
  if (!live()) { if (ui) ui.el.style.display = 'none'; return; }
  for (const m of MECHS) if (m.frame) m.frame(C.d[m.id], dt, k);
  syncGhosts();
  drawUi();
});
EXT.on('shift', (from, to, k) => { if (!live() || !C.has) return; for (const m of MECHS) if (m.shift) m.shift(C.d[m.id], from, to, k); });
EXT.on('hurt', () => { if (live() && C.has) addFail(); });
EXT.on('interact', () => { if (!live() || !C.has) return undefined; const t = nearestTarget(); return t ? t.act() : undefined; });
EXT.on('prompt', () => { if (!live() || !C.has) return undefined; const t = nearestTarget(); if (!t) return undefined; return t.label() || ''; });
EXT.on('exit', () => { C.inv = { seed: 0, key: 0 }; });
// 시험용 손잡이 (tools/t3_check.py · src/ext/t3/dev.js가 씀)
window.__t3 = { C, at, nearestTarget, solver: () => solverMod, targets: () => MECHS.flatMap(m => (m.targets ? m.targets(C.d[m.id], EXT.K) : [])).map(t => ({ x: t.x, z: t.z })) };
