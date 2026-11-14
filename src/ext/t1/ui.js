// T1 — #ext 화면: 덮개(시작 메뉴·층 지도·런 요약)와 모래 계량기, 키보드로 고르기.
// 덮개가 떠 있는 동안 세상은 멈추고(K.freeze), 게임 키(Shift·J·Space·E·WASD)는 덮개가 먹는다. Esc는 그대로 일시정지로.
const CSS = `
#ext .t1-ov { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 14px; box-sizing: border-box;
  background: radial-gradient(ellipse at center, #0a0d18e8 0%, #000000f2 75%); overflow-y: auto; z-index: 0; }
#ext .t1-box { margin: auto; width: min(640px, 100%); display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; text-wrap: balance; }
#ext .t1-h { font-size: 30px; font-weight: 700; color: var(--gold); text-shadow: 0 3px 10px #000; letter-spacing: 1px; }
#ext .t1-sub { font-size: 15px; opacity: .85; line-height: 1.5; }
#ext .t1-small { font-size: 12.5px; opacity: .6; line-height: 1.45; }
#ext .t1-btns { display: flex; flex-direction: column; gap: 8px; width: min(340px, 100%); margin-top: 6px; }
#ext .t1-btn { font: inherit; font-size: 17px; padding: 10px 16px; border-radius: 9px; border: 1px solid #ffffff40; background: #ffffff10; color: inherit; cursor: pointer; text-align: center; }
#ext .t1-btn small { display: block; font-size: 12.5px; opacity: .7; margin-top: 2px; }
#ext .t1-btn.sel, #ext .t1-btn:hover { border-color: var(--gold); background: #ffd27a22; box-shadow: 0 0 0 2px #ffd27a55; }
#ext .t1-btn.main { border-color: #ffd27a99; }
#ext .t1-stats { display: grid; grid-template-columns: auto auto; gap: 3px 18px; font-size: 15px; margin: 4px 0; }
#ext .t1-stats b { color: var(--gold); font-weight: 600; text-align: left; }
#ext .t1-stats span { text-align: right; opacity: .8; }
#ext .t1-meta { font-size: 17px; color: var(--teal); }
/* 층 지도 */
#ext .t1-mapwrap { position: relative; width: min(560px, 100%); height: min(430px, 56vh); min-height: 250px; margin: 2px 0 0; }
#ext .t1-mapwrap svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#ext .t1-node { position: absolute; transform: translate(-50%, -50%); width: 54px; height: 54px; border-radius: 50%; border: 2px solid #ffffff30;
  background: #12141c; color: #ffffffaa; font-size: 25px; line-height: 50px; text-align: center; padding: 0; cursor: default; font-family: 'Segoe UI Symbol', 'Segoe UI', sans-serif; }
#ext .t1-node.done { opacity: .45; border-style: dashed; }
#ext .t1-node.here { box-shadow: 0 0 0 3px #ffffff55; opacity: 1; }
#ext .t1-node.can { cursor: pointer; border-color: currentColor; color: inherit; background: #1b1e2a; animation: t1pulse 1.2s ease-in-out infinite; }
#ext .t1-node.sel { transform: translate(-50%, -50%) scale(1.18); box-shadow: 0 0 0 3px currentColor, 0 0 18px currentColor; animation: none; }
#ext .t1-node.far { opacity: .55; }
@keyframes t1pulse { 50% { box-shadow: 0 0 12px currentColor; } }
#ext .t1-info { min-height: 44px; font-size: 15px; }
#ext .t1-info b { font-size: 18px; }
#ext .t1-bar { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; font-size: 15px; }
#ext .t1-bar .h { color: #ff5d6c; } #ext .t1-bar .s { color: var(--gold); } #ext .t1-bar .m { color: var(--teal); }
/* 모래 계량기 (#shards 자리) */
#ext .t1-sand { position: fixed; left: 18px; top: 46px; display: none; align-items: center; gap: 7px; pointer-events: none !important; font-size: 15px; color: var(--gold); text-shadow: 0 2px 4px #000; }
#ext .t1-sand .gl { font-size: 17px; width: 18px; text-align: center; }
#ext .t1-sand .bar { position: relative; width: 132px; height: 9px; border-radius: 5px; background: #ffffff1c; border: 1px solid #ffffff30; overflow: hidden; }
#ext .t1-sand .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #c9902c, var(--gold)); border-radius: 5px; }
#ext .t1-sand .bar u { position: absolute; top: 0; bottom: 0; width: 2px; background: #ffffff70; }
#ext .t1-sand .n { min-width: 46px; font-variant-numeric: tabular-nums; }
#ext .t1-sand .plus { color: #fff3c4; opacity: 0; transition: opacity .25s; }
#ext .t1-sand.drain .bar i { background: linear-gradient(90deg, #e0a030, #fff0b0); }
#ext .t1-sand.low { color: #ff8a7a; animation: t1low .5s steps(2) infinite; }
#ext .t1-sand.low .bar i { background: #ff6a5a; }
#ext .t1-sand.empty { color: #9aa3b8; } #ext .t1-sand.empty .bar i { background: #7fe8ff88; }
@keyframes t1low { 50% { opacity: .55; } }
body.t1run #shards, body.t1run #era .ptime { display: none !important; }
/* 2차: 런 방의 첫 안내는 수수께끼 — 기울여 쓰고 따옴표로 (두 번 실패하면 main.js가 .tip으로 바꿈) */
body.t1run.t1riddle #hint:not(.tip) { font-style: italic; color: #efe3c8; letter-spacing: .5px; }
body.t1run.t1riddle #hint:not(.tip)::before { content: '“'; opacity: .6; margin-right: 2px; }
body.t1run.t1riddle #hint:not(.tip)::after { content: '”'; opacity: .6; margin-left: 2px; }
body.t1run #ext .t1-sand { display: flex; }
body:has(#ext .t1-ov) #hud #hint, body:has(#ext .t1-ov) #hud #prompt, body:has(#ext .t1-ov) #hud #toast, body:has(#ext .t1-ov) #hud #roomTitle { visibility: hidden; }
#endCard .t1-endrun { margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
#endCard .t1-endrun .t1-btn { font: inherit; font-size: 19px; padding: 10px 26px; border-radius: 9px; border: 1px solid var(--gold); background: #ffd27a26; color: var(--gold); cursor: pointer; }
#endCard .t1-endrun div { font-size: 15px; opacity: .85; }
@media (max-width: 520px) {
  #ext .t1-h { font-size: 24px; }
  #ext .t1-node { width: 44px; height: 44px; line-height: 40px; font-size: 20px; }
  #ext .t1-sand { top: 44px; left: 14px; } #ext .t1-sand .bar { width: 96px; }
}
/* 낮은 창(960×420 등): 칸이 겹치지 않게 작게 (11/13 창 크기 시험) */
@media (max-height: 520px) {
  #ext .t1-mapwrap { height: 60vh; min-height: 240px; } #ext .t1-h { font-size: 20px; } #ext .t1-box { gap: 4px; }
  #ext .t1-node { width: 38px; height: 38px; line-height: 34px; font-size: 18px; } #ext .t1-info { min-height: 36px; font-size: 13px; } #ext .t1-info b { font-size: 15px; }
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
    ov.innerHTML = `<div class="t1-box">${html}</div>`;
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
