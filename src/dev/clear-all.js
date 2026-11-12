// 개발용: ORDER의 12방을 처음부터 끝까지 실제 키 입력(play.js)으로 깨 보는 출시 점검 (게임에는 안 들어감)
//   const C = (await import('/src/dev/clear-all.js?' + Date.now())).default; await C.ready(); C.all()
//   C.one('outpost') 으로 한 방만. 결과: [{ room, cleared, past, alarms, hurts, hearts, shards, note }]
// 순간이동(tp)은 쓰지 않는다. 걷기·Shift·찌르기·E만 쓰고, 시간은 __yk.step으로만 흐른다.
// 풀이는 방마다 "개발자가 의도한 풀이" 한 가지다(NOTES.md 사람 봇 표와 같은 길).
import P from './play.js';
import BossBots from './boss-bots.js';

const Y = () => window.__yk;
const st = () => Y().state();
const C2 = i => i * 2 + 1; // 칸 → 미터(칸 가운데)
const rad = d => d * Math.PI / 180;
const OTHER = { past: 'now', now: 'past' };

/** 지금 시대에서 깨어 있는 적이 서 있는 칸 (몸에 막히지 않게 길에서 뺀다) */
function occupied(era) {
  const all = [...Y().guards().map(g => ({ ...g, era: 'past' })), ...Y().golems().map(g => ({ ...g, era: 'now' }))];
  return new Set(all.filter(g => g.alive && g.era === era).map(g => g.cell.join(',')));
}
/** play.js goCell과 같지만, 적이 서 있는 칸을 피해 돌아간다 */
function go(i, j, o = {}) {
  const s = st(), era = s.era, occ = occupied(era), key = (a, b) => a + ',' + b;
  const ok = (a, b) => { const c = Y().cell(a, b, era); return c.floor && !c.solid && (!occ.has(key(a, b)) || (a === i && b === j)); };
  const prev = new Map([[key(s.cell[0], s.cell[1]), null]]), q = [s.cell];
  while (q.length) {
    const [a, b] = q.shift();
    if (a === i && b === j) break;
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db; if (!prev.has(key(na, nb)) && ok(na, nb)) { prev.set(key(na, nb), [a, b]); q.push([na, nb]); } }
  }
  if (!prev.has(key(i, j))) return false;
  const path = []; for (let c = [i, j]; c; c = prev.get(key(c[0], c[1]))) path.unshift(c);
  for (const [a, b] of path.slice(1)) if (!P.moveTo(C2(a), C2(b), { tol: 0.45, max: 3, exact: true, until: o.until })) return !!o.until;
  return true;
}

let last = null; // 출구를 밟기 직전 상태(방 점수는 다음 방을 불러오면 지워지므로)
function exitAt(i, j) {
  last = st();
  const until = s => { if (!s.trans && !s.ended) last = s; return s.trans || s.ended; };
  go(i, j, { until });
  P.wait(1.0);
}
function shiftTo(era) {
  if (st().era === era) return 'ok';
  // state()의 shiftCd는 소수 셋째 자리로 반올림돼 0.0004초가 0으로 보인다 → 한 틱 더 기다린다
  let waited = false;
  for (let k = 0; k < 40 && st().shiftCd > 0; k++) { P.wait(1 / 30); waited = true; }
  if (waited) P.wait(1 / 30);
  return P.shift();
}
/** 키 하나를 조건이 될 때까지 누르고 있기 */
function holdKey(code, until, max = 3) {
  const ev = type => dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
  ev('keydown'); P.waitUntil(until, max, 1 / 60); ev('keyup');
}
const foes = kind => (kind === 'guard' ? Y().guards() : Y().golems());

/**
 * 적 하나 쓰러뜨리기.
 * via 'freeze'(기본): 적이 멈춰 있는 시대에서 옆(가능하면 등 뒤) 1.6m로 걸어가 → 적의 시대로 전환 → 전환 기습 찌르기
 * via 'live': 적의 시대에서 그대로 등 뒤로 걸어가 찌르기(보초가 벽을 보고 있을 때)
 */
