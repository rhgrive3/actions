// #678: world yaw must resolve against the FULL gravity axis.
//
// The W3C DeviceOrientation earth frame is Z-up — the module's own downInDevice
// returns earth down (0,0,-1) — so world yaw is the complete projection of
// screen-space ω onto earth-down rotated into screen space. The shipped formula
// normalized by all three gravity components but projected only (gy·py + gz·pz),
// dropping the screen-x term gx·px. Whenever gravity has a screen-x component —
// every rolled or landscape pose — that term cancels or destroys genuine world yaw,
// and pure roll is reported as yaw.
//
// The correction is applied by the fail-closed build adapter
// (patches/local-quality/adapter.mjs, the same adapter that injects
// installGyroQuality) so the published upstream source stays byte-locked. These
// tests load the module through that real build path and compare the projection it
// actually emits against world-space quaternion ground truth.
//
// NOTE on what this does and does not prove: the downstream
// `min(|worldYaw| * 1.41, yawAxes)` roll-relax is a separate, pre-existing guard
// that caps the FINAL emitted yaw. This fix corrects the projection term only.
// See the report's limitations for that remaining architectural concern.
//
// Logic fixtures only: no physical sensor, phone, tablet or Switch is involved.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { gyroSource } from './gyro-fixture.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const D2R = Math.PI / 180;

// Load the BUILT src/core/gyro.js (splatatoon3 + touch + reliability + local-quality
// adapters, exactly as the build composes them) with a screen angle we control.
async function loadAdapted(screenAngleDeg) {
  const rel = 'src/core/gyro.js';
  // gyroSource applies the whole preceding chain (splatoon3, touch layout,
  // reliability and the permission overlay), then adaptQualitySource applies the
  // #678 projection correction exactly as the build does. The overlay import/call
  // that same stage adds is stripped here: it is orthogonal (permission, dropout,
  // resync and sensor trust) and gates _orientation behind `enabled`, whereas the
  // projection under test is upstream code. The adapter itself is verified
  // separately below.
  const code = adaptQualitySource(rel, gyroSource(rel))
    .replace(/^import \{ installGyroQuality \}.*$/gm, '')
    .replace(/^\ninstallGyroQuality\(Gyro, screenAngle\);\n$/m, '');
  assert.ok(!code.includes('installGyroQuality'), 'overlay import must be stripped');
  assert.ok(code.includes('-(gx * px + gy * py + gz * pz) / gl'), 'correction must still be applied');
  const context = vm.createContext({
    console, performance: { now: () => 1000 }, window: undefined, navigator: { userAgent: 'test' },
  });
  const device = new vm.SourceTextModule(
    `export const touchPrimary=false,touchCapable=false; export const screenAngle=()=>${screenAngleDeg};`,
    { context, identifier: 'device.js' });
  const gyro = new vm.SourceTextModule(code, { context, identifier: 'gyro.js' });
  await gyro.link(spec => { assert.equal(spec, './device.js'); return device; });
  await gyro.evaluate();
  return gyro.namespace;
}

// --- ground truth, independent of the shipped formula -------------------------
function quatFromEuler(a, b, g) {           // R = Rz(alpha)·Rx(beta)·Ry(gamma), device -> earth
  const ha = a * D2R * .5, hb = b * D2R * .5, hg = g * D2R * .5;
  const ca = Math.cos(ha), sa = Math.sin(ha), cb = Math.cos(hb), sb = Math.sin(hb), cg = Math.cos(hg), sg = Math.sin(hg);
  const x1 = ca * sb, y1 = sa * sb, z1 = sa * cb, w1 = ca * cb;
  return [x1 * cg - z1 * sg, w1 * sg + y1 * cg, x1 * sg + z1 * cg, w1 * cg - y1 * sg];
}
function relQuat(p, q) {
  const px = -p[0], py = -p[1], pz = -p[2], pw = p[3];
  const [qx, qy, qz, qw] = q;
  return [pw*qx+px*qw+py*qz-pz*qy, pw*qy-px*qz+py*qw+pz*qx,
          pw*qz+px*qy-py*qx+pz*qw, pw*qw-px*qx-py*qy-pz*qz];
}
function rotate(q, v) {
  const [x,y,z,w] = q, [vx,vy,vz] = v;
  const tx = 2*(y*vz - z*vy), ty = 2*(z*vx - x*vz), tz = 2*(x*vy - y*vx);
  return [vx + w*tx + (y*tz - z*ty), vy + w*ty + (z*tx - x*tz), vz + w*tz + (x*ty - y*tx)];
}
function truthYaw(eulerA, eulerB, dt) {
  const p = quatFromEuler(...eulerA), q = quatFromEuler(...eulerB);
  let [x, y, z, w] = relQuat(p, q);
  if (w < 0) { x=-x; y=-y; z=-z; w=-w; }
  const s = Math.hypot(x, y, z);
  if (s <= 1e-12) return 0;
  const k = 2 * Math.atan2(s, w) / s / dt;
  return rotate(p, [x*k, y*k, z*k])[2];        // earth +Z (vertical)
}
function deviceOmega(eulerA, eulerB, dt) {
  const p = quatFromEuler(...eulerA), q = quatFromEuler(...eulerB);
  let [x, y, z, w] = relQuat(p, q);
  if (w < 0) { x=-x; y=-y; z=-z; w=-w; }
  const s = Math.hypot(x, y, z);
  if (s <= 1e-12) return [0, 0, 0];
  const k = 2 * Math.atan2(s, w) / s / dt;
  return [x*k, y*k, z*k];
}

