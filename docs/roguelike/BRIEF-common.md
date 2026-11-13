# 어제의 성채 로그라이크 — 병렬 작업 공통 안내 (11/13)

개발자님 말: "플레이 해봤는데 아직도 너무 쉬운데 이거 그냥 튜토리얼이지? 로그라이크류로 만들면 어떨까, 좀 방대한 프로젝트로. 몬스터 종류도 너무 적고 복잡한 퀴즈 푸는 느낌이 안 드네."

그래서 지금의 13개 방은 **튜토리얼(첫 판 한 번)**이 되고, 그 뒤로 **매번 달라지는 런**을 만든다. 네 트랙이 동시에 일한다.

| 트랙 | 맡는 것 | 슬롯 파일 |
|---|---|---|
| T1 런 구조 | 층·방 지도, 조각을 이은 방 생성, 런 시작·죽음·이어하기, 층마다 어려워짐, 모래(어제 시간) 자원 | `src/ext/t1-run.js` |
| T2 몬스터 | 시간과 얽힌 새 적 8종 이상 + 정예, 적이 든 조각 | `src/ext/t2-foes.js` |
| T3 퍼즐 장치 | 두 시대를 엮는 새 장치 6종 이상 + 여러 단계 퍼즐 조각 | `src/ext/t3-puzzles.js` |
| T4 아이템·성장 | 유물·축복·상점·회복, 능력치, 런 사이 해금, 화면 | `src/ext/t4-items.js` |

## 1. 지금 있는 것 (바탕, 커밋 `base-rl`)

- 게임: three.js 탑다운. Shift(또는 L)로 어제(황금기, 경비가 있음) ↔ 오늘(폐허, 골렘이 있음). **떠난 시대는 그 순간에 멈춘다**(적·함정·화살 모두). 등 뒤에서 J = 한 방, 전환 직후 0.6초 = 전환 기습(경보 전이면 어느 방향이든 한 방). 하트 5, 맞으면 되감기(직전 안전한 자리로). 13개 방 + 보스 "성채지기". 자세한 규칙은 `DESIGN.md` 17~19장, 기술 메모는 `NOTES.md`.
- 방 데이터: `src/rooms.js` (글자 그림 두 장 past/now + guards/golems/boss/shards…). 글자 뜻은 `src/main.js`의 `loadRoom`·`buildEra`·`solid`·`floorAt`.
- **확장 슬롯 `src/ext.js`의 `EXT`** — 이걸로만 붙인다:
  - 데이터 표: `EXT.rooms`(id → 방, `?room=id`로 열림), `EXT.chunks`(조각), `EXT.foes`(적 종류), `EXT.chars`(바닥 글자), `EXT.items`, `EXT.stats`(speed, maxHearts, shiftCd, rollCd, rollInv, lunge, invuln)
  - 칸 판정 끼어들기: `EXT.solidAt`, `EXT.floorAt`
  - 훅: `EXT.on(이름, fn)` — init, roomLoad, update, frame, shift, beforeHurt, hurt, kill, cleared, canExit, exit, nextRoom, startRoom, death, end, interact, prompt, stab (설명은 ext.js 주석)
  - `EXT.K` = 핵심 손잡이 78개: `S`(상태), `THREE`, `T`(한 칸 2m), `G`(글자 그리드), `groups.past/now`, `world`, `addEntity`, `addFoe`, `killed`, `hurt`, `toast`, `sfx`(소리 재료 `tone·noise·fm·voiceish·thud·at` 포함), `FX`(sparks·dust·debris·motes·punch…), `assemble`·`Animator`·`LOOKS`(사람 모델), `buildGolem`(돌 골렘), `freeze(on)`(고르기 창 동안 세상 멈춤), `loadRoom`, `chunkRoom`은 `EXT.chunkRoom` …
  - 적 약속(FOE)과 조각 꼴은 `src/ext.js` 맨 아래 주석.
- 연기 시험(smoke): `EXT.foes.dummy`를 등록하고 `__yk.room(EXT.rooms['t0-smoke'])`로 열어 등 뒤 찌르기 → kill 훅 → cleared 훅 → 출구 → 끝 화면까지 확인했다.

## 2. 규칙 (충돌 없이 합치려고)

1. **자기 파일만 고친다**: 슬롯 파일 + `src/ext/<트랙>/` 아래 새 파일 + `docs/roguelike/<트랙>.md` + `tools/<트랙>_*.py` + `devlog/tracks/<트랙>.md` + `devlog/shots/2026-11-xx-<트랙>/`.
   `src/main.js`, `src/ext.js`, `src/ext/index.js`, `src/rooms.js`, `index.html`, `lang/en.js`, `src/audio.js` 등 공용 파일과 다른 트랙 파일은 고치지 않는다.
   정말 공용 파일을 고쳐야 하면: 가장 작게, **따로 커밋**하고 메시지를 `core: …`로 시작, 마지막 보고에 적는다. (훅 하나 더 필요 같은 일이면 그 정도로 끝낸다)
