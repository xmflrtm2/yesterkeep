// T4 화면: HUD 유물 줄(오른쪽) + 설명 풍선, 고르기 창(셋 중 하나), 쉼터·가방·기억 창.
// 창이 떠 있는 동안 세상은 멈춘다(K.freeze). 키보드(←→/AD 고르기, Enter·Space·J·E 가져가기, Esc 닫기)와 마우스 모두.
// 창이 열려 있을 때의 키는 main.js보다 먼저(캡처 단계) 받아서 게임으로 안 넘긴다 (Shift를 눌러도 시대가 안 바뀌게)
import { EXT } from '../../ext.js';
import { T4, has, lvOf, give, upgrade, canUpgrade, roll, priceOf, changed, throwIt, addCoins } from './core.js';
import { RAR, KIND, SYN, byId } from './items.js';
import { UNLOCKS, loadMeta, buyUnlock } from './meta.js';
import { snd } from './sfx.js';

const CSS = `
#t4-bar { position: fixed; right: 12px; top: 128px; display: none; flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: auto; z-index: 2; }
#t4-bar.on { display: flex; }
body:has(#endCard[style*="flex"]) #t4-bar, body:has(#holdCard.on) #t4-bar { visibility: hidden; } /* 끝 화면·멈춤 카드 뒤로 비치지 않게 */
#t4-bar .chip { font-size: 14px; padding: 2px 9px; border-radius: 10px; background: #0009; border: 1px solid #ffffff22; text-shadow: 0 1px 2px #000; white-space: nowrap; }
#t4-bar .coin { color: var(--gold); }
#t4-bar .ammo { color: #dfefff; } #t4-bar .ammo b { color: var(--gold); font-weight: 600; }
#t4-bar .icons { display: grid; grid-template-columns: repeat(3, 34px); gap: 5px; direction: rtl; }
#t4-bar .ic { direction: ltr; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 19px; position: relative;
  background: radial-gradient(circle at 50% 35%, #2a2f3acc, #0b0d12e6); border: 2px solid var(--rc); box-shadow: 0 0 6px #000a; cursor: default; }
#t4-bar .ic.blessing { border-radius: 50%; }
#t4-bar .ic.syn::after { content: '✦'; position: absolute; left: -5px; top: -7px; font-size: 11px; color: var(--gold); text-shadow: 0 0 4px #000; }
#t4-bar .ic .lv { position: absolute; right: -4px; bottom: -5px; font-size: 10px; font-weight: 700; padding: 0 3px; border-radius: 5px; background: var(--rc); color: #10131a; }
#t4-bar .ic.used { filter: grayscale(1) brightness(.6); }
#t4-bar .key { font-size: 11px; opacity: .6; text-shadow: 0 1px 2px #000; }
.r-common { --rc: #c9d2de; } .r-rare { --rc: #7fe8ff; } .r-legend { --rc: #ffd27a; }
#t4-tip { position: fixed; display: none; max-width: 270px; padding: 9px 12px; border-radius: 10px; background: #0b0d12f2; border: 1px solid var(--rc, #ffffff33); font-size: 13px; line-height: 1.45; pointer-events: none; z-index: 5; text-shadow: none; word-break: keep-all; overflow-wrap: anywhere; }
#t4-tip .n { font-size: 15px; font-weight: 700; color: var(--rc); } #t4-tip .r { font-size: 11px; opacity: .7; margin-bottom: 4px; } #t4-tip .s { margin-top: 5px; color: var(--gold); font-size: 12px; }
#t4-near { position: fixed; left: 50%; top: calc(58% + 42px); transform: translateX(-50%); display: none; width: min(340px, 88vw); box-sizing: border-box; padding: 9px 14px; border-radius: 12px;
  background: #0b0d12ee; border: 2px solid var(--rc, #ffffff44); text-align: left; font-size: 13.5px; line-height: 1.45; pointer-events: none; word-break: keep-all; overflow-wrap: anywhere; }
#t4-near .nm { font-size: 16px; font-weight: 700; color: var(--rc); } #t4-near .rk { font-size: 12px; opacity: .7; } #t4-near .p { margin-top: 3px; color: var(--gold); }
#t4-near .sy { margin-top: 3px; color: var(--gold); font-size: 12.5px; } #t4-near .ico, #t4-near .k, #t4-near .pr { display: none; }
#t4-ov { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; overflow-y: auto;
  background: radial-gradient(ellipse at center, #000a 0%, #000d 100%); pointer-events: auto; z-index: 4; text-wrap: balance; word-break: keep-all; overflow-wrap: anywhere; }
#t4-ov.on { display: flex; }
#t4-ov .pn { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 980px; width: 100%; }
#t4-ov .tt { font-size: 28px; font-weight: 700; color: var(--gold); text-shadow: 0 3px 10px #000; text-align: center; }
#t4-ov .sb { font-size: 15px; opacity: .85; text-align: center; }
#t4-ov .cards { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; width: 100%; }
#t4-ov .cards.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; max-width: 960px; }
#t4-ov .cards.grid .cd { width: auto; min-height: 0; flex-direction: row; flex-wrap: wrap; align-items: flex-start; text-align: left; padding: 8px 10px; gap: 1px 10px; }
#t4-ov .cards.grid .cd.sel { transform: none; }
#t4-ov .cards.grid .cd .ico { font-size: 26px; width: 34px; text-align: center; line-height: 1.2; }
#t4-ov .cards.grid .cd .nm { font-size: 15px; flex: 1; align-self: center; }
#t4-ov .cards.grid .cd .rk, #t4-ov .cards.grid .cd .ds, #t4-ov .cards.grid .cd .up, #t4-ov .cards.grid .cd .sy, #t4-ov .cards.grid .cd .pr { width: 100%; padding-left: 44px; box-sizing: border-box; font-size: 12.5px; margin: 0; }
#t4-ov .cards.grid .cd .rk { margin-top: -3px; }
#t4-ov .cd { position: relative; width: 214px; min-height: 236px; box-sizing: border-box; padding: 14px 14px 12px; border-radius: 14px; text-align: center; cursor: pointer;
  background: linear-gradient(180deg, #1b1f29f2, #0b0d12f2); border: 2px solid color-mix(in srgb, var(--rc, #fff) 45%, transparent); color: var(--ink);
  display: flex; flex-direction: column; align-items: center; gap: 5px; transition: transform .12s, border-color .12s, box-shadow .12s; font: inherit; }
#t4-ov .cd.sel { transform: translateY(-6px); border-color: var(--rc, #fff); box-shadow: 0 0 22px color-mix(in srgb, var(--rc, #fff) 40%, transparent), 0 8px 18px #000c; }
#t4-ov .cd.dis { opacity: .45; cursor: default; }
#t4-ov .cd .k { position: absolute; left: 9px; top: 7px; font-size: 12px; opacity: .55; }
#t4-ov .cd .ico { font-size: 40px; line-height: 1.15; filter: drop-shadow(0 3px 6px #000); }
#t4-ov .cd .nm { font-size: 17px; font-weight: 700; color: var(--rc, var(--ink)); }
#t4-ov .cd .rk { font-size: 12px; opacity: .65; }
#t4-ov .cd .ds { font-size: 13.5px; line-height: 1.45; opacity: .92; }
#t4-ov .cd .up { font-size: 12.5px; line-height: 1.4; color: var(--teal); }
#t4-ov .cd .sy { margin-top: auto; font-size: 12.5px; color: var(--gold); font-weight: 600; }
#t4-ov .cd .pr { font-size: 14px; color: var(--gold); }
#t4-ov .cd.done { border-style: dashed; }
#t4-ov .ft { font-size: 13px; opacity: .65; text-align: center; }
#t4-ov .ft b { color: var(--gold); font-weight: 600; opacity: 1; }
#t4-ov .syns { font-size: 13px; color: var(--gold); text-align: center; line-height: 1.6; }
#t4-pop { position: fixed; right: 18px; top: 108px; font-size: 15px; color: var(--gold); text-shadow: 0 1px 3px #000; opacity: 0; transition: opacity .3s, transform .6s; pointer-events: none; }
@media (max-width: 640px), (max-height: 520px) {
  #t4-ov .tt { font-size: 21px; } #t4-ov .sb { font-size: 13px; }
  #t4-ov .cards { flex-direction: column; align-items: center; gap: 8px; }
  #t4-ov .cards.grid { grid-template-columns: 1fr; width: min(440px, 92vw); }
  #t4-ov .cd { width: min(440px, 92vw); min-height: 0; flex-direction: row; flex-wrap: wrap; text-align: left; padding: 9px 12px 9px 12px; gap: 2px 10px; }
  #t4-ov .cd.sel { transform: none; }
  #t4-ov .cd .ico { font-size: 28px; width: 38px; text-align: center; }
  #t4-ov .cd .nm { font-size: 15px; flex: 1; } #t4-ov .cd .rk { width: 100%; padding-left: 48px; margin-top: -4px; }
  #t4-ov .cd .ds, #t4-ov .cd .up, #t4-ov .cd .sy, #t4-ov .cd .pr { width: 100%; padding-left: 48px; box-sizing: border-box; }
  #t4-ov .cd .k { display: none; }
  #t4-bar { top: 118px; right: 8px; } #t4-bar .icons { grid-template-columns: repeat(2, 30px); } #t4-bar .ic { width: 30px; height: 30px; font-size: 16px; }
}
`;

