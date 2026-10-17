// Reuse the complete existing accepted manual specs without geometry or material changes.
import { VARIANT_MODELS as RANGED } from './variants-ranged-defense.mjs';
import { VARIANT_MODELS as SHOOTER } from './shooter-blaster-variants.mjs';
export const FOLLOWUP_MODELS = Object.freeze({
  Maneuver_Dual_01: RANGED.Maneuver_Dual_01,
  Maneuver_Dual_02: RANGED.Maneuver_Dual_02,
  Shooter_Long_02: SHOOTER.Shooter_Long_02,
});
