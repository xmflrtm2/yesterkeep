// 어제의 성채 — 타격감 이펙트: 불꽃·먼지·빛 알갱이(점), 돌 파편(인스턴스), 바닥 금(데칼), 순간 빛, 카메라 펀치
// 모두 미리 만들어 둔 풀을 돌려 쓴다(그리기 호출 4~5개 고정). 시간은 main.js update(dt)를 따른다 → 찌른 순간 멈칫·되감기와 같이 느려진다.
//   fx.init(scene, camera)          : 시작할 때 한 번 (빛 하나를 미리 넣어 두어 셰이더가 나중에 다시 컴파일되지 않게)
//   fx.sparks / dust / motes(x, y, z, o) : 점 알갱이 터뜨리기. o = { n, color, speed, up, life, size, spread, dir: [dx, dz] }
//   fx.debris(x, y, z, o)           : 돌 조각 (튀고 구르다 작아져 사라짐)
//   fx.crack(x, z, r, yaw)          : 바닥에 금 (2.5초에 걸쳐 흐려짐)
//   fx.flash(x, y, z, color, power) : 순간 빛 (주변 벽·바닥이 밝아짐)
//   fx.punch(k)                     : 카메라가 잠깐 확 다가옴 (main.js가 camera.fov에 반영)
import * as THREE from 'three';

const MAXP = 900, MAXD = 180, MAXC = 10;
const v3 = () => new THREE.Vector3();

function pointsMat(additive) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 300 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
      void main() { vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = vA * (1.0 - r * r); gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'}); }`,
    transparent: true, depthWrite: false, depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
// 점 알갱이 풀 하나 (가산 = 불꽃·빛 알갱이, 보통 = 먼지)
class Pool {
  constructor(additive) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 3); this.col = new Float32Array(MAXP * 3); this.alpha = new Float32Array(MAXP); this.size = new Float32Array(MAXP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.pts = new THREE.Points(g, pointsMat(additive)); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 11 : 6;
    this.p = Array.from({ length: MAXP }, () => ({ t: 0, life: 0, v: v3(), g: 0, drag: 0, s0: 0, s1: 0, a0: 0 }));
    this.k = 0; this.live = 0;
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, a0, c, g, drag) {
    const i = this.k; this.k = (this.k + 1) % MAXP;
    const p = this.p[i];
    p.t = 0; p.life = life; p.v.set(vx, vy, vz); p.g = g; p.drag = drag; p.s0 = s0; p.s1 = s1; p.a0 = a0;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
  }
  update(dt) {
    let live = 0;
    for (let i = 0; i < MAXP; i++) {
      const p = this.p[i];
      if (p.t >= p.life) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.t += dt; live++;
      const k = Math.min(1, p.t / p.life);
      p.v.y -= p.g * dt; p.v.multiplyScalar(Math.exp(-p.drag * dt));
      this.pos[i * 3] += p.v.x * dt; this.pos[i * 3 + 1] = Math.max(0.03, this.pos[i * 3 + 1] + p.v.y * dt); this.pos[i * 3 + 2] += p.v.z * dt;
      if (this.pos[i * 3 + 1] <= 0.03 && p.v.y < 0) { p.v.y *= -0.3; p.v.x *= 0.6; p.v.z *= 0.6; }
      this.alpha[i] = p.a0 * (1 - k) * (k < 0.08 ? k / 0.08 : 1);
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
    }
    this.live = live;
    const a = this.pts.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aAlpha.needsUpdate = a.aSize.needsUpdate = true;
  }
}
// 바닥 금 무늬: 가운데서 뻗는 들쭉날쭉한 금 (한 번 그려 두고 돌려 쓴다)
function crackTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.strokeStyle = 'rgba(10,6,4,0.95)'; x.lineCap = 'round';
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const branch = (px, py, ang, len, w) => {
    x.lineWidth = w; x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 5; s++) { ang += (rnd() - 0.5) * 0.7; px += Math.cos(ang) * len / 5; py += Math.sin(ang) * len / 5; x.lineTo(px, py); if (w > 1.6 && rnd() < 0.35) branch(px, py, ang + (rnd() - 0.5) * 1.6, len * 0.45, w * 0.55); }
    x.stroke();
  };
  for (let k = 0; k < 9; k++) branch(128, 128, (k / 9) * Math.PI * 2 + rnd() * 0.4, 70 + rnd() * 50, 4.5);
  const gr = x.createRadialGradient(128, 128, 2, 128, 128, 34); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = v3(), _p = v3();
