// T3 장치 소리 — audio.js는 고치지 않고 K.sfx의 재료(tone·noise·fm·voiceish·thud)와 at(pos)(거리·좌우)로 만든다.
// 세기는 기존 소리와 비슷하게 (발판 0.26, 레버 0.2 언저리). 자주 나는 것(톱니 딸깍, 째깍)은 작게.
import { EXT } from '../../ext.js';
const X = () => EXT.K.sfx;
const c = (f, ct = 60) => f * Math.pow(2, ((Math.random() * 2 - 1) * ct) / 1200);
const o = (pos, extra) => { const s = X(); return pos ? s.at(pos, extra) : Object.assign({}, extra); };
export const S3 = {
  // 씨앗 심기: 흙 툭 + 올라가는 맑은 소리
  plant(pos) { const s = X(), p = o(pos); if (!p) return; s.thud(c(150), 0.14, 0.22, p); s.noise(0.22, 700, 260, 0.12, 0.9, 'lowpass', p); s.tone(c(660), c(990), 0.35, 'sine', 0.05, Object.assign({ t: 0.08 }, p)); s.tone(c(990), c(1320), 0.3, 'sine', 0.03, Object.assign({ t: 0.18 }, p)); },
  dig(pos) { const s = X(), p = o(pos); if (!p) return; s.noise(0.3, c(300), c(800), 0.16, 2.2, 'bandpass', p); s.thud(c(120), 0.12, 0.14, p); },
  // 줍기: 작은 종소리 두 번
  pick(pos, high = 1) { const s = X(), p = o(pos); if (!p) return; s.fm(c(880 * high, 30), 3.5, 0.6, 0.45, 0.06, p); s.fm(c(1320 * high, 30), 3.5, 0.5, 0.5, 0.04, Object.assign({ t: 0.09 }, p)); },
  // 수문 바퀴: 삐걱 + 물소리
  wheel(pos, open) { const s = X(), p = o(pos, { rev: 0.3 }); if (!p) return; s.voiceish(c(80, 80), c(64), 0.7, 0.07, [520, 1100], p); s.thud(c(90), 0.3, 0.2, p); s.noise(open ? 1.6 : 0.9, open ? 280 : 900, open ? 900 : 260, 0.14, 0.7, 'lowpass', Object.assign({ t: 0.25 }, p)); },
  splash(pos) { const s = X(), p = o(pos, { rev: 0.3 }); if (!p) return; s.noise(0.5, 1800, 300, 0.22, 0.8, 'bandpass', p); s.noise(0.9, 600, 150, 0.12, 0.7, 'lowpass', Object.assign({ t: 0.05 }, p)); s.thud(c(70), 0.25, 0.15, p); },
  // 거울 돌리기: 돌 갈리는 소리 + 쇠 울림
  mirror(pos) { const s = X(), p = o(pos); if (!p) return; s.noise(0.32, c(220), c(420), 0.18, 3, 'bandpass', p); s.fm(c(1200), 2.76, 0.5, 0.35, 0.03, Object.assign({ t: 0.25 }, p)); },
  // 봉인 켜짐: 밝은 화음
  seal(pos) { const s = X(), p = o(pos, { rev: 0.5 }); if (!p) return; [523, 659, 784, 1046].forEach((f, k) => s.tone(f, f * 1.002, 0.9, 'sine', 0.04, Object.assign({ t: k * 0.06 }, p))); s.fm(1568, 3.5, 0.8, 1.0, 0.025, Object.assign({ t: 0.1 }, p)); },
  sealOff(pos) { const s = X(), p = o(pos); if (!p) return; s.tone(523, 262, 0.5, 'triangle', 0.04, p); },
  slab(pos, up) { const s = X(), p = o(pos, { rev: 0.35 }); if (!p) return; s.noise(0.8, up ? 160 : 500, up ? 500 : 140, 0.2, 0.8, 'lowpass', p); s.thud(c(60), 0.5, 0.22, Object.assign({ t: up ? 0 : 0.6 }, p)); },
  // 자물쇠: 찰칵 + 쇠 문
  unlock(pos) { const s = X(), p = o(pos); if (!p) return; s.fm(c(2100), 1.5, 1.2, 0.08, 0.08, p); s.thud(c(300), 0.06, 0.16, Object.assign({ t: 0.05 }, p)); s.tone(c(330), c(440), 0.25, 'triangle', 0.05, Object.assign({ t: 0.12 }, p)); s.voiceish(c(140, 40), c(110), 0.5, 0.05, [600, 1300], Object.assign({ t: 0.25 }, p)); },
  locked(pos) { const s = X(), p = o(pos); if (!p) return; s.thud(c(220), 0.08, 0.18, p); s.fm(c(900), 1.5, 1, 0.12, 0.04, p); },
  // 무너지는 바닥: 금 가는 소리 / 무너짐은 K.sfx.crumble
  crack(pos) { const s = X(), p = o(pos); if (!p) return; for (let k = 0; k < 4; k++) s.noise(0.03, c(3200, 300), 1600, 0.16, 1, 'bandpass', Object.assign({ t: k * 0.07 }, p)); s.thud(c(260), 0.05, 0.08, p); },
  // 태엽: 딸깍 (자주 나므로 작게) / 째깍
  ratchet(pos) { const s = X(), p = o(pos); if (!p) return; s.noise(0.025, c(4200), 2600, 0.1, 2, 'highpass', p); s.thud(c(420), 0.03, 0.05, p); },
  tick(pos) { const s = X(), p = o(pos); if (!p) return; s.tone(1900, 1900, 0.025, 'square', 0.008, p); },
  // 회전 다리: 톱니 덜컹 / 예고 딸깍
  gear(pos) { const s = X(), p = o(pos, { rev: 0.3 }); if (!p) return; s.fm(c(180), 2.76, 1.4, 0.3, 0.05, p); s.thud(c(80), 0.25, 0.18, p); s.noise(0.5, 300, 700, 0.06, 2, 'bandpass', Object.assign({ t: 0.05 }, p)); },
  warn(pos) { const s = X(), p = o(pos); if (!p) return; s.tone(1400, 1400, 0.04, 'triangle', 0.025, p); },
};
