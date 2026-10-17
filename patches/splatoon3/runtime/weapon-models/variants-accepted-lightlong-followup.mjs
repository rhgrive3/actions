// Reuse the accepted manual finishes without changing model geometry or palette.
import { VARIANT_MODELS } from './shooter-blaster-variants.mjs';
export const FOLLOWUP_MODELS = Object.freeze({
  Blaster_LightLong_01: VARIANT_MODELS.Blaster_LightLong_01,
  // WNT-R retains its existing fixed-color nozzle and zero visible owner-ink faces.
  Blaster_LightLong_02: VARIANT_MODELS.Blaster_LightLong_02,
});
