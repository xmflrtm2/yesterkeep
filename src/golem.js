// 돌 골렘 모델(StoneGolem 팩): 몸 + 오른손 망치 + 왼손 방패, 동작 6개.
// 파일은 tools/golem_pack.py 가 만든다 (텍스처 축소·양자화). 첫 방이 뜬 뒤 백그라운드로 받는다.
import * as THREE from 'three';
import { prepClips } from './hero.js';

const DIR = 'assets/fab/';
export const GOLEM_URLS = {
  body: DIR + 'StoneGolem/StoneGolem.glb',
  hammer: DIR + 'StoneGolem/Hammer.glb',
  shield: DIR + 'StoneGolem/Shield.glb',
  anims: DIR + 'anims/SKEL_StoneGolem.anims.glb',
};
export const GCLIP = {
  idle: 'AS_StoneGolem_idle2',
  walk: 'AS_StoneGolem_walkF',
  run: 'AS_StoneGolem_jogF',
  slam: 'AS_StoneGolem_attack4',   // 뛰어올라 망치를 들고 ≈1.55초에 내려찍음
  dieFront: 'AS_StoneGolem_death1', // 뒤로 쓰러짐 (정면에서 기습당했을 때)
  dieBack: 'AS_StoneGolem_death2',  // 앞으로 엎어짐 (등 뒤에서 찔렸을 때)
};
// 모델은 키 1.84m → 1.3배(≈2.4m). 동작 본래 속도(1.3배 기준): 걷기 ≈1.5m/s, 뛰기 ≈2.7m/s
export const GOLEM_LOOK = { scale: 1.3, walkSpeed: 0.75, runSpeed: 0.95, slamHit: 1.55, slamSpeed: 1.41, height: 2.4 };

export async function loadGolem(loader) {
  const [body, hammer, shield, anims] = await Promise.all(
    [GOLEM_URLS.body, GOLEM_URLS.hammer, GOLEM_URLS.shield, GOLEM_URLS.anims].map(u => loader.loadAsync(u)));
  return { body: body.scene, hammer: hammer.scene, shield: shield.scene, clips: prepClips(anims) };
}

/** 골렘 하나: 뼈대를 복제하고 SkinnedMesh를 새 뼈에 다시 묶은 뒤 무기를 붙인다.
 *  mat(src) → 쓸 머티리얼(시대 디졸브용). 반환 { rig, meshes, weapons } */
export function buildGolem(G, mat) {
  const rig = G.body.clone(true);
  const byName = {};
  rig.traverse(o => { if (o.isBone) byName[o.name] = o; });
  const meshes = [];
  rig.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.bind(new THREE.Skeleton(o.skeleton.bones.map(b => byName[b.name]), o.skeleton.boneInverses), o.bindMatrix.clone());
    o.material = mat(o.material); o.frustumCulled = false; o.castShadow = false;
    meshes.push(o);
  });
  const weapons = [];
  for (const [bone, src] of [['weapon_r', G.hammer], ['weapon_l', G.shield]]) {
    if (!byName[bone]) continue;
    const w = src.clone(true);
    w.traverse(o => { if (o.isMesh) { o.material = mat(o.material); weapons.push(o); } });
    byName[bone].add(w);
  }
  return { rig, meshes, weapons };
}
