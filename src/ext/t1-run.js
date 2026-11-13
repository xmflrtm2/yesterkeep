// T1 런 구조·절차 생성 — 슬롯 파일. 이 트랙의 코드는 이 파일과 src/ext/t1/ 아래에만 둔다 (docs/roguelike/BRIEF-common.md)
// 하는 일: 튜토리얼(13방) → 런. 런 = 층 3개(층마다 갈림길 지도 5줄) + 마지막 성채지기. 방은 조각(EXT.chunks + 튜토리얼 방 + T1 일반 조각)을
// 이어 붙여 만들고, 시드(?seed=)로 같은 런을 다시 만든다. 모래 = 어제에 머물 수 있는 시간. 죽으면 요약 → 런 사이 재화(기억) → 다시.
// 방과 방 사이에서 localStorage에 저장하고, 창을 다시 열면 그 방부터 이어 한다. T4에 내주는 손잡이는 EXT.run (docs/roguelike/t1.md).
import { EXT } from '../ext.js';
import './t1/en.js';
import { makeRng, newSeed } from './t1/rng.js';
import { flip, canJoin, join, vary, toRoom, reachCheck } from './t1/gen.js';
import { library, byId } from './t1/chunks.js';
import { TYPES, ROWS, genFloor, choices, mapHtml } from './t1/map.js';
import { UI, SND } from './t1/ui.js';
import { landingRoom, TEMP, FLOOR_NAME, buildAltar } from './t1/temp-rooms.js';

const KEY = { run: 'yk-run', tut: 'yk-tut', meta: 'yk-meta' };
// 층마다: 뽑을 조각 단계(tier)와 비율, 두 조각을 이어 붙일 확률, 방을 깰 때 받는 모래
export const FLOORS = [null,
  { tiers: [[1, 0.6], [2, 0.4]], join: 0.3, clear: 2.5 },
  { tiers: [[2, 0.6], [3, 0.4]], join: 0.55, clear: 2 },
  { tiers: [[3, 0.6], [4, 0.4]], join: 0.75, clear: 1.5 },
];
// 모래(초). 어제에 있으면 1초에 1(×EXT.stats.sandDrain)씩 준다. 오늘에서는 reserve까지만 천천히 차올라 갇히지 않게
// 11/13 직접 플레이(시드 123, 14방): 최대 20·처치 1.5·조각 4로는 방을 나올 때마다 거의 가득 → 모래가 고민거리가 안 됐다(상점에서 쓴 뒤에만 빠듯)
// → 최대 16, 처치 1, 조각 3, 층 보너스 5, 상점 5. 어제에서 기다리기만 하는 풀이(경비가 돌아서길 어제에서 기다림)는 바닥나게
export const SAND = { max: 16, start: 16, shard: 3, kill: 1.0, elite: 3, floorBonus: 5, reserve: 3, trickle: 0.3, enterMin: 0.35, low: 4,
  // 성채지기 방: 싸움 자체가 시대 전환이라 모래가 바닥나면 이길 길이 없었다(11/13 봇: 모래 0 → 150초 동안 4번만 맞힘, 런 끝)
  // → 이 방에서는 0.6배로 줄고, 성채지기를 맞힐 때마다 모래가 쏟아진다(+4)
  bossDrain: 0.6, bossHit: 4 };
const CHALLENGE = new Set(['combat', 'puzzle', 'elite', 'guard']);
EXT.stats.sandMax = EXT.stats.sandMax ?? SAND.max;   // T4가 늘리거나 줄인다
EXT.stats.sandDrain = EXT.stats.sandDrain ?? 1;      // T4가 바꾼다 (0.8 = 20% 느리게 줄어듦)

let K = null;
let st = null;            // 런 상태 (저장되는 것)
const R = { mode: 'tut', rows: null, cur: null, next: null, gotN: 0, killsRewarded: 0, enemies0: 0, part: -1, resumeHearts: null, lowT: 0, sandEl: null, plusT: 0, lastSand: 0, warned: {} };
const ROOMTYPES = {};     // T4: type → fn(ctx) → 방 데이터
const EXTRA_TYPES = {};   // T4가 새로 만든 지도 칸 종류 { rows, weight }

/* ───────── 저장 ───────── */
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 이번만 */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};
const tutDone = () => ls.get(KEY.tut, 0) === 1;
// 런 사이 저장 'yk-meta'는 T4(meta.js)와 같은 열쇠·같은 필드 이름(memory·runs·wins·best·total·unlocked)을 쓴다.
// T4가 있으면 기억 계산·저장은 T4 몫(EXT.t4.endRun), T1은 안 쓴다. 없으면 T1이 같은 필드로 쓰되 모르는 필드(unlocked 등)는 그대로 둔다
const T4 = () => EXT.t4 || null;
const meta = () => { const m = ls.get(KEY.meta, {}) || {}; return Object.assign(m, { memory: m.memory | 0, runs: m.runs | 0, wins: m.wins | 0, best: m.best | 0, total: m.total | 0, bestFloor: m.bestFloor | 0 }); };
function save() {
  if (!st || st.pending) return;
  st.saved = Date.now();
  if (T4() && T4().snapshot) { try { st.t4 = T4().snapshot(); } catch (e) { console.error('[T1] t4 snapshot', e); } }
  ls.set(KEY.run, st);
}
function loadSaved() { const s = ls.get(KEY.run, null); return s && s.v === 1 && s.seed && s.floor >= 1 && s.floor <= 3 ? s : null; }
// 런 방의 별 기록(yk-best)은 남기지 않는다 — main.js가 출구에서 저장한 것을 바로 지움 (튜토리얼 기록만 남게)
function cleanBest(id) { if (!id || !/^run-/.test(id)) return; const b = ls.get('yk-best', {}); if (b[id]) { delete b[id]; ls.set('yk-best', b); } }

