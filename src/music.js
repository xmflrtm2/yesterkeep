// 어제의 성채 — 배경 음악 (WebAudio로 그 자리에서 합성, 소리 파일 없음 → 용량 0)
//
// "어제의 노래는 내가 어제에 있을 때만 흐른다": 시대마다 재생 위치를 따로 갖는다. 떠난 시대의 노래는 그 박자에 멈춰 있다가
// 돌아오면 거기서 다시 이어진다(시대를 바꾸는 순간 떠나는 쪽은 낮게 가라앉으며 끊기고, 들어가는 쪽은 열리며 살아난다).
// 같은 가락을 두 번 편곡했다:
//   어제 = D장조. 하프 분산화음 · 부드러운 현 · 플루트 가락 · 북 (황금기의 성채)
//   오늘 = 같은 음 번호를 D단조로. 가락은 박에 걸린 음만 남은 오르골 조각, 낮은 울림, 바람, 가끔 물방울 (무너진 성채)
// 보스 방(성채지기)은 같은 동기를 112bpm 프리지아로: 어제 = 금관 · 북 · 합창, 오늘 = 일그러진 저음 · 쇳소리 · 오르골. 2페이즈엔 층이 더해진다.
// 들킨 상태(danger)면 심장 박동 층, 되감는 동안은 먹먹하게, 보스를 쓰러뜨리면 장조 화음.
//
// 쓰는 법(main.js): music.attach(AudioContext) → setSong('keep'|'boss') · setEra('past'|'now') · update({ danger, boss, down }) · toggle()
// 시험: music.render(song, era, sec, opts) → OfflineAudioContext로 그려 최고값 · 평균 세기 · 무음 구간을 돌려준다.

const SC = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], phr: [0, 1, 3, 5, 7, 8, 10] };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const AHEAD = 0.12;    // 미리 짜 두는 시간(초)
const VOL = 0.34;      // 음악 전체 세기 (효과음이 위에 들리게)