function kill(kind, k, { via = 'freeze', d = 1.6, angles = [180, 150, -150, 120, -120, 90, -90, 60, -60, 0] } = {}) {
  const live = kind === 'guard' ? 'past' : 'now', freeze = OTHER[live];
  const walkEra = via === 'live' ? live : freeze;
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = foes(kind)[k];
    if (!g || !g.alive) return true;
    if (shiftTo(walkEra) !== 'ok' && st().era !== walkEra) return false;
    let pick = null;
    for (const a of angles) {
      const ang = rad(g.yawDeg + a), x = g.x + Math.sin(ang) * d, z = g.z + Math.cos(ang) * d;
      const i = Math.floor(x / 2), j = Math.floor(z / 2);
      const ok = e => { const c = Y().cell(i, j, e); return c.floor && !c.solid; };
      if (ok(live) && (via === 'live' || ok(freeze))) { pick = { x, z, i, j }; break; }
    }
    if (!pick) return false;
    if (!go(pick.i, pick.j)) return false;
    P.moveTo(pick.x, pick.z, { exact: true, tol: 0.2, max: 4 });
    if (via === 'freeze' && shiftTo(live) !== 'ok') { P.moveCell(pick.i, pick.j, { exact: true, tol: 0.2 }); shiftTo(live); }
    if (via === 'freeze') P.react();
    P.stab(); P.wait(0.6);
    if (!foes(kind)[k].alive) return true;
    shiftTo(freeze); P.wait(0.6); // 실패하면 멈춘 시대로 피했다가 다시
  }
  return !foes(kind)[k].alive;
}

/** 어제의 화살 줄 j가 x0에서 동쪽으로 건너는 동안 비어 있는지 (화살은 서쪽으로 6.5m/s) */
function rowFree(j, x0, ahead = 7) {
  const z = C2(j);
  return !Y().actors().arrows.some(([era, ax, az]) => era === 'past' && Math.abs(az - z) < 0.6 && ax - x0 > -0.9 && ax - x0 < ahead);
}
/** 화살 방: 오늘에서 구덩이 열 col 바로 앞까지 걸어가, 화살이 빈 줄에서만 어제로 건넌다 */
function crossArrows(col, rows = [2, 3, 4], prefer = null) {
  const edge = col * 2 - 0.45;
  for (let tries = 0; tries < 12; tries++) {
    const order = prefer != null ? [prefer, ...rows.filter(r => r !== prefer)] : rows;
    const j = order.find(r => rowFree(r, edge));
    if (j != null) {
      shiftTo('now');
      go(col - 1, j); P.moveTo(edge, C2(j), { exact: true, tol: 0.15, max: 3 });
      if (!rowFree(j, edge)) continue;
      shiftTo('past');
      P.moveTo(col * 2 + 2.5, C2(j), { exact: true, tol: 0.15, max: 2 });
      return j;
    }
    // 빈 줄이 없으면 어제의 시간을 조금 흘려 화살을 끌어당긴다(내 줄 화살이 4.5m 밖일 때만)
    const s = st(), myJ = s.cell[1];
    if (rowFree(myJ, s.x - 0.5, 4.5)) { shiftTo('past'); P.wait(0.5); shiftTo('now'); }
    else { const alt = rows.find(r => rowFree(r, s.x - 0.5, 4.5)); if (alt != null) go(col - 1, alt); else P.wait(0.1); }
  }
  return null;
}

/** 칼날 줄 j(어제)가 바닥을 지나는 순간을 기다렸다가 다음 칸까지 건넌다 */
function crossBlade(i, j, toZ) {
  const ang = () => Y().actors().blades.find(b => b[0] === i && b[1] === j)[3];
  let prev = ang();
  for (let n = 0; n < 150; n++) { P.wait(1 / 60); const a = ang(); if (Math.sign(a) !== Math.sign(prev) && prev !== 0) break; prev = a; }
  P.moveTo(C2(i), toZ, { exact: true, tol: 0.15, max: 2 });
}

