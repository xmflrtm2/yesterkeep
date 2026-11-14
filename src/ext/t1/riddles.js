// T1 2차 — 런 방의 안내 문구 3단계: ① 수수께끼 한 줄(답을 말하지 않고 "무엇을 보라"만) → ② 두 번 실패하면 조각의 원래 안내 → ③ 네 번이면 tip.
// 11/14 합친 판 직접 플레이 메모: "안내 문구가 답을 거의 말해 주는 방이 많다". 조각이 riddle 필드를 주면 그걸 먼저 쓴다(T2·T3 2차용).
export const RIDDLE = {
  // 튜토리얼 방
  'tut-bridge': N('어제는 이어져 있고, 오늘은 끊겨 있다'),
  'tut-bars': N('어제 막힌 길이 오늘도 막혔을까'),
  'tut-lever': N('어제 당긴 것은 오늘도 당겨져 있다'),
  'tut-ambush': N('멈춘 자의 등은 열려 있다'),
  'tut-backtoback': N('나타나는 순간, 가까운 자는 얼어붙는다'),
  'tut-golem': N('돌은 오늘에만 깨어 있다'),
  'tut-pair': N('하나가 등을 돌린 순간을 쥐어라'),
  'tut-outpost': N('모두 잠든 뒤에도 문은 어제의 시간으로만 열린다'),
  'tut-storehouse': N('어제 밀어 둔 것이 오늘의 발판이 된다'),
  'tut-arrows': N('화살은 어제에서만 난다'),
  'tut-raft': N('떠다니는 것을 원하는 자리에 세워라'),
  'tut-blades': N('떠나는 순간이 곧 돌아오는 순간이다'),
  'tut-gate': N('열린 문을 들고 가라'),
  'tut-spikes': N('내려간 가시를 그대로 붙잡아라'),
  'tut-crates': N('어제의 상자는 썩어서도 버틴다'),
  // T1 일반 조각
  't1-sentry': N('어제의 벽은 오늘 무너져 있다'),
  't1-loop': N('낭떠러지 끝에서 돌의 곁에 서라'),
  't1-crossing': N('하나가 멈춘 사이에 다른 하나를'),
  't1-gallery': N('화살은 멀리서 올수록 늦다'),
  't1-spikeyard': N('가시도 물결처럼 지나간다'),
  't1-twin': N('등과 등 사이, 둘 다의 그림자 안'),
  't1-bridgewatch': N('다리를 지키는 눈은 다리만 본다'),
  't1-arena': N('기둥은 시선을 가린다'),
  't1-switch': N('어제의 틈과 오늘의 틈은 반대쪽에'),
  // T2 몬스터 조각
  't2-hound-pit': N('따라오는 자는 발밑을 보지 않는다'),
  't2-shield-wall': N('방패는 앞만 막는다'),
  't2-xbow-hall': N('날아오던 화살도 오늘엔 멈춘다'),
  't2-mimic-corridor': N('오늘의 괴물은 어제의 궤짝'),
  't2-nest-den': N('구멍은 어제부터 막는다'),
  't2-echo-gate': N('내 그림자는 내가 간 길을 늦게 걷는다'),
  't2-wraith-crypt': N('보이지 않는 것은 어제에서 보인다'),
  't2-mage-court': N('되살리는 손부터'),
  't2-shield-xbow': N('지키는 자를 지키는 자가 있다'),
  't2-hound-mage': N('되살리는 손은 어제에서만 움직인다'),
  't2-mimic-bridge': N('다리를 막은 것은 어제 밀 수 있다'),
  't2-rats-golem': N('오늘에 오래 머물면 몰려온다'),
  't2-echo-wraith': N('뒤에선 메아리가, 앞에선 망령이'),
  't2-elite-court': N('금빛 근위대는 귀가 밝다'),
  't2-elite-pack': N('금빛 사냥개는 한 번은 속지 않는다'),
  // T3 퍼즐 장치 조각
  't3-seed1': N('오늘의 씨앗은 어제의 흙을 기억한다'),
  't3-sluice1': N('오늘의 물은 어제 흘러온 것'),
  't3-mirror1': N('어제 돌린 거울은 오늘도 그쪽을 본다'),
  't3-key1': N('오늘 주운 것이 어제의 문에 맞는다'),
  't3-crumble1': N('무너지는 것은 오늘뿐이다'),
  't3-clock1': N('어제 감은 것은 오늘 풀린다'),
  't3-turn1': N('어제를 떠난 순간, 다리는 그 방향으로 녹슨다'),
  't3-mirror2': N('빛이 지나는 길에 어제의 상자'),
  't3-seedkey': N('섬으로 가는 길은 어제 심는다'),
  't3-float': N('어제의 마당은 오늘의 저수지'),
  't3-crumble2': N('금 간 바닥도 어제에선 기다려 준다'),
  't3-turnkey': N('축 위는 언제나 안전하다'),
  't3-sunkkey': N('물은 어제 열고, 어제 닫는다'),
  't3-garden': N('자라난 것이 빛을 가린다면'),
  't3-clockcrumble': N('둘 다 오늘에서만 시간이 간다'),
  't3-grand': N('물을 열면 건널 수 없다'),
};
// 표에 없는 조각(새로 들어온 조각): 꼬리표로 고른 일반 수수께끼
const GENERIC = {
  gatekeeper: N('이 층의 문은 그가 지킨다 — 그의 시간을 읽어라'),
  elite: N('금빛 적은 한 번 더 생각한다'),
  puzzle: N('어제 한 일은 오늘에 남는다'),
  combat: N('멈춘 자의 등은 열려 있다'),
};
export function riddleFor(c) {
  if (!c) return null;
  if (c.riddle) return c.riddle;
  if (RIDDLE[c.id]) return RIDDLE[c.id];
  const tags = c.tags || [];
  for (const t of ['gatekeeper', 'boss', 'elite', 'puzzle', 'combat']) if (tags.includes(t)) return GENERIC[t === 'boss' ? 'gatekeeper' : t];
  return GENERIC.puzzle;
}
