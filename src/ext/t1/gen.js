// T1 — 조각 → 방 조립기. 조각 하나를 그대로 쓰거나, 둘을 문 하나로 이어 붙인다(동쪽 또는 북쪽).
// 바꾸는 것은 풀이가 깨지지 않는 것뿐: 좌우 뒤집기, 경비가 끝에서 쉬는 시간 ±20%, 함정 박자를 통째로 미루기(서로의 엇박은 그대로), 높은 층에서 조각이 미리 정해 둔 적 더하기.
// 좌표는 언제나 조각 안 좌표(i = 열, j = 행). 조각 꼴은 src/ext.js 맨 아래 주석 + docs/roguelike/t1.md.

const SOLID = new Set(['#', '|', '*', 'b', 'A']);
const PIT = new Set(['_', 'M', 'm']);
// 문을 내거나 지나가는 칸으로 쓸 수 있는 글자 (두 시대 모두 이것이어야 함)
const PLAIN = new Set(['.', ',', '%', '=']);

const DEF_PHASE = { spikePhase: (i) => i * 0.45, arrowPhase: (i, j) => j * 0.4, bladePhase: () => 0 }; // main.js 기본값과 같음 (조각 안 좌표로)
const PHASES = Object.keys(DEF_PHASE);
const COORD_DEFS = ['guards', 'golems', 'foes'];

const clone = o => JSON.parse(JSON.stringify(o));
const findCh = (rows, chs) => { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (chs.includes(rows[j][i])) return [i, j]; return null; };
const setCh = (rows, i, j, c) => { rows[j] = rows[j].slice(0, i) + c + rows[j].slice(i + 1); };

/** 방 데이터(rooms.js 꼴, @와 > 가 그림에 있음) 또는 조각(start/exit) → 정리된 조각 */
export function normalize(src, meta = {}) {
  const c = { ...src, ...meta };
  const past = src.past.slice(), now = src.now.slice();
  const startEra = src.startEra || 'now';
  let start = src.start ? src.start.slice() : findCh(startEra === 'past' ? past : now, '@') || findCh(past, '@') || findCh(now, '@');
  let exit = src.exit ? src.exit.slice() : findCh(past, '>') || findCh(now, '>');
  for (const rows of [past, now]) for (let j = 0; j < rows.length; j++) if (/[@>]/.test(rows[j])) rows[j] = rows[j].replace(/[@>]/g, '.');
  if (start) { if (past[start[1]][start[0]] === '#') setCh(past, start[0], start[1], '.'); if (now[start[1]][start[0]] === '#') setCh(now, start[0], start[1], '.'); }
  if (exit) { if (past[exit[1]][exit[0]] === '#') setCh(past, exit[0], exit[1], '.'); if (now[exit[1]][exit[0]] === '#') setCh(now, exit[0], exit[1], '.'); }
  c.past = past; c.now = now; c.start = start; c.exit = exit; c.startEra = startEra;
  c.w = past[0].length; c.h = past.length;
  for (const k of COORD_DEFS) c[k] = clone((meta[k] ?? src[k]) || []); // meta(T1 표)가 적 배치를 덮어쓸 수 있다 — 튜토리얼 방 자체는 그대로
  c.shards = clone(src.shards || []);
  c.extra = clone((meta.extra ?? src.extra) || []);
  for (const p of PHASES) c[p] = src[p] || DEF_PHASE[p];
  const all = past.join('') + now.join('');
  c.hasGate = /[Gp]/.test(all); c.hasLever = /[LD]/.test(all); c.hasBoss = !!src.boss;
  c.tags = (src.tags || meta.tags || []).slice();
  c.parts = [{ x: 0, y: 0, w: c.w, h: c.h, id: c.id, name: c.name, hint: c.hint, tip: c.tip, gateTip: c.gateTip }];
  return c;
}

// 좌표 바꾸기 (조각 안 좌표 → 새 좌표). def 안의 at·path·face, 조각의 start·exit·shards, 박자 함수, 그리고 조각이 준 remap()
function mapDefs(c, f, faceF) {
  for (const k of COORD_DEFS) for (const d of c[k]) {
    if (d.path) d.path = d.path.map(([i, j]) => f(i, j));
    if (d.at) d.at = f(d.at[0], d.at[1]);
    if (d.face != null && faceF) d.face = faceF(d.face);
  }
  for (const e of c.extra) for (const k of COORD_DEFS) for (const d of e[k] || []) {
    if (d.path) d.path = d.path.map(([i, j]) => f(i, j));
    if (d.at) d.at = f(d.at[0], d.at[1]);
    if (d.face != null && faceF) d.face = faceF(d.face);
  }
  c.shards = c.shards.map(([E, i, j]) => [E, ...f(i, j)]);
  for (const e of c.extra) if (e.shards) e.shards = e.shards.map(([E, i, j]) => [E, ...f(i, j)]);
  if (c.start) c.start = f(c.start[0], c.start[1]);
  if (c.exit) c.exit = f(c.exit[0], c.exit[1]);
  if (typeof c.remap === 'function') { try { c.remap(f, faceF); } catch (e) { console.error('[T1] remap', c.id, e); } }
}

