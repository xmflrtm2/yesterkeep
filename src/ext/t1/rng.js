// T1 — 시드 난수. 같은 시드 + 같은 꼬리표면 언제나 같은 수열 (?seed=123 으로 같은 런을 다시 만든다)
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
// mulberry32
function m32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** makeRng(seed, '꼬리표', 1, 2 …) → { next, int(a, b), range(a, b), pick(arr), chance(p), shuffle(arr), weighted(arr, w) } */
export function makeRng(seed, ...tags) {
  const next = m32(hashStr([seed, ...tags].join('|')));
  const r = {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    range: (a, b) => a + next() * (b - a),
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
    shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted(arr, w) {
      const ws = arr.map(x => Math.max(0, w(x)));
      const sum = ws.reduce((s, x) => s + x, 0);
      if (sum <= 0) return arr[Math.floor(next() * arr.length)];
      let t = next() * sum;
      for (let i = 0; i < arr.length; i++) { t -= ws[i]; if (t <= 0) return arr[i]; }
      return arr[arr.length - 1];
    },
  };
  return r;
}
export const newSeed = () => String(Math.floor(Math.random() * 900000) + 100000);
