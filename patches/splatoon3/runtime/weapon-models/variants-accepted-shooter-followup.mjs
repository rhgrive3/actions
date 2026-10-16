// Promote the GPU-accepted manual appearances without rebuilding or recoloring them.
import { VARIANT_MODELS } from './shooter-blaster-variants.mjs';
export const FOLLOWUP_MODELS = Object.freeze({
  Shooter_Expert_01: VARIANT_MODELS.Shooter_Expert_01,
  Shooter_QuickLong_01: VARIANT_MODELS.Shooter_QuickLong_01,
  // Preserve the existing fixed yellow nozzle, including zero visible owner-ink faces.
  Shooter_Long_01: VARIANT_MODELS.Shooter_Long_01,
});
