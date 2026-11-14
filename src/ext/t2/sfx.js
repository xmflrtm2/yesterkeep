// T2 몬스터 소리 — audio.js를 고치지 않고 K.sfx 재료(tone·noise·fm·voiceish·thud)와 K.sfx.at(pos)로 만든다.
// 세기는 기존 소리와 비슷하게(tools/t2_sfx_check.py: 평균 -45~-12 dBFS, 자주 나는 소리 < -30).
import { T2 } from './core.js';

const cents = (f, c = 60) => f * Math.pow(2, ((Math.random() * 2 - 1) * c) / 1200);
const X = () => T2.K.sfx;
const at = (pos, extra) => (pos ? X().at(pos, extra) : Object.assign({}, extra || {}));
// pos가 너무 멀면 null → 안 낸다
const go = (pos, extra, fn) => { const o = at(pos, extra); if (o) fn(X(), o); };
const W = (o, t) => Object.assign({}, o, { t: (o.t || 0) + t });

export const S2 = {
  // 사냥개
  growl(pos) { go(pos, { rev: 0.2 }, (s, o) => { s.voiceish(cents(82, 80), cents(70), 0.55, 0.07, [380, 720], o); s.noise(0.5, 260, 180, 0.08, 2, 'bandpass', o); }); },
  bark(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.voiceish(cents(300, 100), cents(180), 0.16, 0.12, [700, 1300], o); s.voiceish(cents(280, 100), cents(170), 0.14, 0.09, [700, 1300], W(o, 0.2)); }); },
  bite(pos) { go(pos, {}, (s, o) => { s.noise(0.06, 3500, 1500, 0.22, 1.2, 'bandpass', o); s.thud(cents(210), 0.07, 0.22, o); }); },
  yelp(pos) { go(pos, { rev: 0.5 }, (s, o) => { s.voiceish(cents(620, 60), cents(260), 0.5, 0.09, [900, 1700], o); s.tone(700, 120, 0.9, 'triangle', 0.05, W(o, 0.1)); }); },
  pant(pos) { go(pos, {}, (s, o) => { s.noise(0.09, 1800, 1200, 0.04, 1.5, 'bandpass', o); s.noise(0.09, 1500, 1000, 0.035, 1.5, 'bandpass', W(o, 0.18)); }); },
  timeJump(pos) { go(pos, { rev: 0.4 }, (s, o) => { s.noise(0.35, 500, 3200, 0.1, 1.2, 'bandpass', o); s.fm(cents(660, 30), 2.01, 1.2, 0.5, 0.03, o); }); },
  // 방패병
  shieldUp(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.fm(cents(380, 80), 2.76, 2.5, 0.35, 0.09, o); s.thud(cents(130), 0.12, 0.2, o); }); },
  bash(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.thud(cents(95), 0.2, 0.35, o); s.fm(cents(300), 2.76, 3, 0.3, 0.08, o); s.noise(0.15, 1500, 300, 0.15, 0.8, 'lowpass', o); }); },
  // 석궁병
  aim(pos) { go(pos, {}, (s, o) => { for (let k = 0; k < 3; k++) s.noise(0.02, 3800, 3000, 0.07, 2, 'highpass', W(o, k * 0.06)); s.tone(cents(900), 1400, 0.3, 'sine', 0.02, W(o, 0.1)); }); },
  shoot(pos) { go(pos, {}, (s, o) => { s.tone(cents(160, 80), cents(110), 0.25, 'triangle', 0.16, o); s.noise(0.08, 2600, 900, 0.18, 1, 'bandpass', o); s.noise(0.25, 1200, 3600, 0.08, 1, 'bandpass', W(o, 0.03)); }); },
  boltHit(pos) { go(pos, {}, (s, o) => { s.thud(cents(360, 150), 0.06, 0.2, o); s.noise(0.06, 2300, 900, 0.14, 1, 'bandpass', o); }); },
  // 시간 마법사
  blink(pos) { go(pos, { rev: 0.5 }, (s, o) => { s.noise(0.3, 6000, 900, 0.1, 1.5, 'bandpass', o); [1568, 1175, 880].forEach((f, k) => s.fm(cents(f, 20), 3.5, 1, 0.4, 0.03, W(o, k * 0.04))); }); },
  chant(pos) { go(pos, { rev: 0.6 }, (s, o) => { s.voiceish(cents(196, 30), cents(208), 0.9, 0.035, [500, 1100], o); s.fm(cents(392, 15), 1.5, 0.6, 1.0, 0.012, o); }); },
  revive(pos) { go(pos, { rev: 0.6 }, (s, o) => { [523, 659, 784, 1046].forEach((f, k) => s.fm(f, 3.5, 1.2, 0.7, 0.04, W(o, k * 0.07))); s.noise(0.7, 400, 4000, 0.07, 1, 'bandpass', o); }); },
  // 미믹
  mimicWake(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.voiceish(cents(110, 80), cents(160), 0.4, 0.09, [420, 900], o); for (let k = 0; k < 3; k++) s.thud(cents(240, 200), 0.05, 0.12, W(o, 0.1 + k * 0.07)); }); },
  chomp(pos) { go(pos, {}, (s, o) => { s.thud(cents(180), 0.1, 0.32, o); s.noise(0.05, 4200, 2000, 0.2, 1, 'bandpass', o); s.thud(cents(150), 0.08, 0.2, W(o, 0.09)); }); },
  creak(pos) { go(pos, {}, (s, o) => { s.voiceish(cents(95, 90), cents(80), 0.35, 0.03, [600, 1200], o); }); },
  // 망령
  whisper(pos) { go(pos, { rev: 0.7 }, (s, o) => { s.noise(0.9, cents(1800, 200), cents(2600, 200), 0.05, 6, 'bandpass', o); s.noise(0.7, cents(900, 200), cents(1300, 200), 0.035, 7, 'bandpass', W(o, 0.25)); }); },
  wail(pos) { go(pos, { rev: 0.7 }, (s, o) => { s.voiceish(cents(420, 40), cents(560), 0.7, 0.05, [700, 1600], o); s.noise(0.7, 3000, 6000, 0.05, 2, 'bandpass', o); }); },
  disperse(pos) { go(pos, { rev: 0.8 }, (s, o) => { s.noise(1.0, 5000, 400, 0.14, 1.2, 'bandpass', o); [1318, 988, 740, 554].forEach((f, k) => s.fm(cents(f, 20), 2.01, 1.4, 0.8, 0.03, W(o, k * 0.06))); }); },
  // 쥐
  squeak(pos) { go(pos, {}, (s, o) => { s.tone(cents(3200, 200), cents(4200, 200), 0.06, 'sine', 0.035, o); }); },
  scurry(pos) { go(pos, {}, (s, o) => { for (let k = 0; k < 4; k++) s.noise(0.02, cents(5200, 300), 3800, 0.04, 1.5, 'bandpass', W(o, k * 0.035)); }); },
  ratDie(pos) { go(pos, {}, (s, o) => { s.tone(cents(2600, 200), 900, 0.12, 'sine', 0.05, o); s.thud(cents(260), 0.05, 0.1, o); }); },
  seal(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.noise(0.35, cents(220), cents(480), 0.18, 3, 'bandpass', o); s.thud(cents(80), 0.3, 0.3, W(o, 0.3)); s.noise(0.3, 700, 150, 0.12, 0.8, 'lowpass', W(o, 0.3)); }); },
  // 메아리
  echoHum(pos) { go(pos, { rev: 0.8 }, (s, o) => { s.fm(cents(440, 10), 2.01, 0.5, 0.6, 0.015, o); s.fm(cents(660, 10), 2.01, 0.5, 0.6, 0.01, W(o, 0.15)); }); },
  // ── 2차: 문지기 · 새 적 ──
  roar(pos) { go(pos, { rev: 0.5 }, (s, o) => { s.voiceish(cents(110, 60), cents(80), 0.9, 0.12, [420, 900], o); s.noise(0.8, 300, 120, 0.12, 0.8, 'lowpass', o); }); },
  bigSwing(pos) { go(pos, {}, (s, o) => { s.noise(0.3, 400, 2400, 0.32, 0.9, 'bandpass', o); s.noise(0.25, 2400, 600, 0.2, 0.9, 'bandpass', W(o, 0.12)); }); },
  bossHit(pos) { go(pos, { rev: 0.5 }, (s, o) => { s.fm(cents(300, 60), 2.76, 3, 0.6, 0.12, o); s.thud(cents(90), 0.35, 0.35, o); s.voiceish(cents(150, 60), cents(95), 0.45, 0.08, [520, 980], W(o, 0.05)); }); },
  oath(pos) { go(pos, { rev: 0.7 }, (s, o) => { [392, 494, 587].forEach((f, k) => s.fm(cents(f, 10), 3.5, 1, 0.9, 0.03, W(o, k * 0.12))); }); },
  quake(pos) { go(pos, { rev: 0.4 }, (s, o) => { s.tone(cents(70), 35, 1.0, 'sine', 0.36, o); s.noise(1.0, 500, 90, 0.22, 0.7, 'lowpass', o); }); },
  screech(pos) { go(pos, { rev: 0.4 }, (s, o) => { s.voiceish(cents(900, 80), cents(1400), 0.45, 0.07, [1800, 3200], o); s.noise(0.4, 4000, 7000, 0.08, 2, 'bandpass', o); }); },
  pounce(pos) { go(pos, {}, (s, o) => { s.noise(0.25, 1200, 300, 0.18, 0.9, 'bandpass', o); }); },
  land(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.thud(cents(110), 0.25, 0.34, o); s.noise(0.2, 900, 200, 0.16, 0.8, 'lowpass', o); }); },
  webShot(pos) { go(pos, {}, (s, o) => { s.noise(0.18, 3000, 800, 0.16, 1.4, 'bandpass', o); s.tone(cents(500), 300, 0.15, 'triangle', 0.04, o); }); },
  eggCrack(pos) { go(pos, {}, (s, o) => { s.noise(0.08, 2500, 1200, 0.2, 1, 'bandpass', o); s.thud(cents(300), 0.08, 0.12, o); s.noise(0.25, 800, 300, 0.08, 1, 'lowpass', W(o, 0.05)); }); },
  eyeHum(pos) { go(pos, { rev: 0.5 }, (s, o) => { s.fm(cents(220, 10), 1.5, 0.4, 0.8, 0.012, o); }); },
  lock(pos) { go(pos, { rev: 0.4 }, (s, o) => { for (let k = 0; k < 4; k++) s.fm(cents(1200, 100), 2.76, 1.2, 0.08, 0.05, W(o, k * 0.06)); s.thud(cents(140), 0.2, 0.2, W(o, 0.25)); }); },
  fuse(pos) { go(pos, {}, (s, o) => { s.noise(0.5, 5000, 3000, 0.05, 2, 'highpass', o); }); },
  boom(pos) { go(pos, { rev: 0.5 }, (s, o) => { s.tone(cents(80), 30, 0.7, 'sine', 0.42, o); s.noise(0.9, 2200, 100, 0.32, 0.7, 'lowpass', o); s.noise(0.3, 6000, 1500, 0.1, 1, 'bandpass', o); }); },
  throwIt(pos) { go(pos, {}, (s, o) => { s.noise(0.2, 700, 1800, 0.14, 1, 'bandpass', o); }); },
  rewindWhoosh(pos) { go(pos, { rev: 0.6 }, (s, o) => { s.noise(0.45, 5000, 600, 0.12, 1.2, 'bandpass', o); s.tone(cents(900), 300, 0.45, 'triangle', 0.05, o); }); },
  parry(pos) { go(pos, { rev: 0.3 }, (s, o) => { s.fm(cents(1500, 100), 2.76, 2.5, 0.3, 0.1, o); s.noise(0.06, 7000, 4000, 0.08, 1, 'highpass', o); }); },
  echoBreak(pos) { go(pos, { rev: 0.8 }, (s, o) => { [880, 1108, 1318, 1760].forEach((f, k) => s.fm(cents(f, 15), 3.5, 1.4, 0.6, 0.035, W(o, k * 0.05))); s.noise(0.5, 8000, 2000, 0.06, 1, 'highpass', o); }); },
};
