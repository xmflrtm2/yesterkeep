// 시대 전환 머티리얼: 모든 머티리얼에 uShiftOrigin / uShiftRadius 를 넣어서
// 플레이어 위치에서 퍼지는 고리 안쪽은 새 시대, 바깥쪽은 떠나는 시대가 보이게 한다.
// 고리 경계는 조금 울퉁불퉁하게(칸 노이즈) 하고 빛나는 테두리를 그린다.
import * as THREE from 'three';

// 모든 시대가 같이 쓰는 전환 상태
export const SHIFT = {
  origin: { value: new THREE.Vector3() },
  radius: { value: 1e5 },
  width: { value: 0.7 },
};

// 시대별 유니폼 (이 객체를 머티리얼끼리 공유하므로 값 하나만 바꾸면 전부 바뀐다)
// side: -1 = 고리 안쪽만 보임(들어오는 시대 / 평소), +1 = 고리 바깥쪽만 보임(떠나는 시대)
export const ERA_U = {
  past: {
    side: { value: -1 },
    tint: { value: new THREE.Color(1.06, 0.97, 0.84) },
    desat: { value: 0.0 },
    glow: { value: new THREE.Color('#ffc65a') },
  },
  now: {
    side: { value: -1 },
    tint: { value: new THREE.Color(0.80, 0.90, 1.06) },
    desat: { value: 0.42 },
    glow: { value: new THREE.Color('#6fe3ff') },
  },
};

const VERT_HEAD = /* glsl */`
varying vec3 vShW;
`;
const VERT_BODY = /* glsl */`
{
  vec4 shW4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  shW4 = instanceMatrix * shW4;
  #endif
  vShW = (modelMatrix * shW4).xyz;
}
`;
const FRAG_HEAD = /* glsl */`
varying vec3 vShW;
uniform vec3 uShOrigin;
uniform float uShRadius;
uniform float uShWidth;
uniform float uShSide;
uniform vec3 uShTint;
uniform float uShDesat;
uniform vec3 uShGlow;
float shHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;
const FRAG_CLIP = /* glsl */`
float shK;
{
  vec2 d2 = vShW.xz - uShOrigin.xz;
  float shD = length(d2) - uShRadius;
  // 경계를 돌 조각처럼 들쭉날쭉하게: 0.35m 칸마다 다른 오프셋 + 높이에 따라 조금
  shD += (shHash(floor(vShW.xz * 2.8) + floor(vShW.y * 1.5)) - 0.5) * 0.55;
  shK = uShSide * shD;
  if (shK < 0.0) discard;
}
`;
const FRAG_COLOR = /* glsl */`
{
  float shL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(shL), uShDesat) * uShTint;
  // 바닥 아래(구덩이 벽)는 깊을수록 어둡게
  diffuseColor.rgb *= mix(0.04, 1.0, smoothstep(-4.5, -0.3, vShW.y));
}
`;
const FRAG_EMIT = /* glsl */`
{
  float shG = 1.0 - smoothstep(0.0, uShWidth, shK);
  // 들어오는 시대(안쪽) 테두리는 밝게, 떠나는 시대(바깥쪽)는 은은하게
  totalEmissiveRadiance += uShGlow * shG * (uShSide > 0.0 ? 0.9 : 2.6);
}
`;

function inject(shader, era) {
  const u = ERA_U[era];
  shader.uniforms.uShOrigin = SHIFT.origin;
  shader.uniforms.uShRadius = SHIFT.radius;
  shader.uniforms.uShWidth = SHIFT.width;
  shader.uniforms.uShSide = u.side;
  shader.uniforms.uShTint = u.tint;
  shader.uniforms.uShDesat = u.desat;
  shader.uniforms.uShGlow = u.glow;
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
  let f = FRAG_HEAD + shader.fragmentShader;
  f = f.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_CLIP);
  f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
  f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
  shader.fragmentShader = f;
}

// 원본 머티리얼 → 시대별 복제본 (같은 원본은 한 번만 복제)
const cache = { past: new Map(), now: new Map() };
export function eraMaterial(src, era) {
  let m = cache[era].get(src);
  if (m) return m;
  m = src.clone();
  if (!m.isMeshStandardMaterial) {
    // 표준 머티리얼이 아니면(드묾) 색과 텍스처만 옮긴다
    m = new THREE.MeshStandardMaterial({ color: src.color, map: src.map || null, transparent: src.transparent, alphaTest: src.alphaTest, side: src.side });
  }
  m.onBeforeCompile = sh => inject(sh, era);
  m.customProgramCacheKey = () => 'yk-era';
  m.userData.era = era;
  cache[era].set(src, m);
  return m;
}

// 코드로 만드는 단색 머티리얼 (벽 윗면 등)
export function eraPlain(era, params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = sh => inject(sh, era);
  m.customProgramCacheKey = () => 'yk-era';
  m.userData.era = era;
  return m;
}