// 음 번호(1~7, ' = 한 옥타브 위, , = 아래) → MIDI
function degMidi(tok, key, sc) {
  const n = parseInt(tok, 10), up = (tok.match(/'/g) || []).length - (tok.match(/,/g) || []).length, d = n - 1;
  return key + SC[sc][((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + up);
}
// 화음 근음 번호 → 세 음(근음 · 3도 · 5도, 그 음계 안에서)
function triad(root, key, sc, oct = 0) { return [0, 2, 4].map(k => degMidi(String(root + k), key + 12 * oct, sc)); }

/* ───────── 곡 ───────── */
// 가락: 마디는 '|', 한 마디는 8분음표 8칸. '-' = 앞 음을 늘림, '.' = 쉼. 화음: 마디마다 근음 번호, '4/5' = 반 마디씩
const THEME = {
  A: { mel: "1 - 3 - 5 - - 6 | 5 - 4 3 2 - - . | 1 - 3 - 6 - - 5 | 4 - - 3 4 - . . | 1 - 3 - 5 - - 1' | 7 - 6 5 6 - - 5 | 4 - 3 - 2 - 5, - | 1 - - - - - . .", ch: '1 5 6 4 1 5 4/5 1' },
  B: { mel: "6 - - 5 6 - 1' - | 1' - 6 - 4 - - . | 5 - - 4 3 - 5 - | 2 - - - 7, - . . | 6 - - 5 6 - 1' - | 2' - 1' - 6 - 4 - | 2 - 4 - 6 - 5 4 | 5 - - - . . . .", ch: '6 4 1 5 6 4 2 5' },
};
const BOSS_T = {
  X: { mel: "1 - - - 3 - - - | 5 - - - 6 - 5 - | 4 - 3 - 2 - - - | 1 - - - . . . . | 1 - - - 3 - - - | 5 - - - 1' - 7 - | 6 - 5 - 4 - 2 - | 1 - - - . . . .", ch: '1 2 1 7 1 2 6 7' },
  Y: { mel: "5 - 6 - 1' - - - | 7 - 6 - 5 - - - | 1' - 7 - 6 - 5 - | 4 - - - 2 - - - | 5 - 6 - 1' - - - | 2' - 1' - 7 - 6 - | 5 - - - 2 - - - | 1 - - - - - - -", ch: '6 7 1 1 6 7 2 1' },
};
const SONGS = {
  keep: { bpm: 84, key: 62, sc: { past: 'maj', now: 'min' }, sections: THEME, form: ['A', 'A', 'B', 'A'] },
  boss: { bpm: 112, key: 62, sc: { past: 'phr', now: 'phr' }, sections: BOSS_T, form: ['X', 'X', 'Y', 'X'] },
};
// 곡 → 16분음표 칸마다 { sec(악절 번호), bar, mel: [음 번호 토큰, 길이(칸)] | null, ch: 근음 번호 }
function compile(song) {
  const steps = [];
  song.form.forEach((name, si) => {
    const S = song.sections[name], bars = S.mel.split('|').map(b => b.trim().split(/\s+/)), chs = S.ch.split(/\s+/);
    bars.forEach((slots, bi) => {
      const ch = chs[bi].split('/').map(Number);
      const row = [];
      for (let k = 0; k < 16; k++) row.push({ sec: si, name, bar: bi, ch: ch[k < 8 || ch.length === 1 ? 0 : 1], chStart: k === 0 || (k === 8 && ch.length > 1), mel: null });
      let last = null;
      slots.forEach((tok, k) => {
        if (tok === '-') { if (last) last[1] += 2; return; }
        if (tok === '.') { last = null; return; }
        last = [tok, 2]; row[k * 2].mel = last;
      });
      steps.push(...row);
    });
  });
  return steps;
}
for (const id in SONGS) SONGS[id].steps = compile(SONGS[id]);

/* ───────── 소리 엔진 (실제 · 오프라인 공용) ───────── */
function irBuf(c, sec, decay) {
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let k = 0; k < n; k++) { const x = k / n; lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.45 * x); d[k] = k < 400 ? 0 : lp * Math.pow(1 - x, decay); }
  }
  return b;
}
class Engine {
  constructor(c, out) {
    this.c = c; this.live = 0;
    const g = v => { const n = c.createGain(); n.gain.value = v; return n; };
    this.g = g;
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noise.getChannelData(0); for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
    // 마스터: 먹먹함(되감기) → 압축 → 출력
    this.master = g(VOL); this.mlp = c.createBiquadFilter(); this.mlp.type = 'lowpass'; this.mlp.frequency.value = 16000; this.mlp.Q.value = 0.4;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 3; this.comp.knee.value = 10; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.dcb = c.createBiquadFilter(); this.dcb.type = 'highpass'; this.dcb.frequency.value = 28; this.dcb.Q.value = 0.5; // 직류 · 초저역 막기
    this.master.connect(this.dcb); this.dcb.connect(this.mlp); this.mlp.connect(this.comp); this.comp.connect(out);
    // 잔향 · 메아리 (시대 공용. 떠난 시대의 메아리는 남아서 흩어진다)
    this.revIn = g(1); this.rev = c.createConvolver(); this.rev.buffer = irBuf(c, 2.6, 2.2); this.revOut = g(0.9);
    this.revIn.connect(this.rev); this.rev.connect(this.revOut); this.revOut.connect(this.master);
    this.dIn = g(1); this.dl = c.createDelay(2); this.dl.delayTime.value = 60 / 84 * 0.75; this.dfb = g(0.38); this.dlp = c.createBiquadFilter(); this.dlp.type = 'lowpass'; this.dlp.frequency.value = 2200;
    this.dIn.connect(this.dl); this.dl.connect(this.dlp); this.dlp.connect(this.dfb); this.dfb.connect(this.dl); this.dlp.connect(this.master); this.dlp.connect(this.revIn);
    // 시대마다 버스: 세기 · 저역 통과 (떠나면 가라앉고, 들어오면 열린다)
    this.bus = {};
    for (const E of ['past', 'now']) {
      const b = { in: g(1), lp: c.createBiquadFilter(), out: g(0), rev: g(E === 'now' ? 0.55 : 0.32), dly: g(E === 'now' ? 0.5 : 0.12), held: [] };
      b.lp.type = 'lowpass'; b.lp.frequency.value = 300; b.lp.Q.value = 0.6;
      b.in.connect(b.lp); b.lp.connect(b.out); b.out.connect(this.master); b.out.connect(b.rev); b.rev.connect(this.revIn);
      b.dlyIn = g(1); b.dlyIn.connect(b.dly); b.dly.connect(this.dIn); // 가락만 메아리로 보낸다
      this.bus[E] = b;
    }
    this.layer = g(1); // 들킴 층 (심장 박동)
  }
  t() { return this.c.currentTime; }
  // 일그러짐 곡선: 점 수를 홀수(257)로 해서 한가운데가 정확히 0 → 입력이 없을 때 직류가 새지 않게 (짝수면 -0.008씩 새어 쌓였다)
  shape(drive) {
    const key = 'ws' + drive;
    if (!this[key]) { const cv = new Float32Array(257); for (let k = 0; k < 257; k++) cv[k] = Math.tanh((k / 128 - 1) * drive); this[key] = cv; }
    return this[key];
  }
  run(src, t, end) { src.start(t); src.stop(end); this.live++; src.onended = () => { this.live--; }; }
  osc(type, f, t) { const o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
  env(t, a, v, dec, end) { const n = this.c.createGain(); n.gain.setValueAtTime(0, t); n.gain.linearRampToValueAtTime(v, t + a); if (dec) n.gain.setTargetAtTime(0, t + a, dec); if (end) n.gain.setTargetAtTime(0, end, 0.08); return n; }
  // ── 악기 ──
  pluck(b, t, m, v, dec = 0.5, w = 'triangle', cut = 3000) { // 하프
    const o = this.osc(w, hz(m), t), lp = this.c.createBiquadFilter(), e = this.env(t, 0.004, v, dec);
    lp.type = 'lowpass'; lp.Q.value = 1.5; lp.frequency.setValueAtTime(cut, t); lp.frequency.setTargetAtTime(Math.max(hz(m) * 1.5, 600), t, dec * 0.6);
    o.connect(lp); lp.connect(e); e.connect(b.in); this.run(o, t, t + dec * 6 + 0.05);
  }
  flute(b, t, m, d, v) { // 사인 + 세모, 길면 비브라토
    const end = t + d, stop = end + 0.6, e = this.c.createGain(), lp = this.c.createBiquadFilter();
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.07); e.gain.setTargetAtTime(v * 0.8, t + 0.07, 0.3); e.gain.setTargetAtTime(0, end, 0.12);
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    const o1 = this.osc('sine', hz(m), t), o2 = this.osc('triangle', hz(m), t), g2 = this.g(0.35);
    o1.connect(e); o2.connect(g2); g2.connect(e); e.connect(lp); lp.connect(b.in); lp.connect(b.dlyIn);
    if (d > 0.35) { const l = this.osc('sine', 5.2, t), lg = this.c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.25); lg.gain.linearRampToValueAtTime(9, t + 0.6); l.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); this.run(l, t, stop); }
    this.run(o1, t, stop); this.run(o2, t, stop);
  }
  box(b, t, m, v, dec = 1.1) { // 오르골: FM 2배
    const f = hz(m), car = this.osc('sine', f, t), mod = this.osc('sine', f * 2, t), mg = this.c.createGain(), e = this.env(t, 0.003, v, dec);
    mg.gain.setValueAtTime(f * 0.9, t); mg.gain.setTargetAtTime(f * 0.08, t, dec * 0.25);
    mod.connect(mg); mg.connect(car.frequency); car.connect(e); e.connect(b.in); e.connect(b.dlyIn);
    this.run(car, t, t + dec * 6); this.run(mod, t, t + dec * 6);
  }
  clank(b, t, m, v, dec = 0.35) { // 쇳소리: FM 3.5배, 낮게
    const f = hz(m), car = this.osc('sine', f, t), mod = this.osc('sine', f * 3.5, t), mg = this.c.createGain(), e = this.env(t, 0.002, v, dec);
    mg.gain.setValueAtTime(f * 3, t); mg.gain.setTargetAtTime(f * 0.3, t, dec * 0.3);
    mod.connect(mg); mg.connect(car.frequency); car.connect(e); e.connect(b.in);
    this.run(car, t, t + dec * 6); this.run(mod, t, t + dec * 6);
  }
  pad(b, t, notes, d, v, cut = 1200, att = 0.5, w = 'sawtooth', vib = 0) {
    const lp = this.c.createBiquadFilter(), e = this.c.createGain(), stop = t + d + 3;
    lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.3;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + Math.min(att, d * 0.8)); e.gain.setTargetAtTime(0, t + d, 0.45);
    lp.connect(e); e.connect(b.in);
    let lg = null;
    if (vib) { const l = this.osc('sine', 4.6, t); lg = this.c.createGain(); lg.gain.value = vib; l.connect(lg); this.run(l, t, stop); }
    for (const m of notes) for (const dt of [-7, 7]) { const o = this.osc(w, hz(m), t); o.detune.value = dt; if (lg) lg.connect(o.detune); o.connect(lp); this.run(o, t, stop); }
  }
  bass(b, t, m, d, v, w = 'triangle', cut = 700, drive = 0) {
    const o = this.osc(w, hz(m), t), lp = this.c.createBiquadFilter(), e = this.c.createGain(), end = t + d;
    lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(cut * 2.2, t); lp.frequency.setTargetAtTime(cut, t, 0.07);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.008); e.gain.setTargetAtTime(v * 0.65, t + 0.01, 0.2); e.gain.setTargetAtTime(0, end, 0.05);
    let src = o;
    if (drive) { const ws = this.c.createWaveShaper(); ws.curve = this.shape(drive); o.connect(ws); src = ws; }
    src.connect(lp); lp.connect(e); e.connect(b.in); this.run(o, t, end + 0.4);
  }
  brass(b, t, m, d, v) { // 금관: 톱니 둘 → 열렸다 닫히는 저역 통과
    const end = t + d, stop = end + 0.5, lp = this.c.createBiquadFilter(), e = this.c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.06); lp.frequency.setTargetAtTime(1300, t + 0.06, 0.25);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.04); e.gain.setTargetAtTime(v * 0.75, t + 0.05, 0.2); e.gain.setTargetAtTime(0, end, 0.08);
    for (const dt of [-6, 6]) { const o = this.osc('sawtooth', hz(m), t); o.detune.value = dt; o.connect(lp); this.run(o, t, stop); }
    lp.connect(e); e.connect(b.in); e.connect(b.dlyIn);
  }
  drum(b, t, f0, f1, v, dec, noise = 0) { // 북: 떨어지는 사인 (+ 짧은 잡음)
    const o = this.osc('sine', f0, t), e = this.c.createGain();
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    e.gain.setValueAtTime(v, t); e.gain.setTargetAtTime(0, t + 0.003, dec);
    o.connect(e); e.connect(b.in); this.run(o, t, t + dec * 6);
    if (noise) this.hiss(b, t, noise, 0.04, 900, 'bandpass', 0.8);
  }
  hiss(b, t, v, dec, f, type = 'highpass', q = 0.7) { // 걸러낸 잡음: 셰이커 · 하이햇 · 물방울
    const s = this.c.createBufferSource(), fl = this.c.createBiquadFilter(), e = this.c.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    e.gain.setValueAtTime(v, t); e.gain.setTargetAtTime(0, t + 0.002, dec);
    s.connect(fl); fl.connect(e); e.connect(b.in);
    s.start(t, Math.random() * 1.5); s.stop(t + dec * 6 + 0.02); this.live++; s.onended = () => { this.live--; };
  }
  // 오래 울리는 소리(오늘의 낮은 울림 · 바람, 보스 방 오늘의 저음): 그 시대에 들어올 때 켜고 떠나면 끈다
  holdOn(E, kind, key, t) {
    const b = this.bus[E];
    if (b.held.some(h => h.kind === kind)) return;
    const nodes = [], e = this.c.createGain();
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 1.2); e.connect(b.in);
    if (kind === 'drone' || kind === 'growl') {
      const lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = kind === 'growl' ? 4 : 1; lp.frequency.value = kind === 'growl' ? 260 : 320;
      const lfo = this.osc('sine', kind === 'growl' ? 0.23 : 0.07, t), lg = this.g(kind === 'growl' ? 140 : 120);
      lfo.connect(lg); lg.connect(lp.frequency); nodes.push(lfo);
      for (const [m, dt, v] of [[key - 24, -5, 0.055], [key - 24, 6, 0.055], [key - 17, 0, 0.03]]) { const o = this.osc('sawtooth', hz(m), t), og = this.g(kind === 'growl' ? v * 1.4 : v); o.detune.value = dt; o.connect(og); og.connect(lp); nodes.push(o); }
      lp.connect(e);
    } else if (kind === 'wind') {
      const s = this.c.createBufferSource(), bp = this.c.createBiquadFilter(), lfo = this.osc('sine', 0.11, t), lg = this.g(380), wg = this.g(0.035);
      s.buffer = this.noise; s.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.value = 700;
      lfo.connect(lg); lg.connect(bp.frequency); s.connect(bp); bp.connect(wg); wg.connect(e); nodes.push(s, lfo);
    }
    for (const n of nodes) { n.start(t); this.live++; }
    b.held.push({ kind, e, nodes });
  }
  holdOff(E, t, kind = null) {
    const b = this.bus[E];
    b.held = b.held.filter(h => {
      if (kind && h.kind !== kind) return true;
      h.e.gain.cancelScheduledValues(t); h.e.gain.setValueAtTime(h.e.gain.value, t); h.e.gain.setTargetAtTime(0, t, 0.15);
      for (const n of h.nodes) { n.stop(t + 1.2); n.onended = () => { this.live--; }; }
      return false;
    });
  }
}

