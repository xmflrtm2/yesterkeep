// T1 — 층 지도: 줄 5개(아래 → 위). 0~3번 줄은 2~3갈래에서 고르고, 4번 줄은 문지기(1·2층) 또는 성채지기(3층).
// 같은 시드 + 같은 층이면 같은 지도. T4가 registerRoomType(type, fn, { icon, name, desc, rows, weight })로 새 종류를 넣으면 그 줄의 뽑기에 섞인다.
import { makeRng } from './rng.js';

export const TYPES = {
  combat: { icon: '⚔', name: N('전투'), desc: N('경비와 골렘을 모두 쓰러뜨려야 출구가 열려요'), color: '#ff9a8a' },
  puzzle: { icon: '✦', name: N('퍼즐'), desc: N('어제와 오늘을 엮는 장치. 어제를 아끼는 길을 찾아요'), color: '#7fe8ff' },
  elite: { icon: '☠', name: N('정예'), desc: N('더 많은 적 — 모래와 기억을 더 줘요'), color: '#ff5d6c' },
  treasure: { icon: '◆', name: N('보물'), desc: N('모래시계 조각이 있는 방'), color: '#ffd27a' },
  shop: { icon: '⚖', name: N('상점'), desc: N('모래를 내고 하트를 사요'), color: '#d4b0ff' },
  rest: { icon: '☾', name: N('쉼터'), desc: N('하트 2개 회복, 모래 가득'), color: '#9be89b' },
  guard: { icon: '♜', name: N('문지기'), desc: N('층의 끝. 이기면 아래층으로'), color: '#ffb347' },
  boss: { icon: '♛', name: N('성채지기'), desc: N('성채의 심장 — 마지막 방'), color: '#ffd27a' },
};
export const ROWS = 5;
const CHALLENGE = new Set(['combat', 'puzzle', 'elite']);

/** genFloor(seed, floor, extra) → [[{ type, row, col, next:[col…] }]] (extra = T4가 넣은 종류 { type: { rows, weight } }) */
export function genFloor(seed, floor, extra = {}) {
  const rng = makeRng(seed, 'map', floor);
  const rows = [];
  const add = (r, list) => { rows[r] = list.map((type, col) => ({ type, row: r, col, next: [] })); };
  const pool = (r, base) => {
    const p = base.slice();
    for (const [type, m] of Object.entries(extra)) if ((m.rows || [1, 2]).includes(r)) p.push([type, m.weight ?? 1]);
    return p;
  };
  const draw = (r, n, base, maxOne = []) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const p = pool(r, base).filter(([t, w]) => w > 0 && !(maxOne.includes(t) && out.includes(t)));
      out.push(rng.weighted(p, x => x[1])[0]);
    }
    if (!out.some(t => CHALLENGE.has(t))) out[rng.int(0, out.length - 1)] = rng.chance(0.5) ? 'combat' : 'puzzle';
    return out;
  };
  add(0, rng.shuffle(['combat', 'puzzle']));
  add(1, draw(1, 3, [['combat', 3], ['puzzle', 3], ['treasure', 1.3], ['elite', floor >= 2 ? 1 : 0]], ['treasure', 'elite']));
  add(2, draw(2, rng.chance(0.6) ? 3 : 2, [['combat', 3], ['puzzle', 2.6], ['elite', floor >= 2 ? 1.6 : 0.9], ['shop', 1.5], ['treasure', 0.5]], ['shop', 'elite', 'treasure']));
  add(3, rng.shuffle(['rest', rng.chance(0.55) ? 'shop' : 'treasure']));
  add(4, [floor < 3 ? 'guard' : 'boss']);
  // 줄 사이 잇기: 비율이 가까운 칸끼리 + 들어오는 길이 없는 칸 채우기 + 엇갈리지 않는 샛길 하나쯤
  for (let r = 0; r < ROWS - 1; r++) {
    const A = rows[r], B = rows[r + 1], n = A.length, m = B.length;
    const ratio = (k, len) => (len === 1 ? 0.5 : k / (len - 1));
    const link = (a, b) => { if (!A[a].next.includes(b)) A[a].next.push(b); };
    for (let a = 0; a < n; a++) { let best = 0; for (let b = 1; b < m; b++) if (Math.abs(ratio(b, m) - ratio(a, n)) < Math.abs(ratio(best, m) - ratio(a, n))) best = b; link(a, best); }
    for (let b = 0; b < m; b++) if (!A.some(x => x.next.includes(b))) { let best = 0; for (let a = 1; a < n; a++) if (Math.abs(ratio(a, n) - ratio(b, m)) < Math.abs(ratio(best, n) - ratio(b, m))) best = a; link(best, b); }
    const crosses = (a, b) => A.some((x, a2) => x.next.some(b2 => (a2 < a && b2 > b) || (a2 > a && b2 < b)));
    for (let tries = 0; tries < 2; tries++) {
      const a = rng.int(0, n - 1), b = A[a].next[0] + (rng.chance(0.5) ? 1 : -1);
      if (b >= 0 && b < m && !A[a].next.includes(b) && !crosses(a, b)) link(a, b);
    }
    for (const x of A) x.next.sort((p, q) => p - q);
  }
  return rows;
}

