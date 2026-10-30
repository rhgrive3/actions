// Runs after the existing gameplay/native adapters. Original inputs remain locked.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0)
    throw new Error(`Turf intro camera conflict (${label}): expected one connection`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptTurfIntroCamera(rel, code) {
  if (rel === 'src/main.js') {
    code = "import { beginTurfIntro } from '../patches/splatoon3/runtime/turf-intro-camera.mjs';\n" + code;
    const start = code.indexOf('  _intro() {'), end = code.indexOf('\n  pause() {', start);
    if (start < 0 || end < 0 || code.indexOf('  _intro() {', start + 1) >= 0)
      throw new Error('Turf intro camera conflict (Game intro method)');
    const previous = code.slice(start, end);
    if (!previous.includes('beginIntroPresentation(this, m, [[1.7, \'ready\'], [3, \'show\']])') || !previous.includes('nativeBasis'))
      throw new Error('Turf intro camera conflict (composed native/clock intro)');
    code = once(code, previous, `  _intro() {
    if (this.match.boss) { this._bossIntro(this.match.boss); return; }
    beginTurfIntro(this, G, THREE);
  }
`, 'turf intro');
  } else if (rel === 'src/game/cameraRig.js') {
    if (!code.includes('    recordAimPose(this);')) throw new Error('Turf intro camera conflict (simulation aim owner)');
    code = "import { updateTurfIntroCamera } from '../../patches/splatoon3/runtime/turf-intro-camera.mjs';\n" + code;
    code = once(code, '  update(dt) {', '  update(dt) {\n    if (updateTurfIntroCamera(this, G, THREE, recordAimPose)) return;', 'CameraRig update');
  } else if (rel === 'src/game/match.js') {
    code = "import { TURF_INTRO_FRAMES } from '../../patches/splatoon3/runtime/turf-intro-camera.mjs';\n" + code;
    code = once(code, "    this.state = 'init';", "    this.turfIntroFrames = TURF_INTRO_FRAMES.go;\n    this.state = 'init';", 'intro frame budget');
    code = once(code, 'if (this.stateT > (this.bossMode ? this.bossCfg.intro : 4.2))',
      'if (this.bossMode ? this.stateT > this.bossCfg.intro : this.stateT + 1e-9 >= TURF_INTRO_FRAMES.go / 60)', 'match duration');
  } else if (rel === 'src/ui/hud.js') {
    // The old full-screen VS card hides both portrait shots. Boss retains its card.
    code = once(code, '  _lineup(match) {', `  _lineup(match) {
    if (!this.boss.on) { this.overLayer.querySelectorAll('.iw-lineup').forEach(e => e.remove()); return; }`, 'portrait visibility');
  }
  return code;
}
