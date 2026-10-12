// Apply the mobile editor independently of the gameplay patches and fetched upstream files.
import fs from 'node:fs';
import crypto from 'node:crypto';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
function connect(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`INKWAVE touch layout conflict (${label}): review upstream before building.`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptTouchLayout(rel, code) {
  if (rel === 'src/ui/menu-art.js') {
    // The upstream settings preview calls these helpers without importing them.
    return "import { t as tr } from '../i18n.js';\nimport { gyroTurnDeg, touchSensMul } from '../core/gyro.js';\n" + code;
  }
  if (rel === 'src/ui/menus.js') {
    const row = "  { key: '_layout', label: 'Edit button layout', type: 'link', linkLabel: 'EDIT', help: 'Drag buttons where you want them and resize them. Saved per device.' },\n";
    code = connect(code, row, '', 'layout entry');
    return connect(code, "const TOUCH_TAB = { id: 'touch', label: 'Touch', icon: 'hand', rows: [\n",
      "const TOUCH_TAB = { id: 'touch', label: 'Touch', icon: 'hand', rows: [\n" + row, 'touch settings');
  }
  if (rel === 'src/core/mobile.js') {
    // Let native buttons/selects/ranges receive their touch-generated clicks.
    code = connect(code, "if (e.target.closest?.('#iw-mobile-controls') || e.target === this.canvas) stop(e);",
      "if (!e.target.closest?.('.iwm-edit__bar, .iwm-edit__sel') && (e.target.closest?.('#iw-mobile-controls') || e.target === this.canvas)) stop(e);", 'editor touch actions');
    // A button's individual CSS scale must shrink around its own center. A
    // translated transform is scaled as well, moving the visible button away
    // from the fixed input hitbox. Keep the floating stick's transform path.
    code = connect(code,
      '      el.style.transform = `translate3d(${(b.x - b.d / 2).toFixed(1)}px,${(b.y - b.d / 2).toFixed(1)}px,0)`;',
      `      if (id === 'stick') {
        el.style.transform = \`translate3d(\${(b.x - b.d / 2).toFixed(1)}px,\${(b.y - b.d / 2).toFixed(1)}px,0)\`;
      } else {
        el.style.left = (b.x - b.d / 2).toFixed(1) + 'px';
        el.style.top = (b.y - b.d / 2).toFixed(1) + 'px';
        el.style.transform = 'none';
      }`, 'pressed button center');
    // A floating stick moved to the right must still accept input at its new home.
    code = connect(code, ": x < W * 0.42;",
      ": x < W * 0.42 || Math.hypot(x - this._stickHome.x, y - this._stickHome.y) <= this._stickR * 1.6;", 'moved floating stick');
    return code + '\n' + read('mobile.js') + '\ninstallTouchLayout(MobileInput, CONTROLS);\n';
  }
  if (rel === 'styles/mobile.css') return code + '\n' + read('ui.css');
  return code;
}

export function touchLayoutIdentity() {
  return Object.fromEntries(['adapter.mjs', 'mobile.js', 'ui.css'].map(name =>
    [name, crypto.createHash('sha256').update(read(name)).digest('hex')]));
}
