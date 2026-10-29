// #287: right-stick sensitivity -5..+5 through the production-composed PlayerController.
// What is pinned here is INKWAVE behaviour only: the S3 setting domain (21 half steps), the
// provisional 2^(s/5) gain, the #1012 sub-360 deg/s yaw bound, the legacy-setting migration and
// frame-rate independence of stick -> camera rotation. Nintendo's per-step turn rate is not
// public (Inkipedia Options gives only the -5..+5 domain), so no Nintendo deg/s value is asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { s3PadMultiplier, legacyPadToS3, boundedPadYawRate } from '../runtime/pad-sensitivity.mjs';

const f = await fixture({ productionComposition: true,
  extraExports: "export { Input } from './inkwave-public/src/core/input.js';" });
const STEPS = Array.from({ length: 21 }, (_, i) => -5 + i / 2);
const YAW_BASE = 3.6, PITCH_BASE = 2.4, YAW_BOUND = Math.PI * 2; // INKWAVE rad/s at setting 0; #1012 bound

// Hold the right stick at (x, y) for `hold` seconds, then release and let the look filter settle.
// `pitch0` keeps vertical traces inside the camera's [-1.05, 1.15] rad pitch clamp.
function run(setting, hz, { x = 1, y = 0, hold = 1, settle = 0.5, pitch0 = 0, legacyGain } = {}) {
  const a = f.make();
  f.G.actors = [a];
  f.G.settings = { ...f.DEFAULT_SETTINGS, padSensitivity: setting, padSensitivityScale: 's3', padLegacyGain: legacyGain, aimAssist: 0 };
  const cam = new f.THREE.PerspectiveCamera(60, 16 / 9, .1, 1000);
  cam.position.set(0, .95, -3); cam.lookAt(0, .95, 20); cam.updateMatrixWorld(); f.G.camera = cam;
  const rig = { yaw: 0, pitch: pitch0, mapK: 0 }; f.G.rig = rig;
  const pad = { axes: [0, 0, 0, 0], buttons: [], id: 'standard', mapping: 'standard', connected: true };
  const inp = { lastDevice: 'pad', pad, mobile: null, mouse: { dx: 0, dy: 0, left: false }, padPressed: new Set(),
    down: () => false, wasPressed: () => false, padButton: () => false, padValue: () => 0,
    padStick(ix, iy, out, dz, outer, expo) { return f.Input.prototype.padStick.call(inp, ix, iy, out, dz, outer, expo); } };
  const c = new f.PlayerController(a, rig, inp);
  c.computeAim = () => {};
  const frames = Math.round((hold + settle) * hz), held = Math.round(hold * hz), rows = [];
  for (let i = 0; i < frames; i++) {
    pad.axes[2] = i < held ? x : 0; pad.axes[3] = i < held ? y : 0;
    const before = { yaw: rig.yaw, pitch: rig.pitch };
    c.update(1 / hz);
    rows.push({ yaw: (before.yaw - rig.yaw) * hz, pitch: (before.pitch - rig.pitch) * hz });
  }
  return { yaw: -rig.yaw, pitch: pitch0 - rig.pitch, rows, held };
}

// The bounded upper interval is provisional, with all speeds through +4 unchanged.
test('#287 full-stick steady yaw follows the provisional S3 gain and stays below the #1012 bound', () => {
  let previous = 0;
  for (const s of STEPS) {
    const { rows, held } = run(s, 60);
    const steady = rows[held - 1].yaw;
    const want = boundedPadYawRate(s3PadMultiplier(s));
    assert.ok(Math.abs(steady - want) < 1e-6 * want, `setting ${s}: ${steady} vs ${want}`);
    assert.ok(steady < YAW_BOUND, `setting ${s}: ${steady * 180 / Math.PI} deg/s must stay below 360`);
    assert.ok(steady >= previous - 1e-12, `setting ${s}: yaw rate must not decrease`);
    previous = steady;
  }
  // Boundaries: -5 is half, 0 is the unchanged INKWAVE rate, +5 doubles before the bound.
  assert.ok(Math.abs(run(-5, 60).rows[59].yaw - YAW_BASE / 2) < 1e-6);
  assert.ok(Math.abs(run(0, 60).rows[59].yaw - YAW_BASE) < 1e-6);
});

