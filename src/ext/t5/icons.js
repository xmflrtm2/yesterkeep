// T5 — 어제의 성채 아이콘 한 벌 (코드로 그린 SVG). 이모지는 컴퓨터마다 모양이 달라서, 화면에 나가는 그림을 여기서 한 번에 그린다.
//   icon(id, opts)  → '<svg class="yi">…</svg>' 문자열 (없는 id면 opts.fb 또는 그 글자를 그대로 — 다른 트랙이 새 유물을 넣어도 안 깨지게)
//   addIcon(id, svg) → 새 아이콘 등록 (24×24 격자, 아래 도우미 P·C·R·L… 로 그린 조각 문자열)
//   iconUrl(id)     → CSS background용 url("data:…")    iconImage(id, px) → Promise<HTMLImageElement> (three.js 스프라이트용)
//   glyphIcon(ch)   → 이모지 한 글자에 맞는 아이콘 id (토스트·안내 글 속 이모지를 그림으로 바꿀 때)
// 한 벌로 보이게: 모두 24×24, 진한 고동색 윤곽(#1a1109, 굵기 1.8 — 채움 아래에 깔림), 위→아래 그러데이션, 흰 하이라이트 한 줄.
// 글자 없음(언어와 상관없음). 설계와 색 표: docs/roguelike/t5.md

