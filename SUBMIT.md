# 어제의 성채 / Yesterkeep — Game Off 2026 제출 준비

> **1차 점검 2026-11-12** (Claude). 11/27 14:00 예약 실행 `yesterkeep-submit-prep-1127`이 이 파일을 다시 점검해 고쳐 쓰고,
> 12/1 12:00 `game-off-final-check-1201`이 제출 여부를 확인한다. 개발은 11/29까지 이어질 수 있으니 숫자는 그때 다시 잰다.

## 0. 잼 규칙 재확인 (2026-11-12, itch.io/jam/game-off-2026 + FAQ 글)

| 항목 | 지금 페이지 | 메모(game-off-2026-jam)와 |
|---|---|---|
| 마감 | 2026-12-01 13:37 PST = **12/2(수) 06:37 KST**. 11/12 17시 기준 19일 13시간 남음 | 같음 |
| 필수 | 공개 GitHub 저장소 + itch 잼 제출. "GitHub에 올린다고 자동 제출되지 않음" | 같음 |
| 저장소 | 공개면 됨, 라이선스 자유(제한적도 OK), 커밋 한 번이어도 OK, 유료 에셋은 빼고 README에 적으면 됨 | 같음 |
| AI | 코딩·에셋 생성 모두 허용, **제출 때 공개**, 점수·자격에 영향 없음 | 같음 |
| 11월에 시작 | 대부분의 개발이 11월 안. 예전 게임에 조금 손댄 것은 안 됨 | 같음 (11/9 시작) |
| 투표 기간 | 12/2 ~ 2027-01-01 13:37 PST. 이 동안은 치명적 버그만 고치고 메모 남기기 | 같음 |
| 평가 | Overall · Gameplay · Graphics · Audio · Innovation · Theme interpretation | 같음 |
| 제출 폼 칸 (itch.io/jam/417834/add-game) | Project(내 itch 프로젝트 고르기) · **GitHub repository URL**(필수) · **Game description**(필수, 여러 줄) · **Theme interpretation**(필수, 한 줄) · **AI usage**(필수, 복수 선택 8개) · **Extent of AI usage**(필수, 5단계 중 하나) | 메모보다 자세함 → 아래 2장에 칸마다 문구 |

참고: 잼 본문 예시에 "두 겹친 현실을 오가는 퍼즐 플랫포머(무너진 다리가 다른 세계엔 있다)"가 그대로 나온다. 비슷한 출품작이 많을 테니 페이지 첫머리는 **떠난 시대가 멈춘다 + 잠입 암살 액션**으로 연다.

## 1. 1차 점검 결과 (2026-11-12)

점검 방법: `py -I tools\build_itch.py` → `py -I tools\release_check.py build\itch\web` (헤드리스 크롬, 영어 브라우저, 빌드 폴더 그대로).
방 풀이는 `src/dev/clear-all.js`(실제 키 입력, 순간이동 없음). 결과 JSON은 `build/itch/release-check.json`.

