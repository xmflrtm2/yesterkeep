// T1 런 구조·절차 생성 — 슬롯 파일. 이 트랙의 코드는 이 파일과 src/ext/t1-run/ 아래에만 둔다 (docs/roguelike/BRIEF-common.md)
// 하는 일: 층·방 지도, 조각(EXT.chunks)을 이어 붙인 방 생성, 런 시작·죽음·다시 시작, 층마다 어려워지는 곡선, 이어하기 저장. nextRoom·exit·end 훅.
import { EXT } from '../ext.js';

// 예) EXT.on('roomLoad', (room, K) => { … });
// (T1 런 구조·절차 생성 슬롯 끝)