2. **줄 끝**: `src/main.js`·`src/rooms.js`는 CRLF. Edit 도구는 그대로 지켜 주지만, Git Bash `sed -i`나 파이썬 `read_text/write_text`는 LF로 바꿔 버린다 → 바이트로 읽고 쓰기. 새 파일은 아무거나.
3. **화면 글자**: `$t('한국어')`로. 영어는 공용 `lang/en.js` 대신 자기 파일 `src/ext/<트랙>/en.js`에서 `Object.assign(window.I18N.en, { '한국어': 'English' })` 하고 슬롯 파일에서 import. 데이터 표 안 글자는 `N('…')`(main.js와 같은 뜻의 `k => k`)로 두고 그릴 때 `$t`.
4. **소리**: `audio.js`를 고치지 말고 `K.sfx.tone/noise/fm/voiceish/thud`와 `K.sfx.at(pos)`(거리·좌우)로 자기 소리를 만든다. 세기는 기존 소리와 비슷하게(`tools/sfx_check.py` 기준 -45~-12 dBFS).
5. **Fab 모델 파일**: `assets/fab/`는 git에 없다. 작업 폴더(worktree) 맨 위에서 한 번:
   `cmd /c mklink /J assets\fab "C:\Users\PC\Desktop\CMG\어제의 성채\assets\fab"` (지우거나 고치지 말 것 — 원본과 이어져 있음)
6. **커밋**: 자기 브랜치에 자주 커밋. main으로 merge·push 하지 않는다(합치는 건 처음 세션이 한다). `.gitignore`의 `assets/fab/`는 그대로.
7. **시험 포트**: 직접 플레이 서버 `py -I tools\play_server.py <포트> <스크래치 폴더>` — T1 8151, T2 8152, T3 8153, T4 8154. (화면 없는 크롬 + 진짜 키 입력. `/goto`, `/seq?steps=key:ShiftLeft;goto:x,z;until:<JS>;gotojs:<[x,z] 식>`, `/shot`, `/size`, `/errors`. 생각하는 동안은 `__yk.pause(true)`로 세상을 멈춰 둔다 — 안 그러면 생각하는 사이에 맞아 죽는다.) 앱의 미리보기 창(Browser pane)은 쓰지 말 것(개발자님이 쓰는 중).
8. **회귀 시험**: 끝내기 전에 `py -I tools\release_check.py`가 13/13 그대로여야 한다(튜토리얼 방을 깨뜨리지 않기).

## 3. 이번 일의 목표 — "너무 쉽다"를 고친다

- **직접 플레이가 기준** (`C:\Users\PC\.claude\CLAUDE.md`의 "게임 직접 플레이 테스트 규칙"을 꼭 읽고 따른다): 기능을 넣을 때마다 진짜 키 입력으로 해 보고, 끝에 처음 보는 사람처럼 통째로. 봇·훅 통과만으로 "시험했다"고 하지 않는다.
- **게으른 풀이 봇도 같이**: 의도한 풀이 봇 옆에 "Shift만 연타", "빙빙 돌며 찌르기", "가만히 있기" 같은 봇을 돌려 보고, 그걸로 쉽게 깨지면 너무 쉬운 것이다(지난번 보스가 Shift 연타로 깨졌다).
- **퍼즐 느낌**: 한 방을 깨려면 "어제에서 무엇을 해 두면 오늘 무엇이 바뀌는가"를 두세 단계 읽어야 하게. 답을 찾으면 짧게 깨지되, 처음엔 생각해야 하는 방. 안내 문구는 짧게(한 줄), 두 번 실패하면 tip.
- **공정함**: 위험은 미리 보인다(붉은 예고, 다른 시대 윤곽). 이유 없이 죽지 않게.
- 숫자 목표: 처음 보는 사람이 T1 런 1층을 첫 시도에 못 깨는 정도(하트를 다 잃는 일이 생김), 익숙해지면 1층 5~8분.

## 4. 트랙 사이의 약속

- T2·T3 → T1: 조각을 `EXT.chunks.push({...})`로 넣는다(꼴은 ext.js 주석). `tier`(1~4)와 `tags`를 꼭. 조각마다 그 트랙 시험 도구로 풀린다는 걸 확인해 둔다(풀이 단계를 `solve`에).
- T1이 조각을 아직 못 받았을 때를 위해 T1은 기존 13개 방을 조각처럼 쓸 수 있게 해 둔다. T2·T3은 T1을 기다리지 않고 자기 시험 방(`EXT.rooms['t2-…']`)으로 일한다.
- 모래(어제에 머문 시간 자원)·하트·런 상태(`S.run`)는 T1이 가진다. T4는 훅과 `EXT.stats`·T1이 내보내는 작은 함수(`EXT.run.*` — T1이 만들어 문서에 적음)로만 바꾼다. T1보다 먼저 필요하면 T4는 임시로 자기 쪽에 두고 보고에 적는다.
- 같은 이름 충돌을 피하려고 id 앞에 트랙 이름: `t2-hound`, `t3-seed`, `t4-relic-…`.

## 5. 기록과 보고

- 개발 일지: `devlog/tracks/<트랙>.md`에 단계마다(날짜·무엇을 왜·전후 숫자·스크린샷 경로·그대로 읽을 문장 3~6개). 합칠 때 `devlog/log.md`로 옮긴다. 스크린샷은 실패·전후 비교 포함해 `devlog/shots/2026-11-xx-<트랙>/`.
- 설계·규칙: `docs/roguelike/<트랙>.md` (무엇을 넣었고 수치는 왜 그런지, 시험 방 id, 조각 목록).
- 마지막 보고(한국어, 개발자님께 그대로 보여도 되게): 브랜치 이름, 넣은 것 목록, 시험 방 id와 여는 법, 직접 몇 판·몇 분 했고 어디까지 갔는지, 찾아서 고친 문제·남은 문제, `core:` 커밋이 있으면 무엇을 왜.
- 목표 일정: 11/20까지 1차를 끝내고 합친다. 잼 마감 12/2 06:37(제출 목표 11/29). 로그라이크가 늦으면 13개 방 판(태그 `jam-safe-1113`)으로 낸다.