/* ───────── 편곡: 칸 하나를 짠다 ───────── */
// st: compile()의 칸, n: 곡 안의 칸 번호, lv: { danger 0~1, phase 0~2 }
function arrange(X, songId, E, st, n, t, spb, lv) {
  const S = SONGS[songId], key = S.key, sc = S.sc[E], b = X.bus[E], k = n % 16, beat = spb * 4;
  const first = st.sec === 0 && st.name === S.form[0]; // 처음 악절: 얇게
  const mel = st.mel ? degMidi(st.mel[0], key, sc) : null, dur = st.mel ? st.mel[1] * spb : 0;
  if (songId === 'keep') {
    if (E === 'past') {
      if (st.chStart) X.pad(b, t, triad(st.ch, key - 12, sc), (k === 0 && !X.split(st) ? 16 : 8) * spb, first ? 0.022 : 0.03, 1300, 0.6);
      if (k === 0 || k === 8) X.bass(b, t, degMidi(String(st.ch), key - 24, sc) + (k === 8 && !X.split(st) ? 7 : 0), 6 * spb, 0.16);
      if (k % 2 === 0) { const tr = triad(st.ch, key, sc), seq = [tr[0], tr[2], tr[1], tr[0] + 12, tr[2], tr[1] + 12, tr[0] + 12, tr[1]]; X.pluck(b, t, seq[k / 2], first ? 0.05 : 0.065, 0.45); }
      if (mel != null) X.flute(b, t, mel, dur, first ? 0.065 : 0.085);
      if (!first) {
        if (k === 0) X.drum(b, t, 120, 62, 0.32, 0.16, 0.05);
        if (k === 8) X.drum(b, t, 105, 58, 0.22, 0.14, 0.04);
        if (k % 4 === 2) X.hiss(b, t, k % 8 === 6 ? 0.03 : 0.018, 0.035, 7000);
      }
    } else {
      // 오늘: 박에 걸린 가락만 오르골로 남는다. 낮은 울림 · 바람은 holdOn으로 늘 깔림
      if (mel != null && k % 4 === 0) X.box(b, t, mel + 12, 0.05, 1.2);
      if (st.chStart && k === 0) X.pad(b, t, triad(st.ch, key, sc), 16 * spb, 0.012, 900, 1.6, 'sine');
      if (k === 0) X.bass(b, t, degMidi(String(st.ch), key - 24, sc), 10 * spb, 0.07, 'sine', 400);
      if (k % 4 === 0 && X.rnd() < 0.12) X.box(b, t + spb * 2, key + 24 + [0, 7, 3, 10][Math.floor(X.rnd() * 4)], 0.022, 1.6); // 물방울
    }
    // 들킴: 심장 박동 (쿵-쿵)
    if (lv.danger > 0.05 && (k === 0 || k === 2 || k === 8 || k === 10)) X.drum(X.bus[E], t, k % 8 === 0 ? 70 : 62, 40, 0.3 * lv.danger, 0.12);
    if (lv.danger > 0.05 && k % 2 === 1) X.hiss(b, t, 0.012 * lv.danger, 0.02, 9000);
  } else { // boss
    const tr = triad(st.ch, key, sc), root2 = degMidi(String(st.ch), key - 24, sc);
    if (E === 'past') {
      if (st.chStart) X.pad(b, t, triad(st.ch, key - 12, sc), 8 * spb * (X.split(st) ? 1 : 2), 0.028, 1000, 0.3, 'sawtooth', 8); // 합창
      if (k % 2 === 0) X.bass(b, t, root2 + (k === 12 ? 12 : 0), 1.6 * spb, 0.17, 'sawtooth', 500);
      if ([0, 6, 8, 11, 14].includes(k)) X.drum(b, t, k === 0 || k === 8 ? 95 : 130, 45, k === 0 ? 0.42 : 0.26, 0.2, 0.08); // 큰북
      if (mel != null) X.brass(b, t, mel, dur, first ? 0.06 : 0.075);
      if (lv.phase >= 2 && k % 1 === 0) { X.hiss(b, t, k % 4 === 0 ? 0.035 : 0.018, 0.03, 8000); X.pluck(b, t, tr[(k / 1) % 3] + 12 * (1 + (k >> 3 & 1)), 0.045, 0.18, 'sawtooth', 2400); }
    } else {
      if (k % 2 === 0) X.bass(b, t, root2, 1.4 * spb, 0.085, 'sawtooth', 340, 2.5); // 일그러진 저음
      if (k === 0 || k === 8 || (k === 12 && st.bar % 2)) X.clank(b, t, key - 12 + (k === 12 ? 1 : 0), 0.07, 0.4);
      if (mel != null && (k % 4 === 0 || lv.phase >= 2)) X.box(b, t, mel + 12, 0.055, 0.9);
      if (st.chStart && k === 0) X.pad(b, t, tr, 16 * spb, 0.014, 700, 1.2, 'sine');
      if (lv.phase >= 2 && k % 2 === 1) X.hiss(b, t, 0.025, 0.03, 5000, 'bandpass', 3);
    }
  }
}

