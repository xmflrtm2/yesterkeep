// T1 2차 — 층마다 테마: 빛·안개(main.js가 매 프레임 applyLook으로 정한 값 위에 덧칠), 떠다니는 입자, 오늘 바닥의 잔해, 층에 어울리는 적·장치 비율.
// 1층 = 무너진 바깥 회랑(기본 빛, 바람에 날리는 먼지) · 2층 = 가라앉은 창고(청록 물빛, 짙은 안개, 떨어지는 물방울) · 3층 = 심장으로 가는 길(붉은 불빛, 올라가는 불티)
export const THEMES = [null,
  {
    id: 'halls', grade: null, rubble: 0, motes: { color: ['#d8cfb8', '#ffffff'], up: 0.25, speed: 0.6, life: 2.2, every: 0.9 },
    foe: { guard: 1, golem: 1, 't2-hound': 1.3, 't2-shield': 1.3, 't2-xbow': 1.2, 't2-nest': 1.2, 't2-mimic': 1.3, 't2-echo': 0.5, 't2-wraith': 0.5, 't2-mage': 0.4 },
    tag: { seed: 1.4, key: 1.4, crumble: 1.2 },
  },
  {
    id: 'stores', grade: { tint: '#4fc8b8', k: 0.45, fogK: 0.7, fogNear: -5, exp: 0.92, hemiI: 0.9 }, rubble: 0.08,
    motes: { color: ['#9fe8e0', '#d8fff8'], up: -1.6, speed: 0.2, life: 1.6, every: 0.3, high: true },
    foe: { guard: 0.9, golem: 0.9, 't2-mimic': 1.4, 't2-nest': 1.4, 't2-echo': 1.5, 't2-wraith': 1.3, 't2-xbow': 1.2, 't2-mage': 0.9 },
    tag: { water: 1.6, crate: 1.4, clock: 1.4 },
  },
  {
    id: 'heart', grade: { tint: '#ff7a4a', k: 0.28, fogK: 0.5, fogNear: -6, exp: 0.96, hemiI: 0.85 }, rubble: 0.14,
    motes: { color: ['#ffb060', '#ff6a3a', '#ffe0a0'], up: 1.6, speed: 0.5, life: 1.8, every: 0.35 },
    foe: { guard: 0.8, golem: 0.8, 't2-mage': 1.6, 't2-wraith': 1.5, 't2-echo': 1.4, 't2-hound': 1.2, 't2-shield': 1.2 },
    tag: { mirror: 1.6, turn: 1.4, key: 1.2 },
  },
];

/** 조각 무게에 곱할 값: 층에 어울리는 적·장치면 크게. 조각이 floor 필드(그 층 전용)를 주면 그 층 2배, 다른 층 0.3배 */
export function themeWeight(c, floor) {
  const T = THEMES[floor]; if (!T) return 1;
  let w = 1;
  const kinds = [...(c.guards || []).map(() => 'guard'), ...(c.golems || []).map(() => 'golem'), ...(c.foes || []).map(f => f.kind)];
  if (kinds.length) w *= kinds.reduce((s, k) => s + (T.foe[k] ?? 1), 0) / kinds.length;
  for (const t of c.tags || []) if (T.tag[t]) w *= T.tag[t];
  if (c.floor != null) w *= c.floor === floor ? 2 : 0.3;
  return w;
}

/** 깊은 층일수록 오늘 바닥에 잔해(','는 두 시대 모두 그냥 바닥 — 보기만 다름). T1·튜토리얼 조각 칸에만(다른 트랙 장치 글자 곁은 건드리지 않음) */
export function addRubble(room, floor, rng, okCell) {
  const T = THEMES[floor]; if (!T || !T.rubble) return room;
  room.now = room.now.map((r, j) => [...r].map((ch, i) => (ch === '.' && okCell(i, j) && rng.next() < T.rubble ? ',' : ch)).join(''));
  return room;
}

let hemi = null, sun = null;
const c1 = { r: 0, g: 0, b: 0 };
/** main.js의 applyLook 뒤(같은 프레임)에 덧칠. update()가 돌 때마다 main이 기본값으로 되돌리므로 쌓이지 않는다 */
export function applyGrade(K, floor) {
  const T = THEMES[floor]; if (!T || !T.grade) return;
  if (!hemi) K.scene.traverse(o => { if (o.isHemisphereLight) hemi = o; else if (o.isDirectionalLight && !sun) sun = o; });
  const g = T.grade, THREE = K.THREE;
  const tint = new THREE.Color(g.tint);
  if (hemi) { hemi.color.lerp(tint, g.k); hemi.intensity *= g.hemiI; }
  if (sun) sun.color.lerp(tint, g.k * 0.6);
  if (K.scene.fog) K.scene.fog.color.lerp(tint.multiplyScalar(0.25), g.fogK);
  K.renderer.toneMappingExposure *= g.exp;
}
/** 방을 불러온 직후 한 번: 안개 시작 거리(main.js loadRoom이 방마다 새로 정함 — 프레임마다 더하면 쌓인다) */
export function themeRoom(K, floor) {
  const T = THEMES[floor];
  if (T && T.grade && K.scene.fog) K.scene.fog.near = Math.max(4, K.scene.fog.near + T.grade.fogNear);
}
let moteT = 0;
export function ambient(K, floor, dt) {
  const T = THEMES[floor]; if (!T || !T.motes) return;
  moteT -= dt; if (moteT > 0) return;
  const m = T.motes; moteT = m.every * (0.6 + Math.random() * 0.8);
  const S = K.S, a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 6;
  try { K.FX.motes(S.p.x + Math.cos(a) * d, m.high ? 4.5 : 0.6 + Math.random() * 1.5, S.p.z + Math.sin(a) * d, { n: 3, color: m.color, speed: m.speed, up: m.up, life: m.life, spread: 0.8 }); } catch (e) { /* 이펙트 없이 */ }
}
export function resetGrade() { hemi = null; sun = null; }
