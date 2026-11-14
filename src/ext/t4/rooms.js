// T4 방: 보물 방(제단에서 셋 중 하나), 상점(금화로 사기), 쉼터(하트 회복 또는 유물 강화), 기억의 서고, 시험장.
// room.t4 = { type, altars: [{ type: 'treasure'|'shop'|'heart'|'rest'|'meta', at: [i, j] }], tier } 이 있는 방이면 어떤 방이든 제단을 짓는다
// (T1이 조각으로 만든 방에도 EXT.t4.decorate(room, 'shop')로 붙일 수 있다).
// T1이 없을 때: ?room=t4-treasure 로 열면 시험 런(보물 → 보초 → 시험장 → 상점 → 두 경비 → 쉼터 → 초소 → 보물 → 성채지기)이 돈다.
import { EXT } from '../../ext.js';
import { T4, give, roll, priceOf, heartPrice, addCoins, resetRun, apply, changed } from './core.js';
import { byId } from './items.js';
import { openPick, openRest, openMeta, showNear, itemCard, panel, showHud } from './ui.js';
import { loadMeta, saveMeta, runGain } from './meta.js';
import { snd } from './sfx.js';

// ───────── 시험 방 ─────────
const R = {};
R['t4-treasure'] = {
  id: 't4-treasure', name: N('보물 방'), label: 'T4', startEra: 'now',
  hint: N('제단 앞에서 E — 유물 셋 중 하나를 고르세요'),
  t4: { type: 'treasure', altars: [{ type: 'treasure', at: [5, 2] }] },
  past: ['###########', '#.........#', '#..*...*..#', '#@.......>#', '#..*...*..#', '#.........#', '###########'],
  now: ['###########', '#...,.....#', '#..*...*..#', '#@.......>#', '#..*.,.*..#', '#.,.......#', '###########'],
};
R['t4-shop'] = {
  id: 't4-shop', name: N('떠돌이 상점'), label: 'T4', startEra: 'now',
  hint: N('받침대 앞에서 E로 사요. 금화는 적을 쓰러뜨리면 생겨요'),
  t4: { type: 'shop', altars: [{ type: 'shop', at: [3, 2] }, { type: 'shop', at: [6, 2] }, { type: 'shop', at: [9, 2] }, { type: 'heart', at: [6, 5] }] },
  past: ['#############', '#...........#', '#...........#', '#@.........>#', '#...........#', '#...........#', '#############'],
  now: ['#############', '#..,........#', '#...........#', '#@.........>#', '#.......,...#', '#...........#', '#############'],
};
R['t4-rest'] = {
  id: 't4-rest', name: N('모닥불 쉼터'), label: 'T4', startEra: 'now',
  hint: N('모닥불 앞에서 E — 쉬거나 유물을 강화해요 (하나만)'),
  t4: { type: 'rest', altars: [{ type: 'rest', at: [5, 2] }] },
  past: ['###########', '#.........#', '#.........#', '#@.......>#', '#.........#', '#.........#', '###########'],
  now: ['###########', '#..,......#', '#.........#', '#@.......>#', '#......,..#', '#.........#', '###########'],
};
R['t4-meta'] = {
  id: 't4-meta', name: N('기억의 서고'), label: 'T4', startEra: 'now',
  hint: N('책상 앞에서 E — 런에서 모은 기억으로 해금해요'),
  t4: { type: 'meta', altars: [{ type: 'meta', at: [5, 2] }, { type: 'treasure', at: [3, 4] }, { type: 'rest', at: [7, 4] }] },
  past: ['###########', '#.........#', '#.........#', '#@.......>#', '#.........#', '#.........#', '###########'],
  now: ['###########', '#.........#', '#.........#', '#@.......>#', '#.........#', '#.........#', '###########'],
};
// 시험장: 유물 효과를 한 방에서 — 어제엔 경비 둘(순찰·보초)과 화살 줄·가시, 오늘엔 골렘(보초 자리를 지나감 → 겹친 순간), 두 시대 다 구덩이
R['t4-arena'] = {
  id: 't4-arena', name: N('시험장'), label: 'T4', startEra: 'now',
  hint: N('유물을 시험해 보세요: 어제엔 경비 둘, 오늘엔 골렘'),
  guards: [{ path: [[10, 1], [16, 1]], wait: 1.2 }, { path: [[13, 6]], face: -90 }],
  golems: [{ path: [[10, 6], [16, 6]], wait: 1.0 }],
  arrowPhase: () => 0,
  past: [
    '###################',
    '#.................#',
    '#.@...............#',
    '#.......***.......#',
    '#.......*.*.......#',
    '#.......***.......#',
    '#.................#',
    '#^^^^.............#',
    'A.................#',
    '#.......___......>#',
    '###################',
  ],
  now: [
    '###################',
    '#....,............#',
    '#.@...............#',
    '#.......***.......#',
    '#.......*,*....,..#',
    '#.......***.......#',
    '#.................#',
    '#^^^^.............#',
    '#.................#',
    '#.......___......>#',
    '###################',
  ],
};
for (const id in R) EXT.rooms[id] = R[id];

