// T2 2차 — 정예 접두어. 적 배치(def)에 mods: ['hasty', 'hard', …]를 붙이면 그 적이 바뀐다. T1 정예 칸(room.t1.type === 'elite')에서는
// 방의 적마다 접두어 하나(3층은 둘)를 시드로 골라 붙인다(room.noPrefix면 안 붙임). main.js 경비·골렘에는 hard·defy·rewind만 된다.
//   서두르는(hasty)       — 모든 동작이 1.3배 빠르다(이동·예비동작·조준·되살리기 시계까지). T2 적만
//   단단한(hard)          — 갑옷 한 겹: 쓰러뜨릴 한 방을 한 번 막고 0.8초 휘청(갑옷 깨지는 소리). 한 번 더 찔러야 함
//   시간을 거스르는(defy)  — 시간 충격(넘어올 때 3m 경직)이 안 먹고, 넘어오며 치는 기습도 안 통함 → 같은 시대에서 등 뒤로만
//   눈 밝은(keen)         — 시야·듣기 1.4배. T2 사람 적만(방패병·석궁병·마법사·폭탄병·검사)
//   되감는(rewind)        — 처음 쓰러질 때 2초 전 자리로 되감겨 다시 선다(보라 빛). 두 번 잡아야 함
import { EXT } from '../../ext.js';
import { T2, fromBehind, decal, ringGeo, t2Foes } from './core.js';

const N = k => k;
export const PREFIX = {
  hasty: { name: N('서두르는'), color: '#ffd24a' },
  hard: { name: N('단단한'), color: '#a8bedc' },
  defy: { name: N('시간을 거스르는'), color: '#7fe8ff' },
  keen: { name: N('눈 밝은'), color: '#ff9a4a' },
  rewind: { name: N('되감는'), color: '#b98cff' },
};
// 종류마다 말이 되는 접두어
const ALLOW = {
  't2-shield': ['hasty', 'hard', 'defy', 'keen', 'rewind'], 't2-xbow': ['hasty', 'hard', 'defy', 'keen', 'rewind'], 't2-mage': ['hasty', 'hard', 'keen', 'rewind'],
  't2-sapper': ['hasty', 'hard', 'keen', 'rewind'], 't2-duelist': ['hasty', 'keen'], 't2-hound': ['hasty'], 't2-mimic': ['hasty', 'hard'], 't2-echo': ['hasty', 'hard'],
  't2-wraith': ['hasty'], guard: ['hard', 'defy', 'rewind'], golem: ['hard', 'defy', 'rewind'],
};
EXT.t2 = EXT.t2 || {};
EXT.t2.PREFIX = PREFIX;