| 항목 | 결과 | 숫자 |
|---|---|---|
| 콘솔 오류 | ✅ 0 | 헤드리스에서만 나는 소리 자동재생 경고·favicon 1150건은 따로 셈 |
| 빠진 파일(404) | ✅ 0 | 117개 요청 |
| 파일 이름 대소문자 | ✅ 0 | itch CDN은 대소문자를 가린다(윈도우는 안 가림) |
| 기본 언어 | ✅ 영어 | 영어 브라우저 → English, 제목 "Yesterkeep". 한국어 브라우저만 한국어, 그 밖의 언어는 영어 |
| 번역 빠짐 | ✅ 0 | `lang\check.py` 111개 문구 중 영어 0 빠짐 + 플레이 중 실제로 뜬 문구 0 빠짐 |
| 방 13개 끝까지 | ✅ 13/13 | 경보 0, 피해 0(보스 방만 1). 아래 표 |
| 첫 로딩 | ✅ 12.93MB → **5.83MB** / 목표 6MB | 11/12 저녁 용량 줄이기(`tools/web_pack.py`) 뒤. 115개 파일. 골렘·보스 모델은 첫 방 뒤 백그라운드 |
| 전체 | ✅ 14.94MB → **7.89MB** / 목표 15MB | 풀린 빌드 15.13 → 7.92MB, zip 10.75 → 5.13MB, 123개 파일. 줄인 뒤에도 13/13 통과·오류 0 (NOTES.md "용량 줄이기") |
| 안 쓰는 파일 | 4개, 0.16MB | 깃발 02, 가시 05, 텍스처 2장 — 빼도 되지만 작음 |
| Fab 에셋 | ✅ | 빌드 zip에 111개 들어감, 저장소(origin/main)에는 0개, `.gitignore` 확인 |
| 저장소 | ✅ | https://github.com/xmflrtm2/yesterkeep 공개, main = origin/main(보스 커밋 af0bf26·9ad2a4d까지 push됨) |

| 방 | 어제 초 | ★★★ 기준 | 경보 | 피해 |
|---|---|---|---|---|
| bridge 무너진 다리 | 1.77 | — | 0 | 0 |
| bars 창살 감옥 | 0.2 | — | 0 | 0 |
| lever 어제의 레버 | 2.13 | — | 0 | 0 |
| ambush 첫 암살 | 1.18 | 1.5 | 0 | 0 |
| backtoback 등을 맞댄 보초 | 4.14 | 3.2 | 0 | 0 |
| golem 깨어난 골렘 | 4.17 | 3.0 | 0 | 0 |
| pair 두 경비 | 5.08 | 6.0 | 0 | 0 |
| outpost 초소의 밤 | 12.06 | 14 | 0 | 0 |
| storehouse 가시 창고 | 10.11 | 13 | 0 | 0 |
| arrows 멈춘 화살 | 1.7 | 4 | 0 | 0 |
| raft 멈춘 뗏목 | 7.86 | 10 | 0 | 0 |
| blades 칼날 복도 | 6.63 | 4.5 | 0 | 0 (문 0.92초 남김) |
| heart 성채의 심장(보스) | 15.12 → **21.4** | 18 | 0 | 1 → 하트 4개 남김, 쓰러짐 0 |

> 11/12 오후(c62ee11) 보스 규칙이 "평소엔 0.35초 만에 내 쪽을 보고 따라옴, **공격 중에 바꿀 때만** 1.5초 묶임"으로 바뀌었다(Shift 연타로 15.2초에 이기던 문제). heart 풀이는 `src/dev/boss-bots.js`의 parry 봇으로 바뀌었고, 보스 세션이 잰 release_check 결과는 13/13, heart 21.4초, 전체 15.0MB(목표 한도), 첫 로딩 12.94MB. 위 표의 나머지 숫자는 1차(16:58~17:00) 측정.

점검 중 알게 된 것 (게임 코드는 안 고침):
- ~~**끝 화면이 "End of the prototype"**~~ → 11/12 밤 엔딩 화면으로 바꿈: "Out of the Keep" + 마무리 2줄 + Thanks for playing + 이번 판 기록(어제 초·별·경보) + Play again + 크레딧(제작·Fab 팩·three.js·AI 공개). 스크린샷 `devlog/shots/2026-11-12-ending/{1280x720,907x510}/after-run-en.jpg`
- **첫 방부터 차례로만 간다** — 심사자가 13방 끝의 보스까지 못 갈 수 있다. 시작 화면이나 방 고르기가 있으면 좋다(보스 세션 노트에도 같은 후보).
- **가시 창고**: 가시 11·12열이 0.45초 엇박(12열이 먼저 내려감)이라 동쪽으로 걸어서 건너면 여유가 0.05초 안팎. 10열 끝에 붙어 서서 11열이 내려가는 순간 출발 + 12열에서 구르기면 피해 0. 의도한 난이도면 그대로, 아니면 `spikePhase: i => (12 - i) * 0.45`처럼 물결 방향을 바꾸면 쉬워진다.
- 게임 안에 언어 바꾸기 버튼은 없다(브라우저 언어로만 정함). 잼에는 문제없음.
- 소리는 첫 키 입력 뒤에 켜진다(브라우저 자동재생 규칙). itch 임베드에서도 같음 — 정상.

