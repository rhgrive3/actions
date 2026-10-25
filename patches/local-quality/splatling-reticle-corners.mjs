import { weaponReticleFamily } from './weapon-reticle-presentation.mjs';

// Native quadrant selectors match the literal raw --a:315deg style text.
// CSSOM style writes would serialize it as --a: 315deg and break placement.
// More specific than the three-selector native angle rules, even if adapters
// prepend this rule before those border-side declarations.
export const SPLATLING_RETICLE_CORNER_CSS = '.iw-ret.iw-ret--splatling .iw-ret__tick.iw-reticle-splatling-chamfer { border-width: 0; }';

const INSTALLED = Symbol.for('inkwave.splatlingReticleCorners.installed');
// Approximate S3 chamfered corner artwork, not a pixel-calibrated asset copy.
// The final composed CSS already owns each 20px box, quadrant and spread
// translation. Keep those boxes intact; unlike iw-ret__svg, these SVGs must
// not inherit the native charge rings' -90 degree rotation. The 1px inset
// keeps the full 2px square-capped stroke inside the existing 20px envelope.
const PATHS = Object.freeze({
  '315deg': 'M1 19V8L8 1H19',
  '45deg': 'M19 19V8L12 1H1',
  '135deg': 'M19 1V12L12 19H1',
  '225deg': 'M1 1V12L8 19H19',
});
const CORNERS = Object.freeze(Object.fromEntries(Object.entries(PATHS).map(([angle, d]) => [angle,
  `<svg class="iw-ret__splatling-corner" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" style="position:absolute;left:0;top:0;width:20px;height:20px;display:block;overflow:hidden;pointer-events:none"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>`,
])));

function decorate(hud, weapons, kind) {
  const id = hud._L?.weapon;
  if (kind !== 'splatling' || typeof id !== 'string' ||
      !Object.prototype.hasOwnProperty.call(weapons, id) ||
      weaponReticleFamily(weapons[id]) !== 'splatling' || !hud.ret) return;
  const ticks = Array.from(hud.ret.children).filter(node => node.classList.contains('iw-ret__tick'));
  const angles = ticks.map(node => node.style.getPropertyValue('--a').trim());
  // Fail closed if native markup changes: never guess quadrants from DOM order
  // (the actual builder orders them TR, BR, BL, TL, not TL, TR, BR, BL).
  if (ticks.length !== 4 || new Set(angles).size !== 4 || angles.some(angle => !Object.prototype.hasOwnProperty.call(CORNERS, angle))) return;
  ticks.forEach((tick, index) => {
    tick.classList.add('iw-reticle-splatling-chamfer');
    tick.insertAdjacentHTML('beforeend', CORNERS[angles[index]]);
  });
}

/**
 * Build-only visual detail. Native rebuilds retire old nodes; charge handles,
 * frame updates, visibility, projection, spread, timing and gameplay stay native.
 */
export function installSplatlingReticleCorners(HUD, WEAPONS) {
  const proto = HUD?.prototype;
  if (!proto || !WEAPONS || Object.prototype.hasOwnProperty.call(proto, INSTALLED)) return;
  if (typeof proto._buildReticle !== 'function')
    throw new TypeError('Splatling reticle corners require the native HUD builder');
  const build = proto._buildReticle;
  Object.defineProperty(proto, INSTALLED, { value: true });
  proto._buildReticle = function (...args) {
    const result = build.apply(this, args);
    decorate(this, WEAPONS, args[0]);
    return result;
  };
}
