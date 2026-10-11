// Per-weapon and per-family pose layers for the catalogue main weapons. Runs
// after the native and patched weapon pose (outermost _poseWeapon wrapper), so
// a layer adds offsets to the final weapon anchor / torso channels for the
// current state. Layers read gameplay (runner/actor) state only; they never
// write runner clocks, ink, hit or projectile state.
import { weaponModelSpec, weaponFamilyPose, weaponFamilyTrigger } from './weapon-models/registry.mjs';
const INSTALLED = Symbol.for('inkwave.s3.weapon-family-motion.v1');
export function installWeaponFamilyMotion({ Character }) {
  const P = Character?.prototype;
  if (!P?._poseWeapon) throw Error('Weapon family motion requires the native Character');
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const pose = P._poseWeapon, trigger = P.trigger;
  // A family/weapon one-shot handler may replace the native one-shot it maps
  // to (Roller flick for Brushes, Shooter recoil for Splatanas …). Source
  // motion still hears every trigger.
  P.trigger = function (name, arg) {
    const id = this.weaponModel;
    if (id && this.s3WeaponFamilyMotionEnabled !== false) {
      const spec = weaponModelSpec(id), family = weaponFamilyTrigger(id);
      if (spec?.trigger?.(this, name, arg) === true || family?.(this, name, arg) === true) {
        this.sourceMotion?.trigger?.(name, arg); return;
      }
    }
    return trigger.call(this, name, arg);
  };
  P._poseWeapon = function (dt, s) {
    const result = pose.call(this, dt, s);
    const id = this.weaponModel;
    if (!id || this.s3WeaponFamilyMotionEnabled === false || !this.weapon) return result;
    const family = weaponFamilyPose(id), spec = weaponModelSpec(id);
    if (family) family(this, dt, s);
    if (spec?.pose) spec.pose(this, dt, s);
    return result;
  };
}
