// T1 — #ext 화면: 덮개(시작 메뉴·층 지도·런 요약)와 모래 계량기, 키보드로 고르기.
// 덮개가 떠 있는 동안 세상은 멈추고(K.freeze), 게임 키(Shift·J·Space·E·WASD)는 덮개가 먹는다. Esc는 그대로 일시정지로.
import { iconUrl } from '../t5/icons.js'; // T5: 그린 아이콘
const CSS = `
/* T5(11/15): 판넬 틀·제목·단추는 ../t5/theme.js의 .yk-frame·.yk-h·.yk-btn (UI.show가 붙임), 색은 시대 변수(--pn-*). 지도 칸 그림은 ../t5/icons.js */
#ext .t1-ov { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 18px 14px; box-sizing: border-box;
  background: radial-gradient(ellipse at center, #05070cd8 0%, #000000f2 75%); overflow-y: auto; z-index: 0; }
#ext .t1-box { margin: auto; width: min(640px, 100%); box-sizing: border-box; padding: 22px 30px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; text-wrap: balance; word-break: keep-all; overflow-wrap: anywhere; }
#ext .t1-h { font-size: 30px; }
#ext .t1-logo { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; font-size: 34px; }
#ext .t1-logo::after { flex-basis: 100%; }
#ext .t1-logo .yi { width: 40px; height: 40px; }
#ext .t1-sub { font-size: 15px; opacity: .88; line-height: 1.55; }
#ext .t1-small { font-size: 12.5px; opacity: .62; line-height: 1.5; }
#ext .t1-btns { display: flex; flex-direction: column; gap: 9px; width: min(340px, 100%); margin-top: 6px; }
#ext .t1-btn { font-size: 17px; padding: 10px 16px; text-align: center; }
#ext .t1-btn small { display: block; font-size: 12.5px; opacity: .72; margin-top: 2px; }
#ext .t1-btn small .yi { width: 15px; height: 15px; }
#ext .t1-btn.main { border-color: var(--pn-edge); color: var(--pn-title); font-weight: 700; }
#ext .t1-stats { display: grid; grid-template-columns: auto auto; gap: 0 22px; font-size: 15px; margin: 4px 0; padding: 6px 16px; border-radius: 4px; background: #0006; box-shadow: inset 0 0 0 1px var(--pn-edge-dk); }
#ext .t1-stats b { color: var(--pn-dim); font-weight: 600; text-align: left; padding: 3px 0; border-bottom: 1px dashed #ffffff14; }
#ext .t1-stats span { text-align: right; color: var(--pn-ink); font-weight: 700; font-variant-numeric: tabular-nums; padding: 3px 0; border-bottom: 1px dashed #ffffff14; }
#ext .t1-meta { font-size: 17px; font-weight: 700; color: #d9cfff; display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; }
#ext .t1-meta .yi { width: 22px; height: 22px; }
/* 층 지도: 오래된 지도판 위에 메달 칸 */
#ext .t1-mapwrap { position: relative; width: min(560px, 100%); height: min(430px, 56vh); min-height: 250px; margin: 2px 0 0; border-radius: 6px;
  background: radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--pn-accent) 9%, transparent) 0%, transparent 70%), var(--pn-tex), #0007;
  box-shadow: inset 0 0 0 1px var(--pn-edge-dk), inset 0 0 30px #000c; }
#ext .t1-mapwrap svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#ext .t1-mapwrap line { stroke: #ffffff2e; stroke-width: 2; stroke-dasharray: 4 5; }
#ext .t1-mapwrap line.open { stroke: var(--pn-edge-lt); stroke-width: 3; stroke-dasharray: 7 4; opacity: .85; }
#ext .t1-mapwrap line.walked { stroke: var(--pn-accent); stroke-width: 3.5; stroke-dasharray: none; filter: drop-shadow(0 0 4px var(--pn-accent)); }
#ext .t1-node { position: absolute; transform: translate(-50%, -50%); width: 56px; height: 56px; border-radius: 50%; padding: 0; cursor: default; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; color: #ffffffaa;
  border: 2px solid color-mix(in srgb, currentColor 55%, #000); background: radial-gradient(circle at 50% 32%, color-mix(in srgb, currentColor 24%, #24211c) 0%, #0d0c0a 76%);
  box-shadow: 0 0 0 2px #000c, inset 0 2px 0 #ffffff1c, inset 0 0 10px #000d; transition: transform .12s; }
#ext .t1-node .yi { width: 38px; height: 38px; filter: drop-shadow(0 2px 2px #000c); }
#ext .t1-node.done { filter: grayscale(.55) brightness(.62); }
#ext .t1-node.done::after { content: ''; position: absolute; right: -6px; bottom: -5px; width: 20px; height: 20px; background: ${iconUrl('check')} center / contain no-repeat; filter: drop-shadow(0 1px 1px #000); }
#ext .t1-node.here { filter: none; border-color: #fff; box-shadow: 0 0 0 2px #000c, 0 0 0 4px #ffffff55, inset 0 0 10px #000d; }
#ext .t1-node.here::before { content: ''; position: absolute; left: 50%; top: -30px; width: 26px; height: 26px; margin-left: -13px; background: ${iconUrl('here')} center / contain no-repeat; filter: drop-shadow(0 2px 2px #000); animation: t1pin 1.1s ease-in-out infinite; }
#ext .t1-node.here.done::after { display: none; }
@keyframes t1pin { 50% { transform: translateY(-4px); } }
#ext .t1-node.can { cursor: pointer; border-color: currentColor; color: inherit; animation: t1pulse 1.2s ease-in-out infinite; }
#ext .t1-node.sel { transform: translate(-50%, -50%) scale(1.2); box-shadow: 0 0 0 2px #000c, 0 0 0 4px currentColor, 0 0 22px currentColor, inset 0 0 10px #000d; animation: none; z-index: 1; }
#ext .t1-node.far { opacity: .62; filter: grayscale(.3); }
@keyframes t1pulse { 50% { box-shadow: 0 0 0 2px #000c, 0 0 16px currentColor, inset 0 0 10px #000d; } }
#ext .t1-info { min-height: 44px; font-size: 15px; }
#ext .t1-info b { font-size: 18px; display: inline-flex; align-items: center; gap: 6px; } #ext .t1-info b .yi { width: 24px; height: 24px; }
#ext .t1-bar { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; font-size: 15px; font-weight: 700; }
#ext .t1-bar span { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px 2px 6px; border-radius: 4px; background: #0008; box-shadow: inset 0 0 0 1px var(--pn-edge-dk); }
#ext .t1-bar .yi { width: 19px; height: 19px; }
#ext .t1-bar .h { color: #ff8a8a; } #ext .t1-bar .s { color: var(--gold); } #ext .t1-bar .m { color: #d9cfff; }
/* 모래 계량기 (#shards 자리): 모래시계 + 유리관 */
#ext .t1-sand { position: fixed; left: 16px; top: 46px; display: none; align-items: center; gap: 6px; pointer-events: none !important; font-size: 15px; font-weight: 700; color: var(--gold); text-shadow: 0 2px 4px #000; }
#ext .t1-sand .gl { width: 24px; height: 24px; display: inline-flex; } #ext .t1-sand .gl .yi { width: 24px; height: 24px; }
#ext .t1-sand .bar { position: relative; width: 132px; height: 10px; border-radius: 6px; background: linear-gradient(180deg, #ffffff12, #0000 60%), #0009; border: 1px solid #e9bf6399; box-shadow: 0 0 0 1px #000c, inset 0 1px 3px #000c; overflow: hidden; }
#ext .t1-sand .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(180deg, #fff3c4, #f2c66f 45%, #b8802c); border-radius: 5px; box-shadow: inset 0 1px 0 #ffffff88; }
#ext .t1-sand .bar u { position: absolute; top: 0; bottom: 0; width: 2px; background: #ffffff80; }
#ext .t1-sand .n { min-width: 46px; font-variant-numeric: tabular-nums; }
#ext .t1-sand .plus { color: #fff3c4; opacity: 0; transition: opacity .25s; }
#ext .t1-sand.drain .bar i { background: linear-gradient(180deg, #fffbe0, #ffd27a 45%, #d89a3a); }
#ext .t1-sand.low { color: #ff8a7a; animation: t1low .5s steps(2) infinite; }
#ext .t1-sand.low .bar i { background: linear-gradient(180deg, #ffc0b0, #ff6a5a 50%, #a8281e); }
#ext .t1-sand.low .bar { border-color: #ff8a7a; }
#ext .t1-sand.empty { color: #9aa3b8; } #ext .t1-sand.empty .bar i { background: #7fe8ff88; } #ext .t1-sand.empty .gl { filter: grayscale(1) brightness(.7); }
@keyframes t1low { 50% { opacity: .55; } }
body.t1run #shards, body.t1run #era .ptime { display: none !important; }
/* 2차: 런 방의 첫 안내는 수수께끼 — 기울여 쓰고 따옴표로 (두 번 실패하면 main.js가 .tip으로 바꿈) */
body.t1run.t1riddle #hint:not(.tip) { font-style: italic; color: #efe3c8; letter-spacing: .5px; }
body.t1run.t1riddle #hint:not(.tip)::before { content: '“'; opacity: .6; margin-right: 2px; }
body.t1run.t1riddle #hint:not(.tip)::after { content: '”'; opacity: .6; margin-left: 2px; }
body.t1run #ext .t1-sand { display: flex; }
body:has(#ext .t1-ov) #hud #hint, body:has(#ext .t1-ov) #hud #prompt, body:has(#ext .t1-ov) #hud #toast, body:has(#ext .t1-ov) #hud #roomTitle { visibility: hidden; }
#endCard .t1-endrun { margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
#endCard .t1-endrun .t1-btn { font-size: 19px; padding: 10px 28px; color: var(--pn-title); font-weight: 700; border-color: var(--pn-edge); }
#endCard .t1-endrun div { font-size: 15px; opacity: .88; }
@media (max-width: 520px) {
  #ext .t1-box { padding: 18px 16px 16px; }
  #ext .t1-h { font-size: 24px; } #ext .t1-logo { font-size: 27px; gap: 8px; } #ext .t1-logo .yi { width: 30px; height: 30px; }
  #ext .t1-node { width: 46px; height: 46px; } #ext .t1-node .yi { width: 31px; height: 31px; }
  #ext .t1-sand { top: 44px; left: 12px; } #ext .t1-sand .bar { width: 96px; }
}
/* 낮은 창(960×420 등): 칸이 겹치지 않게 작게 (11/13 창 크기 시험) */
@media (max-height: 520px) {
  #ext .t1-mapwrap { height: 60vh; min-height: 240px; } #ext .t1-h { font-size: 20px; } #ext .t1-box { gap: 4px; padding: 12px 22px; } #ext .yk-h::after { margin-top: 2px; }
  #ext .t1-node { width: 40px; height: 40px; } #ext .t1-node .yi { width: 24px; height: 24px; } #ext .t1-info { min-height: 36px; font-size: 13px; } #ext .t1-info b { font-size: 15px; }
  #ext .t1-btn { padding: 6px 14px; font-size: 15px; } #ext .t1-sub { font-size: 13px; }
}
`;

