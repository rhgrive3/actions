// Owner-recorded original SFX (supplied 2026-11-04). Applied at the end of the
// composition so every anchor below is the final composed text.
//  - UI hover / press / decide / back, the time-up whistle, special gauge full,
//    team wipeout, the Splat Bomb throw (release), Clam Blitz pickup and
//    the swim loop play the owner's
//    recordings once decoded (runtime/audio/owner-sfx-recordings.mjs); the
//    2026-11-07 set adds the title screen A press (+ a tone 0.3 s later), GO,
//    the judge's decision and the rolling loop. The upstream files stay untouched;
//    synthesized definitions remain the fallback. The Splat Bomb fuse keeps its
//    landing / fuse beeps (`bomb_beep`); the throw recording is not a fuse.
const IMPORT = "import { installOwnerSfxRecordings } from '../../patches/splatoon3/runtime/audio/owner-sfx-recordings.mjs';\n";
export function adaptOwnerSfxRecordings(rel, code, replaceOnce) {
  if (rel === 'src/audio/audio.js') {
    if (code.includes(IMPORT)) throw new Error('INKWAVE owner SFX recordings: repeated audio.js transform');
    return IMPORT + code + '\ninstallOwnerSfxRecordings(AudioEngine, SFX, audio);\n';
  }
  if (rel === 'src/main.js') {
    // The recorded special-ready cue belongs to the local gauge-full event only;
    // HUD streak callouts and menus keep reusing the synthesized special_ready.
    code = replaceOnce(code,
      "      if (actor.isLocal && !this.match?.attract) { G.audio?.play('special_ready'); }",
      "      if (actor.isLocal && !this.match?.attract) { G.audio?.play('special_charged'); }",
      'owner SFX: special gauge full');
    // Playback options (a delay on the audio clock) reach the engine.
    return replaceOnce(code,
      "      playSound: (n) => { G.audio?.init?.(); G.audio?.play(n); },",
      "      playSound: (n, o) => { G.audio?.init?.(); G.audio?.play(n, o); },",
      'owner SFX: playback options');
  }
  if (rel === 'src/ui/menus.js') {
    // Title screen: the A press (TitlePressA) replaces the synthesized confirm and the
    // single tone (N0010A10) follows 0.3 s later on the audio clock, with no second timer.
    // Owner request 2026-11-07: the synthesized splat accent no longer layers
    // over the two recordings. GO (go_horn) and judge_reveal need no call-site change.
    code = replaceOnce(code,
      "  _sfx(name, minGap = 0.03) {",
      "  _sfx(name, minGap = 0.03, opts) {",
      'owner SFX: optional playback options');
    code = replaceOnce(code,
      "    try { this.api.playSound && this.api.playSound(name); } catch (e) { /* audio is optional */ }",
      "    try { this.api.playSound && this.api.playSound(name, opts); } catch (e) { /* audio is optional */ }",
      'owner SFX: pass playback options to the engine');
    return replaceOnce(code,
      "    this._leavingTitle = true;\n    this._sfx('ui_confirm');\n    this._sfx('splat_small');",
      "    this._leavingTitle = true;\n    this._sfx('title_press');\n    this._sfx('title_follow', 0.03, { delay: 0.3 });",
      'owner SFX: title A press and follow-up tone');
  }
  return code;
}
