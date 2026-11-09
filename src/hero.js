// 모듈 캐릭터(Polyart) 조립 + 동작 재생기.
// 기준 뼈대 = 단검 동작 파일(Dagger.anims.glb)의 뼈대: UE 마네킹 뼈 이름 + 단검 뼈(Dagger_Weapon_R/L)가 들어 있다.
// 파츠 GLB는 각자 쓰는 뼈만 들고 있으므로, 이름이 같은 기준 뼈에 다시 묶는다(bind). 같은 파츠로 여러 명(경비병)을 만들 수 있다.
import * as THREE from 'three';

const PARTS_DIR = 'assets/fab/Polyart/ModularStylizedChars/Meshes/SkeletalMeshes/CharacterModularParts/';
export const RIG_URL = 'assets/fab/anims/Dagger.anims.glb';            // 단검 동작 12개 + 뼈대
export const EXTRA_ANIMS_URL = 'assets/fab/anims/SKEL_Mannequin.anims.glb'; // Polyart 동작(MF_Idle, MM_Run, MM_Fall_Loop)
export const DAGGER_URL = 'assets/fab/Dagger/Demo/Characters/Mannequins/Meshes/Dagger.glb';

// 외형 프리셋. 파츠를 바꾸려면: fab-pick.ps1로 복사 → tools/shrink_tex.py 512 → 여기 목록 수정
export const LOOKS = {
  rogueF: { dir: 'Female', parts: ['SK_Female_Head', 'SK_FemaleHair', 'SK_FemaleHood', 'SK_FemaleShirt', 'SK_Female_ArmsWithGloves', 'SK_FemalePants', 'SK_FemaleBoots', 'SK_FemaleBelt'] },
  guardM: { dir: 'Male', parts: ['SK_Male_Head', 'SK_MaleHair', 'SK_MaleArmor', 'SK_MaleShoulders', 'SK_Male_ArmsWithGloves', 'SK_MalePants', 'SK_MaleBoots', 'SK_MaleBelt'], tint: { Armor: '#c0392b', Shoulders: '#a93226' } },
};
const partUrl = (look, p) => `${PARTS_DIR}${LOOKS[look].dir}/${p}.glb`;

/** 파츠 GLB들을 불러 둔다 (여러 번 조립해도 한 번만 받는다) */
export async function loadLook(loader, look) {
  const L = LOOKS[look];
  const parts = await Promise.all(L.parts.map(p => loader.loadAsync(partUrl(look, p))));
  // 색조: 파츠 이름에 키가 들어간 머티리얼만 복제해서 색을 곱한다 (경비병의 붉은 갑옷)
  if (L.tint) for (const g of parts) g.scene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    for (const [key, col] of Object.entries(L.tint)) if (o.name.includes(key)) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(col)).multiplyScalar(1.6); }
  });
  return parts;
}

/** 기준 뼈대를 복제하고 파츠를 그 뼈에 다시 묶는다. 반환: { rig, meshes } */
export function assemble(parts, rigScene, dagger) {
  const rig = rigScene.clone(true);
  const byName = {};
  rig.traverse(o => { if (o.name) byName[o.name] = o; });
  const meshes = [];
  for (const g of parts) {
    g.scene.updateMatrixWorld(true);
    // 기준 뼈대에 없는 뼈(두건 천, 허리띠 장식 등)는 부모 이름을 찾아 붙인다
    const extra = [];
    g.scene.traverse(o => { if (o.isBone && !byName[o.name]) extra.push(o); });
    for (const b of extra) {
      const parent = b.parent && byName[b.parent.name];
      if (!parent) continue;
      const nb = b.clone(false);
      parent.add(nb);
      byName[b.name] = nb;
    }
    g.scene.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const bones = o.skeleton.bones.map(b => byName[b.name]);
      if (bones.some(b => !b)) { console.warn('assemble: missing bone in', o.name); return; }
      const sm = new THREE.SkinnedMesh(o.geometry, o.material);
      sm.name = o.name;
      sm.frustumCulled = false;
      rig.add(sm);
      sm.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix.clone());
      meshes.push(sm);
    });
  }
  if (dagger && byName.Dagger_Weapon_R) byName.Dagger_Weapon_R.add(dagger.clone(true));
  return { rig, meshes };
}

/** 뿌리 움직임(root motion)의 수평 이동을 지운다 — 이동은 게임 코드가 한다 */
function inPlace(clip) {
  for (const t of clip.tracks) {
    if (t.name !== 'root.position') continue;
    const v = t.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
  }
  return clip;
}
export function prepClips(...gltfs) {
  const clips = {};
  for (const g of gltfs) for (const c of g.animations) clips[c.name] = inPlace(c);
  return clips;
}

/** 이름으로 동작을 바꿔 트는 작은 재생기 (부드럽게 섞기 + 한 번만 재생) */
export class Animator {
  constructor(rig, clips) {
    this.mixer = new THREE.AnimationMixer(rig);
    this.clips = clips;
    this.acts = {};
    this.cur = null; this.curName = '';
    this.onceLeft = 0;
  }
  act(name) {
    let a = this.acts[name];
    if (!a && this.clips[name]) a = this.acts[name] = this.mixer.clipAction(this.clips[name]);
    return a;
  }
  /** loop 동작으로 전환 (이미 그 동작이면 그대로) */
  loop(name, fade = 0.2, speed = 1) {
    if (this.onceLeft > 0) return;
    const a = this.act(name); if (!a) return;
    a.timeScale = speed;
    if (this.cur === a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat); a.clampWhenFinished = false; a.enabled = true; a.play();
    if (this.cur) a.crossFadeFrom(this.cur, fade, false);
    this.cur = a; this.curName = name;
  }
  /** 한 번만 재생. dur초 동안은 loop()가 끼어들지 못한다. from: 클립의 시작 위치(초) */
  once(name, { fade = 0.08, speed = 1, dur = null, from = 0, hold = false } = {}) {
    const a = this.act(name); if (!a) return 0;
    a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.timeScale = speed; a.enabled = true; a.time = from; a.play();
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    this.cur = a; this.curName = name;
    const len = (a.getClip().duration - from) / speed;
    this.onceLeft = hold ? 1e9 : (dur != null ? dur : len);
    return len;
  }
  update(dt) { if (this.onceLeft > 0) this.onceLeft -= dt; this.mixer.update(dt); }
}