// 이름표: 머리 위 작은 글씨(같은 시대 9m 안에서만)
function tagTex(text, color) {
  const K = T2.K, c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const x = c.getContext('2d'); x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(text, 128, 25); x.fillStyle = color; x.fillText(text, 128, 25);
  const t = new K.THREE.CanvasTexture(c); t.colorSpace = K.THREE.SRGBColorSpace; return t;
}
function decorate(f, mods) {
  const K = T2.K, THREE = K.THREE;
  const name = mods.map(m => K.$t(PREFIX[m].name)).join(' · ');
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, PREFIX[mods[0]].color), depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.49, 1); s.renderOrder = 9; K.world.add(s);
  const ring = decal(ringGeo(0.78, 0.9), PREFIX[mods[0]].color, { order: 5 });
  f._tag = s; f._ring = ring;
}
/** 적 하나에 접두어 붙이기 (T2 적이면 f, main 경비·골렘이면 g). 이미 붙었으면 그대로 */
export function applyMods(f, mods) {
  if (!f || f._mods || !mods || !mods.length) return f;
  const ok = ALLOW[f.kind] || [];
  mods = mods.filter(m => PREFIX[m] && ok.includes(m));
  if (!mods.length) return f;
  f._mods = mods; f.mods = mods;
  for (const m of mods) {
    if (m === 'hasty' && f.t2) { f.timeScale = 1.3; if (f.update && !f._hastyWrapped) { const u = f.update; f.update = dt => u(dt * (f.timeScale || 1)); f._hastyWrapped = true; } }
    if (m === 'hard') f.armor = (f.armor || 0) + 1;
    if (m === 'defy') f.defy = true;
    if (m === 'keen' && f.cfg) { for (const k of ['range', 'hear']) if (f.cfg[k]) f.cfg[k] *= 1.4; }
    if (m === 'rewind') { f.rewindOnce = true; f.hist = f.hist || []; }
  }
  decorate(f, mods);
  return f;
}
// 되감기용 자리 기록(2초) · 이름표 자리
EXT.on('update', (dt, K) => {
  const all = t2Foes().concat(K.guards, K.golems);
  for (const f of all) {
    if (!f._mods) continue;
    if (f.hist && f.alive && f.era === K.S.era) {
      f._histT = (f._histT || 0) - dt;
      if (f._histT <= 0) { f._histT = 0.1; f.hist.push({ x: f.x, z: f.z }); if (f.hist.length > 20) f.hist.shift(); }
    }
  }
});
EXT.on('frame', (dt, K) => {
  const all = t2Foes().concat(K.guards, K.golems);
  for (const f of all) {
    if (!f._tag) continue;
    const here = f.era === K.S.era || f.era === 'both';
    const near = Math.hypot(f.x - K.S.p.x, f.z - K.S.p.z) < 9;
    f._tag.visible = f.alive && here && near && !K.S.ring;
    f._tag.position.set(f.x, (f.tagY || 2.9), f.z);
    f._ring.visible = f.alive && here;
    f._ring.position.set(f.x, 0.08, f.z);
    f._ring.material.opacity = 0.35 + 0.15 * Math.sin(K.S.time * 4);
  }
});
// 시간을 거스르는: 넘어온 직후의 시간 충격을 지운다 (main.js가 shift 직전에 stun을 준 뒤에 이 훅이 온다)
EXT.on('shift', (from, to, K) => {
  for (const f of t2Foes().concat(K.guards, K.golems)) if (f.defy && f.alive && f.era === to) { f.stun = 0; if (f.anim && f.anim.onceLeft > 0 && f.kind === 'guard') f.anim.onceLeft = 0; }
});
// main.js 경비·골렘의 찌르기: 단단한·되감는·시간을 거스르는 (T2 적은 각자 onStab·kill()에서)
EXT.on('stab', (tgt, info) => {
  const K = T2.K;
  if (!tgt || tgt.ext || !tgt._mods || tgt.kind === 'boss') return undefined;
  const killing = info.behind || (info.shift && tgt.state !== 'alert');
  if (tgt.defy && info.shift && !info.behind) {
    K.sfx.clang({ x: tgt.x, z: tgt.z }); K.clangFx(tgt.x, tgt.z); K.toast(K.$t('시간을 거스르는 적 — 기습이 안 통해요, 등 뒤로'), 1.6);
    tgt.state = 'alert'; tgt.sus = 1; return 'blocked-defy';
  }
  if (!killing) return undefined;
  if (tgt.armor > 0 || (tgt.rewindOnce && tgt.hist && tgt.hist.length)) {
    const wasArmor = tgt.armor > 0;
    if (wasArmor) { tgt.armor--; tgt.stun = Math.max(tgt.stun || 0, 0.8); K.sfx.clang({ x: tgt.x, z: tgt.z }); K.clangFx(tgt.x, tgt.z); K.toast(K.$t('갑옷이 깨졌어요 — 한 번 더!'), 1.4); }
    else {
      tgt.rewindOnce = false; const b = tgt.hist[0];
      K.FX.motes(tgt.x, 1, tgt.z, { n: 30, color: ['#b98cff', '#ffffff'], speed: 3, up: 2, life: 0.8 });
      tgt.x = b.x; tgt.z = b.z; tgt.stun = Math.max(tgt.stun || 0, 0.7);
      K.toast(K.$t('2초 전으로 되감겼어요 — 다시 한 번!'), 1.6);
    }
    tgt.state = 'alert'; tgt.sus = 1; tgt.wind = 0;
    return wasArmor ? 'armor' : 'rewind';
  }
  return undefined;
});
// 방에 들어올 때: 배치에 적힌 mods, 그리고 T1 정예 칸이면 시드로 골라 붙이기
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
EXT.on('roomLoad', (room, K) => {
  (room.guards || []).forEach((d, k) => { if (d.mods && K.guards[k]) applyMods(K.guards[k], d.mods); });
  (room.golems || []).forEach((d, k) => { if (d.mods && K.golems[k]) applyMods(K.golems[k], d.mods); });
  const t1 = room.t1;
  if (!t1 || t1.type !== 'elite' || room.noPrefix) return;
  let h = hash(String(room.id));
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const n = t1.floor >= 3 ? 2 : 1;
  for (const f of t2Foes().filter(o => !o.optional && o.bossHp == null).concat(K.guards, K.golems)) {
    const ok = (ALLOW[f.kind] || []).slice();
    if (!ok.length || f._mods) continue;
    const pick = [];
    for (let k = 0; k < n && ok.length; k++) pick.push(ok.splice(Math.floor(rnd() * ok.length), 1)[0]);
    applyMods(f, pick);
  }
});
EXT.t2.applyMods = applyMods;
