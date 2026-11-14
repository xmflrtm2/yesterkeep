// T5 — 화면 말투 한 벌: 시대별 색 변수(어제 = 금박, 오늘 = 무너진 청록 돌), 판넬 틀·제목·단추, HUD 손질.
// 다른 트랙 화면(T1 메뉴·지도·요약, T4 고르기·상점·쉼터)은 여기 변수(--pn-*)와 클래스(.yk-frame …)를 쓴다.
// 공용 파일(index.html·main.js)은 고치지 않고, 그쪽 HUD 모양은 이 스타일로 덮는다(나중 스타일이 이김 → init에서 맨 끝에 넣음).
import { iconUrl, OUT } from './icons.js';

const enc = s => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}")`;
const svg = (body, vb = '0 0 24 24') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
// 판넬 모서리 장식: 왼쪽 위 하나를 그리고 돌려서 네 귀퉁이
const rot = (b, deg) => `<g transform="rotate(${deg} 12 12)">${b}</g>`;
const CORNER = {
  past: `<path d="M2.5 21V8A5.5 5.5 0 0 1 8 2.5h13" fill="none" stroke="${OUT}" stroke-width="4.4" stroke-linecap="round"/>`
    + `<path d="M2.5 21V8A5.5 5.5 0 0 1 8 2.5h13" fill="none" stroke="#e9bf63" stroke-width="2.2" stroke-linecap="round"/>`
    + `<path d="M6.5 16V10a3.5 3.5 0 0 1 3.5-3.5h6" fill="none" stroke="#fff0c0" stroke-width=".9" stroke-opacity=".75" stroke-linecap="round"/>`
    + `<path d="M5.2 2.2l3 3-3 3-3-3z" fill="#ffe6a0" stroke="${OUT}" stroke-width="1.2"/>`,
  now: `<path d="M1.2 22.6V1.2h21.4v5.6H7.4v15.8z" fill="#3f6a70" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>`
    + `<path d="M2.6 21V2.6h18.6" fill="none" stroke="#9fe4ec" stroke-width=".9" stroke-opacity=".7"/>`
    + `<path d="M4.2 9.6l1.6 1.4-.8 2.2M12.6 2.2l-1 2.6 1.6 1.2" fill="none" stroke="#132a2e" stroke-width="1"/>`
    + `<path d="M22.6 6.8l1.4.8-1.4 1.2z M7.4 22.6l.8 1.4-1.6.2z" fill="#3f6a70" stroke="${OUT}" stroke-width=".8"/>`,
};
const corners = era => [0, 90, 270, 180].map(d => enc(svg(rot(CORNER[era], d))));
// 제목 아래 띠: 가운데 마름모 + 양쪽으로 가늘어지는 선
const DIVIDER = {
  past: svg(`<defs><linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#e9bf63" stop-opacity="0"/><stop offset=".5" stop-color="#e9bf63"/><stop offset="1" stop-color="#e9bf63" stop-opacity="0"/></linearGradient></defs><rect x="0" y="5" width="200" height="2" fill="url(#a)"/><path d="M100 1.4l4.6 4.6-4.6 4.6-4.6-4.6z" fill="#ffe6a0" stroke="${OUT}" stroke-width="1"/><circle cx="88" cy="6" r="1.4" fill="#e9bf63"/><circle cx="112" cy="6" r="1.4" fill="#e9bf63"/>`, '0 0 200 12'),
  now: svg(`<defs><linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#6cc4cc" stop-opacity="0"/><stop offset=".5" stop-color="#6cc4cc"/><stop offset="1" stop-color="#6cc4cc" stop-opacity="0"/></linearGradient></defs><rect x="0" y="5" width="92" height="2" fill="url(#a)"/><rect x="108" y="5" width="92" height="2" fill="url(#a)"/><path d="M96 2.4h8l1.6 3.6-2 4.2h-7.2l-2-4.2z" fill="#3f6a70" stroke="${OUT}" stroke-width="1"/><path d="M99 4l1.2 2-1 2.6" fill="none" stroke="#132a2e" stroke-width=".8"/>`, '0 0 200 12'),
};