/** 좌우 뒤집기. 얼굴 방향(도): 0 = 남, 90 = 동 → 뒤집으면 -90 */
export function flip(c0) {
  const c = { ...c0, past: c0.past.map(r => [...r].reverse().join('')), now: c0.now.map(r => [...r].reverse().join('')) };
  for (const k of COORD_DEFS) c[k] = clone(c0[k]);
  c.shards = clone(c0.shards); c.extra = clone(c0.extra);
  const W = c.w;
  mapDefs(c, (i, j) => [W - 1 - i, j], a => (a === 0 || a === 180 ? a : -a));
  for (const p of PHASES) { const f0 = c0[p]; c[p] = (i, j) => f0(W - 1 - i, j); }
  c.parts = c0.parts.map(p => ({ ...p, x: W - p.x - p.w }));
  c.flipped = !c0.flipped;
  return c;
}

// 문을 낼 수 있는지: 출구(또는 시작) 칸에서 바깥 벽까지 곧게 두 시대 모두 평범한 바닥이고, 그 바깥 벽 줄이 모두 '#'
const plainBoth = (c, i, j) => PLAIN.has(c.past[j][i]) && PLAIN.has(c.now[j][i]);
const wallLine = (c, side) => {
  const cells = side === 'E' ? c.past.map((r, j) => [c.w - 1, j]) : side === 'W' ? c.past.map((r, j) => [0, j]) : side === 'N' ? [...c.past[0]].map((ch, i) => [i, 0]) : [...c.past[0]].map((ch, i) => [i, c.h - 1]);
  return cells.every(([i, j]) => c.past[j][i] === '#' && c.now[j][i] === '#');
};
// 11/13 직접 플레이: 뒤집힌 "교차로"가 출구(서쪽 끝)에서 동쪽 벽까지 곧게 트여 있어 시작 칸 바로 옆에 문이 났다(조각 전체가 막다른 곁길이 됨)
// → 출구에서 문까지 가는 길에 시작 칸이 있으면(들어오는 조각은 문에서 시작까지 길에 출구가 있으면) 잇지 않는다. 문은 시작보다 출구에 가까워야 한다
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
export function canOut(c, side) {
  if (!c.exit || c.join === false) return false;
  const [ei, ej] = c.exit;
  if (!wallLine(c, side)) return false;
  const s = c.start;
  if (side === 'E') {
    for (let i = ei; i <= c.w - 2; i++) { if (!plainBoth(c, i, ej)) return false; if (s && s[0] === i && s[1] === ej) return false; }
    return ej > 0 && ej < c.h - 1 && (!s || near(s, [c.w - 1, ej]) > near(c.exit, [c.w - 1, ej]) + 2);
  }
  if (side === 'N') {
    for (let j = ej; j >= 1; j--) { if (!plainBoth(c, ei, j)) return false; if (s && s[0] === ei && s[1] === j) return false; }
    return ei > 0 && ei < c.w - 1 && (!s || near(s, [ei, 0]) > near(c.exit, [ei, 0]) + 2);
  }
  return false;
}
export function canIn(c, side) { // side = 들어오는 쪽 (W: 서쪽 벽에 문, S: 남쪽 벽에 문)
  if (!c.start || c.join === false) return false;
  const [si, sj] = c.start;
  if (!wallLine(c, side)) return false;
  const x = c.exit;
  if (side === 'W') {
    for (let i = 1; i <= si; i++) { if (!plainBoth(c, i, sj)) return false; if (x && x[0] === i && x[1] === sj) return false; }
    return !x || near(x, [0, sj]) > near(c.start, [0, sj]) + 2;
  }
  if (side === 'S') {
    for (let j = c.h - 2; j >= sj; j--) { if (!plainBoth(c, si, j)) return false; if (x && x[0] === si && x[1] === j) return false; }
    return !x || near(x, [si, c.h - 1]) > near(c.start, [si, c.h - 1]) + 2;
  }
  return false;
}
export function canJoin(a, b, dir) {
  if (a.hasBoss || b.hasBoss) return false;
  if (a.hasGate && b.hasGate) return false; // 발판·시간 문은 방에 하나뿐(main.js S.gateT)
  if (a.hasLever && b.hasLever) return false; // 레버·문도 방에 하나뿐(S.lever)
  if (dir === 'E') return canOut(a, 'E') && canIn(b, 'W') && a.w + b.w - 1 <= 34 && Math.max(a.h, b.h) + Math.abs(a.exit[1] - b.start[1]) <= 18;
  if (dir === 'N') return canOut(a, 'N') && canIn(b, 'S') && a.h + b.h - 1 <= 22 && Math.max(a.w, b.w) + Math.abs(a.exit[0] - b.start[0]) <= 30;
  return false;
}