// Recover the exact worldYaw the ADAPTED module projected. _sample is invoked
// directly with the same ω and the emitted dYaw divided back out by gain.
const DT = 1 / 60;
function projectedYaw(ns, screen, pose) {
  const g = new ns.Gyro();
  g.configure({ sens: 0 });
  const w = deviceOmega(pose.a, pose.b, DT);
  g._orientation({ alpha: pose.a[0], beta: pose.a[1], gamma: pose.a[2], timeStamp: 1000 });
  const gain = 360 / ns.gyroTurnDeg(0);
  const before = g.dYaw;
  g._sample(w[0], w[1], w[2], DT);
  return (g.dYaw - before) / (DT * gain);
}

// The worldYaw term the module projected, plus what the old formula would have
// produced for the same pose. Both are replayed from the module's own screen/down
// vectors, then passed through the module's own downstream roll-relax guard, so
// the expected EMITTED yaw can be computed for either formula.
function project(ns, screen, pose) {
  const g = new ns.Gyro();
  g.configure({ sens: 0 });
  g._orientation({ alpha: pose.a[0], beta: pose.a[1], gamma: pose.a[2], timeStamp: 1000 });
  const w = deviceOmega(pose.a, pose.b, DT);
  const th = screen * D2R, c = Math.cos(th), s = Math.sin(th);
  const px = w[0]*c - w[1]*s, py = w[0]*s + w[1]*c, pz = w[2];
  const d = g._down;
  const gx = d[0]*c - d[1]*s, gy = d[0]*s + d[1]*c, gz = d[2];
  const gl = Math.hypot(gx, gy, gz) || 1;
  const oldWY = -(gy*py + gz*pz)/gl, correctedWY = -(gx*px + gy*py + gz*pz)/gl;
  const yawAxes = Math.hypot(py, pz);
  const relax = v => Math.sign(v) * Math.min(Math.abs(v) * 1.41, yawAxes);
  return { oldEmit: relax(oldWY), correctedEmit: relax(correctedWY),
           oldWY, correctedWY, gx, px, yawAxes, truth: truthYaw(pose.a, pose.b, DT) };
}

// Poses where the omitted screen-x term is OBSERVABLE in the projection, i.e.
// both the screen-x gravity component (gx) and the screen-x ω component (px) are
// non-zero. A pure gamma turn has px == 0 and cannot detect the defect, so these
// use alpha/beta turns on a rolled or near-vertical device across screen angles.
const POSES = [
  { name: 'portrait roll 80',          screen: 0,   a: [60, 0, 80],   b: [64, 0, 80] },
  { name: 'portrait roll 80 @180',     screen: 180, a: [60, 0, 80],   b: [64, 0, 80] },
  { name: 'landscape 90 upright roll', screen: 90,  a: [60, 80, 20],  b: [64, 80, 20] },
  { name: 'landscape 270 upright',     screen: 270, a: [60, 80, 80],  b: [64, 80, 80] },
  { name: 'landscape 90 roll 60',      screen: 90,  a: [60, 80, 60],  b: [64, 80, 60] },
  { name: 'landscape 90 no-roll 80',   screen: 90,  a: [0, 80, 80],   b: [4, 80, 80] },
];