const $ = id => document.getElementById(id);
let built = false;
function build() {
  if (built) return; built = true;
  const st = document.createElement('style'); st.id = 't4-css'; st.textContent = CSS; document.head.appendChild(st);
  const root = $('ext') || document.body;
  for (const id of ['t4-bar', 't4-tip', 't4-near', 't4-ov', 't4-pop']) { const d = document.createElement('div'); d.id = id; root.appendChild(d); }
  $('t4-ov').addEventListener('pointerdown', e => e.stopPropagation());
}

// ───────── 글자 조각 ─────────
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const rarLine = it => `${$t(RAR[it.rar].name)} · ${$t(KIND[it.kind])}`;
export const synFor = id => SYN.filter(s => (s.a === id && has(s.b)) || (s.b === id && has(s.a)));
const synNames = id => synFor(id).map(s => $t(s.name)).join(', ');
export function itemCard(it, { lv = 1, price = null, note = '', showUp = false, key = '' } = {}) {
  const syn = synFor(it.id);
  return `${key ? `<div class="k">${key}</div>` : ''}<div class="ico">${it.icon}</div>`
    + `<div class="nm">${esc($t(it.name))}${lv > 1 ? ' II' : ''}</div><div class="rk">${esc(rarLine(it))}</div>`
    + `<div class="ds">${esc($t(it.desc[Math.min(lv, 2) - 1]))}</div>`
    + (showUp && it.desc[1] ? `<div class="up">⬆ ${esc($t(it.desc[1]))}</div>` : '')
    + (syn.length ? `<div class="sy">✦ ${esc($t('시너지: {0}', syn.map(s => $t(s.name)).join(', ')))}</div>` : '')
    + (price != null ? `<div class="pr">🪙 ${price}</div>` : '')
    + (note ? `<div class="rk">${esc(note)}</div>` : '');
}