/** a 다음에 b를 이어 붙인 조각 (dir: 'E' = b가 동쪽, 'N' = b가 북쪽) */
export function join(a, b, dir) {
  let W, H, oxA, oyA, oxB, oyB;
  if (dir === 'E') {
    oxA = 0; oxB = a.w - 1;
    oyA = Math.max(0, b.start[1] - a.exit[1]); oyB = oyA + a.exit[1] - b.start[1];
    W = a.w + b.w - 1; H = Math.max(oyA + a.h, oyB + b.h);
  } else {
    oyB = 0; oyA = b.h - 1;
    oxA = Math.max(0, b.start[0] - a.exit[0]); oxB = oxA + a.exit[0] - b.start[0];
    H = a.h + b.h - 1; W = Math.max(oxA + a.w, oxB + b.w);
  }
  const grid = () => Array.from({ length: H }, () => '#'.repeat(W));
  const out = { past: grid(), now: grid() };
  const paint = (c, ox, oy) => { for (const E of ['past', 'now']) for (let j = 0; j < c.h; j++) { const r = out[E][oy + j]; out[E][oy + j] = r.slice(0, ox) + c[E][j] + r.slice(ox + c.w); } };
  paint(a, oxA, oyA);
  // b는 공유 벽(a의 동/북 벽 = b의 서/남 벽)을 덮어도 같은 '#'
  paint(b, oxB, oyB);
  const door = dir === 'E' ? [a.w - 1, oyA + a.exit[1]] : [oxA + a.exit[0], b.h - 1];
  for (const E of ['past', 'now']) setCh(out[E], door[0], door[1], '.');
  const c = {
    id: a.id + '+' + b.id, name: a.name, past: out.past, now: out.now, w: W, h: H,
    start: [a.start[0] + oxA, a.start[1] + oyA], exit: [b.exit[0] + oxB, b.exit[1] + oyB], startEra: a.startEra,
    tier: Math.max(a.tier || 1, b.tier || 1), tags: [...new Set([...a.tags, ...b.tags])],
    hasGate: a.hasGate || b.hasGate, hasLever: a.hasLever || b.hasLever, hasBoss: false,
    gateHold: a.hasGate ? a.gateHold : b.gateHold, cam: Math.max(a.cam || 0, b.cam || 0) || undefined,
    par: a.par != null || b.par != null ? (a.par || 0) + (b.par || 0) : undefined,
    shards: [], extra: [], door,
    parts: [...a.parts.map(p => ({ ...p, x: p.x + oxA, y: p.y + oyA })), ...b.parts.map(p => ({ ...p, x: p.x + oxB, y: p.y + oyB }))],
  };
  for (const k of COORD_DEFS) c[k] = [];
  const add = (src, ox, oy) => {
    const s = { ...src }; for (const k of COORD_DEFS) s[k] = clone(src[k]); s.shards = clone(src.shards); s.extra = clone(src.extra); s.start = s.exit = null; s.remap = src.remap;
    mapDefs(s, (i, j) => [i + ox, j + oy]);
    for (const k of COORD_DEFS) c[k].push(...s[k]);
    c.shards.push(...s.shards); c.extra.push(...s.extra);
  };
  add(a, oxA, oyA); add(b, oxB, oyB);
  const inB = (i, j) => i >= oxB && i < oxB + b.w && j >= oyB && j < oyB + b.h && !(i === door[0] && j === door[1]);
  for (const p of PHASES) { const fa = a[p], fb = b[p]; c[p] = (i, j) => (inB(i, j) ? fb(i - oxB, j - oyB) : fa(i - oxA, j - oyA)); }
  c.hint = a.hint; c.tip = a.tip; c.gateTip = a.gateTip || b.gateTip;
  return c;
}

/** 변형: 높은 단계면 조각이 정해 둔 적을 더하고, 경비 쉬는 시간 ±20%, 함정 박자를 통째로 미룬다 */
export function vary(c0, rng, tier) {
  const c = { ...c0 };
  for (const k of COORD_DEFS) c[k] = clone(c0[k]);
  c.shards = clone(c0.shards);
  for (const e of c0.extra || []) if (tier >= (e.minTier || 2)) {
    for (const k of COORD_DEFS) if (e[k]) c[k].push(...clone(e[k]));
    if (e.shards) c.shards.push(...clone(e.shards));
  }
  if (c0.vary !== false) {
    for (const d of [...c.guards, ...c.golems]) if (d.path && d.path.length > 1) d.wait = +((d.wait ?? 1.0) * rng.range(0.8, 1.2)).toFixed(2);
    const off = { spikePhase: rng.range(0, 2.3), arrowPhase: rng.range(0, 1.8), bladePhase: rng.range(0, 2.0) };
    for (const p of PHASES) { const f = c0[p]; const o = off[p]; c[p] = (i, j) => f(i, j) + o; }
  }
  return c;
}

