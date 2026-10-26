// LOCAL next-candidate draft, now hooked by this overlay's candidate compiler
// only. Not published; browser/retail validation is pending. Suppression is intentionally
// incomplete: no radius calibration, Pencil arcs, gauge/lifecycle or projection changes.
export const css = `.iw-ret--charger[data-charger-shape="bamboo"] .iw-ret__line,
.iw-ret--charger[data-charger-shape="bamboo"] .iw-ret__notch,
.iw-ret--charger[data-charger-shape="pencil"] .iw-ret__line,
.iw-ret--charger[data-charger-shape="pencil"] .iw-ret__notch { display: none; }`;
export function selectDraftShape(ret, kind, weaponId, registry) {
 // className assignment does not clear dataset. Always clear stale decoration,
 // including unsupported or unregistered identities and non-Charger rebuilds.
 delete ret.dataset.chargerShape;
 if (kind !== 'charger' || typeof weaponId !== 'string' || !registry || !Object.hasOwn(registry, weaponId)) return '';
 const weapon = registry[weaponId];
 const isNativeTargetCharger = w => w?.kind === 'catalog' && w.behaviorKind === 'charger' && w.modelKind === 'charger';
 if (weapon?.id !== weaponId || !isNativeTargetCharger(weapon)) return '';
 const baseId = weapon.variantOf || weaponId;
 const shape = baseId === 's3-charger-light' ? 'bamboo' : baseId === 's3-charger-pencil' ? 'pencil' : '';
 if (!shape || !Object.hasOwn(registry, baseId) || registry[baseId]?.id !== baseId || !isNativeTargetCharger(registry[baseId])) return '';
 if (weaponId !== baseId && weapon.variantOf !== baseId) return '';
 ret.dataset.chargerShape = shape;
 return shape;
}
const installations = new WeakMap();
export function installDraftChargerDecoration(HUD, registry) {
 const proto = HUD.prototype;
 if (installations.has(proto)) return installations.get(proto).uninstall;
 const native = proto._buildReticle;
 if (typeof native !== 'function') throw new TypeError('Native Charger builder required');
 const wrapped = function(kind, ...args) {
  const result = native.call(this, kind, ...args);
  selectDraftShape(this.ret, kind, this._L?.weapon, registry);
  return result;
 };
 proto._buildReticle = wrapped;
 const uninstall = () => {
  if (proto._buildReticle !== wrapped) return false;
  proto._buildReticle = native;
  installations.delete(proto);
  return true;
 };
 installations.set(proto, {uninstall});
 return uninstall;
}
