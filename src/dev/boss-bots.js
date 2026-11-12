// 개발용: 성채지기(보스) 공략 봇 모음 (게임에는 안 들어감). tools/boss_sim.py가 화면 없는 크롬에서 돌린다.
//   const M = (await import('/src/dev/boss-bots.js?' + Date.now())).default; await M.ready(); M.run('parry', 3)
// 봇마다 사람 반응 0.25초(play.js RT), 실제 키 입력. 시간은 __yk.step으로만 흐른다.
//   spam   : 0.5초마다 Shift를 누르며 등 뒤로 걸어가 찌른다 (11/12 개발자님이 짚은 "Shift만 계속 쓰기")
//   circle : Shift 없이 같은 시대에서 빙빙 돌아 등을 잡는다
//   idle   : 공격하지 않을 때 Shift → 얼마나 빨리, 어느 쪽을 보고 나타나는지
//   parry  : 의도한 풀이. 내려찍기 예비동작(붉은 부채꼴)을 보고 Shift → 멈춘 윤곽 등 뒤로 → 와서 마저 내려찍는 동안 찌르기.
//            휘두르기(둘레 고리)는 굴러서 피하고, 돌진 예고는 옆으로 비킨다.
//            11/12 밤 패턴: 2연타는 두 번째도 같은 식, 땅 가르기(주황 줄)는 가까우면 Shift 뒤 등으로·멀면 옆으로, 무너지는 천장은 Shift로 어제에 피함,
//            오늘로 돌아왔을 때 멈춰 있던 돌 원 안이면 걸어 나간다
//   roll   : Shift 없이 구르기만. 내려찍기 예고에 옆·뒤로 굴러 회복 중에 찌르기, 나머지는 비키기 (Shift 없이도 이기면 시간 회피가 필요 없는 것)
//   wall   : 멀리서 버티기. 어제로 한 번 가서 6m 넘게 떨어져 돌진만 부르고 옆으로 비켜 벽에 박혔을 때만 찌른다 (Shift는 처음 한 번)
//   far    : 오늘에서 멀리 떨어져 예고만 피한다 (공격 안 함) — 멀리 있으면 안전한지
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
// 보스에게서 멀어지는 쪽으로 (그 길에 구덩이·벽이 있으면 45°씩 돌려 본다)
function backOff(dist = 3.2, max = 0.8) {
  const b = B(), s = st(), a0 = Math.atan2(s.x - b.x, s.z - b.z);
  for (const da of [0, 0.8, -0.8, 1.6, -1.6]) {
    const tx = b.x + Math.sin(a0 + da) * dist, tz = b.z + Math.cos(a0 + da) * dist;
    if (lineClear(s.x, s.z, tx, tz)) { P.moveTo(tx, tz, { exact: true, max, tol: 0.4 }); return; }
  }
  P.wait(Math.min(max, 0.2));
}
// 미끼 자리: 보스 앞 2m. 거기가 구덩이·벽이면 보스에서 내 쪽 2m
function baitSpot() {
  const b = B(), s = st(), y = b.yawDeg * Math.PI / 180;
  let tx = b.x + Math.sin(y) * 2.0, tz = b.z + Math.cos(y) * 2.0;
  if (!okCell(tx, tz)) { const ux = s.x - b.x, uz = s.z - b.z, l = Math.hypot(ux, uz) || 1; tx = b.x + ux / l * 2.0; tz = b.z + uz / l * 2.0; }
  return [tx, tz];
}
const QR = 1.35; // 무너지는 천장 돌 반지름 (main.js BOSS.quake.r)
// 오늘에서 곧 떨어질 돌 원 안에 있으면 그 원 밖으로 (가장 가까운 원 기준, 벽이면 반대로)
function rockUnderMe(pad = 0.35) { const s = st(); return st().era === 'now' && (B().rocks || []).find(r => Math.hypot(r.x - s.x, r.z - s.z) < QR + pad); }
function leaveRock(max = 0.6) {
  const r = rockUnderMe(); if (!r) return false;
  const s = st(); let ux = s.x - r.x, uz = s.z - r.z, l = Math.hypot(ux, uz);
  if (l < 0.2) { const b = B(); ux = s.x - b.x; uz = s.z - b.z; l = Math.hypot(ux, uz) || 1; }
  for (const sgn of [1, -1]) { const tx = r.x + sgn * ux / l * (QR + 0.7), tz = r.z + sgn * uz / l * (QR + 0.7); if (Y().cell(Math.floor(tx / 2), Math.floor(tz / 2)).floor && !Y().cell(Math.floor(tx / 2), Math.floor(tz / 2)).solid) { P.moveTo(tx, tz, { exact: true, max, tol: 0.3 }); return true; } }
  return false;
}
// 줄(돌진·땅 가르기) 옆으로 비키기: 보스가 보는 방향의 수직으로 d m (막혔으면 반대쪽)
function sidestep(d = 2.4, max = 0.45) {
  const b = B(), s = st(), y = b.yawDeg * Math.PI / 180;
  for (const sgn of [1, -1]) { const tx = s.x - sgn * Math.cos(y) * d, tz = s.z + sgn * Math.sin(y) * d, c = Y().cell(Math.floor(tx / 2), Math.floor(tz / 2)); if (c.floor && !c.solid) { P.moveTo(tx, tz, { max }); return; } }
  P.roll();
}
// 저쪽 시대에선 내 발밑이 구덩이인지 (그러면 Shift하면 떨어진다)
function pitThere() { const me = st(), oth = me.era === 'past' ? 'now' : 'past'; return !Y().cell(me.cell[0], me.cell[1], oth).floor; }
// 사람처럼 구덩이는 돌아서 간다: 곧게 가다 구덩이·벽이 있으면 칸 길(너비 우선)을 따라 가장 멀리 곧게 보이는 칸으로
const okCell = (x, z) => { const c = Y().cell(Math.floor(x / 2), Math.floor(z / 2)); return c.floor && !c.solid; };
function lineClear(x0, z0, x1, z1) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25); for (let k = 1; k <= n; k++) if (!okCell(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n)) return false; return true; }
function cellPath(i0, j0, i1, j1) {
  const key = (a, b) => a + ',' + b, prev = new Map([[key(i0, j0), null]]), q = [[i0, j0]];
  while (q.length) {
    const [a, b] = q.shift(); if (a === i1 && b === j1) break;
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (!prev.has(key(na, nb)) && okCell(na * 2 + 1, nb * 2 + 1)) { prev.set(key(na, nb), [a, b]); q.push([na, nb]); } }
  }
  if (!prev.has(key(i1, j1))) return null;
  const out = []; for (let c = [i1, j1]; c; c = prev.get(key(c[0], c[1]))) out.unshift(c);
  return out;
}
function safeTo(x, z, max, tol = 0.4) {
  const t0 = S().time;
  if (!okCell(x, z)) return false;
  while (S().time - t0 < max) {
    const s = st();
    if (Math.hypot(x - s.x, z - s.z) < tol) return true;
    if (lineClear(s.x, s.z, x, z)) return P.moveTo(x, z, { exact: true, max: max - (S().time - t0), tol });
    const path = cellPath(s.cell[0], s.cell[1], Math.floor(x / 2), Math.floor(z / 2));
    if (!path) return false;
    let wp = path[1] || path[0];
    for (const c of path.slice(1)) if (lineClear(s.x, s.z, c[0] * 2 + 1, c[1] * 2 + 1)) wp = c;
    P.moveTo(wp[0] * 2 + 1, wp[1] * 2 + 1, { exact: true, max: Math.min(0.6, max - (S().time - t0)), tol: 0.45 });
  }
  return false;
}
// play.js circleBehind와 같은 세 걸음이지만 구덩이를 돌아간다. 등 뒤 자리가 이 시대에 구덩이면 반대쪽·더 가까이
function goBehind(side, d = 1.7, max = 1.4) {
  const b = B(), y = b.yawDeg * Math.PI / 180, fx = Math.sin(y), fz = Math.cos(y);
  for (const [sd, dd] of [[side, d], [-side, d], [side, 1.3]]) {
    const px = -fz * sd, pz = fx * sd, bx = b.x - fx * dd, bz = b.z - fz * dd;
    if (!okCell(bx, bz)) continue;
    const t0 = S().time;
    if (okCell(b.x + px * 2.3 + fx * 0.3, b.z + pz * 2.3 + fz * 0.3)) safeTo(b.x + px * 2.3 + fx * 0.3, b.z + pz * 2.3 + fz * 0.3, max / 2, 0.5);
    if (okCell(b.x + px * 1.6 - fx * dd, b.z + pz * 1.6 - fz * dd)) safeTo(b.x + px * 1.6 - fx * dd, b.z + pz * 1.6 - fz * dd, Math.max(0.2, max - (S().time - t0) - 0.3), 0.5);
    safeTo(bx, bz, 0.8, 0.35);
    return true;
  }
  return false;
}
// 시간 회피 뒤: 멈춘 윤곽의 등 뒤로 → 와서 마저 치는 동안 찌르기. 반환: 'HIT' | 'miss' | 'late' | 'FALL'
function parryStab(maxRun = 1.4) {
  goBehind(Math.random() < 0.5 ? 1 : -1, 1.7, maxRun);
  P.waitUntil(() => sameEra() || B().fall, 2.5);
  if (B().fall) return 'FALL';
  P.waitUntil(() => isBehind() || B().rec <= 0.05, 0.6);
  if (isBehind() && B().hurtCd <= 0) { const hp = B().hp; P.stab(); P.wait(0.15); return B().hp < hp ? 'HIT' : 'miss'; }
  return 'late';
}
function start() {
  P.room('heart'); P.events = [];
  P.moveCell(8, 7);
  P.waitUntil(() => B().state === 'alert' && B().stagger <= 0, 3);
  return { t0: S().time, hurts0: S().hurts, falls0: S().falls, deaths: 0, hearts: st().hearts };
}
// 하트가 늘었으면 = 다 잃고 방을 처음부터 (보스도 체력 6으로). 맞을 때마다 무엇에 맞았는지(화면 알림 글) 적어 둔다
function track(c) {
  const h = st().hearts; if (h > c.hearts) { c.deaths++; (c.hl = c.hl || []).push('DEATH'); }
  const n = S().hurts + S().falls;
  if (c.hn != null && n > c.hn) { const el = document.getElementById('toast'); (c.hl = c.hl || []).push(`${(S().time - c.t0).toFixed(1)}:${el ? el.textContent.slice(0, 14) : '?'}`); }
  c.hn = n; c.hearts = h;
}
const result = (c, extra = {}) => ({ win: !B().alive, t: +(S().time - c.t0).toFixed(1), bossHp: B().hp, hurts: S().hurts - c.hurts0 + (S().falls - c.falls0), deaths: c.deaths, past: st().pastTime, used: Object.entries(B().used || {}).map(([k, v]) => k + '=' + v).join(','), ...extra, hl: (c.hl || []).join(' | ') });

