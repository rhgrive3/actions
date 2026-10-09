// S3 right-stick setting bridge. Nintendo's -5..+5 UI scale is verified;
// the exact game gain curve has not been extracted. Preserve INKWAVE's
// 0-setting turn rate and use an explicit, reversible provisional transfer.
export const clampPadSetting = value => Math.max(-5, Math.min(5, Number.isFinite(+value) ? +value : 0));
export function s3PadMultiplier(value) {
  return 2 ** (clampPadSetting(value) / 5);
}
export function legacyPadToS3(value) {
  const gain = +value;
  return !Number.isFinite(gain) || gain <= 0 ? 0 : clampPadSetting(5 * Math.log2(gain));
}