/* ───────── 런 만들기 ───────── */
function freshState(seed) {
  return { v: 1, seed: String(seed), floor: 1, pos: { row: -1, col: 0 }, visited: [], phase: 'landing', hearts: K ? K.STAT.maxHearts : 5, sand: SAND.start,
    recipe: null, used: [], mem: 0, stats: { rooms: 0, kills: 0, time: 0, hurts: 0, sandUsed: 0, shifts: 0, deepest: 1 }, t4: {}, started: Date.now() };
}
const sandMax = () => Math.max(1, (EXT.stats.sandMax || SAND.max) * (EXT.stats.sandMul ?? 1)); // T4 유물(모래주머니)이 sandMul을 바꾼다
function withMeta(room, m) { room.t1 = m; return room; }
function landing(floor, opts) { return withMeta(landingRoom(floor, opts), { kind: 'landing', floor }); }
function enterRun(seed, pending = false) {
  st = freshState(seed); st.pending = pending;
  R.mode = 'run'; R.rows = genFloor(st.seed, 1, EXTRA_TYPES); R.cur = null; R.next = null; R.warned = {};
  if (K) { for (const id of [...K.S.got]) if (id.startsWith('run-')) K.S.got.delete(id); }
  if (!pending) beginRun();
  return landing(1);
}
// 런이 정말 시작될 때(메뉴에서 고른 뒤 포함): 저장 + T4 런 시작(유물·금화 초기화, 해금 적용)
function beginRun() {
  st.pending = false;
  if (T4() && T4().startRun) { try { T4().startRun(); } catch (e) { console.error('[T1] t4 startRun', e); } }
  save(); EXT.emit('runStart', st);
}
function enterResume(s) {
  st = s; st.pending = false;
  if (T4() && T4().restore && s.t4) { try { T4().restore(s.t4); } catch (e) { console.error('[T1] t4 restore', e); } }
  R.mode = 'run'; R.rows = genFloor(st.seed, st.floor, EXTRA_TYPES); R.cur = null; R.next = null; R.warned = {};
  R.resumeHearts = st.hearts;
  EXT.emit('runResume', st);
  if (st.phase === 'room' && st.pos.row >= 0) {
    const node = R.rows[st.pos.row] && R.rows[st.pos.row][st.pos.col];
    if (node) { try { return buildNodeRoom(node, true); } catch (e) { console.error('[T1] resume build', e); } }
  }
  return landing(st.floor, { label: N('이어하기'), hint: st.phase === 'map' || st.pos.row >= 0 ? N('출구로 가면 지도가 열려요 — 고르던 곳부터') : undefined });
}