export const UI = {
  root: null, ov: null, items: [], sel: 0, onKeyExtra: null, K: null,
  init(K) {
    this.K = K;
    this.root = document.getElementById('ext');
    if (!document.getElementById('t1-style')) { const st = document.createElement('style'); st.id = 't1-style'; st.textContent = CSS; document.head.appendChild(st); }
  },
  get open() { return !!this.ov; },
  /** 덮개 열기. html 안의 [data-k] 요소가 고를 수 있는 것. onPick(key, el) */
  show(html, onPick, opts = {}) {
    this.close(true);
    const ov = document.createElement('div');
    ov.className = 't1-ov ' + (opts.cls || '');
    ov.innerHTML = `<div class="t1-box yk-frame">${html}</div>`;
    for (const el of ov.querySelectorAll('.t1-h')) el.classList.add('yk-h'); // T5 판넬 말투 (src/ext/t5/theme.js)
    for (const el of ov.querySelectorAll('.t1-btn')) el.classList.add('yk-btn');
    this.root.appendChild(ov);
    this.ov = ov; this.onPick = onPick; this.onKeyExtra = opts.onKey || null;
    this.items = [...ov.querySelectorAll('[data-k]')];
    if (opts.order) this.items.sort(opts.order);
    this.sel = Math.max(0, Math.min(this.items.length - 1, opts.sel || 0));
    for (const el of this.items) {
      el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.pick(el); });
      el.addEventListener('mouseenter', () => { this.sel = this.items.indexOf(el); this.mark(); });
    }
    this.onSel = opts.onSel || null;
    this.mark();
    if (this.K) this.K.freeze(true);
    return ov;
  },
  mark() { this.items.forEach((el, k) => el.classList.toggle('sel', k === this.sel)); if (this.onSel && this.items[this.sel]) this.onSel(this.items[this.sel]); },
  move(d) { if (!this.items.length) return; this.sel = (this.sel + d + this.items.length) % this.items.length; this.mark(); this.K && this.K.sfx && this.K.sfx.tone && tick(this.K); },
  pick(el) { if (!this.ov || !el) return; const f = this.onPick; const k = el.dataset.k; if (f) f(k, el); },
  close(keepFrozen) {
    if (this.ov) { this.ov.remove(); this.ov = null; }
    this.items = []; this.onPick = null; this.onKeyExtra = null; this.onSel = null;
    if (!keepFrozen && this.K) this.K.freeze(false);
  },
};
function tick(K) { try { K.sfx.tone(660, 700, 0.05, 'triangle', 0.05); } catch (e) { /* 소리 없이 */ } }
/** T1 소리 (audio.js 재료로) */
export const SND = {
  pick(K) { try { K.sfx.tone(523, 784, 0.18, 'triangle', 0.08); K.sfx.tone(784, 1046, 0.22, 'sine', 0.05, { t: 0.07 }); } catch (e) { /* */ } },
  sand(K) { try { K.sfx.noise(0.25, 3000, 6000, 0.05, 1.2); K.sfx.tone(988, 1318, 0.2, 'sine', 0.05); } catch (e) { /* */ } },
  low(K) { try { K.sfx.tone(880, 860, 0.06, 'square', 0.03); } catch (e) { /* */ } },
  empty(K) { try { K.sfx.noise(0.5, 2400, 300, 0.12, 1.2); K.sfx.tone(392, 196, 0.45, 'triangle', 0.08); } catch (e) { /* */ } },
  deny(K) { try { K.sfx.thud(140, 0.18, 0.22); } catch (e) { /* */ } },
  heal(K) { try { K.sfx.tone(392, 523, 0.3, 'sine', 0.08); K.sfx.tone(523, 659, 0.35, 'sine', 0.07, { t: 0.12 }); K.sfx.tone(659, 784, 0.4, 'triangle', 0.05, { t: 0.24 }); } catch (e) { /* */ } },
  floor(K) { try { K.sfx.fm(98, 1.5, 2, 2.0, 0.06, { rev: 0.7 }); K.sfx.tone(196, 294, 1.2, 'sine', 0.05, { rev: 0.5 }); } catch (e) { /* */ } },
  dead(K) { try { K.sfx.tone(330, 110, 1.4, 'triangle', 0.08, { rev: 0.6 }); K.sfx.noise(1.2, 1200, 150, 0.08, 0.8); } catch (e) { /* */ } },
  win(K) { try { for (const [k, f] of [[0, 523], [1, 659], [2, 784], [3, 1046]]) K.sfx.tone(f, f, 0.5, 'triangle', 0.07, { t: k * 0.14, rev: 0.4 }); } catch (e) { /* */ } },
};