스크린샷 `devlog/shots/2026-11-12-release-check/`: `first-room-en.jpg`(영어 첫 방), `after-run-en.jpg`(13방 뒤 끝 화면 "End of the prototype"),
`storehouse-1-fail-center-start.jpg`(칸 가운데서 출발 → 12열 가시에 찔림), `storehouse-2-ok-edge-roll.jpg`(끝에 붙어 출발 + 구르기 → 피해 0).

## 2. 문구

### 2-1. itch 프로젝트 페이지

- **Title**: `Yesterkeep`
- **Project URL**: `xmflrtm2.itch.io/yesterkeep`
- **Short description or tagline**:
  > Shift between the keep's golden past and its ruined present. The era you leave freezes, guards and all.
- **Classification**: Games · **Kind**: HTML · **Release status**: In development (잼 중) · **Pricing**: No payments (무료, 잼 FAQ 권장)
- **Embed**: "This file will be played in the browser" 체크, 크기 1280×720(또는 960×540) + Fullscreen button 켜기, Mobile friendly 끄기(키보드 게임)
- **Genre**: Action
- **Tags (10)**: `stealth`, `time-travel`, `assassin`, `top-down`, `dungeon`, `3d`, `short`, `singleplayer`, `threejs`, `github-game-off`
- **AI generation disclosure**(itch 편집 페이지 체크칸): Code ✅, Text ✅(UI 문구·영어 번역), Sound ✅(효과음을 코드로 합성) / Graphics ❌(Fab 에셋, 사람이 만든 것)

**Description** (페이지 본문, 영어):

```
Press Shift and the whole keep shifts between its golden past and its ruined present.

THE ERA YOU LEAVE FREEZES
Step into today and yesterday stops mid-breath. A patrolling guard hangs in place as a red ghost,
its vision cone frozen on the floor. Arrows hang in the air. A swinging blade stops mid-arc.
Walk around behind the guard in the ruins, then shift back and strike before it can turn.

A STEALTH DAGGER GAME, NOT A PUZZLE BOX
- Backstab: one hit from behind, even when the guard has spotted you.
- Shift strike: arrive in an era and every guard within 3 m freezes for a moment. Strike from any side.
- Stone golems exist only today and bounce a front stab off their shields. Go to yesterday,
  where they freeze, get behind them, and come back.
- The Warden, the keep's last guardian, follows you through time and turns to face you. But shift
  in the middle of its attack and it loses track of time: it stays locked in that swing for 1.5 seconds,
  then arrives exactly where and how it stood and finishes the blow, back wide open.
  If that spot is a pit in your era, it falls.

TWO MAPS OF ONE KEEP
Today the bridge is gone; yesterday it stands. Yesterday the bars are shut; today the wall beside them
has crumbled. And yesterday leaves marks on today: push a crate into the moat yesterday and it is
a rotten stepping stone today. A guard who falls yesterday is a pile of bones today.

SCORE = SECONDS SPENT IN YESTERDAY
Every room counts your time in the past and your alarms. Fewer seconds, fewer alarms, more stars.
Hourglass shards are hidden for players who read both maps.

13 rooms and a boss, about 15 minutes. Plays in the browser (WebGL). Keyboard and mouse.

Made for GitHub Game Off 2026 (theme: SHIFT). Source: https://github.com/xmflrtm2/yesterkeep

AI disclosure: the code was written with the AI coding assistant Claude, directed and reviewed by
the developer. The art, 3D models and animations are purchased Fab assets made by human artists.
```

**Controls** (본문 아래 또는 사이드):