/* ───────── 방 만들기 ───────── */
const tierW = (ct, want) => [1, 0.45, 0.08][Math.abs((ct || 1) - want)] || 0;
function pickPool(lib, wantTags, tier, used, prefer) {
  const pool = lib.filter(c => !c.hasBoss && !c.tags.includes('link') && c.tags.some(t => wantTags.includes(t)));
  return { pool, w: c => (c.weight || 1) * tierW(c.tier, tier) * (used.includes(c.id) ? 0.12 : 1) * (prefer && c.tags.includes(prefer) ? 3 : 1) };
}
function genRecipe(type, rng, floor) {
  const F = FLOORS[floor], lib = library(EXT);
  let tier = rng.weighted(F.tiers, x => x[1])[0];
  const strong = type === 'elite' || type === 'guard';
  if (strong) tier = Math.min(4, tier + 1);
  const wantA = type === 'puzzle' ? ['puzzle'] : ['combat', 'elite'];
  const { pool, w } = pickPool(lib, wantA, tier, st.used, strong ? 'elite' : type === 'puzzle' ? 'puzzle' : 'combat');
  if (!pool.length) return null;
  const A = rng.weighted(pool, w);
  const fa = A.flip !== false && rng.chance(0.5);
  const rec = { a: A.id, fa, b: null, fb: false, dir: null, tier, type };
  const joinP = type === 'guard' ? 1 : F.join + (type === 'elite' ? 0.35 : 0);
  if (A.join !== false && rng.chance(joinP)) {
    const wantB = type === 'puzzle' ? ['puzzle', 'combat'] : ['combat', 'puzzle', 'elite'];
    const pb = pickPool(lib, wantB, tier, [...st.used, A.id], type === 'puzzle' ? 'puzzle' : 'combat');
    const cands = pb.pool.filter(c => c.id !== A.id && c.join !== false);
    const order = [];
    const left = cands.slice();
    while (left.length && order.length < 14) { const c = rng.weighted(left, pb.w); order.push(c); left.splice(left.indexOf(c), 1); }
    // 뒤집은 A가 이어 붙일 수 없으면 안 뒤집은 쪽으로도 (11/13: 1층 문지기가 뒤집힌 "좁은 회랑" 하나뿐이라 너무 작았다)
    const fas = A.flip !== false ? [fa, !fa] : [false];
    outer: for (const fa2 of fas) { const a = fa2 ? flip(A) : A; for (const B of order) for (const fb of rng.shuffle(B.flip !== false ? [false, true] : [false])) for (const dir of rng.shuffle(['E', 'N'])) {
      if (canJoin(a, fb ? flip(B) : B, dir)) { rec.fa = fa2; rec.b = B.id; rec.fb = fb; rec.dir = dir; break outer; }
    } }
  }
  return rec;
}
function fromRecipe(rec, vrng) {
  const A = byId(EXT, rec.a); if (!A) return null;
  let c = rec.fa ? flip(A) : A, name = $t(A.name || A.id);
  const B = rec.b && byId(EXT, rec.b);
  if (B) { const b = rec.fb ? flip(B) : B; if (canJoin(c, b, rec.dir)) { c = join(c, b, rec.dir); name += ' · ' + $t(B.name || B.id); } }
  return { c: vary(c, vrng, rec.tier), name };
}
function buildNodeRoom(node, resume = false) {
  const f = st.floor;
  const m = { kind: 'node', floor: f, row: node.row, col: node.col, type: node.type };
  const id = `run-${st.seed}-${f}-${node.row}-${node.col}`;
  const label = $t('{0}층 · {1}', f, `${node.row + 1}/${ROWS}`) + ' · ' + $t(typeMeta(node.type).name);
  const ctx = { floor: f, row: node.row, col: node.col, type: node.type, seed: st.seed, rng: makeRng(st.seed, 'type', f, node.row, node.col), K, state: st, temp: TEMP[node.type] };
  let room = null;
  if (node.type === 'boss') {
    const heart = K.ROOMS.find(r => r.id === 'heart');
    room = { ...heart, id: 'run-heart', label };
  } else if (ROOMTYPES[node.type] || TEMP[node.type]) {
    const rt = ROOMTYPES[node.type];
    try { room = rt ? (typeof rt === 'function' ? rt(ctx) : rt.make({ tier: f, label, floor: f, rng: ctx.rng, seed: st.seed })) : TEMP[node.type](ctx); } catch (e) { console.error('[T1] room type', node.type, e); }
    if (!room && TEMP[node.type]) room = TEMP[node.type](ctx);
    if (room && !room.past && room.room) room = room.room;
    if (room && room.start && room.exit && !room.past.some(r => r.includes('@'))) room = toRoom({ ...room, w: room.past[0].length, h: room.past.length, parts: [], shards: room.shards || [] }, {});
    room = { ...room, id, label };
  } else {
    let rec = resume && st.recipe && st.recipe.a ? st.recipe : null;
    if (!rec) rec = genRecipe(node.type === 'guard' ? 'guard' : node.type, makeRng(st.seed, 'room', f, node.row, node.col), f);
    const vr = () => makeRng(st.seed, 'vary', f, node.row, node.col);
    let built = rec && fromRecipe(rec, vr());
    if (built) {
      const r = toRoom(built.c, { id, name: built.name, label });
      const chk = reachCheck(r);
      if (!chk.ok) { // 이어 붙인 게 안 풀리면 첫 조각만
        console.warn('[T1] generated room failed reach check, using first chunk', rec, chk.why);
        rec = { ...rec, b: null }; built = fromRecipe(rec, vr());
      }
    }
    if (!built) { rec = { a: 't1-sentry', fa: false, b: null, tier: 1, type: node.type }; built = fromRecipe(rec, vr()); }
    room = toRoom(built.c, { id, name: built.name, label });
    st.recipe = rec;
    if (!resume) { st.used.push(rec.a); if (rec.b) st.used.push(rec.b); }
  }
  return withMeta(room, m);
}
export function typeMeta(type) { return TYPES[type] || { icon: '?', name: type, desc: '', color: '#ccc' }; }

/* ───────── 모래 ───────── */
function addSand(n, why) {
  if (!st) return 0;
  const before = st.sand;
  st.sand = Math.max(0, Math.min(sandMax(), st.sand + n));
  const got = st.sand - before;
  if (got > 0.05 && R.sandEl) { const p = R.sandEl.querySelector('.plus'); p.textContent = '+' + (Math.round(got * 10) / 10); p.style.opacity = 1; R.plusT = 1.4; if (K && why !== 'quiet') SND.sand(K); }
  EXT.emit('sand', got, why, st);
  return got;
}
const doShift = () => (K.tryShift ? K.tryShift() : window.__yk ? window.__yk.shift() : 'busy');
function nearestStand(era) {
  const S = K.S, ci = K.cellOf(S.p.x), cj = K.cellOf(S.p.z);
  let best = null, bd = 1e9;
  for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) {
    if (!K.stand(era, i, j)) continue;
    const x = i * K.T + 1, z = j * K.T + 1, d = Math.hypot(x - S.p.x, z - S.p.z);
    if (d < bd) { bd = d; best = [x, z]; }
  }
  return best;
}
// 모래가 다 떨어지면 오늘로 끌려온다. 그 자리가 오늘 막혀 있으면 가장 가까운 오늘 바닥으로 밀려난 뒤. 오늘 구덩이 위면 떨어진다(main.js가 처리)
function forceToday() {
  const S = K.S;
  if (S.era !== 'past') return;
  let r = doShift();
  if (r === 'blocked') { const p = nearestStand('now'); if (p) { S.p.x = p[0]; S.p.z = p[1]; S.shiftCd = 0; r = doShift(); } }
  if (r === 'ok' || r === 'fall') { K.toast($t('모래가 다 떨어졌어요 — 오늘로 끌려왔어요'), 2.2); SND.empty(K); EXT.emit('sandOut', st); }
}
function drawSand(dt) {
  const el = R.sandEl; if (!el || !st) return;
  const S = K.S, mx = sandMax(), v = st.sand;
  el.querySelector('.bar i').style.width = (100 * v / mx).toFixed(1) + '%';
  el.querySelector('.bar u').style.left = (100 * SAND.reserve / mx).toFixed(1) + '%';
  el.querySelector('.n').textContent = $t('{0}초', v.toFixed(1));
  const node = R.cur && R.cur.t1 && R.cur.t1.kind === 'node';
  el.classList.toggle('drain', node && S.era === 'past');
  el.classList.toggle('low', node && S.era === 'past' && v < SAND.low && v > 0);
  el.classList.toggle('empty', v < SAND.enterMin);
  if (R.plusT > 0) { R.plusT -= dt; if (R.plusT <= 0) el.querySelector('.plus').style.opacity = 0; }
}
function setRunUI(on) { document.body.classList.toggle('t1run', !!on); }