/** 조각 → rooms.js 꼴 방 데이터 */
export function toRoom(c, extra = {}) {
  const put = (rows, [i, j], ch) => rows.map((r, y) => (y === j ? r.slice(0, i) + ch + r.slice(i + 1) : r));
  const room = {
    id: extra.id || 'chunk:' + c.id, name: extra.name || c.name || c.id, label: extra.label, hint: c.hint, tip: c.tip, gateTip: c.gateTip,
    startEra: c.startEra || 'now', guards: c.guards, golems: c.golems, foes: c.foes, shards: c.shards.map(s => s.slice()),
    par: c.par, gateHold: c.gateHold, cam: c.cam, spikePhase: c.spikePhase, arrowPhase: c.arrowPhase, bladePhase: c.bladePhase,
    t1parts: c.parts, t1src: c.id,
  };
  if (c.boss) room.boss = c.boss;
  for (const E of ['past', 'now']) { let rows = c[E]; if (c.start) rows = put(rows, c.start, '@'); if (c.exit) rows = put(rows, c.exit, '>'); room[E] = rows; }
  // 조각이 더 가진 것(T3 장치 설정 등)은 그대로 넘긴다
  for (const k of Object.keys(c)) if (!(k in room) && !['past', 'now', 'start', 'exit', 'w', 'h', 'extra', 'parts', 'tags', 'tier', 'hasGate', 'hasLever', 'hasBoss', 'door', 'remap', 'solve', 'weight', 'flip', 'join', 'vary', 'flipped', 'src', 'track'].includes(k)) room[k] = c[k];
  return Object.assign(room, extra);
}

/** 대강의 풀림 검사: (칸, 시대) 그래프에서 시작 → 출구, 그리고 모든 적의 첫 자리에 닿는지. 함정·시야는 안 본다(그건 직접 플레이로) */
export function reachCheck(room, extChars = null) {
  const H = room.past.length, W = room.past[0].length;
  // 다른 트랙 장치 글자(EXT.chars)가 있으면 구덩이가 다리가 되는 등 이 검사가 모르는 규칙이 있다 → 그 트랙의 solve 확인을 믿는다
  // (11/13 네 트랙 겹친 시험: T3 "돌다리 위의 열쇠"·"멈춘 회전 다리"가 여기서만 '출구 못 감'으로 나왔다)
  if (extChars) { const all = room.past.join('') + room.now.join(''); for (const c of Object.keys(extChars)) if (all.includes(c)) return { ok: true, trusted: true }; }
  const ok = (E, i, j) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    const c = room[E][j][i];
    if (SOLID.has(c)) return false;
    if (PIT.has(c)) {
      if (E === 'past' && (c === 'M' || c === 'm')) return true; // 뗏목 길(대강)
      if (E === 'now' && c === '_' && room.past.some(r => r.includes('c'))) return true; // 상자를 밀어 메울 수 있음(대강)
      return false;
    }
    return true;
  };
  const s = findCh(room[room.startEra || 'now'], '@') || findCh(room.past, '@'), x = findCh(room.past, '>') || findCh(room.now, '>');
  if (!s || !x) return { ok: false, why: 'no start/exit' };
  const seen = new Set(), key = (E, i, j) => E + i + ',' + j, q = [[room.startEra || 'now', s[0], s[1]]];
  seen.add(key(...q[0]));
  while (q.length) {
    const [E, i, j] = q.shift();
    const nb = [[E, i + 1, j], [E, i - 1, j], [E, i, j + 1], [E, i, j - 1], [E === 'past' ? 'now' : 'past', i, j]];
    for (const n of nb) if (!seen.has(key(...n)) && ok(...n)) { seen.add(key(...n)); q.push(n); }
  }
  const at = (i, j) => seen.has(key('past', i, j)) || seen.has(key('now', i, j));
  if (!at(x[0], x[1])) return { ok: false, why: 'exit unreachable' };
  for (const d of [...(room.guards || []), ...(room.golems || []), ...(room.foes || [])]) {
    const p = d.at || (d.path && d.path[0]);
    if (p && !at(p[0], p[1]) && !d.optional) return { ok: false, why: 'enemy unreachable ' + p };
  }
  return { ok: true, cells: seen.size };
}