export const OUT = '#1a1109';
// 그러데이션 (위 → 아래). [색, 위치, 투명도]
const GRAD = {
  gold: [['#fff6cc', 0], ['#f5c862', 0.45], ['#b0701c', 1]],
  teal: [['#e2fdff', 0], ['#74d6e2', 0.45], ['#1f6874', 1]],
  red: [['#ffc0b8', 0], ['#ef4d47', 0.5], ['#8a1424', 1]],
  steel: [['#ffffff', 0], ['#c8cfdb', 0.45], ['#5a6474', 1]],
  violet: [['#f3dcff', 0], ['#a873e6', 0.5], ['#43207a', 1]],
  stone: [['#c3cfd2', 0], ['#7d8c91', 0.5], ['#3d484c', 1]],
  wood: [['#f0bd84', 0], ['#a96a3a', 0.55], ['#5a3216', 1]],
  leaf: [['#e6ffc8', 0], ['#90d468', 0.5], ['#3c7a2c', 1]],
  sand: [['#fff3cf', 0], ['#f2c66f', 0.5], ['#c4893a', 1]],
  fire: [['#fffbd0', 0], ['#ffc04a', 0.45], ['#e2492a', 1]],
  cloth: [['#8a91b0', 0], ['#4b5070', 0.5], ['#232638', 1]],
  bone: [['#ffffff', 0], ['#ece6d6', 0.5], ['#a99f88', 1]],
  mem: [['#f6f3ff', 0], ['#b3a6ff', 0.5], ['#4f3fae', 1]],
  moon: [['#ffffff', 0], ['#d4f4ff', 0.5], ['#6bb4cc', 1]],
  lead: [['#b3afc2', 0], ['#66627a', 0.5], ['#2c2938', 1]],
  dusk: [['#ffe08a', 0], ['#ff8a5a', 0.45], ['#7a3a8f', 1]],
  burlap: [['#f6dfae', 0], ['#cfa56a', 0.5], ['#7a5a30', 1]],
  blue: [['#cfe2ff', 0], ['#4a7ae0', 0.5], ['#1a2f6a', 1]],
  lamp: [['#fff8d8', 0], ['#ffd060', 0.5], ['#e8862a', 1]],
  glass: [['#ffffff', 0, 0.55], ['#bfefff', 0.6, 0.28], ['#9fdcff', 1, 0.4]],
  crys: [['#ffffff', 0, 0.95], ['#bff6ff', 0.5, 0.8], ['#4fb4cc', 1, 0.9]],
  ghost: [['#e2fdff', 0, 0.55], ['#74d6e2', 1, 0.3]],
};
function gradDefs(prefix) {
  let s = '';
  for (const [n, stops] of Object.entries(GRAD)) {
    s += `<linearGradient id="${prefix}${n}" x1="0" y1="0" x2="0" y2="1">${stops.map(([c, o, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
  }
  // 두 시대 반반 (퍼즐 톱니): 왼쪽 어제 금빛, 오른쪽 오늘 청록
  s += `<linearGradient id="${prefix}era" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe7a6"/><stop offset=".5" stop-color="#e9b14a"/><stop offset=".5" stop-color="#6fd0dc"/><stop offset="1" stop-color="#bff6ff"/></linearGradient>`;
  return s;
}
const PFX = 'yk5-';
const g = n => `url(#${PFX}${n})`;

// ───────── 그리기 도우미 (모두 24×24 격자) ─────────
const NS = ' stroke="none"';
const P = (d, f, x = '') => `<path d="${d}" fill="${f}"${x}/>`;
const C = (cx, cy, r, f, x = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"${x}/>`;
const E = (cx, cy, rx, ry, f, x = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"${x}/>`;
const R = (x, y, w, h, rx, f, e = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}"${e}/>`;
// 윤곽 있는 선 (밧줄·호·끈)
const L = (d, col, w = 1.6) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${(w + 1.8).toFixed(2)}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
// 윤곽 없는 가는 선 (무늬·금·실)
const D = (d, col, w = 1, op = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"${op < 1 ? ` stroke-opacity="${op}"` : ''}/>`;
const HL = d => D(d, '#ffffff', 1.1, 0.75);
// 중심 (12,12)에 그린 조각을 (cx,cy)로 옮기고 키우고 돌린다
const at = (s, cx, cy, k = 1, rot = 0, op = 1) => `<g transform="translate(${cx} ${cy})${rot ? ` rotate(${rot})` : ''}${k !== 1 ? ` scale(${k})` : ''} translate(-12 -12)"${op < 1 ? ` opacity="${op}"` : ''}>${s}</g>`;
const pts = a => a.map(([x, y], k) => (k ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join('') + 'Z';
function star(cx, cy, ro, ri, n, rot = -90) {
  const a = [];
  for (let k = 0; k < n * 2; k++) { const t = ((rot + (k * 180) / n) * Math.PI) / 180, r = k % 2 ? ri : ro; a.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return pts(a);
}
function gear(cx, cy, ro, ri, n) {
  const a = [], w = Math.PI / n;
  for (let k = 0; k < n; k++) { const t = (k / n) * Math.PI * 2; for (const [r, d] of [[ri, -0.55], [ro, -0.32], [ro, 0.32], [ri, 0.55]]) a.push([cx + r * Math.cos(t + d * w * 2), cy + r * Math.sin(t + d * w * 2)]); }
  return pts(a);
}
function spiral(cx, cy, r0, k, turns, steps = 64) {
  let d = '';
  for (let s = 0; s <= steps; s++) { const t = (s / steps) * turns * Math.PI * 2, r = r0 + k * t; d += (s ? 'L' : 'M') + (cx + r * Math.cos(t)).toFixed(2) + ' ' + (cy + r * Math.sin(t)).toFixed(2); }
  return d;
}
const spk = (x, y, r, col) => P(`M${x} ${y - r}Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y}Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r}Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y}Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r}z`, col, NS);

// ───────── 자주 쓰는 조각 ─────────
const HEART = 'M12 20.6S3.4 15.2 3.4 9.1A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.6 2.3c0 6.1-8.6 11.5-8.6 11.5z';
const heart = (f = g('red')) => P(HEART, f) + P('M12 18.2S5.7 13.9 5.7 9.4a2.5 2.5 0 0 1 4.5-1.5L12 10.1l1.8-2.2a2.5 2.5 0 0 1 4.5 1.5c0 4.5-6.3 8.8-6.3 8.8z', '#ffffff', ' stroke="none" fill-opacity=".16"') + HL('M5.8 8.4a2.6 2.6 0 0 1 2.5-2');
// 모래시계: sand = 모래 색, frame = 받침 색, top/bot = 위·아래 모래 (false · 'small')
function hourglass(sand = g('sand'), frame = g('wood'), top = true, bot = true) {
  return R(5, 2.4, 14, 2.6, 1.2, frame) + R(5, 19, 14, 2.6, 1.2, frame)
    + P('M7 5h10c0 4.2-3.6 5.4-3.6 7s3.6 2.8 3.6 7H7c0-4.2 3.6-5.4 3.6-7S7 9.2 7 5z', g('glass'))
    + (top ? P(top === 'small' ? 'M10.4 9.6h3.2c-.4.9-1 1.4-1.6 2-.6-.6-1.2-1.1-1.6-2z' : 'M8.4 7h7.2c-.7 2.1-2.6 3.1-3.6 4.4-1-1.3-2.9-2.3-3.6-4.4z', sand, NS) : '')
    + (top ? D('M12 11.4v4.8', sand, 1) : '')
    + (bot ? P(bot === 'small' ? 'M10.2 18.6c.5-1 1.1-1.4 1.8-1.6.7.2 1.3.6 1.8 1.6z' : 'M8.1 18.6c.8-2.3 2.5-3.1 3.9-3.5 1.4.4 3.1 1.2 3.9 3.5z', sand, NS) : '')
    + HL('M8.4 6.2c.2 1.6 1 2.6 2 3.4');
}
const DAG = P('M12 1.8l2.3 3.1v8.4H9.7V4.9z', g('steel')) + D('M12 3.6v9.2', '#7d8696', 0.8) + R(7.4, 13.2, 9.2, 2.1, 1, g('gold')) + R(10.8, 15.3, 2.4, 4.6, 0.8, g('wood')) + C(12, 21, 1.5, g('gold'));
const SWORD = P('M12 2.2l1.7 2.2v10.2h-3.4V4.4z', g('steel')) + D('M12 3.8v10.4', '#7d8696', 0.7) + R(8.2, 14.4, 7.6, 1.9, 0.9, g('gold')) + R(11.1, 16.3, 1.8, 3.6, 0.6, g('wood')) + C(12, 20.8, 1.3, g('gold'));
const ARROW = R(11.2, 6, 1.6, 13.5, 0.6, g('wood')) + P('M12 1.6l3.2 5.2H8.8z', g('steel')) + P('M12 16.5l-3.4 3.8v2.4l3.4-2.6 3.4 2.6v-2.4z', g('red'));
const FIG = f => C(12, 6.6, 3.4, f) + P('M5.6 21.4c0-4.6 2.8-8.2 6.4-8.2s6.4 3.6 6.4 8.2z', f);
const PRINT = f => P('M12 2.6c2.7 0 4.1 2.3 4.1 5.3 0 2.5-.9 3.9-1.4 5.6H9.3C8.8 11.8 7.9 10.4 7.9 7.9c0-3 1.4-5.3 4.1-5.3z', f) + P('M9.3 15.4h5.4v3.4a2.7 2.7 0 0 1-5.4 0z', f);
const FOOT = f => P('M12.4 8c2.3 0 3.5 1.9 3.5 4.6 0 3.4-1.3 5.1-1.3 7.2 0 1.5-1 2.5-2.3 2.5s-2.3-1-2.3-2.5c0-2.2-1.2-3.8-1.2-7.2 0-2.7 1.3-4.6 3.6-4.6z', f) + C(8.9, 7.2, 1, f) + C(10.3, 5.2, 1.05, f) + C(12.2, 4, 1.15, f) + C(14.6, 4.2, 1.5, f);
const PAW = f => E(12, 15, 3.4, 2.9, f) + C(7.8, 10.6, 1.5, f) + C(10.5, 8.4, 1.5, f) + C(13.5, 8.4, 1.5, f) + C(16.2, 10.6, 1.5, f);
const EYE = 'M2.4 12C5 7.4 8.4 5.4 12 5.4s7 2 9.6 6.6C19 16.6 15.6 18.6 12 18.6S5 16.6 2.4 12z';
const DROP = 'M12 3.2c2.4 3.4 3.8 5.6 3.8 7.4a3.8 3.8 0 0 1-7.6 0c0-1.8 1.4-4 3.8-7.4z';
const CRESC = 'M15 2.4a9.6 9.6 0 1 0 6.4 15.4A7.8 7.8 0 0 1 15 2.4z';
const FLAME = P('M12 2.6c3.1 3.4 5.6 6.1 5.6 9.7a5.6 5.6 0 0 1-11.2 0c0-2.1 1-3.6 2.3-4.6.2 1.7.9 2.7 1.9 3.2C10.1 8.2 10.5 5.2 12 2.6z', g('fire')) + P('M12 9.2c1.6 1.8 2.6 3.2 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-1.5 1-3 2.6-4.8z', '#fff4b8', NS);
const BELL = C(12, 19.4, 2, g('gold')) + P('M12 2.6c.9 0 1.6.7 1.6 1.6v.7c2.8.8 4.6 3.3 4.6 6.3v4.2l2 2.6H3.8l2-2.6v-4.2c0-3 1.8-5.5 4.6-6.3v-.7c0-.9.7-1.6 1.6-1.6z', g('gold')) + D('M5.8 15.4h12.4', '#9a5d16', 0.9) + HL('M8.6 9.4c.4-1.6 1.4-2.6 2.6-3');
const SHIELD = 'M12 2.4l8.2 3v6.2c0 5-3.6 8.6-8.2 10.6-4.6-2-8.2-5.6-8.2-10.6V5.4z';
const SCROLL = R(3.6, 2.6, 16.8, 3.4, 1.7, g('wood')) + R(5.2, 5, 13.6, 13.4, 0, g('bone')) + R(3.6, 17.8, 16.8, 3.4, 1.7, g('wood')) + D('M7.6 8.6h8.8M7.6 11.2h8.8M7.6 13.8h6', '#8a7a5a', 0.9);
const CONTRACT = P('M5.2 3.4h10.6l3 3v14.2H5.2z', g('bone')) + P('M15.8 3.4v3h3z', '#cfc4a8') + D('M7.6 8h6.4M7.6 10.6h8.6M7.6 13.2h5', '#8a7a5a', 0.9);

// ───────── 아이콘 표 ─────────
const ICONS = {
  // ── 화폐·자원 (HUD) ──
  coin: C(12, 12, 9.2, g('gold')) + C(12, 12, 6.6, 'none', ' stroke="#9a5d16" stroke-width="1"') + P('M9.6 8.4h4.8l-2.4 3.6 2.4 3.6H9.6l2.4-3.6z', '#a8661a', NS) + HL('M6.4 9.6a6.2 6.2 0 0 1 3.4-3.6'),
  sand: hourglass(),
  heart: heart(),
  'heart-empty': P(HEART, '#3a2228') + P('M12 18.2S5.7 13.9 5.7 9.4a2.5 2.5 0 0 1 4.5-1.5L12 10.1l1.8-2.2a2.5 2.5 0 0 1 4.5 1.5c0 4.5-6.3 8.8-6.3 8.8z', 'none', ' stroke="#a8707c" stroke-width="1" stroke-dasharray="2 1.6"'),
  knife: at(DAG, 12, 12, 1, 45),
  arrow: at(ARROW, 12, 12, 1, 45),
  memory: P('M12 2l5.4 6.4L12 22 6.6 8.4z', g('mem')) + D('M6.6 8.4h10.8M9.2 8.4 12 22l2.8-13.6M9.2 8.4 12 2l2.8 6.4', '#ffffff', 0.7, 0.6) + spk(19, 4.6, 2.6, '#fff1b8') + spk(4.6, 16.4, 1.8, '#e2dcff'),
  synergy: P('M12 1.6Q13.1 10.9 22.4 12 13.1 13.1 12 22.4 10.9 13.1 1.6 12 10.9 10.9 12 1.6z', g('gold')) + C(12, 12, 1.3, '#fffbe6', NS),
  warn: P('M12 2.6l10.2 17.8H1.8z', g('red')) + R(10.9, 8, 2.2, 7, 1, '#2a0a0e', NS) + C(12, 17.4, 1.3, '#2a0a0e', NS),
  up: P('M12 2.5l8.5 8.5H15v9.5H9V11H3.5z', g('teal')) + HL('M12 4.8 7.8 9'),
  upgrade: P('M12 2.4l8.6 7.6-2.6 2.6L12 7.4 6 12.6 3.4 10z', g('gold')) + P('M12 10.4l8.6 7.6-2.6 2.6L12 15.4 6 20.6 3.4 18z', g('gold')),
  check: P('M3.4 12.4l2.7-2.7 3.7 3.7 8.1-8.1 2.7 2.7L9.8 18.8z', g('leaf')),
  tip: L('M9.6 4.4a2.4 2.4 0 0 1 4.8 0', '#e0a840', 1.2) + R(7.4, 6.6, 9.2, 10.8, 2, g('lamp')) + P('M12 8.6c1.9 2.1 2.2 3.8 0 6.4-2.2-2.6-1.9-4.3 0-6.4z', '#fffbe0', NS) + D('M9.8 6.8v10.4M14.2 6.8v10.4', '#8a5a1a', 0.9) + P('M7.4 6.8h9.2l-1.2-2.6H8.6z', g('gold')) + P('M7 17.4h10l-1.3 3.2H8.3z', g('gold')),
  star: P(star(12, 12.8, 10, 4.4, 5), g('gold')) + HL('M8.6 10.6l2.2-.4'),
  'star-empty': P(star(12, 12.8, 10, 4.4, 5), '#2a2418') + P(star(12, 12.8, 7.6, 3.4, 5), 'none', ' stroke="#7a6640" stroke-width=".8"'),
  rewind: L('M18.6 15.2A7.4 7.4 0 1 1 15.8 5.6', '#cfefff', 2.4) + P('M12.6 2.6l6.4 1.6-3.6 5.2z', '#cfefff'),
  seed: P('M6.6 11.4h10.8c0 5-3.4 8.6-5.4 9.6-2-1-5.4-4.6-5.4-9.6z', g('wood')) + P('M5.6 12c0-3.6 2.8-5.8 6.4-5.8s6.4 2.2 6.4 5.8z', '#6b4224') + D('M7.4 9.6l2-2.4M10.6 11.6l2.4-5M14.4 11.6l2-3', '#4a2c16', 0.7) + L('M12 6.2c0-1.6.6-2.8 2-3.6', '#3c7a2c', 1.3) + P('M14 2.6c2.2-.6 4 .2 4.6 1.6-2 .6-3.6.4-4.6-1.6z', g('leaf')) + HL('M8.4 14c.2 1.6 1 3 2 4'),
  key: at(C(6, 12, 4, g('gold')) + C(6, 12, 1.6, OUT, NS) + R(9.4, 10.9, 12, 2.2, 0.8, g('gold')) + R(16.6, 13, 1.8, 3, 0.4, g('gold')) + R(19.4, 13, 1.8, 2.2, 0.4, g('gold')), 12.4, 12, 1, -40),
  flame: at(FLAME, 12, 13, 1.18),
  candle: R(8.6, 9.6, 6.8, 11, 1.2, g('bone')) + R(6.6, 19.6, 10.8, 2.4, 1.2, g('gold')) + D('M12 9.6V7.6', OUT, 1) + P('M12 1.8c1.8 2 2.5 3.4 2.5 4.6a2.5 2.5 0 0 1-5 0c0-1.2.7-2.6 2.5-4.6z', g('fire')) + HL('M10.2 11.4v6'),
  gift: R(4, 10, 16, 10.6, 1.2, g('teal')) + R(3, 7.2, 18, 3.8, 1, g('teal')) + R(10.6, 7.2, 2.8, 13.4, 0.4, g('gold')) + P('M12 7.2c-1.6-3-4.8-3.4-5.4-1.6-.4 1.2 1.6 1.8 5.4 1.6zM12 7.2c1.6-3 4.8-3.4 5.4-1.6.4 1.2-1.6 1.8-5.4 1.6z', g('gold')) + HL('M5.6 12v6'),
  dice: P('M12 2.6l8.4 4.4-8.4 4.4L3.6 7z', '#fdfaf2') + P('M3.6 7l8.4 4.4v10L3.6 17z', '#d9d0bc') + P('M20.4 7 12 11.4v10l8.4-4.4z', '#a99c80') + E(12, 7, 1.5, 0.9, '#b8323a', NS) + E(6.2, 11, 0.9, 1.1, OUT, NS) + E(9.6, 16, 0.9, 1.1, OUT, NS) + E(14.6, 17.4, 0.9, 1.1, OUT, NS) + E(16.2, 14.2, 0.9, 1.1, OUT, NS) + E(17.8, 11, 0.9, 1.1, OUT, NS),
  purse: P('M4.6 10.4h14.8l1.2 8.4c.2 1.6-.8 2.4-2.2 2.4H5.6c-1.4 0-2.4-.8-2.2-2.4z', g('wood')) + R(4.2, 9.2, 15.6, 2.2, 1, g('gold')) + C(10.4, 8.2, 1.4, g('gold')) + C(13.6, 8.2, 1.4, g('gold')) + C(12, 15.8, 2.8, g('gold')) + C(12, 15.8, 1.5, 'none', ' stroke="#9a5d16" stroke-width=".8"'),
  scroll: SCROLL + C(15.6, 15, 2, g('mem')) + spk(15.6, 15, 1.2, '#ffffff'),
  next: P('M3 9.4h10V4.6l8.4 7.4-8.4 7.4v-4.8H3z', g('gold')) + HL('M4.4 10.8h8'),
  cursor: at(DAG, 12, 12, 0.95, 90), // 메뉴에서 고른 단추 옆의 단검 표시
  unknown: C(12, 12, 9.4, g('stone')) + L('M9.2 9.4a2.8 2.8 0 1 1 3.8 2.6c-.8.4-1 1-1 1.8v.8', '#fff4d6', 2) + C(12, 17.6, 1.4, '#fff4d6', NS),
  purify: `<ellipse cx="7.4" cy="15.6" rx="4.8" ry="3" transform="rotate(-38 7.4 15.6)" fill="none" stroke="${OUT}" stroke-width="4.6"/><ellipse cx="7.4" cy="15.6" rx="4.8" ry="3" transform="rotate(-38 7.4 15.6)" fill="none" stroke="#b98cf0" stroke-width="2.6"/>`
    + `<ellipse cx="16.6" cy="8.4" rx="4.8" ry="3" transform="rotate(-38 16.6 8.4)" fill="none" stroke="${OUT}" stroke-width="4.6"/><ellipse cx="16.6" cy="8.4" rx="4.8" ry="3" transform="rotate(-38 16.6 8.4)" fill="none" stroke="#b98cf0" stroke-width="2.6"/>`
    + spk(12, 12, 4.2, '#ffffff') + spk(16.4, 15.8, 2, '#fff1b8') + spk(7.2, 7, 1.6, '#fff1b8'),
  // ── 시대 문장 (HUD 오른쪽 위) ──
  'era-past': P(star(12, 12, 11, 6.6, 10, -90), g('gold')) + C(12, 12, 5.4, g('lamp')) + HL('M9 10a3.4 3.4 0 0 1 2.4-2'),
  'era-now': P('M15 2.4a9.6 9.6 0 1 0 5.6 16.6l-2.4-.6-.6-2 1.6-1.2A7.8 7.8 0 0 1 15 2.4z', g('teal')) + D('M8.6 4.6l1.6 3.2-1.4 2.6 1.8 2.4M4.6 14.2l2.6.4 1.4 2.8', '#0d2a30', 1.1) + P('M20.2 19.8l2.2.2-.8 2z', g('teal')) + P('M21.4 15.4l1.6.6-1 1.2z', g('teal')) + HL('M5.2 9a8 8 0 0 1 3-4'),
  // ── 층 지도 칸 ──
  combat: at(SWORD, 12, 12, 1, -42) + at(SWORD, 12, 12, 1, 42),
  puzzle: P(gear(12, 12, 10, 7.6, 9), g('era')) + C(12, 12, 4.2, '#262019') + P('M10.4 9.6h3.2l-1.6 2.4 1.6 2.4h-3.2l1.6-2.4z', '#ffe7a6', NS),
  elite: P('M6.2 9.2C3.4 8.2 2 5.6 2.4 3c1.3 1.7 3 2.5 5 2.6z', g('bone')) + P('M17.8 9.2c2.8-1 4.2-3.6 3.8-6.2-1.3 1.7-3 2.5-5 2.6z', g('bone'))
    + P('M12 3.6c-4.3 0-7 3-7 6.9 0 2.4 1.2 4 2.6 4.8v4.2h8.8v-4.2c1.4-.8 2.6-2.4 2.6-4.8 0-3.9-2.7-6.9-7-6.9z', g('bone'))
    + E(9.2, 11.2, 2.1, 1.9, '#2a0a0e', NS) + E(14.8, 11.2, 2.1, 1.9, '#2a0a0e', NS) + C(9.2, 11.3, 0.95, '#ff4a40', NS) + C(14.8, 11.3, 0.95, '#ff4a40', NS)
    + P('M12 13.4l-1 1.7h2z', '#2a0a0e', NS) + D('M10.2 16.6v2.6M12 16.6v2.6M13.8 16.6v2.6', '#6b5f4a', 0.8),
  treasure: R(3.4, 11.2, 17.2, 9.4, 1.2, g('wood')) + P('M3.4 11.2V9.4a4.2 4.2 0 0 1 4.2-4.2h8.8a4.2 4.2 0 0 1 4.2 4.2v1.8z', g('wood'))
    + R(6.2, 5.4, 2.2, 15.2, 0.4, g('gold')) + R(15.6, 5.4, 2.2, 15.2, 0.4, g('gold')) + R(3.4, 10.4, 17.2, 1.8, 0.4, g('gold'))
    + R(10.3, 9.2, 3.4, 4.6, 0.7, g('gold')) + C(12, 11, 0.75, OUT, NS) + P('M11.6 11.2h.8l.25 1.5h-1.3z', OUT, NS),
  shop: R(11.2, 4.6, 1.6, 14.6, 0.6, g('gold')) + P('M7.4 21.2h9.2l-1.6-2.4H9z', g('gold')) + R(3.2, 4.8, 17.6, 1.7, 0.85, g('gold')) + C(12, 4, 1.6, g('gold'))
    + D('M5.4 6.4 3 12.4M5.4 6.4l2.4 6M18.6 6.4 16.2 12.4M18.6 6.4l2.4 6', '#f0c060', 0.8)
    + P('M2.2 12.4h6.4a3.2 3.2 0 0 1-6.4 0z', g('gold')) + P('M15.4 12.4h6.4a3.2 3.2 0 0 1-6.4 0z', g('gold')) + C(5.4, 11.4, 1.6, g('gold')),
  rest: at(R(3.4, 10.5, 17.2, 3, 1.5, g('wood')), 12, 18.6, 1, 14) + at(R(3.4, 10.5, 17.2, 3, 1.5, g('wood')), 12, 18.6, 1, -14) + at(FLAME, 12, 9.6, 1.02),
  guard: P('M4.6 21.2V8.6h14.8v12.6z', g('stone')) + P('M4 9.2V4.2h3v2.2h2.8V4.2h4.4v2.2H17V4.2h3v5z', g('stone'))
    + P('M9 21.2v-5.4a3 3 0 0 1 6 0v5.4z', '#120c08') + D('M10.5 13.6v7.6M12 12.8v8.4M13.5 13.6v7.6M9.2 16.4h5.6M9.2 18.8h5.6', '#e0b050', 0.8)
    + R(11, 9.8, 2, 2.4, 0.4, '#120c08', NS) + D('M4.6 13h3.4M16 13h3.4M6 17h2M16.2 17h2', '#3d484c', 0.7),
  boss: P('M6.6 6.6 5.6 2.6l3.2 2.2L12 1.8l3.2 3 3.2-2.2-1 4z', g('gold')) + P('M5.2 7.6c0-.8.6-1.4 1.4-1.4h10.8c.8 0 1.4.6 1.4 1.4v9.4l-2.6 4.4H7.8l-2.6-4.4z', g('stone'))
    + P('M7.4 11h3.4l-.6 1.8H7.8z', '#8ff8ff', NS) + P('M13.2 11h3.4l-.4 1.8h-2.4z', '#8ff8ff', NS) + D('M9 6.4 10.2 9.2M15.8 16.2 14 18.8', '#2a3236', 0.8) + D('M9.4 16.4h5.2', OUT, 1.2),
  here: P('M12 22.2s-6.6-6.4-6.6-11.6a6.6 6.6 0 0 1 13.2 0c0 5.2-6.6 11.6-6.6 11.6z', g('red')) + C(12, 10.4, 3, g('gold')) + HL('M8 8.6a4.4 4.4 0 0 1 2.6-2.8'),

  // ── 유물·축복 (T4 items.js의 id 그대로) ──
  't4-ambush-sand': at(hourglass(), 9, 12, 0.86) + at(DAG, 16, 12.6, 0.74, 45),
  't4-shock-bell': at(BELL, 12, 12.4, 0.84) + L('M3.4 8.4c-1.2 2.4-1.2 5.2 0 7.6', '#9ff3ff', 1.3) + L('M20.6 8.4c1.2 2.4 1.2 5.2 0 7.6', '#9ff3ff', 1.3) + D('M1.4 6.6c-1.4 3.4-1.2 7 0 10.8', '#9ff3ff', 0.9, 0.7),
  't4-lunge-cord': L('M12 4.6C9.2 2.4 4.6 2.8 4.2 5.8s4.4 3.4 4.2 6.4S4.8 15.8 2.8 15.2', '#d8a066', 1.5)
    + L('M12 15.6c-3.4.2-5.2-1.6-5.6-4.6', '#c8cfdb', 2) + L('M12 15.6c3.4.2 5.2-1.6 5.6-4.6', '#c8cfdb', 2) + L('M12 15.6v4.8', '#c8cfdb', 2)
    + P('M6.4 11.6l-.2-3 2.4 1.8z', g('steel')) + P('M17.6 11.6l.2-3-2.4 1.8z', g('steel')) + P('M12 22.4l-1.6-2.6h3.2z', g('steel'))
    + R(11, 4.4, 2, 11.4, 0.8, g('steel')) + C(12, 3.8, 1.7, 'none', ` stroke="${OUT}" stroke-width="2.6"`) + C(12, 3.8, 1.7, 'none', ' stroke="#c8cfdb" stroke-width="1.1"'),
  't4-cracked-shield': P(SHIELD, g('steel')) + P('M12 4.4l6.2 2.3v4.9c0 3.9-2.7 6.7-6.2 8.4-3.5-1.7-6.2-4.5-6.2-8.4V6.7z', 'none', ' stroke="#d9a640" stroke-width="1"') + D('M13.6 2.8l-2.4 5 3.2 2.8-2.8 4.2 1.2 4.4', '#20262e', 1.3) + HL('M6 7l3-1.2'),
  't4-spare-heart': at(heart(), 11, 11, 0.92) + C(18, 18, 4.2, g('gold')) + R(16.9, 15.4, 2.2, 5.2, 0.4, '#5a3a0a', NS) + R(15.4, 16.9, 5.2, 2.2, 0.4, '#5a3a0a', NS),
  't4-iron-boots': P('M6.6 2.8h6.6v9.8l5.8 2.6c1.4.6 2.2 1.8 2.2 3.2v.8H4.6v-3l2-1.4z', g('steel')) + R(4.6, 19, 16.6, 2.6, 0.6, '#3a3f4a') + D('M6.6 6h6.6M6.6 9h6.6', '#5a6474', 0.9) + C(9, 14, 0.8, '#5a6474', NS) + C(15, 15.6, 0.8, '#5a6474', NS) + HL('M8 4v7'),
  't4-dusk-cloak': P('M2.4 15.6a9.6 9.6 0 0 1 19.2 0z', g('dusk')) + P('M12 4.2c3.6 0 6.2 3 6.2 7.2v10H5.8v-10c0-4.2 2.6-7.2 6.2-7.2z', g('cloth')) + P('M12 8.2c-2 0-3.3 1.8-3.3 3.9v2.6h6.6v-2.6c0-2.1-1.3-3.9-3.3-3.9z', '#0c0d14', NS) + C(10.6, 11.8, 0.65, '#ffd27a', NS) + C(13.4, 11.8, 0.65, '#ffd27a', NS) + D('M12 15.4v6', '#232638', 0.9),
  't4-moon-step': at(P(CRESC, g('moon')), 9, 9, 0.74) + at(FOOT(g('moon')), 16.6, 15, 0.72, 20) + spk(4.4, 19, 1.8, '#e2fdff'),
  't4-light-glass': at(hourglass(), 12, 12, 0.84) + P('M16.4 9.2c2.6-1.4 5-1.2 6 .4-1.6.1-2.7.6-3.3 1.2 1.3 0 2.2.5 2.6 1.4-1.5-.2-2.8.1-4.1.8z', g('bone')) + P('M7.6 9.2c-2.6-1.4-5-1.2-6 .4 1.6.1 2.7.6 3.3 1.2-1.3 0-2.2.5-2.6 1.4 1.5-.2 2.8.1 4.1.8z', g('bone')),
  't4-thief-pouch': P('M7.4 9.4c-2.2 2.2-3.4 5-3.4 7.4 0 2.8 3.2 4.4 8 4.4s8-1.6 8-4.4c0-2.4-1.2-5.2-3.4-7.4z', g('wood')) + P('M8.6 8.2c-1.2-1.6-.6-3.8 1-4.4.8 1 1.4 1.6 2.4 1.6s1.6-.6 2.4-1.6c1.6.6 2.2 2.8 1 4.4z', g('wood')) + R(7.4, 7.8, 9.2, 2, 1, '#5a3216')
    + C(17, 17, 3.6, g('gold')) + C(17, 17, 2, 'none', ' stroke="#9a5d16" stroke-width=".8"') + HL('M6.6 13.6c.2 1.8.8 3.2 1.8 4'),
  't4-gate-wedge': R(4, 2.6, 16, 2.2, 0.6, g('stone')) + [5.4, 9.1, 12.8, 16.5].map(x => R(x, 4.4, 2, 11.8, 0.5, g('gold')) + P(`M${x} 16.2h2l-1 2.4z`, g('gold'))).join('') + R(4.2, 7.6, 15.6, 1.6, 0.5, g('gold')) + R(4.2, 11.6, 15.6, 1.6, 0.5, g('gold')) + P('M3 21.6h12.6L3 16.8z', g('wood')),
  't4-blood-sand': hourglass(g('red')) + at(P(DROP, g('red')) + HL('M10.6 9.4c0-1 .5-2 1-2.8'), 19.2, 16.2, 0.52),
  't4-reverse-glass': at(hourglass(), 12, 12, 0.7) + L('M4.6 9.2A7.8 7.8 0 0 1 16.2 4.6', '#9ff3ff', 1.5) + P('M15 2l4.4 3.4-5 1.6z', '#9ff3ff') + L('M19.4 14.8A7.8 7.8 0 0 1 7.8 19.4', '#9ff3ff', 1.5) + P('M9 22 4.6 18.6l5-1.6z', '#9ff3ff'),
  't4-time-ripple': L(spiral(12, 12, 0.6, 0.76, 1.75), '#8ff0ff', 1.8) + C(12, 12, 1.6, g('gold')),
  't4-held-breath': P('M12 2.8c4.6 0 7.2 3 7.2 7.6 0 5.2-3.6 9.6-7.2 10.8-3.6-1.2-7.2-5.6-7.2-10.8 0-4.6 2.6-7.6 7.2-7.6z', g('bone')) + D('M7.8 10.2c.8.9 2 .9 2.8 0M13.4 10.2c.8.9 2 .9 2.8 0', OUT, 1.2) + D('M9.4 15.4h5.2', OUT, 1.2) + D('M10.6 14.5v1.8M12 14.5v1.8M13.4 14.5v1.8', OUT, 0.8) + spk(20, 4.6, 2.8, '#bff6ff') + spk(4, 5.6, 2, '#bff6ff'),
  't4-blinkers': P(EYE, g('bone')) + C(12, 12, 3.6, g('teal')) + C(12, 12, 1.6, OUT, NS) + P('M2 12c2.6-4.8 6.2-7 10-7s7.4 2.2 10 7c-2.6-.2-4.6-1.4-10-1.4S4.6 11.8 2 12z', g('sand')) + C(8, 20.6, 0.8, '#f2c66f', NS) + C(12, 21.6, 0.8, '#f2c66f', NS) + C(16, 20.6, 0.8, '#f2c66f', NS),
  't4-assassin-eye': P(EYE, g('bone')) + C(12, 12, 4, g('red')) + C(12, 12, 1.5, OUT, NS) + D('M12 1.6v5M12 17.4v5M.8 12h3.4M19.8 12h3.4', '#ffd27a', 1.3) + C(12, 12, 6.8, 'none', ' stroke="#ffd27a" stroke-width=".9" stroke-dasharray="2.6 2.4"'),
  't4-rewind-spring': R(5, 2.2, 14, 2.4, 0.8, g('gold')) + R(5, 19.4, 14, 2.4, 0.8, g('gold')) + L('M7 4.8 17 7.2 7 9.6 17 12 7 14.4 17 16.8 7 19.2', '#d8dee8', 1.6) + C(18.6, 18, 3.8, g('teal')) + P('M15.9 18l2.3-1.7v3.4zM18.6 18l2.3-1.7v3.4z', '#0d2a30', NS),
  't4-throw-knife': at(DAG, 14, 10, 0.92, 45) + D('M2.8 15.4l4.4-4.4M5 19.8l4-4M2.4 20.6l1.8-1.8', '#cfe9ff', 1.3, 0.9),
  't4-arrow-glove': at(ARROW, 12, 11, 1, 45) + P('M6.4 21.6v-4.2c-1.6-1-2.4-2.6-2.2-4.2l.8-3c.3-1.2 1.6-1.6 2.6-.8l.8.8V8c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v-.6c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v1c0-1 .8-1.6 1.7-1.6s1.7.8 1.7 1.7v6.8c0 2.6-1.4 4.6-3 5.6v.9z', g('wood')) + R(5.6, 19.4, 10, 2.8, 0.8, '#5a3216') + D('M9.4 8v4.4M13 7.4v5', '#5a3216', 0.8),
  't4-harvest': L('M12 21.2V9.6M12 21.2 7.6 10.4M12 21.2l4.4-10.8', '#c99a3a', 1.1)
    + E(12, 6.2, 1.9, 4, g('gold')) + E(7, 7.8, 1.7, 3.6, g('gold'), ' transform="rotate(-22 7 7.8)"') + E(17, 7.8, 1.7, 3.6, g('gold'), ' transform="rotate(22 17 7.8)"')
    + D('M10.6 5h2.8M10.6 7.4h2.8M5.8 7.2l2.6-1M6.2 9.6l2.6-1M15.6 6.2l2.6 1M15.2 8.6l2.6 1', '#9a5d16', 0.7) + R(9.4, 15.2, 5.2, 2, 0.8, '#8a5a1a'),
  't4-last-grain': hourglass(g('sand'), g('wood'), false, 'small') + spk(12, 12.4, 4.4, '#fff1b0') + C(12, 12.4, 1.2, '#ffffff', NS),
  't4-sandbag': P('M6.6 8.2c-1.8 3.2-2.4 6.6-1.8 9.6.6 2.6 3.2 3.8 7.2 3.8s6.6-1.2 7.2-3.8c.6-3 0-6.4-1.8-9.6z', g('burlap')) + P('M8.4 8.2c-.8-1.8-.2-3.6 1.4-4.4.8.8 1.4 1.2 2.2 1.2s1.4-.4 2.2-1.2c1.6.8 2.2 2.6 1.4 4.4z', g('burlap')) + R(7.6, 7.4, 8.8, 1.8, 0.9, '#7a4a20')
    + P('M10.2 12.2h3.6l-1.8 2.4 1.8 2.4h-3.6l1.8-2.4z', '#8a5a2a', NS) + C(20.8, 21.4, 0.8, '#f2c66f', NS) + C(19, 22.4, 0.6, '#f2c66f', NS),
  't4-double-moment': at(FIG(g('gold')), 8.6, 12, 0.92) + at(FIG(g('teal')), 15.4, 12.6, 0.92, 0, 0.92) + spk(20.6, 3.6, 2.2, '#ffffff'),
  't4-shadow-step': at(PRINT(g('cloth')), 6.2, 16.4, 0.6, 16, 0.85) + at(PRINT(g('cloth')), 13.6, 11, 0.6, 16, 0.85) + at(PRINT(g('gold')), 8.2, 14.6, 0.6, 16) + at(PRINT(g('gold')), 15.8, 9, 0.6, 16),
  't4-glass-dagger': at(P('M12 1.6l3 4v8.6H9V5.6z', g('crys')) + D('M12 1.6v12.6M9 5.6l3 2 3-2', '#ffffff', 0.7, 0.85) + R(7.4, 14, 9.2, 2, 1, g('gold')) + R(10.8, 16, 2.4, 4.2, 0.8, g('violet')) + C(12, 21.2, 1.5, g('crys')), 12, 12, 1, 45) + spk(19.6, 4.4, 2.6, '#ffffff'),
  't4-hourglass-heart': at(heart(), 12, 11.6, 1.05) + P('M9.4 8.4h5.2l-2.6 3.6 2.6 3.6H9.4l2.6-3.6z', g('gold')),
  't4-afterimage': at(FIG(g('ghost')), 7, 12.4, 0.88, 0, 0.55) + at(FIG(g('ghost')), 10.4, 12.2, 0.9, 0, 0.8) + at(FIG(g('cloth')), 14.6, 12, 0.92) + at(R(9.6, 12.4, 4.8, 1.8, 0.8, '#d8343a', NS), 14.6, 12, 0.92),
  't4-crossed-tracks': at(PAW(g('gold')), 7.4, 7.4, 0.62, -30) + at(PAW(g('gold')), 16.4, 16.4, 0.62, -30) + at(PAW(g('teal')), 16.6, 7.4, 0.62, 30) + at(PAW(g('teal')), 7.4, 16.6, 0.62, 30),
  't4-shield-gap': P('M4.4 3.2h6.6v18.4l-4.4-1.6c-1.4-.6-2.2-1.8-2.2-3.4z', g('steel')) + P('M13 3.2h6.6v13.4c0 1.6-.8 2.8-2.2 3.4L13 21.6z', g('steel')) + D('M12 3v18.6', '#ffd27a', 1.4) + C(7.6, 7, 0.8, '#5a6474', NS) + C(16.4, 7, 0.8, '#5a6474', NS) + HL('M6 5.4v9'),
  't4-shaky-aim': R(11, 7, 2, 14.4, 0.8, g('wood')) + L('M3.2 11C6 7.2 18 7.2 20.8 11', '#c8cfdb', 1.8) + D('M3.2 11 12 13.6 20.8 11', '#efe9da', 0.8) + R(11.4, 3, 1.2, 9.6, 0.4, '#efe9da') + P('M12 1.2l1.5 2.6h-3z', g('steel'))
    + D('M1.2 16.6c.8-.7 1.6.7 2.4 0s1.6.7 2.4 0M17.8 16.6c.8-.7 1.6.7 2.4 0s1.6.7 2.4 0M1.2 19.6c.8-.7 1.6.7 2.4 0s1.6.7 2.4 0M17.8 19.6c.8-.7 1.6.7 2.4 0s1.6.7 2.4 0', '#9ff3ff', 1.1),
  't4-deep-sleep': P('M2.6 11.6c2.4 3.6 5.8 5.4 9.4 5.4s7-1.8 9.4-5.4c-2.6 1.4-5.6 2-9.4 2s-6.8-.6-9.4-2z', g('mem')) + D('M5.4 14.6l-1.2 1.8M9 16.2l-.6 2.2M15 16.2l.6 2.2M18.6 14.6l1.2 1.8', '#d9ccff', 1) + L('M12.6 2.6h4l-4 4.4h4', '#e6ddff', 1.2) + L('M18.4 7h2.8l-2.8 3.2h2.8', '#e6ddff', 1),
  't4-beast-hide': P('M6 2.8l3 2h6l3-2 1.2 4.2-2 2 1 5-2 2 1 4.2-3 2.2H9.8l-3-2.2 1-4.2-2-2 1-5-2-2z', g('wood')) + E(10, 9, 1.4, 1, '#5a3216', NS) + E(14.4, 12, 1.6, 1.1, '#5a3216', NS) + E(10.6, 15.6, 1.3, 0.9, '#5a3216', NS) + E(14, 17.8, 1, 0.8, '#5a3216', NS) + HL('M8.8 6.6c-.4 2-.4 4 0 6'),
  't4-spirit-charm': L('M12 1.4v3.6', '#e0a840', 1.1) + C(12, 13, 8.2, g('gold')) + C(12, 13, 6.2, g('blue')) + C(12, 13, 4, g('bone')) + C(12, 13, 2.5, g('teal')) + C(12, 13, 1.1, OUT, NS) + HL('M7 10.4a5.6 5.6 0 0 1 2.4-2.6'),
  't4-winding-key': E(7.2, 7.4, 4.2, 3.2, g('gold'), ' transform="rotate(-24 7.2 7.4)"') + E(16.8, 7.4, 4.2, 3.2, g('gold'), ' transform="rotate(24 16.8 7.4)"') + E(7.2, 7.4, 1.8, 1.1, OUT, ' stroke="none" transform="rotate(-24 7.2 7.4)"') + E(16.8, 7.4, 1.8, 1.1, OUT, ' stroke="none" transform="rotate(24 16.8 7.4)"')
    + R(10.9, 9, 2.2, 10, 0.6, g('gold')) + C(12, 9.6, 2.4, g('gold')) + R(9.8, 18.4, 4.4, 3.4, 0.6, g('gold')) + C(12, 20.1, 0.8, OUT, NS),
  't4-feather-ankle': P('M2.6 14c3-7.4 9.2-10.6 19-10.8-1.6 2-3.6 3.1-5.8 3.4 1.6.3 2.6.9 3.3 1.8-2 .3-3.6.5-5.2.3 1 .6 1.8 1.4 2 2.4-1.8.2-3.4 0-4.8-.5.5.9.7 1.7.6 2.6-3.1.6-5.6.9-9.1.8z', g('bone')) + D('M4.4 13.6c3.6-2.4 8-4.4 13-6.2M9 13.2l1.8-2.2M12.8 11.4l1.6-1.8', '#a99f88', 0.8) + R(3, 16.6, 9, 3, 1.4, g('gold')) + HL('M6 11c2-2.6 5-4.6 9-6'),
  't4-elite-hunter': L('M6.6 2.6C15 6.4 15 17.6 6.6 21.4', '#b07a44', 2) + D('M6.6 2.6v18.8', '#efe9da', 0.8) + R(3.6, 11.2, 15.6, 1.6, 0.6, g('wood')) + P('M22.2 12l-3.6 2.3V9.7z', g('steel')) + P('M4.8 12 2.2 9.6h2.6l2.2 2.4-2.2 2.4H2.2z', g('red')) + spk(19.4, 4.6, 2.8, '#ffd27a'),
  't4-moon-edge': C(12, 12, 9, g('moon')) + C(8.2, 8.6, 1.5, '#9ccfe0', NS) + C(15.6, 16.4, 1.1, '#9ccfe0', NS) + at(SWORD, 12, 12, 0.98, -40),
  // ── 저주 (보랏빛) ──
  't4-curse-blood': CONTRACT + at(P(DROP, g('red')), 16.4, 16.6, 0.62) + R(5.2, 17.6, 6.4, 1.4, 0.6, g('violet')),
  't4-curse-lead': hourglass(g('violet'), g('lead')) + R(3.6, 20.4, 16.8, 1.6, 0.6, '#2c2938', NS),
  't4-curse-glass': P(HEART, g('violet')) + D('M12 6.8l-1.6 3.6 2.6 2-2 3.4 1 3', '#ffffff', 1.2, 0.95) + spk(19.4, 17, 2, '#e6d4ff') + spk(4.2, 4.4, 1.6, '#e6d4ff') + HL('M5.8 8.4a2.6 2.6 0 0 1 2.5-2'),
  't4-curse-thin': at(FIG(g('violet')), 12, 10.2, 0.95, 0, 0.72) + L('M2.4 17.2c2-1.2 3.6-1.2 5.6 0s3.6 1.2 5.6 0 3.6-1.2 5.6 0 1.2.4 2.4.2', '#c8d6e0', 1.2) + L('M1.6 21c2-1.2 3.6-1.2 5.6 0s3.6 1.2 5.6 0 3.6-1.2 5.6 0', '#9aaab8', 1.2),
  't4-curse-debt': CONTRACT + C(16.4, 16.8, 4, g('gold')) + C(16.4, 16.8, 2.4, 'none', ' stroke="#9a5d16" stroke-width=".8"') + R(5.2, 17.6, 6.4, 1.4, 0.6, g('violet')),
  't4-curse-crown': P('M3.2 18.2 2.4 7.4l5 4 4.6-7.2 4.6 7.2 5-4-.8 10.8z', g('gold')) + R(2.8, 17.2, 18.4, 3.6, 1, g('gold')) + C(12, 19, 1.3, g('violet')) + C(7, 19, 1, g('violet')) + C(17, 19, 1, g('violet'))
    + C(2.4, 7.2, 1.3, g('violet')) + C(12, 4, 1.4, g('violet')) + C(21.6, 7.2, 1.3, g('violet')) + HL('M5 12.6l1.2 3'),
};
// 다른 이름으로도 부를 수 있게 (해금 id 등)
const ALIAS = { 'start-pick': 'gift', reroll: 'dice', heal: 'heart', 'rest-heal': 'heart', 'no-curse': 'candle', archive: 'scroll' };
// 글 속 이모지 → 아이콘 (토스트·안내·다른 트랙 HUD). ◆◇는 T3 시험 방 이름 표시라 그대로 둔다
const GLYPH = {
  '🪙': 'coin', '⌛': 'sand', '⏳': 'sand', '♥': 'heart', '❤': 'heart', '💗': 'heart', '🔪': 'knife', '➶': 'arrow', '🧠': 'memory', '✧': 'memory',
  '✦': 'synergy', '⚠': 'warn', '⬆': 'up', '✓': 'check', '💡': 'tip', '★': 'star', '☆': 'star-empty', '⟲': 'rewind', '🌰': 'seed', '🗝': 'key',
  '🔥': 'flame', '🎁': 'gift', '📜': 'scroll', '🎲': 'dice', '👛': 'purse', '🕯': 'candle', '🕊': 'purify', '➡': 'next', '❔': 'unknown',
  '⚔': 'combat', '☠': 'elite', '⚖': 'shop', '☾': 'rest', '♜': 'guard', '♛': 'boss',
  '🪽': 't4-feather-ankle', '⏪': 't4-rewind-spring', '💠': 't4-hourglass-heart', '🥾': 't4-iron-boots', '🧤': 't4-arrow-glove', '🐗': 't4-beast-hide',
  '🧿': 't4-spirit-charm', '🛡': 't4-cracked-shield', '👥': 't4-double-moment', '🌾': 't4-harvest', '💎': 't4-glass-dagger', '🏹': 't4-elite-hunter', '🌕': 't4-moon-edge',
};
export const GLYPH_RE = new RegExp('(' + Object.keys(GLYPH).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'gu');
export const glyphIcon = ch => GLYPH[String(ch).replace(/️/g, '')] || null;

export const ICON_IDS = () => Object.keys(ICONS);
export const hasIcon = id => !!(ICONS[id] || ICONS[ALIAS[id]]);
const real = id => (ICONS[id] ? id : ALIAS[id] && ICONS[ALIAS[id]] ? ALIAS[id] : null);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROOT = `fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`;

// ───────── 문서에 한 번 깔아 두는 그림 묶음 (<symbol>) ─────────
let sheet = null;
export function ensureSheet() {
  if (sheet && sheet.isConnected) return sheet;
  if (typeof document === 'undefined' || !document.body) return null;
  const NSV = 'http://www.w3.org/2000/svg';
  sheet = document.createElementNS(NSV, 'svg');
  sheet.setAttribute('id', 'yk5-icons'); sheet.setAttribute('aria-hidden', 'true');
  sheet.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  sheet.innerHTML = `<defs>${gradDefs(PFX)}</defs>` + Object.entries(ICONS).map(([id, s]) => `<symbol id="${PFX}i-${id}" viewBox="0 0 24 24"><g ${ROOT}>${s}</g></symbol>`).join('');
  document.body.insertBefore(sheet, document.body.firstChild);
  return sheet;
}
export function addIcon(id, svg) {
  ICONS[id] = svg; urlCache.delete(id);
  if (sheet && sheet.isConnected) {
    const old = sheet.querySelector(`#${CSS.escape(PFX + 'i-' + id)}`); if (old) old.remove();
    sheet.insertAdjacentHTML('beforeend', `<symbol id="${PFX}i-${id}" viewBox="0 0 24 24"><g ${ROOT}>${svg}</g></symbol>`);
  }
}

/** icon(id, { cls, fb, title, size }) → HTML 문자열. 등록 안 된 id면 fb(또는 id 글자)를 그대로 */
export function icon(id, { cls = '', fb = null, title = null, size = null } = {}) {
  const r = real(id);
  if (!r) { // 이모지가 그대로 오면 그 이모지의 아이콘으로
    const gi = glyphIcon(id);
    if (gi) return icon(gi, { cls, title, size });
    return `<span class="yi-fb${cls ? ' ' + cls : ''}">${esc(fb != null ? fb : id)}</span>`;
  }
  ensureSheet();
  const st = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<svg class="yi yi-${r}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"${st}>${title ? `<title>${esc(title)}</title>` : ''}<use href="#${PFX}i-${r}"/></svg>`;
}
/** 혼자 서는 SVG 문서 (CSS 배경·캔버스용) */
export function iconSvg(id, px = 24) {
  const r = real(id) || 'unknown';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}"><defs>${gradDefs(PFX)}</defs><g ${ROOT}>${ICONS[r]}</g></svg>`;
}
const urlCache = new Map();
export function iconUrl(id) {
  if (!urlCache.has(id)) urlCache.set(id, `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(id, 48))}")`);
  return urlCache.get(id);
}
const imgCache = new Map();
/** three.js 캔버스에 그릴 그림 (불러지면 resolve) */
export function iconImage(id, px = 128) {
  const key = id + '@' + px;
  if (!imgCache.has(key)) {
    imgCache.set(key, new Promise(res => {
      const im = new Image(px, px);
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg(id, px));
    }));
  }
  return imgCache.get(key);
}

// ───────── 글 속 이모지를 그림으로 (토스트·안내·다른 트랙 HUD) ─────────
// 글자 노드만 쪼개서 바꾼다 — 옆의 요소(막대·숫자 칸)는 그대로라 다른 코드가 들고 있는 참조가 안 깨진다
const SKIP = new Set(['STYLE', 'SCRIPT', 'TEXTAREA', 'INPUT', 'svg', 'SVG', 'TITLE', 'title']);
function fixText(node) {
  const s = node.nodeValue;
  if (!s || !GLYPH_RE.test(s)) { GLYPH_RE.lastIndex = 0; return; }
  GLYPH_RE.lastIndex = 0;
  const p = node.parentNode;
  if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest('[data-noicon], .yi'))) return;
  const frag = document.createDocumentFragment(), tpl = document.createElement('template');
  let last = 0;
  s.replace(GLYPH_RE, (m, ch, off) => {
    if (off > last) frag.appendChild(document.createTextNode(s.slice(last, off)));
    tpl.innerHTML = icon(glyphIcon(ch), { cls: 'yi-g' });
    frag.appendChild(tpl.content.firstChild);
    last = off + m.length;
    return m;
  });
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  p.replaceChild(frag, node);
}
export function iconize(root) {
  if (!root) return;
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list = []; for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  for (const n of list) fixText(n);
}
/** root 아래에 새로 들어오는 글에서 이모지를 계속 그림으로 바꾼다 */
export function watch(root) {
  if (!root || root.__yk5watch) return;
  root.__yk5watch = true;
  iconize(root);
  new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'characterData') fixText(r.target);
      else for (const n of r.addedNodes) iconize(n);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
