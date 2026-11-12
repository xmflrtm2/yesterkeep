// 개발용: 성채지기(보스) 공략 봇 모음 (게임에는 안 들어감). tools/boss_sim.py가 화면 없는 크롬에서 돌린다.
//   const M = (await import('/src/dev/boss-bots.js?' + Date.now())).default; await M.ready(); M.run('parry', 3)
// 봇마다 사람 반응 0.25초(play.js RT), 실제 키 입력. 시간은 __yk.step으로만 흐른다.
//   spam   : 0.5초마다 Shift를 누르며 등 뒤로 걸어가 찌른다 (11/12 개발자님이 짚은 "Shift만 계속 쓰기")
//   circle : Shift 없이 같은 시대에서 빙빙 돌아 등을 잡는다
//   idle   : 공격하지 않을 때 Shift → 얼마나 빨리, 어느 쪽을 보고 나타나는지
//   parry  : 의도한 풀이. 내려찍기 예비동작(붉은 부채꼴)을 보고 Shift → 멈춘 윤곽 등 뒤로 → 와서 마저 내려찍는 동안 찌르기.
//            휘두르기(둘레 고리)는 굴러서 피하고, 돌진 예고는 옆으로 비킨다
import P from './play.js';

const Y = () => window.__yk;
const B = () => Y().boss();
const S = () => Y().S;
const st = () => Y().state();
const sameEra = () => B().era === st().era;
function isBehind() {
  const b = B(), s = st(), y = b.yawDeg * Math.PI / 180, fx = Math.sin(y), fz = Math.cos(y), dx = s.x - b.x, dz = s.z - b.z, d = Math.hypot(dx, dz);
  return (dx * fx + dz * fz) / Math.max(d, 0.01) < Math.cos(110 * Math.PI / 180);
}
function inFront(deg = 50) {
  const b = B(), s = st(), y = b.yawDeg * Math.PI / 180, dx = s.x - b.x, dz = s.z - b.z, d = Math.hypot(dx, dz);
  return (dx * Math.sin(y) + dz * Math.cos(y)) / Math.max(d, 0.01) > Math.cos(deg * Math.PI / 180);
}
// 보스에게서 멀어지는 쪽으로 (벽이면 옆으로)
function backOff(dist = 3.2, max = 0.8) {
  const b = B(), s = st(), ux = s.x - b.x, uz = s.z - b.z, l = Math.hypot(ux, uz) || 1;
  P.moveTo(b.x + ux / l * dist, b.z + uz / l * dist, { exact: true, max, tol: 0.4 });
}
function start() {
  P.room('heart'); P.events = [];
  P.moveCell(8, 7);
  P.waitUntil(() => B().state === 'alert' && B().stagger <= 0, 3);
  return { t0: S().time, hurts0: S().hurts, falls0: S().falls, deaths: 0, hearts: st().hearts };
}
// 하트가 늘었으면 = 다 잃고 방을 처음부터 (보스도 체력 6으로)
function track(c) { const h = st().hearts; if (h > c.hearts) c.deaths++; c.hearts = h; }
const result = (c, extra = {}) => ({ win: !B().alive, t: +(S().time - c.t0).toFixed(1), bossHp: B().hp, hurts: S().hurts - c.hurts0 + (S().falls - c.falls0), deaths: c.deaths, past: st().pastTime, ...extra });

