// T1 — 좌우로 뒤집은 조각이 풀리는지: T3 풀이 봇(src/ext/t3/dev.js)에 좌우로 뒤집은 단계를 넘겨 돌린다 (게임에는 안 들어감)
//   const F = (await import('/tools/t1_flipcheck.js?' + Date.now())).default; await F.run(['t3-mirror1', …])
import { EXT } from '../src/ext.js';
import { normalize, flip, toRoom } from '../src/ext/t1/gen.js';
import D from '../src/ext/t3/dev.js';

// 조건 글자 좌우 뒤집기 (W = 조각 폭 칸, 미터 폭 = 2W)
function mirrorCond(cond, W) {
  const M = 2 * W;
  let m;
  if (typeof cond !== 'string') return cond;
  if ((m = cond.match(/^x([<>])(-?[\d.]+)$/))) return 'x' + (m[1] === '<' ? '>' : '<') + (M - +m[2]);
  if ((m = cond.match(/^cell=(\d+),(\d+)$/))) return `cell=${W - 1 - +m[1]},${m[2]}`;
  if ((m = cond.match(/^band=(-?[\d.]+),(-?[\d.]+)$/))) return `band=${M - +m[2]},${M - +m[1]}`;
  if ((m = cond.match(/^box=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/))) return `box=${M - +m[2]},${M - +m[1]},${m[3]},${m[4]}`;
  return cond;
}
export function mirrorSteps(steps, W) {
  return steps.map(s => {
    const [op, a, b, c, d] = s;
    if (op === 'go') return [op, W - 1 - a, b];
    if (op === 'push') return [op, W - 1 - a, b, -c, d];
    if (op === 'to') return [op, 2 * W - a, b];
    if (op === 'chest') return [op, a, -b, c];
    if (op === 'goUntil') return [op, W - 1 - a, b, c && [c[0], c[1], mirrorCond(c[2], W)]];
    if (op === 'waitFoe') return [op, a, b, mirrorCond(c, W), d];
    return s.slice();
  });
}
const F = {
  async run(ids) {
    await D.ready();
    const out = [];
    for (const id of ids) {
      const src = EXT.chunks.find(c => c.id === id);
      if (!src) { out.push({ id, err: 'no chunk' }); continue; }
      const base = D.bot(id); // 뒤집지 않은 것(기준)
      const c = flip(normalize(src, { src: 't3' }));
      const rid = 't1f-' + id;
      EXT.rooms[rid] = toRoom(c, { id: rid, name: src.name });
      const r = D.bot(rid, mirrorSteps(src.solve || [], c.w));
      out.push({ id, base: base.ok, flipped: r.ok, fail: r.fail, hearts: r.hearts, past: r.past, mirrors: c.past.join('').replace(/[^/\\]/g, '') });
    }
    return out;
  },
};
export default F;
