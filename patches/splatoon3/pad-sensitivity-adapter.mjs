// Build-only right-stick sensitivity migration. Keep locked native sources unchanged.
export function adaptPadSensitivity(rel, code, replaceOnce) {
  // Keep the legacy locked config anchor: reliability/controls-adapter.mjs
  // must first inject padInvertX. The first-boot migration maps default 1x to S3 0.
  if (rel === 'src/ui/menus.js') return replaceOnce(
    code,
    "{ key: 'padSensitivity', label: 'Controller sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'Camera turn speed with the right stick.' },",
    "{ key: 'padSensitivity', label: 'Controller sensitivity', type: 'slider', min: -5, max: 5, step: 0.5, fmt: sgnFmt, help: 'S3 right-stick settings −5 to +5; turn-speed mapping is an INKWAVE approximation pending verified measurements.' },",
    'S3 right-stick setting UI');
  if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '      const ps = s.padSensitivity ?? 1;', '      const ps = s3PadMultiplier(s.padSensitivity);', 'S3 pad look multiplier');
    return "import { s3PadMultiplier } from '../../patches/splatoon3/runtime/pad-sensitivity.mjs';\n" + code;
  }
  if (rel === 'src/main.js') {
    code = replaceOnce(code,
      "    this.profile = loadJSON('inkwave.profile', DEFAULT_PROFILE);",
      "" +
      "    if (this.settings.padSensitivityScale !== 's3') {\n" +
      "      this.settings.padSensitivity = legacyPadToS3(this.settings.padSensitivity);\n" +
      "      this.settings.padSensitivityScale = 's3';\n" +
      "      saveJSON('inkwave.settings', this.settings);\n" +
      "    }\n    this.profile = loadJSON('inkwave.profile', DEFAULT_PROFILE);",
      'migrate persisted legacy pad gain once');
    return "import { legacyPadToS3 } from '../patches/splatoon3/runtime/pad-sensitivity.mjs';\n" + code;
  }
  return code;
}
