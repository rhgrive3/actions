// LOCAL next-candidate integration prototype, now hooked by this overlay's
// candidate compiler only. Not published; browser/retail validation is pending.
import { slosherDiagonalProposal } from './slosher-diagonal-proposal.mjs';
const INSTALLED = Symbol('evidenceSlosherDiagonalInstalled');
const STATE = Symbol('evidenceSlosherDiagonalState');
function release(s) {
  s.overlay?.remove();
  for (const { element, value, priority } of s.hidden) {
    if (value) element.style.setProperty('display', value, priority);
    else element.style.removeProperty('display');
  }
  s.hidden.length = 0; s.overlay = null; s.ret = null;
}
function update(hud, weapons, kind, rebuilt = false) {
  const s = hud[STATE] ||= { ret: null, overlay: null, hidden: [], nativeKind: null, hasBuildKind: false };
  if (rebuilt) { release(s); s.nativeKind = kind; s.hasBuildKind = true; }
  const id = hud._L?.weapon;
  const actual = typeof id === 'string' && Object.prototype.hasOwnProperty.call(weapons, id) &&
    weapons[id]?.id === id ? weapons[id] : null;
  const geometry = slosherDiagonalProposal(actual, s.hasBuildKind ? s.nativeKind : hud._L?.kind);
  if (!geometry || !hud.ret) { release(s); return; }
  if (s.ret === hud.ret && s.overlay?.parentNode === hud.ret) return;
  release(s); s.ret = hud.ret;
  for (const element of hud.ret.children) {
    if (!element.classList.contains('iw-ret__tick')) continue;
    s.hidden.push({ element, value: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display') });
    element.style.setProperty('display', 'none');
  }
  hud.ret.insertAdjacentHTML('beforeend', geometry.svg); s.overlay = hud.ret.lastElementChild;
}
export function installEvidenceSlosherDiagonal(HUD, weapons) {
  const proto = HUD?.prototype;
  if (!proto || !weapons || Object.prototype.hasOwnProperty.call(proto, INSTALLED)) return;
  const build = proto._buildReticle, updateCrosshair = proto._updCrosshair;
  if (typeof build !== 'function' || typeof updateCrosshair !== 'function') throw new TypeError('Native HUD reticle methods required');
  Object.defineProperty(proto, INSTALLED, { value: true });
  proto._buildReticle = function (...args) {
    const result = build.apply(this, args); update(this, weapons, args[0], true); return result;
  };
  proto._updCrosshair = function (...args) {
    const result = updateCrosshair.apply(this, args); update(this, weapons); return result;
  };
}