/* ───────── 재생기: 시대마다 따로 가는 재생 위치 ───────── */
class Player {
  constructor(eng) {
    this.X = eng; this.song = 'keep'; this.era = 'now'; this.pos = { past: 0, now: 0 }; this.next = 0;
    this.lv = { danger: 0, phase: 0 }; this.seed = 7;
    eng.split = st => SONGS[this.song].sections[st.name].ch.split(/\s+/)[st.bar].includes('/');
    eng.rnd = () => { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; };
  }
  spb() { return 60 / SONGS[this.song].bpm / 4; }
  // 지금 시대의 버스를 열고(들어옴) 다른 시대를 닫는다(멈춤). instant면 바로
  open(E, t, instant) {
    const X = this.X, S = SONGS[this.song];
    for (const e of ['past', 'now']) {
      const b = X.bus[e], on = e === E;
      b.out.gain.cancelScheduledValues(t); b.lp.frequency.cancelScheduledValues(t);
      if (instant) { b.out.gain.setValueAtTime(on ? 1 : 0, t); b.lp.frequency.setValueAtTime(on ? 14000 : 300, t); }
      else if (on) { b.out.gain.setValueAtTime(b.out.gain.value, t); b.out.gain.linearRampToValueAtTime(1, t + 0.35); b.lp.frequency.setValueAtTime(400, t); b.lp.frequency.exponentialRampToValueAtTime(14000, t + 0.6); }
      else { b.out.gain.setValueAtTime(b.out.gain.value, t); b.out.gain.setTargetAtTime(0, t + 0.05, 0.12); b.lp.frequency.setValueAtTime(Math.max(300, b.lp.frequency.value), t); b.lp.frequency.exponentialRampToValueAtTime(220, t + 0.3); }
      if (on) {
        if (this.song === 'keep' && e === 'now') { X.holdOn(e, 'drone', S.key, t); X.holdOn(e, 'wind', S.key, t); }
        if (this.song === 'boss' && e === 'now') X.holdOn(e, 'growl', S.key, t);
      } else X.holdOff(e, t + 0.4);
    }
    X.dl.delayTime.setValueAtTime(this.spb() * 3, t); // 메아리 = 점8분음표
  }
  setEra(E, instant = false) {
    if (E === this.era && !instant) return;
    this.era = E;
    const t = this.X.t();
    this.open(E, t, instant);
    this.next = Math.max(this.next, t + 0.03); // 그 시대의 멈춘 칸부터 이어서
  }
  setSong(id) {
    if (id === this.song) return;
    const t = this.X.t();
    for (const e of ['past', 'now']) { this.X.holdOff(e, t); this.pos[e] = 0; }
    this.song = id; this.lv.phase = 0;
    this.open(this.era, t, false);
    this.next = t + 0.4;
  }
  // 미리 짜기 (실제 재생은 타이머로, 오프라인은 끝까지 한 번에)
  pump(until) {
    const S = SONGS[this.song], spb = this.spb();
    if (this.next < this.X.t() - 0.25) this.next = this.X.t() + 0.02; // 탭이 잠들었다 깨면 밀린 음을 몰아 치지 않는다
    let guard = 0;
    while (this.next < until && guard++ < 64) {
      const n = this.pos[this.era] % S.steps.length;
      arrange(this.X, this.song, this.era, S.steps[n], n, this.next, spb, this.lv);
      this.pos[this.era] = n + 1;
      this.next += spb;
    }
  }
}