// 게임보다 먼저 키를 받는다(이 모듈이 main.js보다 먼저 실행되어 capture 리스너가 앞에 선다).
// 시작·멈춤 카드가 떠 있으면(S.hold) 손대지 않는다 — 그 카드가 첫 입력을 먹는다
const NAV = { ArrowLeft: -1, KeyA: -1, ArrowUp: -1, KeyW: -1, ArrowRight: 1, KeyD: 1, ArrowDown: 1, KeyS: 1 };
const OK = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyE', 'KeyJ', 'KeyF']);
const SWALLOW = new Set(['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyK', 'KeyR', 'KeyM', 'Tab']);
const codeOf = e => e.code || (e.key === ' ' ? 'Space' : e.key === 'Shift' ? 'ShiftLeft' : e.key === 'Enter' ? 'Enter' : e.key && e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key);
addEventListener('keydown', e => {
  if (!UI.ov) return;
  const S = UI.K && UI.K.S;
  if (S && S.hold) return;
  const code = codeOf(e);
  if (code === 'Escape' || code === 'KeyP') return; // 일시정지는 그대로
  if (UI.onKeyExtra && UI.onKeyExtra(code, e) === true) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (NAV[code] != null) { if (!e.repeat) UI.move(NAV[code]); }
  else if (OK.has(code)) { if (!e.repeat) UI.pick(UI.items[UI.sel]); }
  else if (!SWALLOW.has(code) && !/^(Digit|Numpad)/.test(code)) return;
  if (/^Digit[1-9]$/.test(code)) { const n = +code.slice(5) - 1; if (UI.items[n]) { UI.sel = n; UI.mark(); UI.pick(UI.items[n]); } }
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