test('#287 full-stick steady pitch scales with every half step (no bound applies to pitch)', () => {
  for (const s of STEPS) {
    const { rows, held } = run(s, 60, { x: 0, y: 1, hold: .4, pitch0: 1.1 });
    const want = PITCH_BASE * s3PadMultiplier(s);
    assert.ok(Math.abs(Math.abs(rows[held - 1].pitch) - want) < 1e-6 * want, `setting ${s}`);
  }
});

test('#287 one stick hold turns the same camera angle at 30 / 60 / 120 Hz', () => {
  const traces = [{ x: 1, y: 0 }, { x: .6, y: .3, hold: .4, pitch0: 1.1 }, { x: 0, y: -1, hold: .4, pitch0: -1 }, { x: .5, y: 0 }];
  for (const s of [-5, -2.5, 0, 2.5, 5]) for (const trace of traces) {
    const { x, y } = trace, ref = run(s, 60, trace), end = (trace.pitch0 || 0) - ref.pitch;
    if (y) assert.ok(Math.abs(ref.pitch) > .05 && end > -1.05 && end < 1.15, `setting ${s} (${x},${y}) pitch stays inside the clamp`);
    for (const hz of [30, 120]) {
      const got = run(s, hz, trace);
      assert.ok(Math.abs(got.yaw - ref.yaw) < 1e-9, `setting ${s} (${x},${y}) ${hz}Hz yaw ${got.yaw} vs ${ref.yaw}`);
      assert.ok(Math.abs(got.pitch - ref.pitch) < 1e-9, `setting ${s} (${x},${y}) ${hz}Hz pitch ${got.pitch} vs ${ref.pitch}`);
    }
  }
});

test('#287 legacy multipliers migrate to the S3 scale with the same turn response', () => {
  for (const legacy of [0.5, 0.75, 1, 1.5, 2]) {
    const migrated = legacyPadToS3(legacy);
    assert.ok(migrated >= -5 && migrated <= 5);
    const want = Math.min(YAW_BASE * legacy, YAW_BOUND - 1e-6);
    const { rows, held } = run(migrated, 60);
    assert.ok(Math.abs(rows[held - 1].yaw - want) < 1e-6 * want, `legacy ${legacy}x -> ${migrated}`);
  }
  assert.equal(legacyPadToS3(1), 0, 'legacy default 1x is S3 setting 0');
});

test('#287 all positive and negative high yaw settings are distinct and remain below one revolution per second', () => {
  for (const hz of [30, 60, 120]) for (const sign of [-1, 1]) {
    let previous = 0;
    for (const s of [4, 4.5, 5]) {
      const { rows, held } = run(s, hz, {x:sign});
      const rate = Math.abs(rows[held - 1].yaw);
      assert.ok(rate > previous, `${hz}Hz direction ${sign} setting ${s}`);
      assert.ok(rate < YAW_BOUND, `setting ${s} reaches 360 deg/s`);
      previous = rate;
    }
  }
});


test('#287 original gains drive actual controller pitch and bounded yaw after migration', () => {
  for (const gain of [.2, .3, .499, 2.001, 2.5, 3]) {
    const setting = legacyPadToS3(gain);
    const yaw = run(setting, 60, {legacyGain:gain});
    const pitch = run(setting, 60, {x:0, y:1, hold:.25, pitch0:1.1, legacyGain:gain});
    const expectedYaw = gain < .5 ? YAW_BASE * gain : YAW_BOUND - 1e-6;
    assert.ok(Math.abs(yaw.rows[yaw.held - 1].yaw - expectedYaw) < 1e-6);
    assert.ok(Math.abs(pitch.rows[pitch.held - 1].pitch - PITCH_BASE * gain) < .001);
  }
});

test('#287 yaw is unchanged through +4, including intermediate settings', () => {
  for (let s = -5; s <= 4; s += .125) {
    const gain = s3PadMultiplier(s);
    assert.equal(boundedPadYawRate(gain), 3.6 * gain);
  }
});