const SOLVE = {
  bridge() {
    go(6, 3); shiftTo('past'); exitAt(11, 3);
  },
  bars() {
    shiftTo('now'); exitAt(5, 2);
  },
  lever() {
    shiftTo('past'); go(2, 7); P.moveTo(5, 15.7, { exact: true, tol: 0.15 });
    P.tap('KeyE'); P.wait(0.3);
    const lever = st().lever;
    go(4, 6); shiftTo('now'); exitAt(6, 2);
    return lever ? '' : 'lever not pulled';
  },
  ambush() {
    kill('guard', 0); exitAt(11, 3);
  },
  backtoback() {
    kill('guard', 0);
    kill('guard', 1, { via: 'live' });
    exitAt(11, 2);
  },
  golem() {
    kill('golem', 0);
    shiftTo('now'); go(7, 4);
    exitAt(13, 4);
  },
  pair() {
    go(4, 7); shiftTo('past'); go(9, 7); shiftTo('now');
    kill('guard', 1);
    shiftTo('now'); go(13, 7); // 조각 먼저: A를 쓰러뜨린 뒤에 가면 길이 출구(13,4)를 지나 방이 끝난다
    kill('guard', 0);
    exitAt(13, 4);
  },
  outpost() {
    shiftTo('past');
    kill('guard', 1, { via: 'live' });
    kill('golem', 0);
    kill('guard', 0);
    shiftTo('now'); go(2, 5); P.moveCell(2, 5, { exact: true, tol: 0.2 });
    shiftTo('past'); P.wait(0.05);
    shiftTo('now'); go(8, 4); P.moveCell(8, 4, { exact: true, tol: 0.2 });
    shiftTo('past'); go(9, 1);
    exitAt(10, 1);
  },
  storehouse() {
    kill('golem', 0);
    shiftTo('past'); go(6, 9); P.moveCell(6, 9, { exact: true, tol: 0.2 });
    P.moveTo(C2(6), C2(7), { exact: true, tol: 0.2, max: 4 });
    go(11, 9); P.moveCell(11, 9, { exact: true, tol: 0.2 });
    P.moveTo(C2(11), C2(7), { exact: true, tol: 0.2, max: 4 });
    const crates = JSON.stringify(st().crates);
    shiftTo('now'); go(11, 6); go(6, 4);
    kill('guard', 0);
    // 가시 11·12열은 0.45초 엇박(12열이 먼저). 칸 가운데서 출발하면 12열이 솟을 때 걸린다 →
    // 10열 동쪽 끝에 붙어 서서 11열이 막 내려간 순간에 출발 (피해 0)
    shiftTo('now'); go(10, 2); P.moveTo(21.55, C2(2), { exact: true, tol: 0.1, max: 2 });
    shiftTo('past');
    const sp = () => (st().spikes.find(s => s[0] === 11 && s[1] === 2) || [])[2];
    P.waitUntil(() => sp() === 'up', 4, 1 / 60); P.waitUntil(() => sp() === 'down', 4, 1 / 60);
    // 12열이 0.45초 먼저 내려가므로 걸어서는 여유가 0.05초 안팎 → 12열 들어설 때 구르기(무적)로 넘는다
    holdKey('KeyD', () => st().x > 23.4); P.roll();
    holdKey('KeyD', () => st().x > 26.6);
    exitAt(15, 2);
    return 'crates ' + crates;
  },
  arrows() {
    crossArrows(4);
    shiftTo('now');
    const gj = () => Y().golems()[0].cell[1];
    crossArrows(8, [2, 3, 4], gj());
    shiftTo('now'); P.react(); P.stab(); P.wait(0.6);
    if (Y().golems()[0].alive) kill('golem', 0);
    shiftTo('now');
    crossArrows(12);
    shiftTo('now'); go(13, 2);
    exitAt(13, 1);
  },
  raft() {
    go(6, 7); P.moveCell(6, 7, { exact: true, tol: 0.15 });
    const raft = () => Y().actors().rafts[0];
    P.waitUntil(() => Math.abs(raft()[0] - 13) < 0.25, 20, 1 / 60);
    shiftTo('now'); go(6, 4); P.moveTo(13, 9, { exact: true, tol: 0.15 });
    shiftTo('past');
    const boarded = Math.abs(st().x - raft()[0]) < 1 && !st().falling;
    P.waitUntil(() => raft()[0] > 20.6, 15, 1 / 30);
    P.moveTo(21, 7, { exact: true, tol: 0.2, max: 2 });
    shiftTo('now'); shiftTo('past'); P.stab(); P.wait(0.6);
    if (Y().guards()[0].alive) kill('guard', 0);
    exitAt(11, 1);
    return boarded ? '' : 'did not board raft';
  },
  blades() {
    go(2, 12); P.moveCell(2, 12, { exact: true, tol: 0.2 });
    const gate0 = st().gateT;
    shiftTo('now'); go(3, 11); P.moveCell(3, 11, { exact: true, tol: 0.15 });
    shiftTo('past'); crossBlade(3, 10, C2(9)); shiftTo('now');
    P.moveCell(3, 8, { exact: true, tol: 0.15 });
    const gz = Y().golems()[0].z;
    shiftTo('past'); crossBlade(3, 7, Math.min(13.7, gz + 2.0));
    shiftTo('now'); P.react(); P.stab(); P.wait(0.6);
    if (Y().golems()[0].alive) kill('golem', 0);
    shiftTo('now'); go(3, 5); P.moveCell(3, 5, { exact: true, tol: 0.15 });
    shiftTo('past'); crossBlade(3, 4, C2(3));
    const gateLeft = st().gateT;
    exitAt(3, 1);
    return `gate ${gate0}s → ${gateLeft}s left at the last blade`;
  },
  // 보스 성채지기 (11/12 오후 규칙): 평소엔 0.35초 만에 내 쪽을 보고 따라온다 → Shift만으로는 등을 못 잡는다.
  // 내려찍기 예비동작(붉은 부채꼴)에 Shift = 시간 회피 → 1.5초 묶임 → 멈춘 윤곽 등 뒤로 → 와서 마저 내려찍는 동안 등 찌르기.
  // 풀이는 boss-bots.js의 parry 봇(사람 반응 0.25초, 휘두르기는 굴러 피함, 돌진은 옆으로)을 그대로 쓴다. 가끔 한 번 쓰러져 방을 다시 시작한다
  heart() {
    const B = () => Y().boss();
    P.waitUntil(() => B() && B() !== 'pending', 10, 0.1);
    const r = BossBots.run('parry', 1)[0];
    P.wait(1.5);
    if (!B().alive) exitAt(8, 1);
    return `boss ${r.win ? 'down' : 'ALIVE'} in ${r.t}s: ${r.parries} parries, ${r.hits} hits, ${r.hurts} hurts, ${r.deaths} restarts`;
  },
};

function one(id) {
  const idx = Y().rooms().indexOf(id);
  if (!SOLVE[id]) return { room: id, cleared: null, note: 'no scripted solution yet (add one to SOLVE)' };
  P.room(id);
  Y().S.hearts = 5; // 방마다 하트를 채워 앞 방의 실수가 뒤 방 점검을 망치지 않게(점검용)
  last = null;
  const s0 = st();
  let note = '';
  try { note = SOLVE[id]() || ''; } catch (e) { note = 'error: ' + e.message; }
  const s = st(), b = last || s;
  const cleared = s.ended || s.roomIdx === idx + 1;
  return { room: id, cleared, past: b.pastTime, alarms: b.alarms, hurts: b.hurts - s0.hurts, hearts: b.hearts, kills: b.kills, shards: b.shards, note };
}

const C = {
  ready: () => P.ready(),
  one, kill, exitAt, shiftTo, crossArrows, crossBlade, SOLVE,
  all() { const out = []; for (const id of Y().rooms()) out.push(one(id)); return out; },
};
window.__clear = C;
export default C;
