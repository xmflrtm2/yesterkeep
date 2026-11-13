// T3 퍼즐 장치 — 슬롯 파일. 이 트랙의 코드는 이 파일과 src/ext/t3/ 아래에만 둔다 (docs/roguelike/BRIEF-common.md)
// 하는 일: 두 시대를 엮는 새 장치(EXT.chars·solidAt·floorAt), 여러 단계 퍼즐 조각(EXT.chunks), 시험 방(EXT.rooms).
// 장치 7종: 씨앗→나무(seed.js) · 수문→물(water.js) · 거울→달빛 봉인(light.js) · 시대를 건너는 열쇠(key.js) · 무너지는 바닥(crumble.js)
//           · 태엽 문(clock.js) · 회전 다리(turn.js). 막다른 길 알아채기는 solver.js. 설명은 docs/roguelike/t3.md
import './t3/en.js';
import './t3/core.js';
import './t3/seed.js';
import './t3/water.js';
import './t3/light.js';
import './t3/key.js';
import './t3/crumble.js';
import './t3/clock.js';
import './t3/turn.js';
import './t3/solver.js';
import './t3/chunks.js';
// (T3 퍼즐 장치 슬롯 끝)