/* ───────── 바깥에 보이는 것 ───────── */
const LS = 'yk-music';
export const music = {
  on: (() => { try { return localStorage.getItem(LS) !== 'off'; } catch (e) { return true; } })(),
  P: null, X: null, timer: 0, boss: 0, down: false,
  want: { song: 'keep', era: 'now' },
  attach(ctx) {
    if (this.X || !ctx) return;
    this.X = new Engine(ctx, ctx.destination);
    this.P = new Player(this.X);
    this.P.song = this.want.song; this.P.era = this.want.era;
    this.P.open(this.want.era, ctx.currentTime, true);
    this.X.master.gain.value = this.on ? VOL : 0;
    this.P.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => { if (ctx.state === 'running') this.P.pump(ctx.currentTime + AHEAD); }, 25);
  },
  setSong(id) { this.want.song = id; if (this.P) this.P.setSong(id); },
  setEra(E, instant = false) { this.want.era = E; if (this.P) this.P.setEra(E, instant); },
  // danger: 들켜서 쫓기는 중(0/1), boss: 0 없음 · 1 · 2(2페이즈) · -1 쓰러뜨림, down: 되감는 중
  update(dt, { danger = 0, boss = 0, down = false } = {}) {
    if (!this.P) return;
    const L = this.P.lv, X = this.X, t = X.t();
    L.danger += ((danger ? 1 : 0) - L.danger) * Math.min(1, dt * (danger ? 3 : 0.8));
    L.phase = Math.max(0, boss);
    if (boss !== this.boss) {
      if (boss === -1 && this.boss > 0) this.victory();
      this.boss = boss;
    }
    if (down !== this.down) {
      this.down = down;
      X.mlp.frequency.cancelScheduledValues(t); X.mlp.frequency.setValueAtTime(X.mlp.frequency.value, t);
      X.mlp.frequency.exponentialRampToValueAtTime(down ? 500 : 16000, t + (down ? 0.25 : 0.6));
    }
  },
  // 보스를 쓰러뜨림: 장조 화음이 울리고 성채의 노래로 돌아간다
  victory() {
    const X = this.X, P = this.P, t = X.t() + 0.05, b = X.bus[P.era], key = SONGS.boss.key;
    for (const [k, m] of [key, key + 4, key + 7, key + 12, key + 16].entries()) X.pluck(b, t + k * 0.09, m, 0.08, 1.6, 'triangle', 3500);
    X.pad(b, t, [key - 12, key - 8, key - 5, key], 3, 0.04, 1600, 0.3);
    if (P.era === 'past') X.brass(b, t + 0.45, key + 12, 1.6, 0.07); else X.box(b, t + 0.45, key + 24, 0.07, 2);
    setTimeout(() => this.setSong('keep'), 3200);
  },
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(LS, this.on ? 'on' : 'off'); } catch (e) { /* 이번만 */ }
    if (this.X) { const t = this.X.t(); this.X.master.gain.cancelScheduledValues(t); this.X.master.gain.setTargetAtTime(this.on ? VOL : 0, t, 0.15); }
    return this.on;
  },
  // 시험: 곡 하나를 sec초 그려 세기를 잰다. o.shiftEvery(초)면 그 간격으로 시대를 바꾸고, o.danger · o.phase 층
  async render(song = 'keep', era = 'now', sec = 20, o = {}) {
    const A = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 32000;
    const c = new A(2, Math.ceil(sr * sec), sr), X = new Engine(c, c.destination), P = new Player(X);
    for (const name of o.off || []) X[name] = () => {}; // 악기 하나씩 꺼 보기 (예: ['bass', 'holdOn'])
    P.song = song; P.era = era; P.open(era, 0, true); P.next = 0.05;
    P.lv.danger = o.danger || 0; P.lv.phase = o.phase || 0;
    let sw = o.shiftEvery || 0, nextSw = sw;
    // OfflineAudioContext는 시간이 안 가므로 pump의 "밀림" 처리를 피하려고 t()를 짜는 시각으로 둔다
    let now = 0; X.t = () => now;
    while (P.next < sec - 0.05) {
      if (sw && P.next >= nextSw) { now = P.next; P.setEra(P.era === 'past' ? 'now' : 'past'); nextSw += sw; }
      now = P.next; P.pump(P.next + 0.5);
    }
    const buf = await c.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, blk = Math.floor(sr * 0.1);
    let pk = 0, ss = 0, nan = 0, bs = 0, bc = 0, quiet = 0, maxQ = 0;
    for (let k = 0; k < n; k++) {
      const l = L[k], r = R[k];
      if (l !== l || r !== r) { nan++; continue; }
      pk = Math.max(pk, Math.abs(l), Math.abs(r)); ss += l * l + r * r; bs += l * l + r * r;
      if (++bc === blk) { if (k > sr && Math.sqrt(bs / (2 * blk)) < 2e-4) { quiet++; maxQ = Math.max(maxQ, quiet); } else quiet = 0; bs = 0; bc = 0; }
    }
    const rms = Math.sqrt(ss / (2 * n));
    const out = { song, era, sec, peak: +pk.toFixed(3), rmsDb: +(20 * Math.log10(rms || 1e-9)).toFixed(1), nan, longestSilence: +(maxQ * 0.1).toFixed(1), stepsPlayed: { past: P.pos.past, now: P.pos.now } };
    if (o.wav) { // 16비트 WAV(base64)로도 돌려준다 — 들어 보기용
      const dv = new DataView(new ArrayBuffer(44 + n * 4)), str = (p, s) => { for (let k = 0; k < s.length; k++) dv.setUint8(p + k, s.charCodeAt(k)); };
      str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
      for (let k = 0; k < n; k++) { dv.setInt16(44 + k * 4, Math.max(-1, Math.min(1, L[k])) * 32767, true); dv.setInt16(46 + k * 4, Math.max(-1, Math.min(1, R[k])) * 32767, true); }
      const u8 = new Uint8Array(dv.buffer); let bin = ''; for (let k = 0; k < u8.length; k += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
      out.wav = btoa(bin);
    }
    return out;
  },
  songs: () => Object.fromEntries(Object.entries(SONGS).map(([k, s]) => [k, { bpm: s.bpm, bars: s.steps.length / 16, seconds: +(s.steps.length * 60 / s.bpm / 4).toFixed(1) }])),
};
window.__music = music;