// ───────── HUD 유물 줄 ─────────
export function showHud() {
  build();
  const bar = $('t4-bar');
  const on = T4.inv.length > 0 || T4.coins > 0 || T4.run.active;
  bar.classList.toggle('on', on);
  if (!on) { bar.innerHTML = ''; hideTip(); return; }
  const st = T4.st;
  let h = `<div class="chip coin">🪙 ${T4.coins}</div>`;
  if (st.knives || st.catch) h += `<div class="chip ammo">${st.knives ? `🔪 <b>${T4.ammo.knife}</b>/${st.knives}` : ''}${st.knives && st.catch ? ' · ' : ''}${st.catch ? `➶ <b>${T4.ammo.arrows}</b>` : ''} <span class="key">Q</span></div>`;
  h += '<div class="icons">';
  for (const e of T4.inv) {
    const it = byId(e.id); if (!it) continue;
    const used = (e.id === 't4-hourglass-heart' && T4.run.phoenixUsed) || (e.id === 't4-cracked-shield' && T4.room.shield <= 0) || (e.id === 't4-rewind-spring' && T4.room.spring <= 0) || (e.id === 't4-afterimage' && T4.decoyCd > 0);
    h += `<div class="ic r-${it.rar} ${it.kind}${synFor(e.id).length ? ' syn' : ''}${used ? ' used' : ''}" data-id="${e.id}">${it.icon}${e.lv > 1 ? '<span class="lv">II</span>' : ''}</div>`;
  }
  h += '</div>';
  if (T4.inv.length) h += `<div class="key">${$t('Tab 유물 보기')}</div>`;
  bar.innerHTML = h;
  for (const el of bar.querySelectorAll('.ic')) {
    el.addEventListener('pointerenter', () => showTip(el));
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('pointerdown', e => { e.stopPropagation(); showTip(el); setTimeout(hideTip, 2600); });
  }
}
function showTip(el) {
  const it = byId(el.dataset.id); if (!it) return;
  const lv = lvOf(it.id), tip = $('t4-tip');
  tip.className = 'r-' + it.rar;
  tip.innerHTML = `<div class="n">${it.icon} ${esc($t(it.name))}${lv > 1 ? ' II' : ''}</div><div class="r">${esc(rarLine(it))}</div>${esc($t(it.desc[lv > 1 ? 1 : 0]))}`
    + (synFor(it.id).length ? `<div class="s">✦ ${esc(synFor(it.id).map(s => $t(s.name) + ' — ' + $t(s.desc)).join(' / '))}</div>` : '');
  tip.style.display = 'block';
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
  tip.style.left = Math.max(8, r.left - w - 10) + 'px';
  tip.style.top = Math.max(8, Math.min(innerHeight - hgt - 8, r.top - 4)) + 'px';
}
function hideTip() { const t = $('t4-tip'); if (t) t.style.display = 'none'; }
// 금화 +n 같은 작은 알림 (HUD 옆)
let popT = 0;
function pop(txt) { build(); const p = $('t4-pop'); p.textContent = txt; p.style.opacity = 1; p.style.transform = 'translateY(0)'; clearTimeout(popT); popT = setTimeout(() => { p.style.opacity = 0; p.style.transform = 'translateY(-10px)'; }, 900); }

