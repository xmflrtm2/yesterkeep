// 런 사이에 남는 것 (localStorage 'yk-meta'): 기억(재화)과 해금.
// 힘이 계속 세지는 해금은 넣지 않는다 — 새 유물이 나오게 하기, 시작 유물 고르기, 다시 뽑기 1번, 시작 금화 5 정도.
import { ITEMS } from './items.js';

const KEY = 'yk-meta';
export const UNLOCKS = [
  // 새 유물 (items.js의 lock 값이 값)
  ...ITEMS.filter(it => it.lock).map(it => ({ id: it.id, item: true, cost: it.lock })),
  { id: 'start-pick', icon: '🎁', name: N('시작 유물 고르기'), desc: N('런을 시작할 때 흔한 유물 셋 중 하나를 골라 들고 가요'), cost: 12 },
  { id: 'reroll', icon: '🎲', name: N('다시 뽑기'), desc: N('런마다 고르기 창에서 한 번 다시 뽑을 수 있어요'), cost: 10 },
  { id: 'purse', icon: '👛', name: N('여윳돈'), desc: N('런을 금화 5개로 시작해요'), cost: 6 },
];
export function loadMeta() {
  let m = {};
  try { m = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { m = {}; }
  return { memory: m.memory | 0, unlocked: Array.isArray(m.unlocked) ? m.unlocked : [], runs: m.runs | 0, wins: m.wins | 0, best: m.best | 0, total: m.total | 0 };
}
export function saveMeta(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* 이번 판만 */ } }
// 한 런이 끝나면: 지난 방 1 + 층 3 + 이기면 10 + 남은 금화 4개마다 1
export function runGain({ rooms = 0, floors = 0, won = false, coins = 0 } = {}) {
  return Math.max(1, rooms + floors * 3 + (won ? 10 : 0) + Math.floor(coins / 4));
}
export function buyUnlock(m, id) {
  const u = UNLOCKS.find(x => x.id === id);
  if (!u || m.unlocked.includes(id) || m.memory < u.cost) return false;
  m.memory -= u.cost; m.unlocked.push(id); saveMeta(m);
  return true;
}
