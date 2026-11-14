// T4 아이템·성장 — 슬롯 파일. 이 트랙의 코드는 이 파일과 src/ext/t4/ 아래에만 둔다 (docs/roguelike/BRIEF-common.md)
// 하는 일: 유물·축복(EXT.items), 방 사이 고르기·상점·쉼터, 능력치(EXT.stats) 변화, 런 사이에 남는 해금(yk-meta), HUD(#ext).
// 유물이 하나도 없으면 아무것도 건드리지 않는다 → 튜토리얼 13방은 지금과 똑같다. 설계·수치·T1이 쓸 함수: docs/roguelike/t4.md
import { EXT } from '../ext.js';
import './t4/en.js';
import { T4, give, take, upgrade, has, lvOf, roll, apply, resetRun, snapshot, restore, addCoins, throwIt, sandOn } from './t4/core.js';
import { ITEMS, SYN } from './t4/items.js';
import { memMul, cursed, CLEAR_COINS } from './t4/r2.js'; // 2차: T2 적·T3 장치 유물, 저주, 런 경제
import { openPick, openRest, openInv, openMeta, openCursePick, panelOpen, showHud } from './t4/ui.js';
import { roomFor, decorate, endRun } from './t4/rooms.js';
import { loadMeta } from './t4/meta.js';

for (const it of ITEMS) EXT.items[it.id] = it;

// T1·다른 트랙이 쓰는 손잡이 (docs/roguelike/t4.md "T1이 쓰는 것")
EXT.t4 = {
  T4, ITEMS, SYN,
  get inv() { return T4.inv; }, get coins() { return T4.coins; },
  give, take, upgrade, has, lv: lvOf, roll, apply, addCoins, throwIt,
  // 런 시작: 유물·금화 초기화 + 해금 적용. 한 런이라도 끝낸 뒤부터는 먼저 저주를 고를 수 있다(난이도 고르기, 첫 카드 = 저주 없이) → 시작 유물(해금 시)
  startRun({ coins = null } = {}) {
    resetRun(); T4.run.active = true; const m = loadMeta();
    if (m.unlocked.includes('purse')) addCoins(5, 'quiet');
    if (m.unlocked.includes('reroll')) T4.rerolls = 1;
    if (coins != null) T4.coins = coins;
    const curse = m.runs >= 1 ? () => openCursePick() : () => Promise.resolve(null);
    return new Promise(res => setTimeout(res, 400)).then(curse)
      .then(() => (m.unlocked.includes('start-pick') ? openPick({ ids: roll(3, { rar: ['common'], meta: m }), title: $t('시작 유물'), skipCoins: 0 }) : null));
  },
  endRun, snapshot, restore, reset: resetRun,
  openPick, openRest, openInv, openMeta, openCursePick, panelOpen, memMul, cursed, CLEAR_COINS,
  roomFor, decorate, sandOn,
};
// 시험용 (콘솔·시험 도구): __t4.give('t4-shock-bell'), __t4.st(), __t4.offer()
window.__t4 = Object.assign({}, EXT.t4, { st: () => T4.st, state: () => ({ inv: T4.inv.map(e => e.id + (e.lv > 1 ? ':2' : '')), coins: T4.coins, ammo: { ...T4.ammo }, room: { ...T4.room }, run: { ...T4.run, seen: undefined }, syn: T4.syn, rerolls: T4.rerolls, open: panelOpen() }), hud: showHud });
// (T4 아이템·성장 슬롯 끝)