export const fx = {
  ready: false, kick: 0, baseFov: 0,
  init(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.add = new Pool(true); this.norm = new Pool(false);
    scene.add(this.add.pts, this.norm.pts);
    // 돌 조각
    this.rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 }), MAXD);
    this.rock.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.rock.frustumCulled = false; this.rock.count = MAXD;
    this.rock.setColorAt(0, _c.set('#888')); this.rock.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.d = Array.from({ length: MAXD }, () => ({ t: 1, life: 0, p: v3(), v: v3(), r: v3(), w: v3(), s: 0 }));
    this.dk = 0;
    for (let i = 0; i < MAXD; i++) this.rock.setMatrixAt(i, _m.makeScale(0, 0, 0));
    scene.add(this.rock);
    // 바닥 금
    const tex = crackTex();
    this.cr = Array.from({ length: MAXC }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false; scene.add(m);
      return { m, t: 0, life: 0 };
    });
    this.ck = 0;
    // 순간 빛 (미리 넣어 둠 — 빛 수가 바뀌면 모든 재질이 다시 컴파일된다)
    this.light = new THREE.PointLight('#ffb060', 0, 14, 1.6); this.light.position.set(0, -50, 0); scene.add(this.light);
    this.lightA = 0;
    this.ready = true;
  },
  _burst(pool, x, y, z, o, d) {
    if (!this.ready) return;
    const n = o.n ?? d.n, sp = o.speed ?? d.speed, up = o.up ?? d.up, life = o.life ?? d.life, size = o.size ?? d.size, spread = o.spread ?? 0.3;
    const cols = [].concat(o.color ?? d.color).map(c => new THREE.Color(c));
    for (let k = 0; k < n; k++) {
      let ang = Math.random() * Math.PI * 2, s = sp * (0.45 + Math.random() * 0.75);
      let vx = Math.cos(ang) * s, vz = Math.sin(ang) * s;
      if (o.dir) { const [dx, dz] = o.dir, cone = o.cone ?? 0.7; ang = Math.atan2(dz, dx) + (Math.random() - 0.5) * 2 * cone; vx = Math.cos(ang) * s; vz = Math.sin(ang) * s; }
      const ox = (Math.random() - 0.5) * 2 * spread, oz = (Math.random() - 0.5) * 2 * spread, oy = Math.random() * (o.h ?? 0.2);
      pool.add(x + ox, y + oy, z + oz, vx, up * (0.5 + Math.random() * 0.8), vz, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), size * (d.grow ?? 1) * (0.8 + Math.random() * 0.5), o.alpha ?? d.alpha, cols[k % cols.length], o.g ?? d.g, o.drag ?? d.drag);
    }
  },
  sparks(x, y, z, o = {}) { this._burst(this.add, x, y, z, o, { n: 16, speed: 7, up: 4, life: 0.5, size: 0.2, alpha: 1, color: '#ffd27a', g: 16, drag: 2.5, grow: 0.3 }); },
  dust(x, y, z, o = {}) { this._burst(this.norm, x, y, z, o, { n: 18, speed: 3, up: 1.2, life: 1.1, size: 0.7, alpha: 0.7, color: '#b9a080', g: 0.5, drag: 3.2, grow: 2.8 }); },
  motes(x, y, z, o = {}) { this._burst(this.add, x, y, z, o, { n: 20, speed: 1.2, up: 2.2, life: 1.3, size: 0.16, alpha: 0.9, color: '#ffd27a', g: -0.6, drag: 1.2, grow: 0.5 }); },
  // 바닥에 둥글게 퍼지는 먼지 고리 (내려찍기·착지)
  dustRing(x, z, r, o = {}) {
    const n = o.n ?? 26, col = new THREE.Color(o.color ?? '#b9a080');
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.2, s = (o.speed ?? 4.5) * (0.7 + Math.random() * 0.5);
      this.norm.add(x + Math.cos(a) * r * 0.3, 0.15, z + Math.sin(a) * r * 0.3, Math.cos(a) * s, 0.4 + Math.random() * 0.6, Math.sin(a) * s, (o.life ?? 1.0) * (0.7 + Math.random() * 0.5), 0.7, 2.2 + Math.random() * 1.0, o.alpha ?? 0.75, col, 0.3, 3.2);
    }
  },
  debris(x, y, z, o = {}) {
    if (!this.ready) return;
    const n = o.n ?? 8, sp = o.speed ?? 4, up = o.up ?? 4.5, cols = [].concat(o.color ?? ['#9a8a74', '#7d6f5f']).map(c => new THREE.Color(c));
    for (let k = 0; k < n; k++) {
      const i = this.dk; this.dk = (this.dk + 1) % MAXD;
      const d = this.d[i], a = o.dir ? Math.atan2(o.dir[1], o.dir[0]) + (Math.random() - 0.5) * 2 * (o.cone ?? 0.8) : Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random() * 0.8);
      d.t = 0; d.life = (o.life ?? 1.8) * (0.7 + Math.random() * 0.6);
      d.p.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4);
      d.v.set(Math.cos(a) * s, up * (0.5 + Math.random() * 0.7), Math.sin(a) * s);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); d.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      d.s = (o.size ?? 0.17) * (0.6 + Math.random() * 0.9);
      this.rock.setColorAt(i, cols[k % cols.length]);
    }
    this.rock.instanceColor.needsUpdate = true;
  },
  crack(x, z, r = 1.6, yaw = Math.random() * 6.28, o = {}) {
    if (!this.ready) return;
    const c = this.cr[this.ck]; this.ck = (this.ck + 1) % MAXC;
    c.t = 0; c.life = o.life ?? 2.6; c.a = o.alpha ?? 0.85;
    c.m.position.set(x, 0.045, z); c.m.rotation.z = yaw; c.m.scale.set(r * 2, r * 2, 1); c.m.visible = true; c.m.material.opacity = c.a;
  },
  flash(x, y, z, color = '#ffb060', power = 6) {
    if (!this.ready) return;
    if (power < this.lightA) return; // 더 센 빛이 켜져 있으면 둔다
    this.light.position.set(x, y, z); this.light.color.set(color); this.lightA = power;
  },
  punch(k = 0.5) { this.kick = Math.max(this.kick, k); },
  update(dt) {
    if (!this.ready) return;
    const cam = this.camera;
    const sc = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    this.add.pts.material.uniforms.uScale.value = this.norm.pts.material.uniforms.uScale.value = sc; // aSize = 지름(m)
    this.add.update(dt); this.norm.update(dt);
    let any = false;
    for (let i = 0; i < MAXD; i++) {
      const d = this.d[i];
      if (d.t >= d.life) { if (d.life) { this.rock.setMatrixAt(i, _m.makeScale(0, 0, 0)); d.life = 0; any = true; } continue; }
      d.t += dt; any = true;
      d.v.y -= 18 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s * 0.6) { d.p.y = d.s * 0.6; if (d.v.y < 0) d.v.y *= -0.35; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.7); }
      d.r.addScaledVector(d.w, dt);
      const k = d.t / d.life, s = d.s * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      this.rock.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _s.set(s, s, s)));
    }
    if (any) this.rock.instanceMatrix.needsUpdate = true;
    for (const c of this.cr) {
      if (!c.m.visible) continue;
      c.t += dt; const k = c.t / c.life;
      c.m.material.opacity = c.a * (k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4));
      if (k >= 1) c.m.visible = false;
    }
    this.lightA *= Math.exp(-dt / 0.12); if (this.lightA < 0.02) this.lightA = 0;
    this.light.intensity = this.lightA;
    this.kick *= Math.exp(-dt / 0.09); if (this.kick < 0.002) this.kick = 0;
  },
  stats() { return { points: this.add.live + this.norm.live, rocks: this.d.filter(d => d.t < d.life).length, cracks: this.cr.filter(c => c.m.visible).length, light: +this.lightA.toFixed(2), kick: +this.kick.toFixed(3) }; },
};
window.__fx = fx;
