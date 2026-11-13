// T1 — 층 입구(계단참)와 임시 보물·상점·쉼터 방. T4가 EXT.run.registerRoomType('treasure'|'shop'|'rest', fn)로 바꾸면 그쪽을 쓴다.
// 제단(t1altar)은 E로 쓴다: 상점 = 모래 6 → 하트 1(두 번까지), 쉼터 = 하트 +2 · 모래 가득(한 번).
export const FLOOR_NAME = [null, N('1층 · 무너진 바깥 회랑'), N('2층 · 가라앉은 창고'), N('3층 · 심장으로 가는 길')];

export function landingRoom(floor, opts = {}) {
  return {
    id: `run-landing-${floor}`, name: FLOOR_NAME[floor] || N('계단참'), label: opts.label || N('계단참'),
    hint: opts.hint || (floor === 1 ? N('왼쪽 위 모래 = 어제에 머물 수 있는 시간. 어제에 있으면 줄고, 다 떨어지면 오늘로 끌려와요') : N('출구로 가면 이 층의 지도가 열려요')),
    startEra: 'now',
    past: ['###########', '####...####', '####.>.####', '#.*.....*.#', '#....@....#', '#.........#', '###########'],
    now: ['###########', '####.,.####', '####.>.####', '#.*..,..*.#', '#....@....#', '#..,......#', '###########'],
  };
}

export const TEMP = {
  treasure(ctx) {
    return {
      name: N('보물 방'), hint: N('모래시계 조각을 모으세요. 하나는 어제에만 있어요'),
      startEra: 'now',
      past: ['#############', '#.....s.....#', '#...........#', '#@.........>#', '#...........#', '#..s........#', '#############'],
      now: ['#############', '#....___....#', '#....___....#', '#@.........>#', '#........s..#', '#...........#', '#############'],
    };
  },
  shop(ctx) {
    return {
      name: N('떠돌이 상인'), hint: N('제단에서 E: 모래를 내고 하트를 사요'),
      startEra: 'now', t1altar: { i: 5, j: 3, kind: 'shop', left: 2 },
      past: ['###########', '#.........#', '#..*...*..#', '#@.......>#', '#..*...*..#', '#.........#', '###########'],
      now: ['###########', '#....,....#', '#..*...*..#', '#@.......>#', '#..*...*..#', '#..,......#', '###########'],
    };
  },
  rest(ctx) {
    return {
      name: N('쉼터'), hint: N('모닥불에서 E: 하트 2개 회복, 모래 가득'),
      startEra: 'now', t1altar: { i: 5, j: 3, kind: 'rest', left: 1 },
      past: ['###########', '#.........#', '#.........#', '#@.......>#', '#.........#', '#.........#', '###########'],
      now: ['###########', '#...,.....#', '#.........#', '#@.......>#', '#......,..#', '#.........#', '###########'],
    };
  },
};

/** 제단 모습(두 시대 모두 보임) + 불빛 */
export function buildAltar(K, a) {
  const { THREE } = K;
  const x = a.i * K.T + 1, z = a.j * K.T + 1;
  const g = new THREE.Group();
  // 11/13 직접 플레이: 공 모양에 빛을 세게 주니 오늘 화면에서 하얀 덩어리로 보였다 → 어두운 받침 + 작게 빛나는 수정, 칸은 막힘(solidAt)
  const stone = new THREE.MeshStandardMaterial({ color: '#4a4640', roughness: 0.95 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.55, 8), stone); base.position.y = 0.27; g.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 8), stone); top.position.y = 0.64; g.add(top);
  const col = a.kind === 'rest' ? '#ff8a2a' : '#b48cff';
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.1 }));
  orb.scale.y = 1.6; orb.position.y = 1.08; g.add(orb);
  if (a.kind === 'rest') { // 모닥불: 장작 셋
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1 });
    for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 6), wood); l.rotation.z = Math.PI / 2; l.rotation.y = k * Math.PI / 3; l.position.y = 0.78; g.add(l); }
  }
  g.position.set(x, 0, z);
  K.world.add(g);
  for (const E of K.ERAS) K.lightSpecs[E].push({ x, y: 1.6, z, color: col, I: 6, d: 7, flick: a.kind === 'rest' });
  a.mesh = g; a.orb = orb; a.x = x; a.z = z;
  a.spin = dt => { orb.rotation.y += dt * 1.2; orb.position.y = 1.08 + Math.sin(performance.now() / 600) * 0.05; };
  return a;
}
