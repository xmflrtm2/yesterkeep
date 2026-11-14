// T5 UI 아트 — 슬롯 파일. 이모지·유니코드 기호 대신 코드로 그린 아이콘 한 벌(src/ext/t5/icons.js)과
// 시대에 따라 바뀌는 판넬 말투(src/ext/t5/theme.js)를 깐다. 설계·아이콘 목록·새 아이콘 넣는 법: docs/roguelike/t5.md
import { EXT } from '../ext.js';
import { icon, iconUrl, iconImage, addIcon, hasIcon, ensureSheet, watch, iconize, glyphIcon } from './t5/icons.js';
import { themeCss } from './t5/theme.js';

// 다른 트랙이 import 없이도 쓰게 (없는 id는 원래 글자를 그대로 보여 줌)
EXT.icon = icon;
EXT.icons = { add: addIcon, has: hasIcon, url: iconUrl, image: iconImage, glyph: glyphIcon };

let css = null;
function putCss() {
  if (!css) { css = document.createElement('style'); css.id = 't5-css'; css.textContent = themeCss(); }
  document.head.appendChild(css); // 다시 붙이면 맨 끝으로 간다 (다른 트랙 스타일보다 뒤 = 같은 우선순위면 이김)
}
ensureSheet();
putCss();
EXT.on('init', () => {
  ensureSheet();
  putCss();
  // 화면에 나가는 글 속 이모지를 그림으로 (토스트·안내·하트·런 화면·끝 화면)
  for (const id of ['hud', 'ext', 'endCard', 'down']) watch(document.getElementById(id));
});
// 시험용: __yk.ext.t5
EXT.t5 = { icon, iconUrl, iconize };
// (T5 UI 아트 슬롯 끝)