test('corrected projection equals world-space quaternion ground truth (#678)', async () => {
  for (const pose of POSES) {
    const ns = await loadAdapted(pose.screen);
    const { correctedWY, truth } = project(ns, pose.screen, pose);
    assert.ok(Math.abs(correctedWY - truth) <= Math.abs(truth) * 1e-9 + 1e-12,
      `${pose.name}: corrected projection ${correctedWY} != truth ${truth}`);
  }
});

test('the emitted yaw of the real module matches the corrected projection (#678)', async () => {
  // Drives the ADAPTED module's _sample: fast turns bypass the smoothing tier, so
  // the emitted yaw is the projected value. Against the old formula these poses
  // emitted roughly a quarter of the correct rate.
  for (const pose of POSES) {
    const ns = await loadAdapted(pose.screen);
    const { correctedEmit, oldEmit } = project(ns, pose.screen, pose);
    const emitted = projectedYaw(ns, pose.screen, pose);
    assert.ok(Math.abs(emitted - correctedEmit) < 1e-9,
      `${pose.name}: emitted ${emitted}, expected corrected ${correctedEmit}`);
    assert.ok(Math.abs(emitted - oldEmit) > 1e-3,
      `${pose.name}: emitted ${emitted} is indistinguishable from the old value ${oldEmit}`);
  }
});

test('the omitted screen-x term was materially wrong in these poses (#678)', async () => {
  // Negative control: with gx*px dropped the same poses diverge from truth.
  let worst = 0;
  for (const pose of POSES) {
    const ns = await loadAdapted(pose.screen);
    const { oldWY, truth } = project(ns, pose.screen, pose);
    worst = Math.max(worst, Math.abs(oldWY - truth));
    assert.ok(Math.abs(oldWY - truth) > 1e-3,
      `${pose.name}: old projection unexpectedly matched truth (${oldWY} vs ${truth})`);
  }
  assert.ok(worst > 0.1, `expected a material old-formula error, got ${worst}`);
});

test('gravity really has a screen-x component in every tested pose (#678)', async () => {
  // Guards the premise: the omitted term must be observable in these poses.
  for (const pose of POSES) {
    const ns = await loadAdapted(pose.screen);
    const { gx } = project(ns, pose.screen, pose);
    assert.ok(Math.abs(gx) > 1e-3, `${pose.name}: screen-x gravity ${gx} is ~0`);
  }
});

test('the quality adapter is fail-closed and the published upstream stays byte-locked (#678)', async () => {
  const fs = await import('node:fs');
  const rel = 'src/core/gyro.js';
  const root = new URL('../../../', import.meta.url);
  const raw = fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
  // The correction lives in the build adapter, never in the published source.
  assert.equal(raw.includes('-(gx * px + gy * py + gz * pz) / gl'), false,
    'published upstream must not contain the correction');
  assert.equal(raw.includes('-(gy * py + gz * pz) / gl'), true,
    'published upstream must still be the original file');
  const once = adaptQualitySource(rel, raw);
  assert.notEqual(once, raw, 'the gyro module must be adapted');
  assert.equal(once.includes('-(gx * px + gy * py + gz * pz) / gl'), true, 'corrected projection present');
  assert.equal(once.includes('-(gy * py + gz * pz) / gl'), false, 'old projection must be gone');
  // fail-closed: the replacement must apply exactly once
  assert.throws(() => adaptQualitySource(rel, once), /conflict|expected exactly one/);
  assert.throws(() => adaptQualitySource(rel, ''), /conflict|expected exactly one/);
});

test('gyroTurnDeg sensitivity endpoints are untouched by this fix (#678)', async () => {
  // #725 (sensitivity span) is a separate hardware-measured concern, deliberately
  // not addressed here; this fix must not perturb the gain curve.
  const ns = await loadAdapted(0);
  assert.equal(ns.gyroTurnDeg(-5), 278);
  assert.equal(ns.gyroTurnDeg(-2.5), 178);
  assert.equal(ns.gyroTurnDeg(0), 132);
  assert.equal(ns.gyroTurnDeg(2.5), 119);
  assert.equal(ns.gyroTurnDeg(5), 110);
});
