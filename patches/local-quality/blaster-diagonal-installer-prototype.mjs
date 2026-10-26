// LOCAL f6 next-candidate installer; original evidence/public source unchanged.
// Not published; exact same-node radius13/restoration needs actual capture.
import { blasterDiagonalProposal } from './blaster-diagonal-proposal.mjs';
const INSTALLED = Symbol('evidenceBlasterDiagonalInstalled');
const STATE = Symbol('evidenceBlasterDiagonalState');
const tag = element => String(element?.tagName || '').toLowerCase();
function nativeParts(ret) {
  const svgs = [...ret.children].filter(n => tag(n) === 'svg' && n.classList.contains('iw-ret__svg'));
  if (svgs.length !== 1) return null;
  const rings = [...svgs[0].querySelectorAll('.iw-ret__ring')];
  const outer = rings.filter(n => tag(n) === 'circle' && !n.classList.contains('thin') && n.getAttribute('r') === '23');
  const inner = rings.filter(n => tag(n) === 'circle' && n.classList.contains('thin') && n.getAttribute('r') === '9');
  return rings.length === 2 && outer.length === 1 && inner.length === 1
    ? { outer: outer[0], inner: inner[0] } : null;
}
function release(s) {
  s.overlay?.remove();
  if (s.outer) {
    if (s.display) s.outer.style.setProperty('display', s.display, s.priority);
    else s.outer.style.removeProperty('display');
  }
  if (s.inner) s.inner.setAttribute('r', s.radius);
  s.ret = null; s.overlay = null; s.outer = null; s.inner = null; s.radius = null;
}
function update(hud, weapons, nativeKind, rebuilt = false) {
  const s = hud[STATE] ||= { hasBuildKind: false, nativeKind: null, ret: null, outer: null, inner: null, radius: null, overlay: null };
  if (rebuilt) { release(s); s.hasBuildKind = true; s.nativeKind = nativeKind; }
  const id = hud._L?.weapon;
  const actual = typeof id === 'string' && Object.prototype.hasOwnProperty.call(weapons, id) ? weapons[id] : null;
  const geometry = actual?.id === id
    ? blasterDiagonalProposal(actual, s.hasBuildKind ? s.nativeKind : hud._L?.kind) : null;
  const ret = hud.ret;
  if (!geometry || !ret) { release(s); return; }
  if (s.ret === ret && s.overlay?.parentNode === ret && ret.contains(s.outer) && ret.contains(s.inner)) return;
  release(s);
  const parts = nativeParts(ret);
  if (!parts) return; // Unexpected native structure stays fully native.
  const { outer, inner } = parts;
  s.ret = ret; s.outer = outer; s.inner = inner; s.radius = inner.getAttribute('r');
  s.display = outer.style.getPropertyValue('display'); s.priority = outer.style.getPropertyPriority('display');
  outer.style.setProperty('display', 'none');
  inner.setAttribute('r', geometry.innerRadius);
  ret.insertAdjacentHTML('beforeend', geometry.svg); s.overlay = ret.lastElementChild;
}
export function installEvidenceBlasterDiagonal(HUD, weapons) {
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