// 상점 받침대 곁에 서면 보이는 설명 카드
export function showNear(html, rar) {
  build(); const n = $('t4-near');
  if (!html) { n.style.display = 'none'; return; }
  n.className = rar ? 'r-' + rar : ''; n.innerHTML = html; n.style.display = 'block';
}

// ───────── 창 (고르기·쉼터·가방·기억) ─────────
let cur = null; // 열린 창
export const panelOpen = () => !!cur;
function freezeLoop() {
  if (!cur) return;
  const S = T4.K && T4.K.S;
  if (S && !S.held && !S.hold) S.held = true; // 일시정지 카드를 닫아도 창이 떠 있으면 계속 멈춤
  requestAnimationFrame(freezeLoop);
}
// cards: [{ html, cls, onPick(), disabled }] / onCancel: Esc·바깥 / keys: { KeyR: fn }
export function panel({ title, sub = '', cards, grid = false, foot = '', onCancel = null, keys = {}, extra = '' }) {
  build();
  if (cur) cur.close(true);
  const ov = $('t4-ov');
  const P = { sel: Math.max(0, cards.findIndex(c => !c.disabled)), t0: performance.now(), cards };
  const draw = () => {
    ov.innerHTML = `<div class="pn"><div class="tt">${esc(title)}</div>${sub ? `<div class="sb">${sub}</div>` : ''}`
      + `<div class="cards${grid ? ' grid' : ''}">${P.cards.map((c, k) => `<button class="cd ${c.cls || ''}${k === P.sel ? ' sel' : ''}${c.disabled ? ' dis' : ''}" data-k="${k}">${c.html}</button>`).join('')}</div>`
      + `${extra}${foot ? `<div class="ft">${foot}</div>` : ''}</div>`;
    for (const b of ov.querySelectorAll('.cd')) {
      const k = +b.dataset.k;
      b.addEventListener('pointerenter', () => { if (P.sel !== k && !P.cards[k].disabled) { P.sel = k; mark(); } });
      b.addEventListener('click', e => { e.stopPropagation(); P.sel = k; mark(); pick(); });
    }
  };
  const mark = () => { for (const b of ov.querySelectorAll('.cd')) b.classList.toggle('sel', +b.dataset.k === P.sel); };
  const pick = () => {
    const c = P.cards[P.sel];
    if (!c || c.disabled) { snd.deny(); return; }
    c.onPick && c.onPick(P);
  };
  P.move = d => { const n = P.cards.length; if (!n) return; let k = P.sel; for (let s = 0; s < n; s++) { k = (k + d + n) % n; if (!P.cards[k].disabled) break; } if (k !== P.sel) { P.sel = k; mark(); snd.move(); } };
  P.key = e => {
    const c = e.code;
    if (performance.now() - P.t0 < 300 && ['Enter', 'Space', 'KeyE', 'Escape'].includes(c)) return; // 창을 연 키가 그대로 고르지 않게
    if (keys[c]) { keys[c](P); return; }
    if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowUp' || c === 'KeyW') P.move(-1);
    else if (c === 'ArrowRight' || c === 'KeyD' || c === 'ArrowDown' || c === 'KeyS' || c === 'Tab') P.move(1);
    else if (c === 'Enter' || c === 'Space' || c === 'KeyE') pick(); // J(찌르기)는 고르지 않는다 — 찌르다가 잘못 가져가지 않게
    else if (/^Digit[1-9]$/.test(c)) { const k = +c.slice(5) - 1; if (P.cards[k] && !P.cards[k].disabled) { P.sel = k; mark(); pick(); } }
    else if (c === 'Escape' && onCancel) onCancel(P);
  };
  P.close = quiet => {
    if (cur !== P) return;
    cur = null; ov.classList.remove('on'); ov.innerHTML = '';
    if (!quiet && T4.K) T4.K.freeze(false);
    showHud();
  };
  P.redraw = cardsNew => { if (cardsNew) P.cards = cardsNew; P.sel = Math.min(P.sel, P.cards.length - 1); if (P.cards[P.sel] && P.cards[P.sel].disabled) P.move(1); draw(); };
  cur = P;
  draw(); ov.classList.add('on'); hideTip(); showNear(null);
  if (T4.K) T4.K.freeze(true);
  requestAnimationFrame(freezeLoop);
  return P;
}