/* ───────── 화면: 시작 메뉴 · 지도 · 요약 ───────── */
function metaLine() { const M = meta(); return M.runs ? $t('기억 {0} · 런 {1}번 · 가장 깊이 {2}층 · 성공 {3}번', M.memory, M.runs, M.bestFloor, M.wins) : $t('기억 {0}', M.memory); }
function showMenu() {
  const saved = st && !st.pending;
  const where = saved ? (st.phase === 'room' && st.pos.row >= 0 ? $t('{0}층 · {1}번째 방', st.floor, st.pos.row + 1) : $t('{0}층 입구', st.floor)) : '';
  const html = `<div class="t1-h">${$t('어제의 성채')}</div>
    <div class="t1-sub">${$t('매번 달라지는 성채를 세 층 내려가 성채지기를 쓰러뜨리세요.')}<br>${$t('하트는 방을 지나도 그대로, 모래는 어제에 머물 시간이에요.')}</div>
    <div class="t1-btns">
      ${saved ? `<button class="t1-btn main" data-k="cont">${$t('이어하기')}<small>${where} · ♥ ${st.hearts} · ⌛ ${st.sand.toFixed(0)}</small></button>` : ''}
      <button class="t1-btn ${saved ? '' : 'main'}" data-k="new">${$t('새 런')}${saved ? `<small>${$t('지금 런은 사라져요')}</small>` : ''}</button>
      <button class="t1-btn" data-k="tut">${$t('튜토리얼 다시 하기')}<small>${$t('13개 방 + 성채지기')}</small></button>
    </div>
    <div class="t1-meta">${metaLine()}</div>
    <div class="t1-small">${$t('Shift/L 시대 전환 · WASD 이동 · J 찌르기 · Space 구르기 · E 상호작용')}<br>${$t('Shift를 연달아 눌러 윈도우 고정키 창이 뜨면 \'아니요\'를 누르세요. Shift 대신 L로도 시대를 바꿀 수 있어요.')}</div>`;
  let sure = false;
  UI.show(html, (k, el) => {
    if (k === 'cont') { UI.close(); return; }
    if (k === 'new') {
      // 이어할 런이 있으면 한 번 더 눌러야 새로 시작 ("클릭해서 시작"을 누른 자리가 바로 이 단추라 실수로 런을 날릴 뻔했다 — 11/13 직접 플레이)
      if (saved && !sure) { sure = true; el.innerHTML = `${$t('새 런')}<small>${$t('한 번 더 누르면 지금 런을 버리고 새로 시작해요')}</small>`; SND.deny(K); return; }
      startRoomNow(enterRun(newSeed())); return;
    }
    if (k === 'tut') { startTutorial(); }
  }, { cls: 'menu' });
}
function startRoomNow(room) {
  UI.close(true);
  const S = K.S;
  S.down = null; K.hud.down.style.opacity = 0; S.trans = null; K.hud.fade.style.opacity = 0; S.falling = 0; S.py = 0; S.ended = false; K.hud.end.style.display = 'none';
  S.hearts = K.STAT.maxHearts;
  if (st) st.hearts = S.hearts;
  K.loadRoom(room);
  K.freeze(false);
}
function startTutorial() {
  UI.close(true);
  R.mode = 'tut'; R.cur = null; setRunUI(false);
  const S = K.S;
  for (const id of [...S.got]) if (id.startsWith('run-')) S.got.delete(id);
  S.down = null; K.hud.down.style.opacity = 0; S.trans = null; K.hud.fade.style.opacity = 0; S.ended = false; K.hud.end.style.display = 'none';
  S.hearts = K.STAT.maxHearts; S.shifts = 0; S.falls = 0; S.blocked = 0; S.time = 0; S.hurts = 0; S.kills = 0; S.runPast = 0; S.runStars = 0; S.runAlarms = 0;
  st = null; // 저장된 런은 그대로 둔다 — 다음에 메뉴에서 이어할 수 있게
  K.loadRoom(0);
  K.freeze(false);
}
function openMap() {
  st.phase = 'map'; st.hearts = K.S.hearts; save();
  const can = choices(R.rows, st.pos);
  EXT.emit('mapOpen', can, st);
  const here = st.pos.row >= 0 ? st.pos : null;
  const html = `<div class="t1-h">${$t(FLOOR_NAME[st.floor])}</div>
    <div class="t1-bar"><span class="h">♥ ${K.S.hearts} / ${K.STAT.maxHearts}</span><span class="s">⌛ ${$t('{0}초', st.sand.toFixed(1))} / ${sandMax()}</span>${T4() ? '' : `<span class="m">✧ ${$t('기억')} ${st.mem}</span>`}</div>
    ${mapHtml(R.rows, st.visited, can, here, typeMeta)}
    <div class="t1-info"></div>
    <div class="t1-small">${$t('←/→ 고르기 · Enter 들어가기 · 아래에서 위로, 맨 위가 이 층의 끝')}</div>`;
  const ov = UI.show(html, k => pickNode(k), {
    cls: 'map',
    order: (a, b) => parseFloat(a.style.left) - parseFloat(b.style.left),
    onSel: el => { const [r, c] = el.dataset.k.split(',').map(Number), n = R.rows[r][c], tm = typeMeta(n.type); const box = UI.ov && UI.ov.querySelector('.t1-info'); if (box) box.innerHTML = `<b style="color:${tm.color}">${tm.icon} ${$t(tm.name)}</b><br>${$t(tm.desc)}`; },
  });
  return ov;
}
function pickNode(k) {
  const [r, c] = k.split(',').map(Number);
  const node = R.rows[r] && R.rows[r][c];
  if (!node) return;
  st.pos = { row: r, col: c };
  R.next = buildNodeRoom(node);
  st.phase = 'room'; save();
  SND.pick(K);
  EXT.emit('roomPick', node, st);
  UI.close();
}
function endRun(result) {
  if (!st) return;
  const won = result === 'win';
  if (won) st.mem += 10;
  ls.del(KEY.run);
  const old = st, seed = st.seed, t4 = T4();
  // 기억(런 사이 재화): T4가 있으면 T4의 계산(지난 방 + 층×3 + 이기면 10 + 금화÷4)과 저장을 쓴다
  let gain = null;
  if (t4 && t4.endRun) { try { gain = t4.endRun({ won, floors: won ? 3 : old.floor - 1, rooms: old.stats.rooms }); } catch (e) { console.error('[T1] t4 endRun', e); gain = null; } }
  const M = meta();
  if (gain == null) { gain = old.mem; M.memory += gain; M.total += gain; M.runs++; if (won) M.wins++; }
  M.bestFloor = Math.max(M.bestFloor, old.floor);
  ls.set(KEY.meta, M);
  EXT.emit('runEnd', result, old);
  (won ? SND.win : SND.dead)(K);
  const t = Math.floor(old.stats.time), mm = Math.floor(t / 60), ss = t % 60;
  const row = (a, b) => `<b>${a}</b><span>${b}</span>`;
  const html = `<div class="t1-h">${result === 'win' ? $t('성채지기를 쓰러뜨렸어요!') : $t('성채에 쓰러졌어요')}</div>
    <div class="t1-sub">${result === 'win' ? $t('세 층을 지나 성채의 심장까지. 성채의 어제가 멈췄어요.') : $t('{0}에서 시간이 멈췄어요.', $t(FLOOR_NAME[old.floor]))}</div>
    <div class="t1-stats">
      ${row($t('내려간 층'), $t('{0}층', old.floor))}${row($t('지난 방'), old.stats.rooms)}${row($t('쓰러뜨린 적'), old.stats.kills)}
      ${row($t('맞은 횟수'), old.stats.hurts)}${row($t('어제에서 쓴 모래'), $t('{0}초', old.stats.sandUsed.toFixed(1)))}${row($t('걸린 시간'), $t('{0}분 {1}초', mm, ss))}
    </div>
    <div class="t1-meta">✧ ${$t('기억 +{0}', gain)} → ${$t('모두 {0}', M.memory)}</div>
    <div class="t1-small">${$t('기억은 런이 끝나도 남아요.')} · ${$t('시드 {0}', seed)}</div>
    <div class="t1-slot"></div>
    <div class="t1-btns">
      <button class="t1-btn main" data-k="new">${$t('새 런')}</button>
      <button class="t1-btn" data-k="same">${$t('같은 시드로 다시')}<small>${$t('시드 {0}', seed)}</small></button>
      ${t4 && t4.openMeta ? `<button class="t1-btn" data-k="meta">${$t('기억의 서고')}<small>${$t('기억으로 새 유물·해금')}</small></button>` : ''}
      <button class="t1-btn" data-k="tut">${$t('튜토리얼 다시 하기')}</button>
    </div>`;
  st = null;
  setRunUI(false);
  const ov = UI.show(html, k => {
    if (k === 'tut') return startTutorial();
    if (k === 'meta') { // T4 해금 창 → 닫으면 새 런
      UI.close(true);
      Promise.resolve(t4.openMeta({ gain: 0, cont: $t('새 런') })).catch(e => console.error(e)).then(() => startRoomNow(enterRun(newSeed())));
      return;
    }
    startRoomNow(enterRun(k === 'same' ? seed : newSeed()));
  }, { cls: 'summary' });
  try { EXT.emit('runSummary', ov.querySelector('.t1-slot'), { result, state: old, meta: M, gain }); } catch (e) { console.error(e); }
}