/** 지금 고를 수 있는 칸: 층에 막 내려왔으면(row -1) 0번 줄 전부, 아니면 지금 칸에서 이어진 칸 */
export function choices(rows, pos) {
  if (!pos || pos.row < 0) return rows[0].map(n => n);
  const cur = rows[pos.row] && rows[pos.row][pos.col];
  if (!cur) return rows[0].slice();
  return cur.next.map(c => rows[pos.row + 1][c]);
}

/** 지도 그림 HTML (줄 0이 아래). visited = [[row, col]…], can = 고를 수 있는 칸 */
export function mapHtml(rows, visited, can, here, typeMeta) {
  const pts = {};
  const W = 100, H = 100;
  rows.forEach((row, r) => row.forEach((n, c) => { pts[r + ',' + c] = [((c + 1) / (row.length + 1)) * W, H - ((r + 0.5) / rows.length) * H]; }));
  const vis = new Set(visited.map(([r, c]) => r + ',' + c));
  const canSet = new Set(can.map(n => n.row + ',' + n.col));
  let lines = '';
  rows.forEach((row, r) => row.forEach((n, c) => n.next.forEach(b => {
    const [x1, y1] = pts[r + ',' + c], [x2, y2] = pts[(r + 1) + ',' + b];
    const walked = vis.has(r + ',' + c) && vis.has((r + 1) + ',' + b);
    const open = (here && here.row === r && here.col === c && canSet.has((r + 1) + ',' + b)) || (!here && r === -1);
    lines += `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" stroke="${walked ? '#ffd27a' : open ? '#ffffffcc' : '#ffffff30'}" stroke-width="${walked || open ? 3 : 2}" ${walked || open ? '' : 'stroke-dasharray="4 5"'} />`;
  })));
  let nodes = '';
  rows.forEach((row, r) => row.forEach((n, c) => {
    const m = typeMeta(n.type);
    const k = r + ',' + c, [x, y] = pts[k];
    const cls = ['t1-node', vis.has(k) ? 'done' : '', here && here.row === r && here.col === c ? 'here' : '', canSet.has(k) ? 'can' : '', !canSet.has(k) && !vis.has(k) ? 'far' : ''].join(' ');
    nodes += `<button class="${cls}" ${canSet.has(k) ? `data-k="${k}"` : ''} style="left:${x}%;top:${y}%;color:${m.color}" title="${$t(m.name)}">${m.icon}</button>`;
  }));
  return `<div class="t1-mapwrap"><svg preserveAspectRatio="none">${lines}</svg>${nodes}</div>`;
}