// 셋 중 하나 고르기 → 고른 id(없으면 null)
export function openPick({ ids = null, count = 3, tier = 1, title = null, sub = null, kinds = null, skipCoins = 4, meta = null } = {}) {
  return new Promise(resolve => {
    let list = ids || roll(count, { tier, kinds, meta: meta || loadMeta() });
    if (!list.length) { addCoinsUI(skipCoins); resolve(null); return; }
    snd.open();
    const mk = () => list.map((id, k) => {
      const it = byId(id);
      return { html: itemCard(it, { key: String(k + 1) }), cls: 'r-' + it.rar, onPick: P => {
        P.close(); give(id); (it.rar === 'legend' ? snd.legend : snd.take).call(snd); resolve(id);
      } };
    });
    const footFn = () => `${$t('←→ 고르기 · Enter 가져가기')}${T4.rerolls > 0 ? ' · ' + $t('R 다시 뽑기 ({0})', T4.rerolls) : ''} · ${skipCoins ? $t('Esc 건너뛰기 (금화 +{0})', skipCoins) : $t('Esc 건너뛰기')}`;
    const P = panel({
      title: title || $t('유물을 하나 고르세요'), sub: sub || '', cards: mk(), foot: footFn(),
      onCancel: P2 => { P2.close(); addCoinsUI(skipCoins); resolve(null); },
      keys: { KeyR: P2 => {
        if (T4.rerolls <= 0) { snd.deny(); return; }
        T4.rerolls--; const again = roll(list.length, { tier, kinds, meta: meta || loadMeta(), exclude: list });
        if (again.length) list = again; snd.open(); P2.redraw(mk()); P2.foot = footFn(); redrawFoot(footFn());
      } },
    });
    P.foot = footFn();
  });
}
function redrawFoot(txt) { const f = document.querySelector('#t4-ov .ft'); if (f) f.textContent = txt; }
const addCoinsUI = n => addCoins(n);