/* ───────── 제단 (임시 상점·쉼터) ───────── */
let altar = null;
const nearAltar = () => altar && altar.left > 0 && Math.hypot(K.S.p.x - altar.x, K.S.p.z - altar.z) < 2.1 && !K.S.trans;
const SHOP_COST = 5;
function useAltar() {
  const S = K.S;
  if (altar.kind === 'shop') {
    if (S.hearts >= K.STAT.maxHearts) { K.toast($t('하트가 가득해요')); SND.deny(K); return true; }
    if (st.sand < SHOP_COST) { K.toast($t('모래가 모자라요 ({0}초 필요)', SHOP_COST)); SND.deny(K); return true; }
    st.sand -= SHOP_COST; S.hearts++; altar.left--; K.drawHearts(); SND.heal(K);
    K.toast($t('하트 +1 (모래 -{0})', SHOP_COST));
  } else {
    const h0 = S.hearts; S.hearts = Math.min(K.STAT.maxHearts, S.hearts + 2); st.sand = sandMax(); altar.left--; K.drawHearts(); SND.heal(K);
    K.toast($t('쉬었어요 — 하트 +{0}, 모래 가득', S.hearts - h0));
    K.FX.motes(altar.x, 0.8, altar.z, { n: 30, color: ['#ffb35a', '#fff0c0'], speed: 2, up: 2.2, life: 1.2, spread: 0.6 });
  }
  if (altar.left <= 0 && altar.orb) altar.orb.material.emissiveIntensity = 0.15;
  st.altar = st.altar || {}; st.altar[R.cur.id] = altar.left; save();
  return true;
}

