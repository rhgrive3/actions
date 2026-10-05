// Gyro axis regression: a physically simulated device is turned about the player's vertical axis (yaw) and about the
// screen's horizontal axis (pitch) in every screen orientation, and the composed production Gyro (real gyro.js, real
// device.js, local-quality installer, permission + lifecycle) must report yaw only / pitch only with the right sign.
//
// Device attitude → W3C deviceorientation (R = Rz(α)·Rx(β)·Ry(γ)) and devicemotion.rotationRate (device-frame deg/s,
// alpha = z, beta = x, gamma = y) are generated from the same rotation, so both the attitude path and the rotationRate
// handoff are covered. Screen environments reproduce what each browser reports:
//   - iPadOS Safari (desktop-class, Macintosh UA, no window.orientation): WebKit's iPad natural orientation is
//     landscape-primary, so screen.orientation.angle is landscape-primary 0 / portrait-primary 90 /
//     landscape-secondary 180 / portrait-secondary 270 while the CoreMotion axes stay in the portrait frame.
//   - iPad / iPhone with the legacy window.orientation (0 / 90 / -90 / 180).
//   - Android portrait-natural phone and landscape-natural tablet (screen.orientation.angle only, sensor frame = natural).
// This is logic-only evidence; it is not a measurement on a physical iPad.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { sensorScreenAngle, appleMotionFrame } from '../screen-angle.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, read('inkwave-public/' + rel)))));
const D = Math.PI / 180;
const dev_apple = (d) => !!d.apple;