// 시험 런 (T1이 없을 때만): 손으로 만든 13방 몇 개를 유물을 든 채 지나간다
const MINI = ['t4-treasure', 'backtoback', 't4-arena', 't4-shop', 'pair', 't4-rest', 'outpost', 't4-treasure', 'heart'];
const roomById = id => EXT.rooms[id] || (T4.K && T4.K.ROOMS.find(r => r.id === id));
const T1on = () => !!EXT.run;

// ───────── 제단 모양 ─────────
const texCache = new Map();
function iconTex(txt, { w = 128, h = 128, font = 84, glow = '#ffd27a', bg = true } = {}) {
  const key = txt + w + h + font + glow + bg;
  if (texCache.has(key)) return texCache.get(key);
  const K = T4.K, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (bg) { const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); g.addColorStop(0, glow + 'aa'); g.addColorStop(0.45, glow + '33'); g.addColorStop(1, glow + '00'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  c.font = `${font}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = '#000'; c.shadowBlur = 8; c.fillStyle = '#fff'; c.fillText(txt, w / 2, h / 2 + font * 0.06);
  const t = new K.THREE.CanvasTexture(cv); t.colorSpace = K.THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
function sprite(tex, s, opacity = 1) { const K = T4.K; const sp = new K.THREE.Sprite(new K.THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity })); sp.scale.set(s, s * tex.image.height / tex.image.width, 1); return sp; }
const RCOL = { common: '#c9d2de', rare: '#7fe8ff', legend: '#ffd27a' };
function pedestal(era, h = 0.9, r = 0.42) {
  const K = T4.K, THREE = K.THREE, g = new THREE.Group();
  const stone = K.eraPlain(era, { color: era === 'past' ? '#8a7860' : '#5c6470', roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.18, 0.18, 16), stone); base.position.y = 0.09;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.82, h - 0.3, 14), stone); col.position.y = 0.18 + (h - 0.3) / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.08, r * 0.8, 0.14, 16), stone); top.position.y = h - 0.05;
  g.add(base, col, top);
  return g;
}
function buildAltar(a) {
  const K = T4.K, THREE = K.THREE;
  a.x = a.at[0] * K.T + 1; a.z = a.at[1] * K.T + 1; a.parts = [];
  for (const E of K.ERAS) {
    const g = new THREE.Group(); g.position.set(a.x, 0, a.z);
    if (a.type === 'rest') {
      let br = null; try { br = K.makeMesh('brazier', E); } catch (e) { br = null; }
      if (br) g.add(br); else g.add(pedestal(E, 0.6, 0.5));
      const fl = sprite(iconTex('🔥', { font: 90, glow: '#ff9e45' }), 1.3); fl.position.y = 1.35; g.add(fl); a.fire = a.fire || []; a.fire.push(fl);
      K.lightSpecs[E].push({ x: a.x, y: 1.8, z: a.z, color: '#ff9e45', I: E === 'past' ? 10 : 8, d: 9, flick: true });
    } else {
      g.add(pedestal(E));
      const icon = a.type === 'treasure' ? '🎁' : a.type === 'meta' ? '📜' : a.type === 'heart' ? '💗' : (byId(a.item) || {}).icon || '❔';
      const glow = a.type === 'shop' && byId(a.item) ? RCOL[byId(a.item).rar] : a.type === 'heart' ? '#ff6a7a' : a.type === 'meta' ? '#b8a0ff' : '#ffd27a';
      const sp = sprite(iconTex(icon, { glow }), 1.05); sp.position.y = 1.55; g.add(sp); a.icon = a.icon || []; a.icon.push(sp);
      if (a.type === 'shop' || a.type === 'heart') { const tag = sprite(iconTex('🪙' + a.price, { w: 192, h: 64, font: 46, bg: false }), 1.25); tag.position.y = 0.95; tag.position.z = 0.6; g.add(tag); a.tag = a.tag || []; a.tag.push(tag); }
      K.lightSpecs[E].push({ x: a.x, y: 1.6, z: a.z + 0.3, color: glow, I: 4, d: 5 });
    }
    K.groups[E].add(g); a.parts.push(g);
  }
  refreshAltar(a);
}
function refreshAltar(a) {
  const off = a.used || a.sold;
  for (const s of a.icon || []) { s.visible = !a.sold; s.material.opacity = off ? 0.25 : 1; }
  for (const s of a.tag || []) s.visible = !a.sold && !off;
  for (const s of a.fire || []) s.material.opacity = a.used ? 0.35 : 1;
}

// ───────── 방에 들어설 때 ─────────
let lastRoomObj = null, visit = 0, made = 0;
const stocks = new WeakMap(); // 방(이번 방문) → 상점 물건·쓴 제단
EXT.on('roomLoad', (room, K) => {
  const fresh = room !== lastRoomObj; lastRoomObj = room;
  if (fresh) visit++;
  // 시험 런 시작 (T1 없이 시험 방으로 들어오면)
  if (!T1on() && !T4.run.active && room.id.startsWith('t4-') && room.id !== 't4-meta') startMini(room);
  if (T4.run.mini && !T1on()) {
    K.hud.title.innerHTML = `${$t(room.name)}<small>${$t('시험 런 {0} / {1}', (T4.miniI || 0) + 1, MINI.length)}</small>`;
  }
  T4.altars = [];
  showNear(null);
  if (!room.t4 || !room.t4.altars) return;
  let st = stocks.get(room);
  if (!st || st.visit !== visit) { st = { visit, used: {}, items: {} }; stocks.set(room, st); }
  const tier = room.t4.tier || (EXT.run && EXT.run.floor) || 1;
  const taken = [];
  room.t4.altars.forEach((src, k) => {
    const a = { ...src, k };
    if (a.type === 'shop') {
      if (!(k in st.items)) { const id = roll(1, { tier, kinds: ['relic'], meta: loadMeta(), exclude: taken })[0] || null; st.items[k] = id; }
      a.item = st.items[k]; if (a.item) taken.push(a.item);
      a.price = priceOf(byId(a.item)); a.sold = !a.item || !!st.used[k];
    } else if (a.type === 'heart') { a.price = heartPrice(); a.sold = !!st.used[k]; }
    else a.used = !!st.used[k];
    a.st = st;
    buildAltar(a);
    T4.altars.push(a);
  });
  // 시작 유물 고르기 해금: 시험 런 첫 방에서 한 번
  if (T4.pendingStartPick) { T4.pendingStartPick = false; setTimeout(() => openPick({ ids: roll(3, { rar: ['common'], meta: loadMeta() }), title: $t('시작 유물'), sub: $t('런 사이 해금: 흔한 유물 하나를 들고 시작해요'), skipCoins: 0 }), 500); }
});
function startMini(room) {
  resetRun();
  T4.run.active = true; T4.run.mini = true; T4.miniI = Math.max(0, MINI.indexOf(room.id));
  const m = loadMeta();
  if (m.unlocked.includes('purse')) addCoins(5, 'quiet');
  if (m.unlocked.includes('reroll')) T4.rerolls = 1;
  if (m.unlocked.includes('start-pick')) T4.pendingStartPick = true;
  devGive();
  changed('run');
}
// 시험용: ?t4give=t4-ambush-sand,t4-shock-bell:2 &t4coins=30 (주소로 유물을 들고 시작)
let devDone = false;
function devGive() {
  if (devDone) return; devDone = true;
  const q = new URLSearchParams(location.search);
  for (const s of (q.get('t4give') || '').split(',').filter(Boolean)) { const [id, lv] = s.split(':'); give(id.startsWith('t4-') ? id : 't4-' + id, { lv: +lv || 1, silent: true }); }
  if (q.get('t4coins')) addCoins(+q.get('t4coins'), 'quiet');
}
EXT.on('init', () => { const q = new URLSearchParams(location.search); if (q.get('t4give') || q.get('t4coins')) setTimeout(() => { if (!T4.run.active) { devGive(); showHud(); } }, 0); });

// ───────── E: 제단 쓰기 ─────────
const nearAltar = () => {
  const K = T4.K; if (!K || !T4.altars || !T4.altars.length) return null;
  let best = null, bd = 2.0;
  for (const a of T4.altars) { const d = Math.hypot(a.x - K.S.p.x, a.z - K.S.p.z); if (d < bd) { bd = d; best = a; } }
  return best;
};
EXT.on('interact', () => {
  const a = nearAltar(); if (!a) return undefined;
  const K = T4.K, S = K.S;
  if (a.type === 'treasure') {
    if (a.used) { K.toast($t('비어 있어요'), 1.2); return 't4-empty'; }
    a.used = true; a.st.used[a.k] = true; refreshAltar(a);
    K.FX.motes(a.x, 1.4, a.z, { n: 30, color: ['#ffe9a8', '#fff'], speed: 2.2, up: 2.2, life: 1.0 });
    openPick({ tier: (S.room.t4 && S.room.t4.tier) || (EXT.run && EXT.run.floor) || 1 });
    return 't4-treasure';
  }
  if (a.type === 'shop') {
    if (a.sold) return 't4-sold';
    const it = byId(a.item); a.price = priceOf(it);
    if (T4.coins < a.price) { snd.deny(); K.toast($t('금화가 모자라요 ({0} / {1})', T4.coins, a.price), 1.6); return 't4-poor'; }
    addCoins(-a.price, 'quiet'); a.sold = true; a.st.used[a.k] = true; refreshAltar(a);
    give(a.item); snd.buy();
    K.FX.motes(a.x, 1.4, a.z, { n: 24, color: [RCOL[it.rar], '#fff'], speed: 2, up: 2, life: 0.9 });
    return 't4-buy';
  }
  if (a.type === 'heart') {
    if (a.sold) return 't4-sold';
    if (S.hearts >= K.STAT.maxHearts) { K.toast($t('하트가 가득해요'), 1.2); return 't4-full'; }
    a.price = heartPrice();
    if (T4.coins < a.price) { snd.deny(); K.toast($t('금화가 모자라요 ({0} / {1})', T4.coins, a.price), 1.6); return 't4-poor'; }
    addCoins(-a.price, 'quiet'); a.sold = true; a.st.used[a.k] = true; refreshAltar(a);
    S.hearts = Math.min(K.STAT.maxHearts, S.hearts + 1); T4.lastHearts = S.hearts; K.drawHearts(); snd.heal();
    return 't4-heart';
  }
  if (a.type === 'rest') {
    if (a.used) { K.toast($t('이미 쉬었어요'), 1.2); return 't4-rested'; }
    openRest().then(r => { if (r) { a.used = true; a.st.used[a.k] = true; refreshAltar(a); } });
    return 't4-rest';
  }
  if (a.type === 'meta') { openMeta(); return 't4-meta'; }
  return undefined;
});
EXT.on('prompt', () => {
  const a = nearAltar();
  if (!a) { showNear(null); return undefined; }
  if (a.type === 'shop' && !a.sold) {
    const it = byId(a.item); a.price = priceOf(it);
    showNear(itemCard(it) + `<div class="p">🪙 ${a.price}${T4.coins < a.price ? ' · ' + $t('금화 {0}개 가짐', T4.coins) : ''}</div>`, it.rar);
    return T4.coins >= a.price ? $t('E 사기 — 금화 {0}', a.price) : $t('금화가 모자라요 ({0} / {1})', T4.coins, a.price);
  }
  showNear(null);
  if (a.type === 'heart') return a.sold ? '' : $t('E 하트 +1 — 금화 {0}', heartPrice());
  if (a.type === 'treasure') return a.used ? '' : $t('E 제단 살피기');
  if (a.type === 'rest') return a.used ? '' : $t('E 모닥불 앞에 앉기');
  if (a.type === 'meta') return $t('E 기억의 서고');
  return '';
});
// 받침대·모닥불은 몸이 있다 (원으로 밀어냄)
EXT.on('update', (dt, K) => {
  if (!T4.altars || !T4.altars.length) return;
  const S = K.S;
  for (const a of T4.altars) {
    const dx = S.p.x - a.x, dz = S.p.z - a.z, d = Math.hypot(dx, dz), m = K.PR + (a.type === 'rest' ? 0.55 : 0.5);
    if (d < m && d > 1e-4) { S.p.x = a.x + dx / d * m; S.p.z = a.z + dz / d * m; }
    for (const s of a.icon || []) s.position.y = 1.55 + Math.sin(S.time * 2.2 + a.k) * 0.07;
    if (a.fire) for (const f of a.fire) { const k = 1 + Math.sin(S.time * 13 + a.k) * 0.06; f.scale.set(1.3 * k, 1.3 * k, 1); }
  }
});

// ───────── 시험 런 길 · 끝 ─────────
EXT.on('nextRoom', idx => {
  if (!T4.run.mini || T1on()) return undefined;
  T4.miniI = (T4.miniI || 0) + 1;
  if (T4.miniI >= MINI.length) return 'end';
  return roomById(MINI[T4.miniI]);
});
// 런 끝: 기억을 쌓는다 (T1도 부름). 돌려주는 값 = 얻은 기억
export function endRun({ won = false, floors = 0, rooms = null } = {}) {
  const m = loadMeta();
  const gain = runGain({ rooms: rooms ?? T4.run.rooms, floors, won, coins: T4.coins });
  m.memory += gain; m.total += gain; m.runs++; if (won) m.wins++; m.best = Math.max(m.best, rooms ?? T4.run.rooms);
  saveMeta(m);
  T4.run.active = false;
  return gain;
}
function overAndAgain(won, gain) {
  const K = T4.K;
  openMeta({ gain, title: won ? $t('시험 런을 끝까지 갔어요') : $t('런이 끝났어요'), sub: $t('지난 방 {0} · 쓰러뜨린 적 {1} · 남은 금화 {2}', T4.run.rooms, T4.run.kills, T4.coins), cont: $t('새 런') })
    .then(() => {
      K.hud.end.style.display = 'none'; K.S.ended = false;
      resetRun(); K.S.hearts = K.STAT.maxHearts; K.drawHearts();
      K.loadRoom(EXT.rooms['t4-treasure']);
    });
}
EXT.on('death', room => {
  if (!T4.run.mini || T1on()) return undefined;
  const gain = endRun({ won: false });
  setTimeout(() => overAndAgain(false, gain), 700);
  return 't4-over';
});
EXT.on('end', K => {
  if (!T4.run.mini || T1on()) return;
  const gain = endRun({ won: true });
  const box = document.createElement('div'); box.className = 'small';
  box.innerHTML = `<br>🧠 ${$t('기억 +{0}', gain)} · ${$t('유물 {0}개', T4.inv.length)}`;
  K.hud.endStats.appendChild(box);
  const b = document.createElement('button'); b.textContent = $t('기억의 서고 · 새 런');
  b.addEventListener('click', () => { K.hud.end.style.display = 'none'; overAndAgain(true, 0); });
  K.hud.endStats.appendChild(b);
});

// ───────── T1이 쓰는 것 ─────────
// 방 종류 → 방 데이터(새 객체). opts.tier = 층(1~), 상점 물건 희귀도에 씀
export function roomFor(type, opts = {}) {
  const src = R['t4-' + type]; if (!src) return null;
  const room = JSON.parse(JSON.stringify(src));
  room.id = 't4:' + type + ':' + (++made); room.label = opts.label ?? ''; room.t4.tier = opts.tier || 1;
  if (opts.startEra) room.startEra = opts.startEra;
  return room;
}
// T1이 만든 방에 제단을 붙인다. at = 제단 칸들(없으면 방 가운데)
export function decorate(room, type, { at = null, tier = 1 } = {}) {
  const W = room.past[0].length, H = room.past.length, mid = [Math.floor(W / 2), Math.floor(H / 2)];
  const spots = at || (type === 'shop' ? [[mid[0] - 3, mid[1] - 1], [mid[0], mid[1] - 1], [mid[0] + 3, mid[1] - 1], [mid[0], mid[1] + 2]] : [mid]);
  const kinds = type === 'shop' ? ['shop', 'shop', 'shop', 'heart'] : [type];
  room.t4 = { type, tier, altars: spots.map((p, k) => ({ type: kinds[k] || kinds[0], at: p })) };
  return room;
}
EXT.on('init', () => {
  // T1이 방 종류 등록 함수를 내보냈으면 거기에 붙는다 (없으면 시험 방으로 혼자 돈다)
  const reg = EXT.run && EXT.run.registerRoomType;
  if (typeof reg === 'function') for (const type of ['treasure', 'shop', 'rest']) { try { reg.call(EXT.run, type, { track: 't4', make: opts => roomFor(type, opts), decorate: (room, opts) => decorate(room, type, opts) }); } catch (e) { console.error('[t4] registerRoomType', e); } }
});
