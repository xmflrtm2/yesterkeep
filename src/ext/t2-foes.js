// T2 몬스터 — 슬롯 파일. 이 트랙의 코드는 이 파일과 src/ext/t2/ 아래에만 둔다 (docs/roguelike/BRIEF-common.md)
// 하는 일: 시간 전환과 얽힌 새 적 종류들(EXT.foes), 시험 방(EXT.rooms), 적이 들어간 조각(EXT.chunks).
// 설계·수치: docs/roguelike/t2.md
import './t2/en.js';
import './t2/core.js';
import './t2/humans.js';   // 방패병 · 석궁병 · 시간 마법사
import './t2/beasts.js';   // 시간 사냥개 · 미믹 · 쥐구멍(쥐 떼)
import './t2/spirits.js';  // 메아리 · 망령
import './t2/chunks.js';   // 조각 + 시험 방 (t2-zoo, t2-<kind>)
// (T2 몬스터 슬롯 끝)
