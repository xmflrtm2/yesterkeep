// 개발용: 타격감 이펙트(src/fx.js) 장면 맞추기 — tools/fx_shots.py가 화면 없는 크롬에서 부른다 (게임에는 안 들어감)
//   const M = (await import('/src/dev/fx-shots.js')).default; await M.ready(); M.stage('slam')  → 그 순간에 멈춘 화면 + 이펙트 수
import P from './play.js';

const Y = () => window.__yk, B = () => Y().boss(), st = () => Y().state();
const sameEra = () => B().era === st().era;
function start(room = 'heart') {
  P.room(room); P.events = [];
  if (room !== 'heart') return;
  P.moveCell(8, 7); P.moveCell(5, 7); P.moveCell(3, 7);
  P.waitUntil(() => B().state === 'alert' && B().stagger <= 0 && P.bossDist() < 3.4, 6);
}
// 보스 앞 2m에 서서 공격을 부른다
function bait(until, max = 8) {
  return P.waitUntil(() => { const b = B(); if (until(b)) return true; const y = b.yawDeg * Math.PI / 180; P.moveTo(b.x + Math.sin(y) * 2.0, b.z + Math.cos(y) * 2.0, { max: 0.1, tol: 0.4 }); P.wait(1 / 30); return false; }, max);
}
// 시간 회피 → 등 뒤 → 도착 → 찌르기 직전까지
function parryToBack() {
  bait(b => b.wind > 0.3 && b.kind === 'slam' && sameEra());
  P.shift(); P.circleBehind(1, 1.6, 1.4);
  P.waitUntil(() => sameEra(), 2.5);
}
const STAGES = {
  // 망치가 땅에 닿은 직후: 먼지 고리 · 돌 조각 · 바닥 금 · 빛
  slam() { start(); bait(b => b.wind > 0 && b.wind < 0.06 && b.kind === 'slam'); P.wait(0.12); },
  // 망치가 떨어지기 직전 (뒤로 굴러 피함) — 이어 찍기(seq)용: 이 뒤로 0.06초씩 넘기며 찍는다
  slamPre() { start(); bait(b => b.wind > 0 && b.wind < 0.32 && b.kind === 'slam'); const b = B(), y = b.yawDeg * Math.PI / 180; Y().roll(Math.sin(y), Math.cos(y)); P.wait(0.12); },
  // 등 찌르기 직전 (이어 찍기용)
  stabPre() { start(); parryToBack(); P.stab(); P.wait(0.05); },
  // 등 찌르기 직후: 불꽃 · 부스러기 · 몸 번쩍 · 체력 막대 흔들림
  stab() { start(); parryToBack(); P.stab(); P.waitUntil(() => B().hurtCd > 0.9, 0.6); P.wait(0.05); },
  // 시간을 건너 도착하는 순간: 빛 알갱이 기둥
  arrive() { start(); bait(b => b.wind > 0.3 && b.kind === 'slam' && sameEra()); P.shift(); P.moveTo(st().x + 2.5, st().z + 1.5, { max: 1.2 }); P.waitUntil(() => sameEra(), 2.5); P.wait(0.15); },
  // 쓰러뜨리는 순간: 큰 먼지 · 금빛 알갱이 (마지막 한 칸)
  death() { start(); Y().bossSet({ hp: 1 }); parryToBack(); P.stab(); P.waitUntil(() => !B().alive, 0.6); P.wait(0.35); },
  // 돌진이 벽에 박힘 (어제, 남쪽 벽 앞에서 옆으로 비킴)
  wall() {
    start(); P.shift(); P.waitUntil(() => sameEra(), 3);
    P.moveCell(14, 10);
    P.waitUntil(() => B().charge === 'tele', 8); P.react();
    const b = B(), s = st(); P.moveTo(s.x + (b.x < s.x ? 2.4 : -2.4), s.z, { exact: true, max: 0.5, tol: 0.3 });
    P.waitUntil(() => B().stagger > 0.5, 2); P.wait(0.1);
  },
  // Shift: 넘어온 시대 빛 알갱이 (첫 방)
  shift() { P.room('bridge'); P.wait(0.5); P.shift(); P.wait(0.25); },
};
const M = {
  async ready() { await P.ready(); const t0 = performance.now(); while (!(B() && B() !== 'pending') && performance.now() - t0 < 20000) { P.wait(0.1); await new Promise(r => setTimeout(r, 100)); } return !!B(); },
  step(sec) { Y().step(sec); Y().render(); Y().render(); return window.__fx.stats(); },
  stage(name) { STAGES[name](); Y().render(); Y().render(); return { fx: window.__fx.stats(), boss: B() && { hp: B().hp, alive: B().alive, kind: B().kind, stagger: B().stagger }, hearts: st().hearts }; },
};
window.__fxShots = M;
export default M;
