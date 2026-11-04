// Owner-recorded original SFX (supplied 2026-11-04). Applied at the end of the
// composition so every anchor below is the final composed text.
//  - UI hover / press / decide / back, the time-up whistle, special gauge full,
//    team wipeout, the Splat Bomb pre-explosion sound, Clam Blitz pickup and
//    the swim loop play the owner's
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
  if (rel === 'src/game/weapons.js') {
    // The recorded pre-explosion sound replaces the landing beep and the fuse
    // beeps of this bomb; until it is decoded the beeps stay.
    code = replaceOnce(code,
      "G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 }); emit('bomb:arm'",
      "b.s3FuseSfx = G.audio?.startOwnerBombFuse?.(b.pos, b.fuse) || null; if (!b.s3FuseSfx) G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 }); emit('bomb:arm'",
      'owner SFX: bomb fuse start');
    code = replaceOnce(code,
      "if (G.camera.position.distanceToSquared(b.pos) < 30 * 30) G.audio?.play('bomb_beep'",
      "if (!b.s3FuseSfx && G.camera.position.distanceToSquared(b.pos) < 30 * 30) G.audio?.play('bomb_beep'",
      'owner SFX: no fuse beeps under the recording');
    code = replaceOnce(code,
      "  _releaseBomb(b) {\n    if (!b?.mesh || b._released) return;\n",
      "  _releaseBomb(b) {\n    if (b?.s3FuseSfx) { b.s3FuseSfx.stop(0.03); b.s3FuseSfx = null; }\n    if (!b?.mesh || b._released) return;\n",
      'owner SFX: bomb fuse ends with the bomb');
    return code;
  }
  return code;
}