// 쉼터: 하트 회복 또는 유물 강화 중 하나
export function openRest({ heal = 2 } = {}) {
  return new Promise(resolve => {
    const K = T4.K, S = K.S, max = K.STAT.maxHearts;
    const ups = T4.inv.filter(e => canUpgrade(e.id));
    snd.fire();
    const first = () => panel({
      title: $t('모닥불 앞에서 쉬어요'), sub: $t('하나만 할 수 있어요'),
      cards: [
        { html: `<div class="ico">❤️</div><div class="nm">${$t('쉬기')}</div><div class="rk">${$t('하트 {0} / {1}', S.hearts, max)}</div><div class="ds">${$t('하트 {0}개 회복', heal)}</div>`,
          cls: 'r-common', disabled: S.hearts >= max, onPick: P => { P.close(); S.hearts = Math.min(max, S.hearts + heal); T4.lastHearts = S.hearts; K.drawHearts(); snd.heal(); K.toast($t('하트를 회복했어요'), 1.6); resolve('heal'); } },
        { html: `<div class="ico">⬆️</div><div class="nm">${$t('유물 강화')}</div><div class="rk">${$t('강화할 수 있는 것 {0}개', ups.length)}</div><div class="ds">${$t('유물 하나를 II로 올려요')}</div>`,
          cls: 'r-rare', disabled: !ups.length, onPick: () => second() },
      ],
      foot: $t('←→ 고르기 · Enter 정하기 · Esc 그냥 가기'),
      onCancel: P => { P.close(); resolve(null); },
    });
    const second = () => panel({
      title: $t('어떤 유물을 강화할까요?'),
      cards: ups.map((e, k) => { const it = byId(e.id); return { html: itemCard(it, { lv: 2, key: String(k + 1), note: $t('지금: {0}', $t(it.desc[0])) }), cls: 'r-' + it.rar, onPick: P => { P.close(); upgrade(e.id); snd.upgrade(); K.toast($t('{0} 강화!', $t(it.name)), 1.8); resolve('upgrade:' + e.id); } }; }),
      foot: $t('←→ 고르기 · Enter 강화 · Esc 뒤로'),
      onCancel: () => first(),
    });
    if (S.hearts >= max && !ups.length) { K.toast($t('하트도 가득하고 강화할 유물도 없어요'), 2); resolve(null); return; }
    first();
  });
}