| Key | Action |
|---|---|
| WASD / Arrow keys | Move |
| J / F / Left click | Stab |
| Space / K | Roll |
| Shift / L | Shift era (yesterday ↔ today) |
| E | Interact (levers) |
| R | Restart room |

**Credits** (본문 끝):
```
Art and animation: FANTASTIC Dungeon Pack, Modular Stylized Character (Polyart), Dagger Animation Pack,
Armored Stone Golem — from Fab, used under the Fab Standard License.
Engine: three.js (MIT).
```

**스크린샷 후보** (itch는 630×500 커버 + 스크린샷 3~5장 권장):
1. `docs/readme/banner.jpg` — 같은 방 어제|오늘 사선 (커버 630×500으로 다시 잘라야 함)
2. `docs/readme/ghost_today.jpg` + `docs/readme/backstab_yesterday.jpg` — 멈춘 경비 → 등 찌르기 (핵심 재미)
3. `docs/readme/arrows_today.jpg` — 공중에 멈춘 화살
4. `docs/boss/10-parry-locked.jpg` — 공격 중에 바꿔 묶인 보스(멈춘 윤곽 + 등 뒤 구역). 11/12 오후 규칙 변경 뒤 장면
5. `docs/boss/05-charge-line.jpg` 또는 `docs/readme/golem_slam.jpg`
- 피할 것: 레버·창살만 보이는 장면(These Four Walls와 첫인상이 겹침), 한국어 화면

These Four Walls와 겹쳐 보이지 않게 쓴 점: "퍼즐 플랫포머", "분신", "몸 바꾸기", "고딕" 같은 말을 쓰지 않았고, 첫 문단부터 **세계 전체가 바뀜 + 떠난 시대가 멈춤 + 단검 잠입**을 앞세웠다. 레버는 조작표에만 있다.

### 2-2. 잼 제출 폼 (itch.io/jam/417834/add-game)

| 칸 | 넣을 것 |
|---|---|
| Project | Yesterkeep (itch 프로젝트를 먼저 만들어야 목록에 뜸) |
| GitHub repository URL | `https://github.com/xmflrtm2/yesterkeep` |
| Game description | 아래 블록 |
| Theme interpreation (한 줄) | 아래 한 줄 |
| AI usage | ✅ Code / programming · ✅ Game design / brainstorming · ✅ Testing / debugging · ✅ Writing / dialogue / narrative · ✅ Music / sound effects / voice (효과음 합성 코드) · ❌ Art / graphics / animation · ❌ I didn't use AI · ❌ Other |
| Extent of AI usage | **A lot - AI played a major role** (코드는 거의 전부 AI, 그림·모델·동작은 사람이 만든 Fab, 설계 결정과 플레이 검토는 개발자) |

Game description:
```
A top-down stealth dagger game where one key shifts the whole keep between its golden past and its ruined present.
The era you leave freezes: guards hang in place as red ghosts, arrows stop in midair, and you walk around behind
them before shifting back to strike. Stone golems exist only today; the Warden follows you through time,
unless you shift in the middle of its attack.
Score = seconds spent in yesterday. 13 rooms, about 15 minutes, plays in the browser.

AI disclosure: the code was written with the AI coding assistant Claude, directed and reviewed by the developer.
The art, 3D models and animations are purchased Fab assets made by human artists.
```

Theme interpretation (한 줄):
```
SHIFT is the key you press: one tap shifts the whole keep between yesterday and today, and the era you leave freezes, so every shift is also a pause you can walk around in.
```

AI 공개 문구 (개발자님이 정한 뜻 그대로):
- 한국어: 코드는 AI 코딩 도우미 Claude로 작성하고 개발자가 지휘·검토했다. 그림·3D 모델·동작은 사람이 만든 Fab 에셋(구매)이다.
- English: The code was written with the AI coding assistant Claude, directed and reviewed by the developer. The art, 3D models and animations are purchased Fab assets made by human artists.

