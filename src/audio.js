// 어제의 성채 — 효과음 (WebAudio로 그 자리에서 합성, 소리 파일 없음)
// 11/13 개발자님: "사운드나 이런 것도 다양하게". 예전 효과음은 사인·잡음 한두 겹짜리 24가지였고, 같은 일엔 늘 똑같은 소리였다.
// 이제는: 여러 겹(몸통 · 날카로운 끝 · 잔향) + 칠 때마다 높낮이·세기가 조금씩 다름 + 소리 난 자리(좌우·거리)
// 새 소리: 발소리(시대별 바닥), 화살 쏘기·박히기, 가시 솟음, 칼날 바람, 뗏목 삐걱, 창살 열림·닫힘, 발판, 조각 줍기,
//          경비의 "흠?"·외침, 골렘·보스 발소리, 횃불 타닥, 방에 들어설 때 울림.
//   const sfx = makeSfx(() => AudioContext, () => ({ x, z }));  sfx.clang({ x, z }) — pos를 안 주면 바로 곁에서 난 소리
const cents = (f, c = 60) => f * Math.pow(2, ((Math.random() * 2 - 1) * c) / 1200);
const rnd = (a, b) => a + Math.random() * (b - a);

export function makeSfx(getCtx, listener) {
  let G = null; // 소리 길 (처음 소리를 낼 때 만든다)
  function graph(a) {
    if (G && G.a === a) return G;
    const g = v => { const n = a.createGain(); n.gain.value = v; return n; };
    const out = g(0.85), comp = a.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.knee.value = 8; comp.attack.value = 0.003; comp.release.value = 0.15;
    out.connect(comp); comp.connect(a.destination);
    // 짧은 돌방 잔향
    const n = Math.floor(a.sampleRate * 1.1), ir = a.createBuffer(2, n, a.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let k = 0; k < n; k++) { const x = k / n; lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * x); d[k] = k < 200 ? 0 : lp * Math.pow(1 - x, 2.6); } }
    const revIn = g(1), rev = a.createConvolver(), revOut = g(0.4); rev.buffer = ir;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(comp);
    const noise = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), nd = noise.getChannelData(0);
    for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
    G = { a, out, revIn, noise, g };
    return G;
  }
  // 위치 → 세기·좌우. 너무 멀면 null (안 낸다)
  function place(pos) {
    if (!pos) return { vol: 1, pan: 0 };
    const L = listener(), dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz);
    const vol = 1 / (1 + (d / 7) * (d / 7));
    return vol < 0.04 ? null : { vol, pan: Math.max(-0.85, Math.min(0.85, dx / 9)) };
  }
  // 한 겹을 내보낸다: 소리 → (거름) → 세기 모양 → 좌우 → 출력 + 잔향
  function voice(a, src, t, dur, vol, o, filt) {
    const g = G.g, env = a.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (o.att ?? 0.006));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src;
    if (filt) { src.connect(filt); node = filt; }
    node.connect(env);
    let last = env;
    if (o.pan && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = o.pan; env.connect(p); last = p; }
    last.connect(G.out);
    if (o.rev) { const s = g(o.rev); last.connect(s); s.connect(G.revIn); }
    src.start(t); src.stop(t + dur + 0.05);
  }
  const S = {
    // ── 바탕 재료 ──
    tone(f0, f1, dur, type = 'sine', vol = 0.2, o = {}) {
      const a = getCtx(); if (!a) return; graph(a);
      const t = a.currentTime + (o.t || 0), osc = a.createOscillator();
      osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      voice(a, osc, t, dur, vol * (o.k ?? 1), o);
    },
    noise(dur, f0, f1, vol = 0.2, q = 1.2, type = 'bandpass', o = {}) {
      const a = getCtx(); if (!a) return; graph(a);
      const t = a.currentTime + (o.t || 0), s = a.createBufferSource(), f = a.createBiquadFilter();
      s.buffer = G.noise; f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      s.loop = true; s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9;
      voice(a, s, t, dur, vol * (o.k ?? 1), Object.assign({ att: 0.01 }, o), f);
    },
    // 쇠·종: 배음이 어긋난 FM (ratio 2.76 = 쇠붙이, 3.5 = 종)
    fm(f, ratio, index, dur, vol, o = {}) {
      const a = getCtx(); if (!a) return; graph(a);
      const t = a.currentTime + (o.t || 0), car = a.createOscillator(), mod = a.createOscillator(), mg = a.createGain();
      car.frequency.value = f; mod.frequency.value = f * ratio;
      mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.05), t + dur);
      mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + dur + 0.05);
      voice(a, car, t, dur, vol * (o.k ?? 1), Object.assign({ att: 0.002 }, o));
    },
    // 목소리 비슷한 것: 톱니파 → 두 개의 띠 거름(모음 소리)
    voiceish(f0, f1, dur, vol, formants, o = {}) {
      const a = getCtx(); if (!a) return; graph(a);
      const t = a.currentTime + (o.t || 0), osc = a.createOscillator(), mix = a.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.8);
      for (const ff of formants) { const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 6; osc.connect(bp); bp.connect(mix); }
      const env = a.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(vol * (o.k ?? 1), t + 0.03); env.gain.setValueAtTime(vol * (o.k ?? 1), t + dur * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      mix.connect(env);
      let last = env; if (o.pan && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = o.pan; env.connect(p); last = p; }
      last.connect(G.out); if (o.rev) { const s = G.g(o.rev); last.connect(s); s.connect(G.revIn); }
      osc.start(t); osc.stop(t + dur + 0.05);
    },
    thud(f, dur, vol, o = {}) { this.tone(f, f * 0.4, dur, 'sine', vol, o); this.noise(Math.min(0.06, dur), 900, 250, vol * 0.5, 0.8, 'lowpass', o); },
    // 위치를 세기·좌우로 바꿔 opts에 넣어 준다 (멀면 null)
    at(pos, extra = {}) { const p = place(pos); return p && Object.assign({ k: p.vol, pan: p.pan }, extra); },

    // ── 플레이어 ──
    step(era) {
      if (era === 'past') { this.thud(cents(150, 150), 0.07, 0.24, { rev: 0.08 }); this.noise(0.04, cents(2600), 1900, 0.12, 0.9); }
      else { this.noise(0.07, cents(1900, 200), 800, 0.17, 0.7); this.noise(0.05, cents(3200, 200), 1500, 0.09, 0.8, 'bandpass', { t: 0.018 }); }
    },
    roll() { this.noise(0.24, cents(950), 280, 0.1, 0.9); this.thud(cents(110), 0.12, 0.08, { t: 0.26 }); },
    swish() { this.noise(0.16, cents(1300, 150), cents(5200, 150), 0.6, 0.8); this.noise(0.12, 700, 2400, 0.25, 0.7, 'bandpass', { t: 0.02 }); this.tone(cents(2400), 1200, 0.08, 'triangle', 0.03); },
    hurt() {
      this.voiceish(cents(340, 80), cents(230), 0.22, 0.08, [850, 1450]);
      this.noise(0.13, 1600, 400, 0.15, 1); this.thud(95, 0.18, 0.18);
    },
    fall() { this.noise(0.7, 1200, 180, 0.1, 0.8); this.tone(480, 90, 0.7, 'triangle', 0.08); this.thud(70, 0.3, 0.12, { t: 0.66, rev: 0.4 }); },
    rewind() { this.noise(0.6, 4000, 300, 0.12, 1.5); this.tone(880, 220, 0.6, 'sine', 0.06, { t: 0.05 }); this.tone(660, 165, 0.6, 'triangle', 0.04, { t: 0.1 }); },
    shift(to) {
      if (to === 'past') {
        this.noise(0.5, 600, 4000, 0.15, 1); this.tone(523, 784, 0.5, 'triangle', 0.07);
        [1046, 1318, 1568].forEach((f, k) => this.fm(cents(f, 15), 3.5, 1.2, 0.7, 0.035, { t: 0.04 + k * 0.05, rev: 0.5 })); // 금빛 반짝
      } else {
        this.noise(0.5, 3000, 400, 0.15, 1); this.tone(392, 262, 0.55, 'triangle', 0.07); this.tone(196, 131, 0.6, 'sine', 0.06, { t: 0.06 });
        [784, 622, 466].forEach((f, k) => this.fm(cents(f, 15), 2.01, 0.8, 0.9, 0.025, { t: 0.05 + k * 0.07, rev: 0.6 })); // 차가운 유리
      }
    },
    thunk() { this.thud(cents(140), 0.22, 0.3); this.noise(0.12, 300, 120, 0.2, 0.8); },
    exit() { this.tone(523, 1046, 0.4, 'triangle', 0.07); this.tone(659, 1318, 0.5, 'sine', 0.05, { t: 0.1 }); this.noise(0.5, 500, 3000, 0.04, 1, 'bandpass', { t: 0.05 }); },
    room() { this.fm(110, 1.41, 1.4, 2.4, 0.05, { rev: 0.6 }); this.tone(220, 218, 2.0, 'sine', 0.03, { rev: 0.5 }); },

    // ── 칼 ──
    kill(pos) {
      const o = this.at(pos) || {};
      this.noise(0.12, 520, 170, 0.28, 1.2, 'lowpass', o); this.thud(cents(120), 0.25, 0.3, o);
      this.voiceish(cents(185, 100), cents(105), 0.3, 0.08, [620, 1080], Object.assign({ t: 0.03 }, o)); // 짧은 신음
      this.fm(cents(900, 120), 2.76, 2.2, 0.22, 0.035, Object.assign({ t: 0.06 }, o)); // 갑옷이 쩔그럭
    },
    clang(pos) {
      const o = Object.assign({ rev: 0.35 }, this.at(pos) || {});
      const f = cents(1100, 200);
      this.fm(f, 2.76, 3, 0.4, 0.13, o); this.fm(f * 1.49, 3.1, 2, 0.28, 0.07, o);
      this.noise(0.08, 6000, 3000, 0.07, 1, 'highpass', o);
    },
    alarm(pos) {
      const o = Object.assign({ rev: 0.3 }, this.at(pos) || {});
      this.voiceish(cents(250, 60), cents(340), 0.34, 0.1, [760, 1260], o); // "야!"
      this.fm(1320, 3.5, 2, 0.55, 0.045, Object.assign({}, o, { t: 0.14 })); this.fm(1320, 3.5, 2, 0.55, 0.04, Object.assign({}, o, { t: 0.36 })); // 종
    },
    hmm(pos) { const o = this.at(pos); if (o) this.voiceish(cents(165, 60), cents(210), 0.24, 0.09, [520, 920], o); }, // "흠?"
    windup(pos) { const o = this.at(pos) || {}; this.noise(0.3, 2400, 7200, 0.22, 1.2, 'bandpass', o); this.fm(cents(2200), 1.5, 0.8, 0.3, 0.05, o); },

    // ── 장치 ──
    lever(pos) {
      const o = this.at(pos) || {};
      for (let k = 0; k < 4; k++) this.noise(0.02, 4200, 3500, 0.05, 2, 'highpass', Object.assign({ t: k * 0.035 }, o)); // 톱니 딸깍
      this.thud(cents(170), 0.14, 0.14, Object.assign({ t: 0.15 }, o)); this.fm(cents(620), 2.76, 1.5, 0.25, 0.03, Object.assign({ t: 0.15 }, o));
    },
    door(pos) {
      const o = Object.assign({ rev: 0.4 }, this.at(pos) || {});
      this.voiceish(cents(78, 80), cents(112), 0.85, 0.035, [700, 1500], o); // 삐걱
      this.noise(0.9, 240, 620, 0.1, 4, 'bandpass', o); this.thud(60, 0.5, 0.12, Object.assign({}, o, { t: 0.75 }));
    },
    plate(pos) { const o = this.at(pos) || {}; this.thud(cents(230), 0.08, 0.26, o); this.noise(0.05, 3000, 2000, 0.12, 1, 'bandpass', o); this.tone(150, 120, 0.25, 'square', 0.015, Object.assign({ t: 0.05 }, o)); },
    gateOpen(pos) {
      const o = this.at(pos) || {};
      for (let k = 0; k < 9; k++) this.fm(cents(1500, 300), 2.76, 1.2, 0.06, 0.05, Object.assign({ t: k * 0.055 }, o)); // 사슬 촤르륵
      this.noise(0.6, 150, 90, 0.16, 0.7, 'lowpass', o);
    },
    gateClose(pos) {
      const o = Object.assign({ rev: 0.4 }, this.at(pos) || {});
      for (let k = 0; k < 5; k++) this.fm(cents(1400, 300), 2.76, 1.2, 0.05, 0.018, Object.assign({}, o, { t: k * 0.04 }));
      this.fm(cents(420), 2.76, 3, 0.5, 0.07, Object.assign({}, o, { t: 0.22 })); this.thud(80, 0.3, 0.2, Object.assign({}, o, { t: 0.22 }));
    },
    spikeUp(pos) { const o = this.at(pos); if (!o) return; this.noise(0.12, 3000, 8000, 0.32, 1.5, 'bandpass', o); this.fm(cents(1800, 150), 2.2, 1.5, 0.2, 0.08, o); },
    spikeWarn(pos) { const o = this.at(pos); if (!o) return; for (let k = 0; k < 3; k++) this.noise(0.02, 5000, 4000, 0.1, 1, 'highpass', Object.assign({ t: k * 0.05 }, o)); },
    arrowFire(pos) {
      const o = this.at(pos); if (!o) return;
      this.tone(cents(190, 100), cents(150), 0.22, 'triangle', 0.13, o); // 시위
      this.noise(0.2, 900, 2800, 0.14, 1, 'bandpass', Object.assign({ t: 0.02 }, o));
    },
    arrowHit(pos) { const o = this.at(pos); if (!o) return; this.thud(cents(320, 150), 0.06, 0.2, o); this.noise(0.06, 2100, 900, 0.14, 1, 'bandpass', o); this.fm(cents(700), 1.5, 1, 0.12, 0.04, o); },
    bladeSwish(pos) {
      const o = this.at(pos); if (!o) return;
      this.noise(0.18, 500, 2600, 0.3, 0.9, 'bandpass', o); this.noise(0.22, 2600, 500, 0.24, 0.9, 'bandpass', Object.assign({ t: 0.16 }, o));
    },
    raftCreak(pos) { const o = this.at(pos); if (!o) return; this.voiceish(cents(92, 90), cents(78), 0.5, 0.06, [640, 1250], o); this.thud(cents(200), 0.08, 0.12, Object.assign({ t: 0.05 }, o)); },
    scrape(pos) { const o = this.at(pos) || {}; this.noise(0.25, cents(200), cents(450), 0.18, 3, 'bandpass', o); this.thud(cents(70), 0.2, 0.12, o); },
    crateSink(pos) { const o = Object.assign({ rev: 0.4 }, this.at(pos) || {}); this.thud(60, 0.5, 0.3, o); this.noise(0.6, 700, 120, 0.2, 0.8, 'lowpass', o); },
    shard(pos) {
      const o = Object.assign({ rev: 0.55 }, this.at(pos) || {});
      [0, 3, 7, 10, 12].forEach((s, k) => this.fm(1318 * Math.pow(2, s / 12), 3.5, 0.9, 0.6, 0.04, Object.assign({}, o, { t: k * 0.06 })));
      this.noise(0.4, 6000, 9000, 0.03, 1, 'highpass', o);
    },
    crackle(pos) { const o = this.at(pos); if (!o) return; const n = 1 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) this.noise(0.022, rnd(2200, 6000), 1800, rnd(0.12, 0.22), 0.8, 'bandpass', Object.assign({ t: rnd(0, 0.12) }, o)); },
    heavyStep(pos, big = 1) { const o = Object.assign({ rev: 0.3 }, this.at(pos) || {}); this.thud(cents(62, 100), 0.32, 0.24 * big, o); this.noise(0.18, 400, 120, 0.1 * big, 0.7, 'lowpass', o); },

    // ── 골렘 · 성채지기 (위치를 주면 거리·좌우가 반영된다) ──
    slam(pos) { const o = Object.assign({ rev: 0.4 }, this.at(pos) || {}); this.tone(cents(90), 40, 0.4, 'sine', 0.4, o); this.noise(0.3, 400, 80, 0.3, 0.7, 'lowpass', o); this.fm(cents(260), 2.76, 2, 0.4, 0.04, o); },
    crumble(pos) { const o = Object.assign({ rev: 0.4 }, this.at(pos) || {}); this.noise(0.7, 900, 120, 0.3, 0.8, 'lowpass', o); this.tone(120, 50, 0.5, 'sine', 0.25, o); for (let k = 0; k < 5; k++) this.thud(cents(180, 300), 0.08, 0.06, Object.assign({}, o, { t: 0.15 + k * rnd(0.06, 0.12) })); },
    wake() { this.tone(70, 42, 1.3, 'sawtooth', 0.07, { rev: 0.4 }); this.noise(1.1, 260, 70, 0.22, 0.7); this.tone(55, 35, 1.4, 'sine', 0.26, { t: 0.1 }); },
    arrive(to) { if (to === 'past') this.tone(784, 523, 0.35, 'triangle', 0.07); else this.tone(523, 262, 0.35, 'triangle', 0.07); this.tone(110, 45, 0.45, 'sine', 0.4); this.noise(0.35, 500, 90, 0.25, 0.8); },
    charge() { this.noise(0.6, 150, 900, 0.14, 1.2); this.tone(60, 120, 0.6, 'sawtooth', 0.05); },
    dash() { this.noise(0.45, 900, 180, 0.3, 0.9); this.tone(130, 55, 0.4, 'sine', 0.3); },
    crack() { this.tone(cents(240), 80, 0.3, 'square', 0.06); this.noise(0.35, 3200, 500, 0.22, 1.5); },
    bossFall() { this.tone(320, 40, 1.3, 'triangle', 0.16); this.noise(0.9, 700, 90, 0.25, 0.8); },
  };
  return S;
}