// 가방: 가진 유물·시너지 보기 (Tab / I)
export function openInv() {
  if (!T4.inv.length) return;
  const syn = SYN.filter(s => T4.syn.includes(s.id));
  panel({
    title: $t('가진 유물'),
    sub: `🪙 ${T4.coins}` + (T4.st.knives ? ` · 🔪 ${T4.ammo.knife}/${T4.st.knives}` : '') + (T4.st.catch ? ` · ➶ ${T4.ammo.arrows}` : ''),
    grid: true,
    cards: T4.inv.map(e => { const it = byId(e.id); return { html: itemCard(it, { lv: e.lv, showUp: e.lv < 2 }), cls: 'r-' + it.rar, onPick: P => P.close() }; }),
    extra: syn.length ? `<div class="syns">${syn.map(s => `✦ <b>${esc($t(s.name))}</b> — ${esc($t(s.desc))}`).join('<br>')}</div>` : '',
    foot: $t('Esc·Tab 닫기'),
    onCancel: P => P.close(),
    keys: { Tab: P => P.close(), KeyI: P => P.close() },
  });
}

// 기억(런 사이 해금) 창 — 런이 끝났을 때 또는 시험 방의 서고에서
export function openMeta({ gain = 0, title = null, sub = null, cont = null } = {}) {
  return new Promise(resolve => {
    const m = loadMeta();
    const mk = () => {
      const cards = UNLOCKS.map(u => {
        const it = u.item ? byId(u.id) : null, got = m.unlocked.includes(u.id), can = !got && m.memory >= u.cost;
        const html = it
          ? `<div class="ico">${it.icon}</div><div class="nm">${esc($t(it.name))}</div><div class="rk">${$t('새 유물')} · ${esc(rarLine(it))}</div><div class="ds">${esc($t(it.desc[0]))}</div>`
          : `<div class="ico">${u.icon}</div><div class="nm">${esc($t(u.name))}</div><div class="rk">${$t('해금')}</div><div class="ds">${esc($t(u.desc))}</div>`;
        return { html: html + `<div class="pr">${got ? '✓ ' + $t('해금됨') : '🧠 ' + u.cost}</div>`, cls: (it ? 'r-' + it.rar : 'r-rare') + (got ? ' done' : ''), disabled: got,
          onPick: P => { if (!can) { snd.deny(); return; } if (buyUnlock(m, u.id)) { snd.upgrade(); P.redraw(mk()); const s = document.querySelector('#t4-ov .sb'); if (s) s.innerHTML = subFn(); } } };
      });
      cards.push({ html: `<div class="ico">➡️</div><div class="nm">${esc(cont || $t('계속'))}</div>`, cls: 'r-legend', onPick: P => { P.close(); resolve(m); } });
      return cards;
    };
    const subFn = () => (sub ? sub + '<br>' : '') + (gain ? $t('기억 +{0}', gain) + ' · ' : '') + $t('가진 기억 🧠 {0}', m.memory);
    panel({ title: title || $t('기억의 서고'), sub: subFn(), grid: true, cards: mk(), foot: $t('←→ 고르기 · Enter 해금 · Esc 닫기'), onCancel: P => { P.close(); resolve(m); } });
  });
}

// ───────── 키 ─────────
// 캡처 단계: main.js의 키 처리보다 먼저. 창이 열려 있으면 키를 먹는다(일시정지 카드가 떠 있으면 그쪽에 양보)
addEventListener('keydown', e => {
  const S = T4.K && T4.K.S;
  if (cur) {
    if (S && S.hold) return; // 일시정지 카드가 먼저
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) cur.key(e);
    return;
  }
  if (!S || !S.ready || S.hold || S.ended || e.repeat) return;
  if (e.code === 'KeyQ' && T4.inv.length) { throwIt(); return; }
  if ((e.code === 'Tab' || e.code === 'KeyI') && T4.inv.length) { e.preventDefault(); e.stopImmediatePropagation(); openInv(); }
}, true);

T4.listeners.add(why => {
  showHud();
  if (typeof why === 'string' && why.startsWith('coins:')) { const n = +why.slice(6); if (n) pop((n > 0 ? '+' : '') + n + ' 🪙'); }
});
EXT.on('init', () => { build(); showHud(); });
