// S3 right-stick setting bridge. Nintendo's -5..+5 UI scale is verified;
// the exact game gain curve has not been extracted. Preserve INKWAVE's
// 0-setting turn rate and use an explicit, reversible provisional transfer.
export const clampPadSetting = value => Math.max(-5, Math.min(5, Number.isFinite(+value) ? +value : 0));
export function s3PadMultiplier(value, legacyGain) {
  // Preserve valid old extreme gains only at their migrated endpoint. Once the
  // user edits the slider, the profile owner clears the override.
  if (Number.isFinite(legacyGain) && ((legacyGain >= .2 && legacyGain < .5 && value === -5) ||
      (legacyGain > 2 && legacyGain <= 3 && value === 5))) return legacyGain;
  return 2 ** (clampPadSetting(value) / 5);
}
// Preserve the old yaw rate through setting +4. Compress only the small
// remaining interval into the existing strict one-revolution/second ceiling.
// This resolves duplicate settings; it is not a measured Nintendo curve.
export function boundedPadYawRate(gain) {
  const max = Math.PI * 2 - 1e-6;
  const start = 2 ** (4 / 5);
  if (gain <= start) return Math.min(3.6 * gain, max);
  return 3.6 * start + (max - 3.6 * start) * Math.min(1, (gain - start) / (2 - start));
}
export function legacyPadToS3(value) {
  const gain = +value;
  return !Number.isFinite(gain) || gain <= 0 ? 0 : clampPadSetting(5 * Math.log2(gain));
}