// ---- 3×3 rotation helpers (row-major arrays)
const mul = (A, B) => A.map((r, i) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const tr = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
const apply = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
// earth: x east, y north, z up. The player faces north; the device's sensor-frame "upright" pose has x east, y up and
// its screen (z) facing the player (south). psi rotates the body counter-clockwise (seen from the player) into the
// physical pose of a screen orientation; the screen is then tilted back by 40° like a handheld held for play.
const UPRIGHT = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
const pose = (psi) => mul(rx(-40 * D), mul(UPRIGHT, rz(psi * D)));
function euler(R) {
  const beta = Math.asin(Math.max(-1, Math.min(1, R[2][1])));
  return { alpha: Math.atan2(-R[0][1], R[1][1]) / D, beta: beta / D, gamma: Math.atan2(-R[2][0], R[2][2]) / D };
}

// ---- screen environments: [name, base env, orientations: [type, legacy window.orientation | undefined, screen angle, body psi]]
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const PORTRAIT_FRAME = { 'portrait-primary': 0, 'landscape-primary': 90, 'portrait-secondary': 180, 'landscape-secondary': 270 };
const IPAD_WEBKIT_ANGLE = { 'landscape-primary': 0, 'portrait-primary': 90, 'landscape-secondary': 180, 'portrait-secondary': 270 };
const LEGACY = { 'portrait-primary': 0, 'landscape-primary': 90, 'portrait-secondary': 180, 'landscape-secondary': -90 };
const TYPES = ['landscape-primary', 'landscape-secondary', 'portrait-primary', 'portrait-secondary'];
const DEVICES = [
  ['iPadOS Safari desktop-class (no window.orientation)', { ua: IPAD_UA, touch: 5, apple: true }, TYPES.map((t) => [t, undefined, IPAD_WEBKIT_ANGLE[t], PORTRAIT_FRAME[t]])],
  ['iPad Home Screen / legacy window.orientation', { ua: IPAD_UA, touch: 5, apple: true }, TYPES.map((t) => [t, LEGACY[t], IPAD_WEBKIT_ANGLE[t], PORTRAIT_FRAME[t]])],
  ['iPhone Safari', { ua: IPHONE_UA, touch: 5, apple: true }, TYPES.map((t) => [t, LEGACY[t], PORTRAIT_FRAME[t], PORTRAIT_FRAME[t]])],
  ['Android portrait-natural phone (screen.orientation only)', { ua: ANDROID_UA, touch: 5 }, TYPES.map((t) => [t, undefined, PORTRAIT_FRAME[t], PORTRAIT_FRAME[t]])],
  ['Android landscape-natural tablet (screen.orientation only)', { ua: ANDROID_UA, touch: 5 }, [['landscape-primary', undefined, 0, 0], ['landscape-secondary', undefined, 180, 180]]],
];

async function loadGyro(dev) {
  const env = {
    console, setTimeout, clearTimeout, isSecureContext: true,
    performance: { now: () => env.__now },
    navigator: { userAgent: dev.ua, maxTouchPoints: dev.touch },
    screen: { width: 1024, height: 1366, orientation: { type: 'portrait-primary', angle: 0 } },
    innerWidth: 1024, innerHeight: 1366,
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, removeEventListener() {},
    __now: 0,
  };
  const DOE = function DeviceOrientationEvent() {}, DME = function DeviceMotionEvent() {};
  if (dev.apple) { DOE.requestPermission = async () => 'granted'; DME.requestPermission = async () => 'granted'; }
  env.DeviceOrientationEvent = DOE; env.DeviceMotionEvent = DME;
  const context = vm.createContext(env);
  context.window = context; context.globalThis = context;
  const mod = (rel, source) => new vm.SourceTextModule(source, { context, identifier: rel });
  const entry = mod('src/core/gyro.js', compose('src/core/gyro.js'));
  await entry.link(async (spec) => {
    if (spec === './device.js') return mod('src/core/device.js', read('inkwave-public/src/core/device.js'));
    const local = spec.replace('../../patches/local-quality/', 'patches/local-quality/').replace(/^\.\//, 'patches/local-quality/');
    if (local.startsWith('patches/local-quality/')) return mod(local, read(local));
    throw new Error('unexpected import ' + spec);
  });
  await entry.evaluate();
  return { env, Gyro: entry.namespace.Gyro };
}

function setScreen(env, [type, legacy, angle]) {
  if (legacy === undefined) delete env.orientation; else env.orientation = legacy;
  env.screen.orientation = { type, angle };
}

const rot = ([x, y, z], t) => {   // Rodrigues: rotation by t about the unit axis (x, y, z)
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [[c + x * x * k, x * y * k - z * s, x * z * k + y * s], [y * x * k + z * s, c + y * y * k, y * z * k - x * s], [z * x * k - y * s, z * y * k + x * s, c + z * z * k]];
};
// One physical device: its attitude R, and the screen's horizontal (screen-right) axis in its body frame.
const device = (psi) => { const R = pose(psi); return { R, right: apply(tr(R), [1, 0, 0]) }; };
// Turn for `n` samples at `rate` rad/s: 'yaw' about the earth vertical (the player turning), 'pitch' about the
// screen's horizontal axis (top edge toward / away from the player). Returns the accumulated look delta.
function turn(env, g, dev, axis, rate, n, motion = true) {
  let yaw = 0, pitch = 0;
  for (let i = 1; i <= n; i++) {
    env.__now += 1000 / 60;
    const step = rate / 60;
    dev.R = axis === 'yaw' ? mul(rz(step), dev.R) : mul(dev.R, rot(dev.right, step));
    if (motion) {
      const w = axis === 'yaw' ? apply(tr(dev.R), [0, 0, rate]) : dev.right.map((v) => v * rate);
      g._motion({ timeStamp: env.__now, rotationRate: { alpha: w[2] / D, beta: w[0] / D, gamma: w[1] / D } });
    }
    g._orientation({ timeStamp: env.__now, ...euler(dev.R) });
    const d = g.consume({}); yaw += d.yaw; pitch += d.pitch;
  }
  return { yaw, pitch };
}

test('sensor-frame screen angle: Apple uses the portrait CoreMotion frame, Android keeps screen.orientation.angle', () => {
  const ipad = { navigator: { userAgent: IPAD_UA, maxTouchPoints: 5 } };
  assert.equal(appleMotionFrame(ipad), true);
  assert.equal(appleMotionFrame({ navigator: { userAgent: IPAD_UA, maxTouchPoints: 0 } }), false, 'a real Mac is not an iPad');
  for (const t of TYPES) {
    assert.equal(sensorScreenAngle({ ...ipad, screen: { orientation: { type: t, angle: IPAD_WEBKIT_ANGLE[t] } } }), PORTRAIT_FRAME[t], 'iPad ' + t);
    assert.equal(sensorScreenAngle({ ...ipad, orientation: LEGACY[t], screen: { orientation: { type: t, angle: IPAD_WEBKIT_ANGLE[t] } } }), PORTRAIT_FRAME[t], 'iPad legacy ' + t);
    assert.equal(sensorScreenAngle({ navigator: { userAgent: ANDROID_UA }, screen: { orientation: { type: t, angle: PORTRAIT_FRAME[t] } } }), PORTRAIT_FRAME[t], 'Android ' + t);
  }
  assert.equal(sensorScreenAngle({ navigator: { userAgent: ANDROID_UA }, screen: { orientation: { type: 'landscape-primary', angle: 0 } } }), 0, 'landscape-natural Android');
  assert.equal(sensorScreenAngle({ navigator: { userAgent: ANDROID_UA }, orientation: 90, screen: {} }), 90);
  assert.equal(sensorScreenAngle({ navigator: {}, screen: {} }, () => 270), 270, 'upstream fallback');
});

test('negative control: the upstream screenAngle crosses iPad landscape yaw into pitch', async () => {
  const { env } = await loadGyro({ ua: IPAD_UA, touch: 5, apple: true });
  setScreen(env, ['landscape-primary', undefined, 0]);
  const device = await new vm.SourceTextModule(read('inkwave-public/src/core/device.js'), { context: vm.createContext(env), identifier: 'device-control' });
  await device.link(async () => { throw new Error('no imports'); }); await device.evaluate();
  assert.equal(device.namespace.screenAngle(), 0, 'upstream reads WebKit\'s landscape-natural angle (sensor frame needs 90)');
  assert.equal(sensorScreenAngle(env, device.namespace.screenAngle), 90);
});

for (const [name, dev, orientations] of DEVICES) {
  const devProfile = dev;
  test(`${name}: device yaw → camera yaw only, device pitch → camera pitch only, signs preserved`, async () => {
    const { env, Gyro } = await loadGyro(devProfile);
    const g = new Gyro();
    if (g.needsPermission) assert.equal(await g.request(), true, 'permission granted after the tap');
    for (const o of orientations) {
      setScreen(env, o);
      for (const motion of [false, true]) {
        g.stop(); assert.equal(g.start(), true, 'gyro ON after OFF');
        const dev = device(o[3]);
        turn(env, g, dev, 'yaw', 0, 3, motion);   // settle on the pose
        // with rotationRate, a clear back-and-forth turn lets calibration hand the source over before each measure
        const handoff = () => { if (motion) { turn(env, g, dev, 'yaw', 1.6, 45, true); turn(env, g, dev, 'yaw', -1.6, 45, true); } };
        for (const sign of [1, -1]) {
          handoff();
          const label = `${o[0]} motion=${motion} src=${g._src}`;
          if (motion && dev_apple(devProfile)) assert.notEqual(g._src, 'ori', `${label}: rotationRate source handoff exercised`);
          const y = turn(env, g, dev, 'yaw', sign * 1.2, 24, motion);
          assert.ok(sign * y.yaw > 0.5, `${label}: turning ${sign > 0 ? 'left' : 'right'} turns the camera the same way (${y.yaw})`);
          assert.ok(Math.abs(y.pitch) < Math.abs(y.yaw) * 0.03, `${label}: yaw leaks into pitch (${y.pitch} vs ${y.yaw})`);
          handoff();
          const p = turn(env, g, dev, 'pitch', sign * 1.2, 24, motion);
          assert.ok(sign * p.pitch > 0.5, `${label}: top edge ${sign > 0 ? 'toward' : 'away from'} the player looks ${sign > 0 ? 'up' : 'down'} (${p.pitch})`);
          assert.ok(Math.abs(p.yaw) < Math.abs(p.pitch) * 0.03, `${label}: pitch leaks into yaw (${p.yaw} vs ${p.pitch})`);
          turn(env, g, dev, 'pitch', -sign * 1.2, 24, motion);   // back to the play pose
          g.resync();   // recenter / pause boundary
        }
      }
    }
    g.stop();
  });
}