## 3. 개발자님이 누를 순서

1. **itch 프로젝트 초안** — 11/12 개발자님 답: "11/27에 만들어 줘". 11/27 14:00 예약 실행(`yesterkeep-submit-prep-1127`)이 Chrome에서 `itch.io/game/new`로 **초안(Draft)**을 만들고 zip 올리기·문구·태그·커버·스크린샷·AI 체크칸까지 채운다. 공개 전환·잼 제출·약관 동의는 하지 않는다. 업로드 파일은 그날 다시 만드는 `build/itch/yesterkeep-web.zip`.
2. 초안 페이지를 열어 직접 한 판 해 보기(브라우저 임베드, 전체 화면 버튼, 소리).
3. 프로젝트를 **Public**으로 바꾸고 저장. (초안은 다른 사람이 열 수 없으니 제출 전에 공개)
4. 잼 페이지 https://itch.io/jam/game-off-2026 → **Submit your project** → Project에서 Yesterkeep 고르기 → 2-2 표대로 채우기 → **Submit**.
5. 잼 제출 목록(itch.io/jam/game-off-2026/entries)에 뜨는지, 거기서 게임이 열리는지 확인.
6. 투표 기간(12/2 ~ 1/1)에는 빌드를 바꾸지 않는다. 치명적 버그만 고치고 페이지에 메모.

마감: 12/2(수) 06:37 KST. 목표: 11/29(일) 제출. GitHub 로그인·비밀번호, itch 공개 전환, 잼 Submit 버튼은 개발자님만.

## 4. 11/29까지 남은 일

### Claude 몫
| 할 일 | 언제 | 메모 |
|---|---|---|
| ~~첫 로딩 줄이기 12.9MB → 6MB~~ → 11/12 저녁 완료: 5.83MB(gltfpack 없이). 새 Fab 파일을 넣으면 `py -I tools\web_pack.py`를 다시 돌리고 release_check로 첫 로딩이 6MB 안인지 확인 | 완료 |
| ~~끝 화면 "End of the prototype" → 엔딩 문구 + 크레딧~~ | 완료 (11/12 밤) | 문구를 바꾸려면 index.html `#endCard` + lang/en.js |
| 시작 화면 또는 방 고르기 | 11/27 전 | 심사자가 보스까지 가게. 개발자님 결정 필요(아래) |
| itch 커버 630×500, 스크린샷 4~5장, GIF | 11/28 | `tools/readme_shots.py` 장면을 늘려 영어 화면으로 |
| README에 보스·13방 반영 | 11/28 | 이번엔 AI 공개 문구·빌드/점검 방법만 고침 |
| 최종 빌드 + `release_check.py` 다시 | 11/27, 11/29 | `clear-all.js`에 새 방 풀이 추가 |
| 이 파일 갱신 | 11/27 예약 실행 | 숫자·문구·남은 일 |
| (선택) 가시 창고 엇박 조정, 안 쓰는 파일 4개 빼기 | 아무 때 | 작음 |

### 개발자님 몫
| 할 일 | 언제 |
|---|---|
| ~~itch 초안을 Claude가 만들어도 되는지 답하기~~ → 11/12 "11/27에 만들어 줘" (예약 실행이 만듦) | 완료 |
| 11/27 예약이 만든 itch 초안 확인 → Public 전환 → 잼 Submit | 11/27~29 |
| 결정: 최종 제목(Yesterkeep 유지?), 코드 라이선스(All rights reserved 유지 추천), 시작 화면/방 고르기 | 11/25 전 |
| 손으로 처음부터 끝까지 한 판(특히 보스: 공격 중에 바꿔 묶어 두는 게 읽히는지) + 소감. 걸린 시간도 알려 주시면 문구의 "about 15 minutes"를 실측으로 고침(지금은 기획서 목표치, 봇은 2분 28초) | 11/27 전 |
| (선택) X·itch 게시판 홍보 문구 승인 | 제출 뒤 |