/* ───────── 훅 ───────── */
EXT.on('init', k => {
  K = k;
  UI.init(K);
  const el = document.createElement('div');
  el.className = 't1-sand';
  el.innerHTML = '<span class="gl">⌛</span><div class="bar"><i></i><u></u></div><span class="n"></span><span class="plus"></span>';
  document.getElementById('ext').appendChild(el);
  R.sandEl = el;
});
EXT.on('startRoom', () => {
  const q = new URLSearchParams(location.search);
  const seedQ = q.get('seed');
  const saved = loadSaved();
  if (seedQ) {
    if (saved && saved.seed === seedQ && !q.has('fresh')) return enterResume(saved);
    return enterRun(seedQ);
  }
  if (q.has('tutorial')) { R.mode = 'tut'; return undefined; }
  if (saved) { const room = enterResume(saved); showMenu(); return room; }
  if (tutDone()) { const room = enterRun(newSeed(), true); showMenu(); return room; }
  R.mode = 'tut';
  return undefined;
});
EXT.on('roomLoad', room => {
  const m = room.t1;
  altar = null;
  if (!m || R.mode !== 'run' || !st) { setRunUI(false); R.cur = null; return; }
  setRunUI(true);
  const S = K.S;
  const restart = R.cur && R.cur.id === room.id;
  R.cur = room; R.part = -1; R.gotN = S.got.size; R.bossHp = null;
  if (!restart) { R.killsRewarded = 0; R.enemies0 = K.enemies().filter(e => !e.optional).length; }
  if (R.resumeHearts != null && !room.boss) { S.hearts = Math.max(1, Math.min(R.resumeHearts, K.STAT.maxHearts)); K.drawHearts(); }
  R.resumeHearts = null;
  if (room.t1altar) { altar = buildAltar(K, { ...room.t1altar }); const used = st.altar && st.altar[room.id]; if (used != null) altar.left = used; if (altar.left <= 0) altar.orb.material.emissiveIntensity = 0.15; }
  if (!st.pending) {
    if (m.kind === 'landing') { st.phase = st.pos.row >= 0 ? 'map' : 'landing'; }
    else st.phase = 'room';
    st.hearts = S.hearts; st.stats.deepest = Math.max(st.stats.deepest, st.floor);
    save();
  }
  if (m.kind === 'landing' && m.floor > 1 && !restart && !R.warned['f' + m.floor]) { R.warned['f' + m.floor] = 1; SND.floor(K); }
  EXT.emit('roomEnter', room, m, st);
});
EXT.on('update', dt => {
  if (UI.open || R.waiting) { K.freeze(true); const tr = K.S.trans; if (tr && !tr.loaded) tr.t = Math.min(tr.t, 0.3); return; }
  if (R.mode !== 'run' || !R.cur || !st) return;
  const S = K.S, m = R.cur.t1;
  st.stats.time += dt;
  if (S.got.size > R.gotN) { // main.js의 "모래시계 조각 n / 튜토리얼 합계" 알림 대신 (런에서는 그 합계가 틀림)
    const got = addSand(SAND.shard * (S.got.size - R.gotN), 'shard'); R.gotN = S.got.size;
    K.toast($t('모래시계 조각 — 모래 +{0}초', (Math.round(got * 10) / 10)), 1.6);
  }
  const boss = R.cur.boss && K.bosses[0];
  if (boss) { if (R.bossHp != null && boss.hp < R.bossHp) { addSand(SAND.bossHit * (R.bossHp - boss.hp), 'boss'); } R.bossHp = boss.hp; } else R.bossHp = null;
  if (m.kind === 'node' && !S.trans && !S.down && S.falling <= 0) {
    if (S.era === 'past') {
      const d = dt * (EXT.stats.sandDrain ?? 1) * (R.cur.boss ? SAND.bossDrain : 1);
      st.sand = Math.max(0, st.sand - d); st.stats.sandUsed += d;
      if (st.sand < SAND.low && st.sand > 0) { R.lowT -= dt; if (R.lowT <= 0) { R.lowT = st.sand < 2 ? 0.25 : 0.5; SND.low(K); } }
      if (st.sand <= 0) forceToday();
    } else if (st.sand < SAND.reserve) st.sand = Math.min(SAND.reserve, st.sand + SAND.trickle * dt);
  }
  // 이어 붙인 방: 지금 있는 조각의 안내로 바꾼다 (두 번 실패하면 그 조각의 tip)
  const parts = R.cur.t1parts;
  if (parts && parts.length > 1) {
    const ci = K.cellOf(S.p.x), cj = K.cellOf(S.p.z);
    const k = parts.findIndex(p => ci >= p.x && ci < p.x + p.w && cj >= p.y && cj < p.y + p.h);
    if (k >= 0 && k !== R.part) {
      const first = R.part < 0; R.part = k; const p = parts[k];
      if (!first && p.hint) { S.room.hint = p.hint; S.room.tip = p.tip; S.room.gateTip = p.gateTip || S.room.gateTip; S.tipShown = false; S.roomFails = 0; K.hud.hint.textContent = $t(p.hint); K.hud.hint.classList.remove('tip'); }
    }
  }
});
EXT.on('frame', dt => { if (R.mode === 'run' && st) drawSand(dt); if (altar && altar.spin) altar.spin(dt); });
// 제단 칸은 두 시대 모두 막힘 (위에 올라서지 않게)
EXT.solidAt.push((era, i, j) => (altar && i === altar.i && j === altar.j ? true : undefined));
// 모래가 없으면 어제로 못 간다 (키를 먹는다 — 오늘에서는 reserve까지 천천히 차오름)
addEventListener('keydown', e => {
  if (!K || UI.open || R.mode !== 'run' || !st || !R.cur || R.cur.t1.kind !== 'node') return;
  const S = K.S; if (S.hold || e.repeat) return;
  const code = e.code || (e.key === 'Shift' ? 'ShiftLeft' : (e.key || '').toLowerCase() === 'l' ? 'KeyL' : '');
  if (code !== 'ShiftLeft' && code !== 'ShiftRight' && code !== 'KeyL') return;
  if (S.era === 'now' && st.sand < SAND.enterMin) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (S.shiftCd <= 0) { K.toast($t('모래가 없어요 — 오늘에 있으면 조금씩 차올라요')); SND.deny(K); S.shiftCd = 0.25; }
  }
}, true);
EXT.on('exit', room => {
  cleanBest(room.id);
  if (R.mode !== 'run' || !st || !room.t1) return;
  const m = room.t1, S = K.S;
  if (m.kind === 'node') {
    st.stats.rooms++;
    st.visited.push([m.row, m.col]);
    if (CHALLENGE.has(m.type)) addSand(FLOORS[st.floor].clear + (m.type === 'elite' || m.type === 'guard' ? SAND.elite : 0), 'clear');
    st.mem += m.type === 'guard' ? 3 : m.type === 'elite' ? 2 : CHALLENGE.has(m.type) ? 1 : 0;
    EXT.emit('roomClear', room, m, st);
    if (m.type === 'boss') { endRun('win'); return; }
    if (m.type === 'guard') {
      st.floor++; st.pos = { row: -1, col: 0 }; st.visited = []; st.phase = 'landing'; st.recipe = null;
      R.rows = genFloor(st.seed, st.floor, EXTRA_TYPES);
      addSand(SAND.floorBonus, 'floor');
      S.hearts = Math.min(K.STAT.maxHearts, S.hearts + 1); K.drawHearts();
      st.hearts = S.hearts;
      R.next = landing(st.floor);
      save();
      EXT.emit('floorStart', st.floor, st);
      reward(m, null);
      return;
    }
    if (m.type === 'elite') { reward(m, openMap); return; }
  }
  openMap();
});
// 정예·문지기 보상: T4가 있으면 유물·축복 셋 중 하나 고르기 창(EXT.t4.openPick → Promise). 그동안 세상은 멈춘다(R.waiting)
function reward(m, then) {
  const t4 = T4();
  if (!t4 || !t4.openPick) { if (then) then(); return; }
  R.waiting = true; K.freeze(true);
  const done = () => { R.waiting = false; save(); if (then) then(); else K.freeze(false); };
  try { Promise.resolve(t4.openPick({ count: 3, tier: st.floor, title: m.type === 'guard' ? $t('문지기를 넘었어요 — 하나를 고르세요') : $t('정예를 쓰러뜨렸어요 — 하나를 고르세요') })).catch(e => console.error('[T1] t4 openPick', e)).then(done); } catch (e) { console.error(e); done(); }
}
EXT.on('nextRoom', () => {
  if (R.mode !== 'run' || !st) return undefined;
  const r = R.next; R.next = null;
  return r || landing(st.floor, { label: N('이어하기') });
});
EXT.on('death', () => {
  if (R.mode !== 'run' || !st || st.pending) return undefined;
  endRun('dead');
  return true;
});
EXT.on('hurt', () => { if (R.mode === 'run' && st) st.stats.hurts++; });
EXT.on('shift', () => { if (R.mode === 'run' && st) st.stats.shifts++; });
EXT.on('kill', foe => {
  if (R.mode !== 'run' || !st || !R.cur || R.cur.t1.kind !== 'node') return;
  st.stats.kills++;
  if (R.killsRewarded < R.enemies0) { R.killsRewarded++; addSand(SAND.kill, 'kill'); }
});
EXT.on('prompt', () => {
  if (!altar || !nearAltar()) return undefined;
  return altar.kind === 'shop' ? $t('E 하트 1개 사기 (모래 {0}초) · 남은 {1}번', SHOP_COST, altar.left) : $t('E 모닥불에서 쉬기 (하트 +2, 모래 가득)');
});
EXT.on('interact', () => (altar && nearAltar() ? useAltar() : undefined));
// 튜토리얼 끝: 깼다고 기억하고, 끝 화면에 "런 시작"
EXT.on('end', () => {
  if (R.mode === 'run') return;
  ls.set(KEY.tut, 1);
  const inner = document.querySelector('#endCard .inner');
  if (!inner) return;
  const old = inner.querySelector('.t1-endrun'); if (old) old.remove();
  const box = document.createElement('div');
  box.className = 't1-endrun';
  box.innerHTML = `<div>${$t('튜토리얼 끝! 이제 매번 달라지는 성채를 세 층 내려가요.')}</div><button class="t1-btn">${$t('런 시작')}</button>`;
  const stats = document.getElementById('endStats');
  inner.insertBefore(box, stats ? stats.nextSibling : null);
  box.querySelector('button').addEventListener('click', () => startRoomNow(enterRun(newSeed())));
});