const BOTS = {
  spam(limit = 90) {
    const c = start(); let hits = 0;
    while (B().alive && S().time - c.t0 < limit) {
      track(c);
      const b = B(), y = b.yawDeg * Math.PI / 180;
      P.moveTo(b.x - Math.sin(y) * 1.6, b.z - Math.cos(y) * 1.6, { exact: true, max: 0.5, tol: 0.3 });
      if (sameEra() && isBehind() && B().hurtCd <= 0) { const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) hits++; }
      P.shift();
    }
    return result(c, { hits });
  },
  circle(limit = 60) {
    const c = start(); let hits = 0, tries = 0;
    while (B().alive && S().time - c.t0 < limit) {
      track(c);
      const b = B(), s = st(), a = Math.atan2(s.x - b.x, s.z - b.z) + 0.9; // 보스 둘레 반지름 1.7m로 한 바퀴씩 앞질러 간다
      P.moveTo(b.x + Math.sin(a) * 1.7, b.z + Math.cos(a) * 1.7, { exact: true, max: 0.25, tol: 0.3 });
      if (sameEra() && isBehind() && B().hurtCd <= 0 && P.bossDist() < 2.6) { tries++; const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) hits++; }
    }
    return result(c, { hits, tries });
  },
  idle(n = 5) {
    const c = start(), out = [];
    for (let k = 0; k < n; k++) {
      P.waitUntil(() => sameEra() && B().wind <= 0 && !B().charge && !B().sweep && B().stagger <= 0 && B().daze <= 0, 4);
      backOff(4.0, 1.0);
      P.shift();
      const ta = P.waitUntil(() => sameEra(), 3);
      out.push({ after: ta, facingMe: inFront(30), behind: isBehind() });
      P.wait(0.6);
    }
    return { samples: out };
  },
  parry(limit = 150) {
    const c = start(); const ev = [];
    let parries = 0, hits = 0;
    const rt0 = performance.now(); let lastT = -1, same = 0;
    while (B().alive && S().time - c.t0 < limit) {
      if (performance.now() - rt0 > 60000) { ev.push('REAL-TIME-LIMIT'); break; }
      if (S().time === lastT) { if (++same > 50) { ev.push('STUCK ' + JSON.stringify({ s: st(), b: B(), down: !!S().down, ended: S().ended, trans: !!S().trans })); break; } } else same = 0;
      lastT = S().time;
      track(c);
      const b = B();
      if (!sameEra() || b.fall) { P.wait(0.1); continue; }
      if (b.sweep === 'wind') { P.react(); backOff(3.4, 0.4); P.roll(); ev.push('roll'); continue; }
      if (b.charge === 'tele') { P.react(); const s = st(), y = b.yawDeg * Math.PI / 180; P.moveTo(s.x - Math.cos(y) * 2.4, s.z + Math.sin(y) * 2.4, { max: 0.45 }); ev.push('side'); continue; }
      if (b.stagger > 0.4 && P.bossDist() < 5) { // 벽에 박힘 → 등 뒤로
        P.circleBehind(1, 1.6, 1.2); if (isBehind() && B().hurtCd <= 0) { const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) { hits++; ev.push('HIT-wall'); } } backOff(); continue;
      }
      if (b.wind > 0 && inFront(65)) {
        // 내려찍기 예비동작 → 반응 → Shift(시간 회피) → 멈춘 윤곽의 등 뒤로 → 와서 마저 내려찍는 동안 찌르기
        P.react(); if (B().wind <= 0) continue;
        const me = st(), oth = me.era === 'past' ? 'now' : 'past';
        if (!Y().cell(me.cell[0], me.cell[1], oth).floor) { backOff(3.4, 0.4); P.roll(); ev.push('pit-under-me'); continue; } // 저쪽 시대에선 내 발밑이 구덩이
        P.shift(); parries++;
        P.circleBehind(Math.random() < 0.5 ? 1 : -1, 1.7, 1.4);
        P.waitUntil(() => sameEra() || B().fall, 2.5);
        if (B().fall) { ev.push('FALL'); continue; }
        P.waitUntil(() => isBehind() || B().rec <= 0.05, 0.6);
        if (isBehind() && B().hurtCd <= 0) { const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) { hits++; ev.push('HIT'); } else ev.push('miss'); } else ev.push('late');
        backOff(3.4, 0.7);
        continue;
      }
      // 미끼: 앞 2m쯤에 서서 내려찍기를 부른다
      const s = st(), y = b.yawDeg * Math.PI / 180;
      P.moveTo(b.x + Math.sin(y) * 2.0, b.z + Math.cos(y) * 2.0, { max: 0.2, tol: 0.4 });
      P.wait(1 / 30); // 이미 그 자리면 moveTo가 시간을 안 흘린다
    }
    return result(c, { parries, hits, ev: ev.join(' ') });
  },
};

// 스크린샷용 장면 맞추기 (tools/boss_sim.py shot:<이름>)
const STAGES = {
  // 서쪽(3,7)으로 가서 방 이름이 사라질 때까지 기다린다 (가운데 우물 자리는 어제엔 구덩이)
  west() { const c = start(); P.moveCell(5, 7); P.moveCell(3, 7); P.waitUntil(() => P.bossDist() < 3.2, 5); P.wait(Math.max(0, 2.8 - (S().time - c.t0))); },
  bait(until) { return P.waitUntil(() => { const b = B(); if (until(b)) return true; const y = b.yawDeg * Math.PI / 180; P.moveTo(b.x + Math.sin(y) * 2.0, b.z + Math.cos(y) * 2.0, { max: 0.1, tol: 0.4 }); P.wait(1 / 30); return false; }, 8); },
  // 내려찍기 예비동작: 앞 120° 붉은 부채꼴
  slam() { STAGES.west(); STAGES.bait(b => b.wind > 0 && b.wind < 0.45 && sameEra()); },
  // 시간 회피 직후: 공격에 묶여 멈춘 윤곽 + 등 뒤 구역 + "공격에 묶여 따라오는 중"
  parry() { STAGES.west(); STAGES.bait(b => b.wind > 0.3); P.shift(); const b = B(), y = b.yawDeg * Math.PI / 180; P.moveTo(st().x + Math.cos(y) * 1.5, st().z - Math.sin(y) * 1.5, { exact: true, max: 0.35 }); P.wait(0.3); },
  // 휘두르기를 정확히 맞춘 장면: 보스를 북쪽을 보게 두고 바로 뒤(남쪽 1.6m)에 선다 → 0.3초 뒤 둘레 고리
  sweepAt() { STAGES.west(); const b = B(); Y().bossSet({ yawDeg: 180 }); Y().tpw(b.x, b.z + 1.6); P.waitUntil(() => B().sweep === 'wind', 1.5); P.wait(0.25); },
  // 등·옆에 붙어 있으면 휘두르기: 둘레 고리 (내려찍고 회복하는 동안 등 뒤로 가서 버팀)
  sweep() { STAGES.west(); STAGES.bait(b => b.rec > 0.5); P.circleBehind(1, 1.4, 0.9); P.waitUntil(() => B().sweep === 'wind', 2); P.wait(0.3); },
  // 평소 Shift: 0.35초 만에 내 쪽을 보고 나타남
  quick() { STAGES.west(); backOff(3.2, 0.6); P.wait(0.6); P.shift(); P.waitUntil(() => sameEra(), 2); P.wait(0.1); },
};

const M = {
  stage(name) { STAGES[name](); Y().render(); Y().render(); return { boss: B(), me: st() }; },
  async ready() { await P.ready(); const t0 = performance.now(); while (!(B() && B() !== 'pending') && performance.now() - t0 < 20000) { P.wait(0.1); await new Promise(r => setTimeout(r, 100)); } return !!B(); },
  run(name, n = 1, ...args) { const out = []; for (let k = 0; k < n; k++) out.push(BOTS[name](...args)); return out; },
  bots: Object.keys(BOTS),
};
window.__bossBots = M;
export default M;
