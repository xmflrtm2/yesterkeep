// T4 소리 — audio.js는 고치지 않고 K.sfx의 재료(tone·noise·fm·thud·at)로 그 자리에서 만든다.
// 세기는 기존 소리와 비슷하게 (조각 줍기·문 소리 정도). pos를 주면 거리·좌우가 붙는다
import { EXT } from '../../ext.js';

const c = (f, k = 40) => f * Math.pow(2, ((Math.random() * 2 - 1) * k) / 1200);
const X = () => EXT.K && EXT.K.sfx;
const ok = () => { const K = EXT.K; return K && K.ac && K.ac.state === 'running'; };

export const snd = {
  // 고르기 창이 열림: 위로 올라가는 종 셋
  open() { const s = X(); if (!s || !ok()) return; [784, 988, 1318].forEach((f, k) => s.fm(c(f, 10), 3.5, 1.1, 0.9, 0.035, { t: k * 0.07, rev: 0.5 })); s.noise(0.6, 900, 3200, 0.04, 1, 'bandpass', { rev: 0.3 }); },
  // 유물을 가져감: 반짝 + 따뜻한 화음
  take() { const s = X(); if (!s || !ok()) return; [523, 659, 784, 1046].forEach((f, k) => s.tone(f, f * 1.002, 0.7, 'triangle', 0.045, { t: k * 0.04, rev: 0.4 })); [1568, 2093].forEach((f, k) => s.fm(c(f, 10), 3.5, 1.4, 0.8, 0.025, { t: 0.12 + k * 0.06, rev: 0.6 })); },
  legend() { const s = X(); if (!s || !ok()) return; this.take(); s.tone(130.8, 131, 1.4, 'sine', 0.06, { rev: 0.6 }); [2637, 3136].forEach((f, k) => s.fm(f, 3.5, 2, 1.2, 0.02, { t: 0.3 + k * 0.08, rev: 0.7 })); },
  move() { const s = X(); if (!s || !ok()) return; s.tone(c(1200, 20), 1500, 0.05, 'triangle', 0.025); },
  coin(pos) { const s = X(); if (!s || !ok()) return; const o = (pos && s.at(pos)) || {}; s.fm(c(1980, 15), 2.76, 1.2, 0.35, 0.05, o); s.fm(c(2640, 15), 2.76, 1, 0.3, 0.035, { ...o, t: 0.06 }); },
  buy() { const s = X(); if (!s || !ok()) return; this.coin(); this.take(); },
  deny() { const s = X(); if (!s || !ok()) return; s.thud(c(120), 0.18, 0.22); s.tone(330, 220, 0.18, 'square', 0.025); },
  heal() { const s = X(); if (!s || !ok()) return; s.tone(392, 784, 0.6, 'sine', 0.06, { rev: 0.5 }); s.tone(494, 988, 0.6, 'triangle', 0.035, { t: 0.08, rev: 0.5 }); s.noise(0.5, 600, 2400, 0.03, 1, 'bandpass', { rev: 0.4 }); },
  upgrade() { const s = X(); if (!s || !ok()) return; [659, 988, 1318, 1976].forEach((f, k) => s.fm(c(f, 8), 2.01, 1.2, 0.7, 0.035, { t: k * 0.09, rev: 0.6 })); s.thud(98, 0.3, 0.12); },
  fire() { const s = X(); if (!s || !ok()) return; s.noise(0.5, 400, 1200, 0.05, 0.7, 'lowpass', { rev: 0.2 }); },
  // 금 간 방패가 막음: 유리 깨짐 + 쿵
  shield() { const s = X(); if (!s || !ok()) return; s.noise(0.25, 5200, 2400, 0.16, 0.9, 'highpass'); s.fm(c(1760, 30), 2.76, 2, 0.4, 0.06); s.thud(c(150), 0.2, 0.2); },
  block() { const s = X(); if (!s || !ok()) return; s.fm(c(880, 30), 2.76, 1.4, 0.3, 0.05); s.thud(c(110), 0.15, 0.15); },
  spring() { const s = X(); if (!s || !ok()) return; s.noise(0.5, 300, 4000, 0.08, 1.5); [1046, 1318, 1568].forEach((f, k) => s.tone(f, f, 0.2, 'triangle', 0.035, { t: 0.08 + k * 0.06 })); },
  phoenix() { const s = X(); if (!s || !ok()) return; s.noise(1.0, 200, 5000, 0.1, 1.2, 'bandpass', { rev: 0.6 }); [262, 392, 523, 784, 1046].forEach((f, k) => s.tone(f, f, 1.2, 'triangle', 0.04, { t: k * 0.07, rev: 0.6 })); },
  throw() { const s = X(); if (!s || !ok()) return; s.noise(0.14, c(1800, 120), 4800, 0.35, 0.9); s.tone(c(1600), 900, 0.07, 'triangle', 0.025); },
  knifeWall(pos) { const s = X(); if (!s || !ok()) return; const o = (pos && s.at(pos)) || {}; s.fm(c(1320, 40), 2.76, 1.6, 0.25, 0.05, o); s.noise(0.05, 3000, 1200, 0.08, 1, 'bandpass', o); },
  pick() { const s = X(); if (!s || !ok()) return; s.fm(c(1568, 15), 2.76, 1, 0.25, 0.04); s.noise(0.06, 2400, 4000, 0.05, 1); },
  catch() { const s = X(); if (!s || !ok()) return; s.noise(0.08, 2600, 900, 0.18, 1); s.thud(c(220), 0.08, 0.12); s.tone(c(1100), 1300, 0.06, 'triangle', 0.02, { t: 0.05 }); },
  double() { const s = X(); if (!s || !ok()) return; s.fm(c(523, 10), 3.5, 1.5, 0.9, 0.05, { rev: 0.6 }); s.fm(c(392, 10), 2.01, 1.2, 0.9, 0.04, { t: 0.05, rev: 0.6 }); },
  decoy() { const s = X(); if (!s || !ok()) return; s.voiceish(c(220, 30), c(180), 0.35, 0.03, [700, 1100], { rev: 0.5 }); s.noise(0.5, 800, 300, 0.04, 1, 'bandpass', { rev: 0.4 }); },
};