/* ───────── T4에 내주는 손잡이 (docs/roguelike/t1.md) ───────── */
EXT.run = {
  get state() { return st; },
  active: () => R.mode === 'run' && !!st && !st.pending,
  sand: () => (st ? st.sand : 0),
  sandMax,
  addSand: (n, why = 'item') => addSand(n, why),
  setSand(v) { if (st) st.sand = Math.max(0, Math.min(sandMax(), v)); },
  get floor() { return st ? st.floor : 0; }, // 숫자 (T4 rooms.js가 EXT.run.floor를 값으로 씀)
  seed: () => (st ? st.seed : null),
  node: () => (R.cur && R.cur.t1) || null,
  map: () => R.rows,
  rng: (...tags) => makeRng(st ? st.seed : 'none', 't4', ...tags),
  heal(n = 1) { const S = K.S; const h0 = S.hearts; S.hearts = Math.min(K.STAT.maxHearts, S.hearts + n); K.drawHearts(); return S.hearts - h0; },
  // fn = (ctx) => 방 데이터, 또는 T4 꼴 { track, make(opts) → 방 데이터, decorate(room, opts) }
  registerRoomType(type, fn, m) {
    ROOMTYPES[type] = fn;
    if (fn && typeof fn === 'object' && !m && fn.meta) m = fn.meta;
    if (m) { TYPES[type] = { ...(TYPES[type] || { icon: '?', name: type, desc: '', color: '#ccc' }), ...m }; if (m.rows && !['treasure', 'shop', 'rest', 'combat', 'puzzle', 'elite', 'guard', 'boss'].includes(type)) EXTRA_TYPES[type] = { rows: m.rows, weight: m.weight ?? 1 }; }
  },
  meta: { get: meta, add(n) { const M = meta(); M.memory += n; ls.set(KEY.meta, M); return M.memory; }, spend(n) { const M = meta(); if (M.memory < n) return false; M.memory -= n; ls.set(KEY.meta, M); return true; } },
  save,
  start(seed) { startRoomNow(enterRun(seed || newSeed())); },
  types: TYPES, FLOORS, SAND, ROWS,
  // 시험용
  _dev: {
    R, library: () => library(EXT), buildNodeRoom, genFloor, openMap, endRun, showMenu, typeMeta, addSand,
    // 시험용: 런을 시작(또는 지금 런에서) f층의 type 칸으로 바로 간다. 예) __yk.ext.run._dev.jump(3, 'boss')
    jump(floor = 1, type = 'combat', seed) {
      if (!st || seed) { enterRun(seed || newSeed()); }
      UI.close(true);
      st.floor = floor; R.rows = genFloor(st.seed, floor, EXTRA_TYPES);
      const node = R.rows.flat().find(n => n.type === type) || { type, row: type === 'boss' || type === 'guard' ? 4 : 1, col: 0 };
      st.pos = { row: node.row, col: node.col };
      startRoomNow(buildNodeRoom(node));
      return K.S.room.id;
    },
    // 시드 여러 개로 세 층의 모든 칸을 만들어 보고 대강의 풀림 검사 (런 상태는 그대로 돌려놓음)
    sweep(seeds = 20, load = false) {
      const keep = st, out = { rooms: 0, joined: 0, fail: [], chunks: {}, types: {}, sizes: [] };
      for (let s = 1; s <= seeds; s++) {
        st = freshState('sw' + s);
        for (let f = 1; f <= 3; f++) {
          st.floor = f;
          const rows = genFloor(st.seed, f, EXTRA_TYPES);
          for (let r = 0; r < rows.length - 1; r++) for (const n of rows[r]) { if (rows[r + 1].length > 1) { out.decisions = (out.decisions || 0) + 1; out.choiceSum = (out.choiceSum || 0) + n.next.length; if (n.next.length < 2) out.oneWay = (out.oneWay || 0) + 1; } }
          for (const row of rows) for (const node of row) {
            const room = buildNodeRoom(node);
            if (node.type === 'guard' && !st.recipe.b) out.guardSingle = (out.guardSingle || 0) + 1;
            out.rooms++; out.types[node.type] = (out.types[node.type] || 0) + 1;
            if (st.recipe && node.type !== 'boss') { out.chunks[st.recipe.a] = (out.chunks[st.recipe.a] || 0) + 1; if (st.recipe.b) { out.joined++; out.chunks[st.recipe.b] = (out.chunks[st.recipe.b] || 0) + 1; } }
            const chk = reachCheck(room);
            out.sizes.push(room.past[0].length + 'x' + room.past.length);
            if (!chk.ok) out.fail.push([room.id, room.name, chk.why]);
            // 오늘에서 시작하는 방: 골렘 순찰이 시작 칸 5m 안에 들어오면 "서서 생각만 해도 맞는" 방
            const s0 = room.now.findIndex(r => r.includes('@')), sx = s0 >= 0 ? room.now[s0].indexOf('@') : -1;
            if ((room.startEra || 'now') === 'now' && sx >= 0) for (const g of room.golems || []) for (const [i, j] of g.path || []) if (Math.hypot(i - sx, j - s0) * 2 < 5) { (out.nearStart = out.nearStart || []).push([room.name, [i, j]]); break; }
            if (load) { try { K.loadRoom(room); } catch (e) { out.fail.push([room.id, 'load', String(e)]); } }
          }
        }
      }
      st = keep;
      out.sizes = [...new Set(out.sizes)];
      return out;
    },
  },
};
// (T1 런 구조·절차 생성 슬롯 끝)
