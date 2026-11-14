// 모든 T2 적 공통 포장 — 모든 foes 파일 뒤에 불러온다(그래야 다 감싼다).
//   def.optional → 출구를 안 막음 · def.mods → 정예 접두어 · 다른 길(T4 유물) 처치 때의 모습 · 던진 것(T4 onThrown) · 시간을 거스르는 적의 기습 막기
import { EXT } from '../../ext.js';
import { fromBehind, thrownToStab } from './core.js';
import { applyMods } from './elite.js';

// 다른 길로 쓰러졌을 때 기본 모습: 몸·윤곽·시야·표시를 숨긴다 (각 적이 따로 가진 게 있으면 그걸)
function hideAll(f) {
  for (const o of [f.holder, f.mk && (f.mk.root || f.mk.g || (f.mk.isObject3D ? f.mk : null)), f.ghost, f.cone, f.mark, f.ring, f.arc, f.biteArc, f.bashArc]) if (o && o.isObject3D) o.visible = false;
}
for (const [k, F] of Object.entries(EXT.foes)) if (k.startsWith('t2-') && !F.wrapped) {
  const sp = F.spawn; F.wrapped = true;
  F.spawn = (def, K) => {
    const f = sp(def, K);
    if (!f) return f;
    if (def.optional) f.optional = true;
    if (!f.onExternalKill) f.onExternalKill = () => hideAll(f);
    if (!f.onThrown && f.onStab) f.onThrown = t => thrownToStab(f, t);
    if (f.onStab && !f._defyWrapped) {
      const o = f.onStab; f._defyWrapped = true;
      // 시간을 거스르는: 넘어오며 치기(앞·옆)는 기습이 아니다
      f.onStab = info => o(f.defy && info.shift && !fromBehind(f, info, 70) ? { ...info, shift: false } : info);
    }
    if (def.mods) applyMods(f, def.mods);
    return f;
  };
}