export function themeCss() {
  const cp = corners('past'), cn = corners('now');
  const pos = 'top left, top right, bottom left, bottom right';
  return `
/* ───────── T5 아이콘 기본 ───────── */
.yi { display: inline-block; width: 1em; height: 1em; vertical-align: -.16em; overflow: visible; flex: none; }
.yi-g { margin: 0 .05em; }
.yi-fb { display: inline-block; min-width: 1em; text-align: center; }
#hud .yi, #ext .yi, #endCard .yi { filter: drop-shadow(0 1px 1.4px #000d); }

/* ───────── 시대별 색 (body.past = 어제 금박, body.now = 오늘 청록 돌) ───────── */
body {
  --pn-bg: linear-gradient(180deg, #211a10f2, #0f0b07f6);
  --pn-edge: #e2b65e; --pn-edge-dk: #6e4a1a; --pn-edge-lt: #fff0c0; --pn-glow: #ffcf6a40;
  --pn-title: #ffe2a0; --pn-accent: #ffd27a; --pn-dim: #cdb88e; --pn-ink: #f6ead2;
  --pn-btn: linear-gradient(180deg, #3a2c18ee, #1d150bee); --pn-btn-sel: linear-gradient(180deg, #6a4c22f2, #33240ff2);
  --pn-tex: repeating-linear-gradient(135deg, #ffffff05 0 2px, transparent 2px 7px);
  --pn-corner: url(""); --pn-div: ${enc(DIVIDER.past)};
}
body.now {
  --pn-bg: linear-gradient(180deg, #11201ff2, #070f10f6);
  --pn-edge: #6cc4cc; --pn-edge-dk: #1f4248; --pn-edge-lt: #d6fbff; --pn-glow: #7fe8ff30;
  --pn-title: #c6f6ff; --pn-accent: #7fe8ff; --pn-dim: #92b6bb; --pn-ink: #e6f2f2;
  --pn-btn: linear-gradient(180deg, #1b2e31ee, #0c1719ee); --pn-btn-sel: linear-gradient(180deg, #275058f2, #12282cf2);
  --pn-tex: repeating-linear-gradient(115deg, #ffffff04 0 1px, transparent 1px 9px), repeating-linear-gradient(25deg, #00000018 0 2px, transparent 2px 13px);
  --pn-div: ${enc(DIVIDER.now)};
}

/* ───────── 판넬 틀 (.yk-frame) — 네 귀퉁이 장식은 ::before 하나에 배경 넷 ───────── */
.yk-frame { position: relative; background: var(--pn-tex), var(--pn-bg); border: 1.5px solid var(--pn-edge); border-radius: 5px; color: var(--pn-ink);
  box-shadow: 0 0 0 1px #000c, inset 0 0 0 1px var(--pn-edge-dk), inset 0 0 0 3px #0009, inset 0 0 0 4px color-mix(in srgb, var(--pn-edge) 30%, transparent), 0 14px 34px #000d, 0 0 26px var(--pn-glow); }
.yk-frame::before { content: ''; position: absolute; inset: -7px; pointer-events: none; background: ${cp.map(u => u + ' no-repeat').join(', ')}; background-size: 26px 26px; background-position: ${pos}; }
body.now .yk-frame::before { background: ${cn.map(u => u + ' no-repeat').join(', ')}; background-size: 24px 24px; background-position: ${pos}; }
.yk-h { color: var(--pn-title); font-weight: 800; letter-spacing: 1px; text-shadow: 0 2px 0 #000, 0 0 18px var(--pn-glow); }
.yk-h::after { content: ''; display: block; height: 12px; margin: 6px auto 0; width: min(320px, 80%); background: var(--pn-div) center / 100% 100% no-repeat; }
.yk-btn { font: inherit; color: var(--pn-ink); background: var(--pn-tex), var(--pn-btn); border: 1px solid var(--pn-edge-dk); border-radius: 5px; cursor: pointer; position: relative;
  box-shadow: inset 0 1px 0 #ffffff1c, inset 0 -2px 0 #0006, 0 2px 0 #000b; transition: background .12s, border-color .12s, box-shadow .12s, transform .12s; }
.yk-btn.sel, .yk-btn:hover { border-color: var(--pn-edge); background: var(--pn-tex), var(--pn-btn-sel); box-shadow: inset 0 1px 0 #ffffff2a, 0 0 0 1px var(--pn-edge), 0 0 18px var(--pn-glow), 0 2px 0 #000b; }
.yk-btn.sel::before { content: ''; position: absolute; left: -30px; top: 50%; width: 26px; height: 26px; margin-top: -13px; background: ${iconUrl('cursor')} center / contain no-repeat; filter: drop-shadow(0 1px 1px #000); animation: yk5nudge .9s ease-in-out infinite; }
@keyframes yk5nudge { 50% { transform: translateX(4px); } }

/* ───────── HUD ───────── */
/* 고르기·쉼터 창(T4)이 떠 있으면 그 뒤 HUD 글을 숨긴다 (T1 덮개는 T1 CSS가 이미 함) */
body:has(#t4-ov.on) #hud #hint, body:has(#t4-ov.on) #hud #prompt, body:has(#t4-ov.on) #hud #toast, body:has(#t4-ov.on) #hud #roomTitle, body:has(#t4-ov.on) #t4-near { visibility: hidden; }
/* 밝은 금빛 바닥에서도 읽히게 위쪽 두 귀퉁이를 살짝 어둡게 */
#hud::before { content: ''; position: absolute; z-index: -1; left: 0; top: 0; width: 360px; height: 150px; background: radial-gradient(ellipse at 0 0, #000b 0%, #0006 38%, transparent 72%); pointer-events: none; }
#hud::after { content: ''; position: absolute; z-index: -1; right: 0; top: 0; width: 300px; height: 120px; background: radial-gradient(ellipse at 100% 0, #000a 0%, #0005 40%, transparent 72%); pointer-events: none; }
#hearts { display: flex; gap: 1px; letter-spacing: 0; left: 14px; top: 11px; font-size: 27px; line-height: 1; }
#hearts span { display: inline-flex; }
#hearts .off .yi { filter: grayscale(.85) brightness(.34) drop-shadow(0 1px 1px #000d); }
#hearts .yi { transition: transform .2s; }
#shards .yi, #toast .yi, #roomTitle .yi { width: 1.1em; height: 1.1em; }
/* 시대 이름 옆 문장(어제 해 · 오늘 이지러진 달) */
#era .name { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
#era .name::before { content: ''; width: 30px; height: 30px; background: ${iconUrl('era-now')} center / contain no-repeat; filter: drop-shadow(0 2px 3px #000c); }
body.past #era .name::before { background-image: ${iconUrl('era-past')}; animation: yk5spin 18s linear infinite; }
@keyframes yk5spin { to { transform: rotate(360deg); } }
#era .cd { height: 6px; border-radius: 1px; background: #000a; border: 1px solid var(--pn-edge-dk); box-shadow: 0 0 0 1px #0008; }
body.past #era .cd i { background: linear-gradient(180deg, #fff0b8, #e2a83e 60%, #a8681c); }
body.now #era .cd i { background: linear-gradient(180deg, #d6fbff, #6cc4cc 60%, #2a6c74); }
/* 성채지기 체력: 보석 점 */
#boss .name { font-weight: 700; color: var(--pn-title); text-shadow: 0 2px 0 #000, 0 0 12px var(--pn-glow); }
#boss .name::before, #boss .name::after { content: ''; display: inline-block; width: 46px; height: 8px; vertical-align: middle; margin: 0 8px; background: var(--pn-div) center / 200% 100% no-repeat; }
#boss .pips { gap: 9px; margin-top: 8px; }
#boss .pips i { width: 14px; height: 14px; transform: rotate(45deg); border-radius: 2px; background: linear-gradient(135deg, #ffd6c8, #ef4d47 45%, #7a1220); border: 1.5px solid ${OUT};
  box-shadow: 0 0 0 1px #ffb08a55, 0 0 10px #ff5a4088; }
#boss .pips i.off { background: #2a1a1c; border-color: #4a3034; box-shadow: none; }
/* 두 번 실패하면 나오는 tip 앞 등불 */
#hint.tip::before { content: ''; display: inline-block; width: 1.25em; height: 1.25em; margin-right: .3em; vertical-align: -.28em; background: ${iconUrl('tip')} center / contain no-repeat; filter: drop-shadow(0 0 6px #ffc04a88); }
#prompt { background: var(--pn-tex), var(--pn-bg); border: 1px solid var(--pn-edge); border-radius: 5px; box-shadow: 0 0 0 1px #000c, inset 0 0 0 1px var(--pn-edge-dk), 0 4px 14px #000a; color: var(--pn-ink); }
#down .glyph .yi { width: 72px; height: 72px; filter: drop-shadow(0 0 14px #7fe8ff88); animation: yk5rew 1.2s linear infinite; }
@keyframes yk5rew { to { transform: rotate(-360deg); } }
`;
}
