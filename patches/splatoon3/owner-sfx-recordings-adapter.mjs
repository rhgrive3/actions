// Owner-recorded original SFX (supplied 2026-11-04). Applied at the end of the
// composition so every anchor below is the final composed text.
//  - UI hover / press / decide / back, the time-up whistle, special gauge full,
//    team wipeout, Clam Blitz pickup / throw and the swim loop play the owner's
//    recordings once decoded (runtime/audio/owner-sfx-recordings.mjs); the
//    synthesized definitions remain the fallback.
const IMPORT = "import { installOwnerSfxRecordings } from '../../patches/splatoon3/runtime/audio/owner-sfx-recordings.mjs';\n";
export function adaptOwnerSfxRecordings(rel, code, replaceOnce) {
  if (rel === 'src/audio/audio.js') {
    if (code.includes(IMPORT)) throw new Error('INKWAVE owner SFX recordings: repeated audio.js transform');
    return IMPORT + code + '\ninstallOwnerSfxRecordings(AudioEngine, SFX);\n';
  }
  if (rel === 'src/main.js') {
    // The recorded special-ready cue belongs to the local gauge-full event only;
    // HUD streak callouts and menus keep reusing the synthesized special_ready.
    return replaceOnce(code,
      "      if (actor.isLocal && !this.match?.attract) { G.audio?.play('special_ready'); }",
      "      if (actor.isLocal && !this.match?.attract) { G.audio?.play('special_charged'); }",
      'owner SFX: special gauge full');
  }
  return code;
}