const BOTS = {
  spam(limit = 90) {
    const c = start(); let hits = 0; const ev = [];
    while (B().alive && S().time - c.t0 < limit) {
      track(c);
      const b = B(), y = b.yawDeg * Math.PI / 180;
      P.moveTo(b.x - Math.sin(y) * 1.6, b.z - Math.cos(y) * 1.6, { exact: true, max: 0.5, tol: 0.3 });
      if (sameEra() && isBehind() && B().hurtCd <= 0) {
        const hp = B().hp, w = B(); P.stab(); P.wait(0.15);
        if (B().hp < hp) { hits++; ev.push(`${(S().time - c.t0).toFixed(1)}:${w.kind || (w.sweep ? 'sw' : w.charge ? 'ch' : w.rec > 0 ? 'rec' : w.daze > 0 ? 'daze' : w.stagger > 0 ? 'stg' : 'idle')}${w.followT > 0 ? '*' : ''}`); }
      }
      P.shift();
    }
    return result(c, { hits, ev: ev.join(' ') });
  },
  circle(limit = 60) {
    const c = start(); let hits = 0, tries = 0; const ev = [];
    while (B().alive && S().time - c.t0 < limit) {
      track(c);
      const b = B(), s = st(), a = Math.atan2(s.x - b.x, s.z - b.z) + 0.9; // 보스 둘레 반지름 1.7m로 한 바퀴씩 앞질러 간다
      P.moveTo(b.x + Math.sin(a) * 1.7, b.z + Math.cos(a) * 1.7, { exact: true, max: 0.25, tol: 0.3 });
      if (sameEra() && isBehind() && B().hurtCd <= 0 && P.bossDist() < 2.6) {
        tries++; const hp = B().hp, w = B(); P.stab(); P.wait(0.15);
        if (B().hp < hp) { hits++; ev.push(`${(S().time - c.t0).toFixed(1)}:${w.kind || (w.sweep ? 'sw' : w.charge ? 'ch' : w.rec > 0 ? 'rec' : w.daze > 0 ? 'daze' : w.stagger > 0 ? 'stg' : 'idle')}`); }
      }
    }
    return result(c, { hits, tries, ev: ev.join(' ') });
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
      if (rockUnderMe() && !(b.kind === 'quake' && b.wind > 0)) { leaveRock(); ev.push('rock-out'); continue; } // 돌아온 오늘에 멈춰 있던 돌
      if (b.sweep === 'wind') { P.react(); backOff(3.4, 0.4); P.roll(); ev.push('roll'); continue; }
      if (b.charge === 'tele') { P.react(); sidestep(); ev.push('side'); continue; }
      if (b.stagger > 0.4 && P.bossDist() < 5) { // 벽에 박힘 → 등 뒤로
        P.circleBehind(1, 1.6, 1.2); if (isBehind() && B().hurtCd <= 0) { const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) { hits++; ev.push('HIT-wall'); } } backOff(); continue;
      }
      if (b.kind === 'quake') {
        // 무너지는 천장: Shift로 어제에 피함(= 시간 회피) → 둘레 충격파(2.8m) 밖에서 기다렸다가 → 크게 회복하는 동안 등 뒤로 찌르기
        // 저쪽이 구덩이면 오늘에서 고리·원 밖으로
        P.react(); if (B().wind <= 0) continue;
        if (pitThere()) { backOff(3.6, 0.6); P.waitUntil(() => B().wind < 0.3, 1.2); leaveRock(0.5); ev.push('quake-walk'); continue; }
        P.shift(); parries++;
        if (P.bossDist() < 3.5) backOff(3.8, 0.8);
        P.waitUntil(() => (sameEra() && B().wind <= 0) || B().fall, 3);
        if (B().fall) { ev.push('Q-FALL'); continue; }
        goBehind(Math.random() < 0.5 ? 1 : -1, 1.7, 1.0);
        let r = 'late'; if (isBehind() && B().hurtCd <= 0 && B().rec > 0) { const hp = B().hp; P.stab(); P.wait(0.15); r = B().hp < hp ? 'HIT' : 'miss'; }
        if (r === 'HIT') hits++; ev.push('Q-' + r); backOff(3.4, 0.7); continue;
      }
      if (b.kind === 'fissure') {
        // 땅 가르기: 가까우면 Shift 뒤 등으로(회복 1.1초), 멀면 옆으로 비키기
        P.react(); if (B().wind <= 0) continue;
        if (P.bossDist() < 6.5 && !pitThere()) { P.shift(); parries++; const r = parryStab(2.4); if (r === 'HIT') hits++; ev.push('F-' + r); backOff(3.4, 0.7); }
        else { sidestep(2.2); ev.push('F-side'); }
        continue;
      }
      if (b.wind > 0 && inFront(65)) {
        // 내려찍기 예비동작(2연타의 두 번째도) → 반응 → Shift(시간 회피) → 멈춘 윤곽의 등 뒤로 → 와서 마저 내려찍는 동안 찌르기
        P.react(); if (B().wind <= 0) continue;
        if (pitThere()) { backOff(3.4, 0.4); P.roll(); ev.push('pit-under-me'); continue; } // 저쪽 시대에선 내 발밑이 구덩이
        P.shift(); parries++;
        const r = parryStab(1.4); if (r === 'HIT') hits++; ev.push(r + (b.pivot > 0 ? '2' : ''));
        backOff(3.4, 0.7);
        continue;
      }
      // 미끼: 앞 2m쯤에 서서 공격을 부른다 (구덩이는 돌아서)
      const [tx, tz] = baitSpot();
      safeTo(tx, tz, 0.2, 0.4);
      P.wait(1 / 30); // 이미 그 자리면 moveTo가 시간을 안 흘린다
    }
    return result(c, { parries, hits, ev: ev.join(' ') });
  },
  roll(limit = 90) {
    const c = start(); let hits = 0, tries = 0;
    while (B().alive && S().time - c.t0 < limit) {
      track(c);
      const b = B();
      if (b.fall || !sameEra()) { P.wait(0.1); continue; }
      if (rockUnderMe() && !(b.kind === 'quake' && b.wind > 0.3)) { leaveRock(); continue; }
      if (b.sweep === 'wind') { P.react(); backOff(3.4, 0.4); P.roll(); continue; }
      if (b.charge === 'tele' || b.kind === 'fissure') { P.react(); sidestep(); continue; }
      if (b.kind === 'quake') { P.waitUntil(() => B().wind < 0.3, 1.2); leaveRock(0.5); continue; }
      if (b.wind > 0 && inFront(65)) {
        // 예고를 보고 옆으로 굴러 등 쪽으로 → 회복하는 동안 찌르기
        P.react(); const y = b.yawDeg * Math.PI / 180, side = Math.random() < 0.5 ? 1 : -1;
        Y().roll(-Math.cos(y) * side - Math.sin(y) * 0.6, Math.sin(y) * side - Math.cos(y) * 0.6); // 옆·뒤로 (방향 키 + 구르기)
        P.wait(0.35);
        P.circleBehind(side, 1.5, 0.9);
        if (isBehind() && B().hurtCd <= 0) { tries++; const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) hits++; }
        backOff(3.4, 0.6);
        continue;
      }
      const [tx, tz] = baitSpot(); safeTo(tx, tz, 0.2, 0.4); P.wait(1 / 30);
    }
    return result(c, { hits, tries });
  },
  wall(limit = 90) {
    const c = start(); let hits = 0, walls = 0;
    P.shift(); // 어제로 한 번 (돌진은 어제에만)
    while (B().alive && S().time - c.t0 < limit) {
      track(c);
      const b = B();
      if (b.fall || !sameEra()) { if (!sameEra() && !b.fall && b.followT === 0 && st().era === 'now') P.shift(); P.wait(0.1); continue; }
      if (b.sweep === 'wind') { P.react(); backOff(3.6, 0.4); P.roll(); continue; }
      if (b.charge === 'tele' || b.kind === 'fissure') { P.react(); sidestep(2.6); continue; }
      if (b.wind > 0 && inFront(65)) { P.react(); backOff(3.6, 0.4); P.roll(); continue; }
      if (b.stagger > 0.4 && P.bossDist() < 6) { walls++; P.circleBehind(1, 1.6, 1.2); if (isBehind() && B().hurtCd <= 0) { const hp = B().hp; P.stab(); P.wait(0.15); if (B().hp < hp) hits++; } backOff(); continue; }
      // 보스에게서 7m쯤, 벽을 등지는 자리(북·남 벽 앞)로
      const s = st(), tz = b.z < 11 ? 19 : 7, tx = Math.max(3, Math.min(31, s.x + (s.x < b.x ? -1 : 1)));
      if (P.bossDist() < 5.5) backOff(7, 0.5); else P.moveTo(tx, tz, { max: 0.3, tol: 0.6 });
      P.wait(1 / 30);
    }
    return result(c, { hits, walls });
  },
  far(limit = 60) {
    const c = start();
    while (S().time - c.t0 < limit) {
      track(c);
      const b = B();
      if (b.fall || !sameEra()) { P.wait(0.1); continue; }
      if (rockUnderMe() && !(b.kind === 'quake' && b.wind > 0.3)) { leaveRock(); continue; }
      if (b.sweep === 'wind') { P.react(); backOff(3.6, 0.4); P.roll(); continue; }
      if (b.charge === 'tele' || b.kind === 'fissure') { P.react(); sidestep(2.4); continue; }
      if (b.kind === 'quake') { P.waitUntil(() => B().wind < 0.3, 1.2); leaveRock(0.5); continue; }
      if (b.wind > 0) { P.react(); backOff(4, 0.4); P.roll(); continue; }
      if (P.bossDist() < 7) backOff(8, 0.4); else P.wait(0.1);
    }
    return result(c);
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
  // ── 11/12 밤 새 패턴 ──
  // 멀리(6m) 서서 기다리다 until(b)까지 (가까워지면 물러남)
  keepFar(until, d = 6, max = 10) { return P.waitUntil(() => { if (until(B())) return true; if (P.bossDist() < d - 0.5 && !B().kind && !B().charge) backOff(d, 0.15); else P.wait(1 / 30); return false; }, max); },
  // 땅 가르기 예고: 주황 줄이 고정되어 진해진 순간
  fissure() { STAGES.west(); STAGES.keepFar(b => b.kind === 'fissure' && b.wind < 0.28); },
  // 땅 가르기 금이 줄을 따라 달려가는 중 (옆으로 비켜서)
  crack() { STAGES.west(); STAGES.keepFar(b => b.kind === 'fissure' && b.wind < 0.25); sidestep(2.2, 0.3); P.waitUntil(() => B().crack && B().crack.d > 4, 1); },
  // 2페이즈 무너지는 천장: 둘레 고리 + 붉은 원들 (하나는 내 발밑)
  quake() { STAGES.west(); backOff(4, 0.5); Y().bossSet({ hp: 3 }); P.waitUntil(() => B().kind === 'quake' && B().wind < 0.45, 4); },
  // 돌이 떨어지는 순간: 원과 고리 밖으로 비켜서
  rockfall() { STAGES.quake(); P.waitUntil(() => B().wind < 0.32, 1); leaveRock(0.5); P.waitUntil(() => (B().rocks || []).some(r => r.t < 0.2), 1.5); },
  // 천장 예고 중 Shift → 어제: 공격에 묶인 붉은 윤곽 (오늘의 돌은 공중에 멈춤)
  frozen() { STAGES.quake(); P.shift(); backOff(4, 0.35); P.wait(0.15); },
  // 어제에서 다 받고 오늘로 돌아오면: 멈춰 있던 돌이 다시 떨어진다
  resume() { STAGES.quake(); P.shift(); backOff(4, 0.5); P.waitUntil(() => sameEra() && B().rec > 0, 3); P.wait(0.3); P.shift(); P.wait(0.4); },
  // 2페이즈 2연타의 두 번째: 확 돌아서며 다시 부채꼴 (어제)
  combo() {
    STAGES.west(); P.shift(); P.waitUntil(() => sameEra(), 1); Y().bossSet({ hp: 3 }); P.wait(0.8);
    STAGES.bait(b => b.kind === 'slam' && sameEra());
    P.waitUntil(() => B().wind < 0.25, 1); backOff(3.4, 0.4);
    P.waitUntil(() => B().pivot > 0 || (B().kind === 'slam' && B().windMax < 0.5), 1.5); P.wait(0.2);
  },
  // 2페이즈 어제 돌진 3연속: 첫 돌진을 비킨 뒤 두 번째 겨눔
  chain() {
    STAGES.west(); P.shift(); P.waitUntil(() => sameEra(), 1); Y().bossSet({ hp: 3 }); P.wait(0.6);
    P.waitUntil(() => { const b = B(); if (b.charge === 'tele' && b.chainLeft === 1 && b.chargeT == null) return true; if (b.charge === 'tele' && b.chainLeft === 2) { P.react(); sidestep(2.4, 0.45); } else if (!b.charge && P.bossDist() < 5.5) backOff(6.5, 0.2); else P.wait(1 / 30); return false; }, 10);
    P.wait(0.22);
  },
};

const M = {
  stage(name) { STAGES[name](); Y().render(); Y().render(); return { boss: B(), me: st() }; },
  async ready() { await P.ready(); const t0 = performance.now(); while (!(B() && B() !== 'pending') && performance.now() - t0 < 20000) { P.wait(0.1); await new Promise(r => setTimeout(r, 100)); } return !!B(); },
  run(name, n = 1, ...args) { const out = []; for (let k = 0; k < n; k++) out.push(BOTS[name](...args)); return out; },
  bots: Object.keys(BOTS),
};
window.__bossBots = M;
export default M;
