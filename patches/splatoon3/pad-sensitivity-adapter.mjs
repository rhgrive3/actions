// Build-only right-stick sensitivity migration. Keep locked native sources unchanged.
export function adaptPadSensitivity(rel, code, replaceOnce) {
  // Keep the legacy locked config anchor: reliability/controls-adapter.mjs
  // must first inject padInvertX. The first-boot migration maps default 1x to S3 0.
  // The local-quality aim-profile owner composes the final controls rows.
  if (rel === 'src/ui/menus.js') return code;
  if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '      const ps = s.padSensitivity ?? 1;', '      const ps = s3PadMultiplier(s.padSensitivity);', 'S3 pad look multiplier');
    return "import { s3PadMultiplier } from '../../patches/splatoon3/runtime/pad-sensitivity.mjs';\n" + code;
  }
  if (rel === 'src/main.js') {
    code = replaceOnce(code,
      "    this.profile = loadJSON('inkwave.profile', DEFAULT_PROFILE);",
      "" +
      "    if (this.settings.padSensitivityScale !== 's3') {\n" +
      "      if (this.settings.aimProfiles) {\n" +
      "        for (const key of ['tv', 'handheld']) {\n" +
      "          const active = this.settings.aimProfiles[key];\n" +
      "          if (active) active.padSensitivity = legacyPadToS3(active.padSensitivity);\n" +
      "        }\n" +
      "      }\n" +
      "      this.settings.padSensitivity = this.settings.aimProfiles?.[this.settings.aimProfile]?.padSensitivity ?? legacyPadToS3(this.settings.padSensitivity);\n" +
      "      this.settings.padSensitivityScale = 's3';\n" +
      "      saveJSON('inkwave.settings', this.settings);\n" +
      "    }\n    this.profile = loadJSON('inkwave.profile', DEFAULT_PROFILE);",
      'migrate persisted legacy pad gain once');
    return "import { legacyPadToS3 } from '../patches/splatoon3/runtime/pad-sensitivity.mjs';\n" + code;
  }
  return code;
}
