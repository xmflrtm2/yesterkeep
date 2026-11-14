(() => { /* T1 직접 플레이용: 지금 방의 두 시대 지도와 적 위치를 한 번에 본다 (py -I tools\t1_play.py jsf tools\t1_dump.js) */
  const s = __yk.state(), R = __yk.S.room, K = __yk.ext.K;
  const en = K.enemies().filter(e => e.alive).map(e => [e.kind || (K.guards.includes(e) ? 'guard' : K.golems.includes(e) ? 'golem' : 'boss'), e.era, K.cellOf(e.x), K.cellOf(e.z), e.hp != null ? e.hp : '', e.state || '']);
  return { room: s.room, name: R.name, hint: document.querySelector('#hint').innerText,
    parts: (R.t1parts || []).map(p => p.id + '@' + p.x + ',' + p.y + ' ' + p.w + 'x' + p.h),
    start: [s.cell, s.era, s.hearts, +__yk.ext.run.sand().toFixed(1)], past: __yk.grid('past'), now: __yk.grid('now'), en };
})()
