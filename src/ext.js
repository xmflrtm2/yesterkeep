// 확장 슬롯 — 로그라이크 병렬 작업(11/13)의 바탕. main.js를 거의 안 고치고 새 적·장치·아이템·런 구조를 붙인다.
// 트랙 파일(src/ext/t1-run.js … t4-items.js)은 이 EXT에 등록만 한다. main.js가 준비되면 EXT.init(K)를 부르고,
// K(핵심 손잡이: S·THREE·FX·sfx·hurt·toast…)는 그 뒤에 EXT.K로 쓴다. 규칙은 docs/roguelike/BRIEF-common.md.
export const EXT = {
  K: null,
  // ── 데이터 표 ──
  rooms: {},     // id → 방 데이터(rooms.js와 같은 꼴). ?room=<id> 로 바로 열린다 (시험 방·청크로 만든 방)
  chunks: [],    // 절차 생성용 방 조각 { id, tags:[], tier, w, h, past:[], now:[], foes:[], ... } — T1이 조립, T2·T3이 채움
  foes: {},      // kind → { spawn(def, K) → foe } (foe 약속은 아래 FOE 주석)
  chars: {},     // 바닥 글자 → (E, i, j, room, K) → 그 칸에 남길 기본 글자('.' '#' '_' 등). 위치는 핸들러가 기억해 두고 roomLoad 훅에서 짓는다
  items: {},     // T4: id → 유물·축복 정의
  stats: {},     // 플레이어 능력치(main.js가 기본값을 채움: speed, maxHearts, shiftCd, rollCd, rollInv, lunge, invuln). 아이템이 바꾼다
  // ── 칸 판정에 끼어들기 (true/false = 그 값으로 결정, undefined = 기본 규칙) ──
  solidAt: [],   // (era, i, j, c) → 막힘이면 true
  floorAt: [],   // (era, i, j, c) → 바닥이면 true, 구덩이면 false
  // ── 훅 ──
  hooks: {},
  on(ev, fn) { (this.hooks[ev] = this.hooks[ev] || []).push(fn); return fn; },
  // 모두 부른다
  emit(ev, ...a) { const hs = this.hooks[ev]; if (!hs) return; for (const f of hs) { try { f(...a); } catch (e) { console.error('[EXT ' + ev + ']', e); } } },
  // 처음으로 undefined가 아닌 값을 돌려준 훅의 값 (훅 순서 = 슬롯 순서 t1 → t4)
  ask(ev, ...a) { const hs = this.hooks[ev]; if (!hs) return undefined; for (const f of hs) { try { const r = f(...a); if (r !== undefined) return r; } catch (e) { console.error('[EXT ' + ev + ']', e); } } return undefined; },
  // 값을 차례로 고쳐 가며 넘긴다 (예: 받는 피해량)
  fold(ev, v, ...a) { const hs = this.hooks[ev]; if (!hs) return v; for (const f of hs) { try { const r = f(v, ...a); if (r !== undefined) v = r; } catch (e) { console.error('[EXT ' + ev + ']', e); } } return v; },
  init(K) { this.K = K; this.emit('init', K); },
  // 조각 하나를 그대로 방으로 (시험용·한 조각짜리 방). 조각 = 벽까지 그린 방 그림 + start/exit 칸.
  // T1은 이걸 쓰거나, 여러 조각을 이어 붙이는 자기 조립기를 만든다. 반환값은 rooms.js와 같은 꼴
  chunkRoom(c, extra = {}) {
    const put = (rows, [i, j], ch) => rows.map((r, y) => (y === j ? r.slice(0, i) + ch + r.slice(i + 1) : r));
    const room = { ...c, id: c.roomId || 'chunk:' + c.id, name: c.name || c.id, startEra: c.startEra || 'now', ...extra };
    for (const E of ['past', 'now']) { let rows = c[E]; if (c.start) rows = put(rows, c.start, '@'); if (c.exit) rows = put(rows, c.exit, '>'); room[E] = rows; }
    delete room.start; delete room.exit;
    return room;
  },
};
/* 조각(chunk) 꼴 — T2·T3이 EXT.chunks에 넣고 T1이 런에 쓴다
   { id, track: 't2'|'t3', tier: 1~4(어려움), tags: ['combat'|'puzzle'|'elite'|'treasure'|…], name, hint, tip,
     past: [...], now: [...]  (같은 크기, 벽 포함. 글자는 rooms.js와 같고 EXT.chars 글자도 됨),
     start: [i, j], exit: [i, j]  (조각 안 좌표. 둘 다 두 시대 모두 바닥이어야 함), startEra,
     foes: [{ kind, era, at:[i,j], path:[[i,j]…], … }], guards, golems, shards, arrowPhase, bladePhase, spikePhase, gateHold, par,
     solve: 봇 풀이(선택, 그 트랙의 시험 도구가 씀) }
   EXT.chunkRoom(chunk) → 방 데이터. 시험은 EXT.rooms[id] = EXT.chunkRoom(chunk) 로 등록하고 ?room=id 로 연다 */
/* 훅 목록 (main.js가 부르는 곳)
   init(K)                     — 부팅 때 한 번 (방 불러오기 전)
   roomLoad(room, K)           — 방을 다 지은 뒤(경비·골렘·보스·EXT 적 생성 후). 장치 메쉬·엔티티는 여기서
   update(dt, K)               — 세상이 도는 프레임마다(되감기·멈춤 중엔 안 옴)
   frame(dt, K)                — 모든 프레임(되감기 중에도). 다른 시대에 멈춘 모습 등 보이기만 하는 일
   shift(from, to, K)          — 시대 전환 성공 직후
   beforeHurt(msg) → false     — false면 피해 없음 (방패 유물 등)
   hurt(msg, K)                — 하트가 줄어든 뒤
   kill(foe, how, K)           — 적이 쓰러짐(how: 'back' | 'shift' | 그 밖)
   cleared(room, K)            — 방의 적을 다 잡음
   canExit(room) → false       — false면 출구가 아직 안 열림(퍼즐 미완 등)
   exit(room, K)               — 출구로 나가는 순간(기록 저장 뒤)
   nextRoom(defaultIdx) → 방 데이터 | 'end' | undefined — 다음 방을 런 모드가 고름
   end(K)                      — 끝 화면이 뜰 때
   interact() → 값             — E키: undefined가 아닌 값을 돌려주면 기본 레버 처리를 건너뜀
   prompt() → 글자             — 화면 아래 "E …" 안내 (기본 레버 안내보다 먼저)
   stab(tgt, info) → 값        — (예비) 찌르기 결과를 가로채기
   FOE 약속 (EXT.foes[kind].spawn이 돌려주는 객체; K.addFoe(foe)로 넣으면 main.js의 적 목록·찌르기·충돌·기습·되감기에 들어간다):
     { kind, era: 'past'|'now', x, z, yaw, r(몸 반지름), alive, state('alert'이면 전환 기습 불가), stun, fall,
       update(dt)   — 그 시대에 있을 때만 불림,  view(dt) — 매 프레임(멈춘 모습·윤곽),
       onStab({ behind, shift, tx, tz, td }) → 'kill-back' | 'kill-shift' | 'blocked' | …  (죽일 땐 K.killed(foe, how)),
       optional(true면 출구를 막지 않음), anim(있으면 시간 충격 때 anim.once('AS_Hit_F_Seq') 부름) } */
