// #678 — DeviceMotion/DeviceOrientation axis conversion must be World Orientation (Splatoon 3's
// documented mapping), not the player-space construction.
//
// The previous source was a partial fix: it restored the missing `gx*px` term in the yaw projection
// but LEFT the player-space 1.41 magnitude borrow, the hypot(py, pz) cap, and `pitch = px`. Those
// are exactly the three defects, so this suite asserts the properties that partial fix violated.
//
// HOW THIS IS TESTED WITHOUT MIRRORING THE FORMULA
// Ground truth is built from the device ATTITUDE, independently of the mapping under test:
//   * a pose is a W3C DeviceOrientation Euler triple -> quaternion (R = Rz(a)Rx(b)Ry(g), device->earth,
//     Z-up earth frame, matching the module's own quatFromEuler);
//   * a world-frame angular velocity W is pushed into the device frame as w = R^T . W;
//   * device-frame earth-down is d = R^T . (0,0,-1), which is exactly the `_down` input the mapping reads.
// The suite then asserts physical properties of the mapping, never a restatement of it:
//   * a rotation purely about WORLD VERTICAL yields yaw = +Omega and pitch = 0, at ANY attitude;
//   * a rotation purely about WORLD HORIZONTAL yields yaw = 0 EXACTLY, at ANY attitude;
//   * a device roll about the gravity axis yields no camera motion at all.
// Those identities are consequences of world orientation alone, and the player-space code fails them.
//
// Filtered output is bypassed by using a large enough omega that `direct` saturates at 1 (sp >= 10
// deg/s) so no smoothing is applied and the raw mapped yaw/pitch are recoverable from dYaw/dPitch.
//
// Logic fixtures only: no browser, no real device, no Nintendo hardware.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || `${ROOT}inkwave-public`;
const REL = 'src/core/gyro.js';
const D2R = Math.PI / 180;
const DEG = 180 / Math.PI;

const rawUpstream = () => fs.readFileSync(`${UPSTREAM}/${REL}`, 'utf8');
// the exact chain scripts/build-inkwave.mjs applies
const adaptUpstream = () => adaptRange(REL, adaptNetworkSource(REL, adaptQualitySource(REL,
  adaptReliability(REL, adaptTouchLayout(REL, adaptSource(REL, rawUpstream()))))));
const adaptWithoutMapping = () => adaptRange(REL, adaptNetworkSource(REL,
  adaptReliability(REL, adaptTouchLayout(REL, adaptSource(REL, rawUpstream())))));
// the local-quality branch also appends the #633 permission overlay; it is orthogonal to this
// mapping, so it is stripped wherever a pure source-vs-source comparison is meant.
const stripOverlay = (s) => s.replace(/^import \{ installGyroQuality \}.*\n/m, '')
  .replace('\ninstallGyroQuality(Gyro, screenAngle);\n', '');

// ---- pose / ground-truth helpers (independent of the mapping under test) --------------------
const quatFromEuler = (a, b, g) => {
  const ha = a * D2R * 0.5, hb = b * D2R * 0.5, hg = g * D2R * 0.5;
  const ca = Math.cos(ha), sa = Math.sin(ha), cb = Math.cos(hb), sb = Math.sin(hb), cg = Math.cos(hg), sg = Math.sin(hg);
  const x1 = ca * sb, y1 = sa * sb, z1 = sa * cb, w1 = ca * cb;
  return [x1 * cg - z1 * sg, w1 * sg + y1 * cg, x1 * sg + z1 * cg, w1 * cg - y1 * sg];
};
/** rotate v by conj(q), i.e. the inverse of the device->earth rotation R. */
const byInv = (v, q) => {
  const [x, y, z, w] = q, ux = -x, uy = -y, uz = -z;
  const cx = uy * v[2] - uz * v[1], cy = uz * v[0] - ux * v[2], cz = ux * v[1] - uy * v[0];
  const dx = cx + w * v[0], dy = cy + w * v[1], dz = cz + w * v[2];
  return [v[0] + 2 * (uy * dz - uz * dy), v[1] + 2 * (uz * dx - ux * dz), v[2] + 2 * (ux * dy - uy * dx)];
};
/** A device pose: device-frame earth-down, and the inverse rotation R^T. */
const pose = (alpha, beta, gamma) => {
  const q = quatFromEuler(alpha, beta, gamma);
  return { q, down: byInv([0, 0, -1], q), toDevice: (W) => byInv(W, q) };
};
const FLAT = pose(0, 0, 0);            // screen faces up: gravity along device -z
const UPRIGHT = pose(0, 90, 0);        // standing portrait: gravity along device -y
const BANK45 = pose(0, 0, 45);         // rolled 45 deg about screen-up: gravity has a screen-x part
const BANK70 = pose(0, 0, 70);
const PITCHED = pose(0, 40, 20);       // tilted forward and rolled together

// ---- module loader --------------------------------------------------------------------------
const screen = { angle: 0 };
async function loadGyro({ adapted }) {
  let code = adapted ? adaptUpstream() : adaptWithoutMapping();
  // drop the local-quality overlay injection; it is orthogonal to the axis mapping under test
  code = stripOverlay(code);
  const context = vm.createContext({ console, Math, Object, Array, JSON, performance: { now: () => 0 } });
  const device = new vm.SourceTextModule(`export const screenAngle = () => ${screen.angle};`,
    { context, identifier: 'device.js' });
  await device.link(() => { throw new Error('device.js must be self-contained'); });
  await device.evaluate();
  const mod = new vm.SourceTextModule(code, { context, identifier: REL });
  await mod.link((spec) => {
    if (spec === './device.js') return device;
    if (spec === '../../patches/local-quality/screen-angle.mjs') return new vm.SourceTextModule(fs.readFileSync(`${ROOT}patches/local-quality/screen-angle.mjs`,'utf8'),{context,identifier:spec});
    throw new Error(`unexpected gyro import ${spec}`);
  });
  await mod.evaluate();
  return mod.namespace;
}

// Build a live Gyro at a pose, with a settled gain. `sens` 0 => gyroTurnDeg 132 => _gain known.
async function at(p, { adapted = true, screenAngle = 0, sens = 0 } = {}) {
  screen.angle = screenAngle;
  const ns = await loadGyro({ adapted });
  const g = new ns.Gyro();
  g.supported = true;
  g._screenAngle = NaN;
  g._down = [...p.down];
  g.configure({ sens });
  g.discard();
  g._sample(0, 0, 0, 1 / 60);          // one sample so _gain settles
  g.discard();
  g._sm.y = g._sm.p = 0;
  return { g, ns };
}

/** Drive one real _sample and read the RAW mapped yaw/pitch back out of dYaw/dPitch. */
function mapOnce(g, w, dt = 1 / 60) {
  g.discard();
  g._sample(w[0], w[1], w[2], dt);
  const gain = g._gain;
  return { yaw: g.dYaw / (dt * gain), pitch: g.dPitch / (dt * gain) };
}
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, want ${b} (tol ${tol})`);

// omega magnitude large enough that direct === 1, so no smoothing touches the mapped value
const BIG = 30 / DEG;

/** The published sensitivity table, read straight out of the upstream source. */
function expectedTurnDeg(published, sens) {
  const table = JSON.parse(published.match(/const GYRO_DEG = (\[\[.*?\]\]);/s)[1].replace(/(\d)\s*\]/g, '$1]').replace(/\]-/, '],['));
  const s = Math.max(-5, Math.min(5, +sens || 0));
  for (let i = 1; i < table.length; i++) {
    const [s0, d0] = table[i - 1], [s1, d1] = table[i];
    if (s <= s1) return d0 + (d1 - d0) * ((s - s0) / (s1 - s0));
  }
  return table[table.length - 1][1];
}

// ===========================================================================================
test('#678: a rotation purely about WORLD VERTICAL gives yaw = +Omega and pitch = 0, at any attitude', async () => {
  for (const [name, p] of [['flat', FLAT], ['upright portrait', UPRIGHT], ['banked 45', BANK45],
    ['banked 70', BANK70], ['pitched+rolled', PITCHED]]) {
    const { g } = await at(p);
    const w = p.toDevice([0, 0, BIG]);              // world-frame omega straight up
    const { yaw, pitch } = mapOnce(g, w);
    close(yaw, BIG, 1e-9, `${name}: world-vertical yaw`);
    close(pitch, 0, 1e-9, `${name}: world-vertical must not leak into pitch`);
  }
});

test('#678: a rotation purely about WORLD HORIZONTAL gives yaw = 0 EXACTLY, at any attitude', async () => {
  // This is the acceptance item the partial gx-only fix still failed: the 1.41 borrow and the
  // hypot(py, pz) cap both turned gravity-orthogonal velocity into camera yaw.
  for (const [name, p] of [['flat', FLAT], ['upright portrait', UPRIGHT], ['banked 45', BANK45],
    ['banked 70', BANK70], ['pitched+rolled', PITCHED]]) {
    const { g } = await at(p);
    for (const H of [[1, 0, 0], [0, 1, 0], [0.6, 0.8, 0]]) {
      const w = p.toDevice([H[0] * BIG, H[1] * BIG, H[2] * BIG]);
      const { yaw, pitch } = mapOnce(g, w);
      close(yaw, 0, 1e-9, `${name}: world-horizontal H=${H} must produce no camera yaw`);
      assert.ok(Number.isFinite(pitch), `${name}: pitch must stay finite`);
    }
  }
});

test('#678: device roll about the gravity axis produces no camera motion', async () => {
  // Upright portrait: gravity runs along device -y, so device-z is a pure roll about the vertical.
  // World orientation discards it entirely; the player-space hypot(py, pz) cap did not.
  const { g } = await at(UPRIGHT);
  const { yaw, pitch } = mapOnce(g, [0, 0, BIG]);
  close(yaw, 0, 1e-9, 'device roll must not become yaw');
  close(pitch, 0, 1e-9, 'device roll must not become pitch');
});

test('#678: yaw never exceeds the gravity projection, even when the local yaw+roll magnitude is large', async () => {
  // Acceptance: "Local angular velocity orthogonal to the world yaw axis does not become extra
  // camera yaw merely because hypot(localYaw, localRoll) is large."
  // Build a vector with a LARGE local hypot(py, pz) that is nonetheless exactly orthogonal to the
  // true gravity, so any yaw it produces can only have come from the player-space magnitude borrow.
  const hl = Math.hypot(...BANK45.down);
  const [ux, uy, uz] = BANK45.down.map((v) => v / hl);
  // in the local y-z plane, perpendicular to gravity: (0, uz, -uy)
  const m = Math.hypot(uz, uy) || 1;
  const w = [0, (uz / m) * BIG, (-uy / m) * BIG];
  assert.ok(Math.hypot(w[1], w[2]) > 0.9 * BIG, 'precondition: large local yaw+roll magnitude');
  close(w[0] * ux + w[1] * uy + w[2] * uz, 0, 1e-12, 'precondition: exactly gravity-orthogonal');
  const { g } = await at(BANK45);
  const { yaw } = mapOnce(g, w);
  close(yaw, 0, 1e-9, 'large local yaw+roll with no gravity part must yield zero yaw');
  assert.ok(Math.abs(yaw) <= 1e-9, 'yaw must never exceed the gravity projection');
});

test('#678: flat and upright keep the local pitch exactly, banking reduces it', async () => {
  // gravity perpendicular to screen-right => the world-horizontal pitch axis IS screen-right
  for (const [name, p] of [['flat', FLAT], ['upright portrait', UPRIGHT]]) {
    const { g } = await at(p);
    const w = [20 / DEG, 3 / DEG, -7 / DEG];
    const { pitch } = mapOnce(g, w);
    close(pitch, w[0], 1e-9, `${name}: pitch must stay the local pitch`);
  }
  // banked: pitch must deviate from the local pitch and equal the world-horizontal projection
  for (const [name, p] of [['banked 45', BANK45], ['banked 70', BANK70], ['pitched+rolled', PITCHED]]) {
    const { g } = await at(p);
    const w = [20 / DEG, 3 / DEG, -7 / DEG];
    const { pitch } = mapOnce(g, w);
    const dev = byInv([0, 0, -1], p.q);                       // true device-frame gravity
    const hl = Math.hypot(dev[0], dev[1], dev[2]);
    const ux = dev[0] / hl, uy = dev[1] / hl, uz = dev[2] / hl;
    // world-horizontal axis nearest the device pitch axis, from the TRUE gravity
    const H = [1 - ux * ux, -ux * uy, -ux * uz];
    const hn = Math.hypot(H[0], H[1], H[2]) || 1;
    close(pitch, (w[0] * H[0] + w[1] * H[1] + w[2] * H[2]) / hn, 1e-9, `${name}: gravity-aware pitch`);
    assert.ok(Math.abs(pitch - w[0]) > 1e-6, `${name}: banked pitch must differ from the local pitch`);
  }
});

test('#678: screen rotations 0/90/180/270 preserve equivalent world-oriented behaviour', async () => {
  for (const [name, p] of [['flat', FLAT], ['banked 45', BANK45]]) {
    const seen = [];
    for (const angle of [0, 90, 180, 270]) {
      const { g } = await at(p, { screenAngle: angle });
      const w = p.toDevice([0, 0, BIG]);
      seen.push(mapOnce(g, w).yaw);
      close(mapOnce(g, w).pitch, 0, 1e-9, `${name} @${angle}: world vertical must not leak into pitch`);
    }
    for (const v of seen) close(v, BIG, 1e-9, `${name}: world-vertical yaw must be screen-rotation invariant`);
  }
});

test('#678: the gravity singularity band stays finite, deterministic and documented', async () => {
  // gravity exactly along screen-right: the device pitch axis has no world-horizontal component.
  const p = pose(0, 0, 90);
  const { g } = await at(p);
  const w = [15 / DEG, 4 / DEG, -2 / DEG];
  const a = mapOnce(g, w), b = mapOnce(g, w);
  assert.ok(Number.isFinite(a.yaw) && Number.isFinite(a.pitch), 'singular band must stay finite');
  close(a.yaw, b.yaw, 0, 'singular band must be deterministic');
  close(a.pitch, b.pitch, 0, 'singular band must be deterministic');
  // yaw is still the exact world-vertical projection even here
  close(a.yaw, -(w[0] * 1 + w[1] * 0 + w[2] * 0), 1e-9, 'singular band yaw is still the gravity projection');
});

test('#678: DeviceOrientation and validated DeviceMotion rotationRate map identically', async () => {
  // Both sources funnel through this one _sample with the same _down, so the axis mapping must be
  // source-independent. Driven through the real _motion handler, not by calling _sample twice.
  const p = BANK45;
  screen.angle = 0;
  const ns = await loadGyro({ adapted: true });
  const g = new ns.Gyro();
  g.supported = true; g._screenAngle = NaN;
  g._down = [...p.down];
  g.configure({ sens: 0 });
  g._hasQ = true;                       // motion is only trusted alongside a live attitude
  g._src = 'rrA'; g._rrScale = 1;       // validated source, deg/s units
  g._sample(0, 0, 0, 1 / 60); g.discard(); g._sm.y = g._sm.p = 0;
  const gain = g._gain;

  const w = p.toDevice([0, 0, BIG]);    // the same world-vertical rotation, in device coords
  g.discard();
  // rrA maps spec (alpha = z, beta = x, gamma = y); k = _rrScale * D2R
  const t0 = 1000;
  g._tRR = t0 - 16;
  g._motion({ rotationRate: { alpha: w[2] * DEG, beta: w[0] * DEG, gamma: w[1] * DEG }, timeStamp: t0 });
  const viaMotion = g.dYaw / ((16 / 1000) * gain);

  g.discard();
  g._sample(w[0], w[1], w[2], 1 / 60);
  const viaSample = g.dYaw / ((1 / 60) * gain);

  close(viaMotion, viaSample, 1e-9, 'rotationRate and attitude paths must share the mapping');
  close(viaMotion, BIG, 1e-6, 'and it must be the world-vertical rotation');
});

test('#678: 30/60/120 Hz cadence does not change integrated displacement', async () => {
  const p = PITCHED;
  for (const [name, deg] of [['world vertical', null], ['world horizontal', [1, 0, 0]]]) {
    const totals = [];
    for (const hz of [30, 60, 120]) {
      const { g } = await at(p);
      g.discard(); g._sm.y = g._sm.p = 0;
      const W = deg ? [deg[0] * BIG, deg[1] * BIG, deg[2] * BIG] : [0, 0, BIG];
      const w = p.toDevice(W);
      const steps = Math.max(1, Math.round(hz / 30));
      const dt = 1 / hz;
      for (let i = 0; i < steps; i++) g._sample(w[0], w[1], w[2], dt);
      totals.push(g.dYaw);
    }
    for (const t of totals) close(t, totals[0], 1e-9, `${name}: integrated yaw must be cadence independent`);
  }
});

test('#678: sensitivity, inversion, filter coefficients and lifecycle are unchanged', async () => {
  const raw = rawUpstream(), fixed = stripOverlay(adaptUpstream());
  // everything from the smoothing tier onward must be byte-identical to the published file
  const tail = (s) => s.slice(s.indexOf('    // soft tiered smoothing'));
  assert.equal(tail(fixed), tail(raw),
    'the filter / sensitivity / integration tail must be byte-identical to upstream');
  assert.ok(raw.includes('    // soft tiered smoothing'), 'anchor comment must exist upstream');
  // the player-space CONSTRUCTS must be gone (the literal 1.41 survives only inside the
  // explanatory comment that records what was removed, so assert the code, not the string)
  for (const gone of ['Math.min(Math.abs(worldYaw) * 1.41, yawAxes)', 'yawAxes',
    'let pitch = px;', 'Math.hypot(py, pz)', 'const worldYaw =']) {
    assert.equal(fixed.includes(gone), false, `player-space construct must be gone: ${gone}`);
  }
  assert.equal(raw.includes('Math.min(Math.abs(worldYaw) * 1.41, yawAxes)'), true,
    'precondition: the published upstream really does contain the player-space borrow');
  assert.ok(fixed.includes('-(px * ux + py * uy + pz * uz)'), 'complete gravity projection present');

  // the Splatoon 3 sensitivity curve is untouched by this change
  const ns = await loadGyro({ adapted: true });
  const published = adaptSource('src/core/gyro.js',rawUpstream());
  for (const s of [-5, -2.5, 0, 2.5, 5]) {
    assert.equal(ns.gyroTurnDeg(s), expectedTurnDeg(published, s), `gyroTurnDeg(${s}) must be unchanged`);
  }
  assert.equal(ns.gyroTurnDeg(0), 200, 'the separately composed provisional 1.8x bridge must survive');
  assert.ok(ns.touchSensMul(0) === 1, 'touch sensitivity multiplier must be untouched');

  // inversion still flips both signs, on real mapped values
  const plain = await at(FLAT);
  const inv = await at(FLAT);
  inv.g.configure({ invX: true, invY: true, sens: 0 });
  inv.g._sample(0, 0, 0, 1 / 60); inv.g.discard(); inv.g._sm.y = inv.g._sm.p = 0;
  const t = FLAT.toDevice([0, 0, BIG]);
  const a = mapOnce(plain.g, t), b = mapOnce(inv.g, t);
  close(a.yaw, -b.yaw, 1e-9, 'invX must still flip the yaw sign');
  close(a.pitch, -b.pitch, 1e-9, 'invY must still flip the pitch sign');
  // and the banked pitch (which the old code never produced) also inverts
  const bp = await at(BANK45), bi = await at(BANK45);
  bi.g.configure({ invY: true, sens: 0 });
  bi.g._sample(0, 0, 0, 1 / 60); bi.g.discard(); bi.g._sm.y = bi.g._sm.p = 0;
  const bw = [20 / DEG, 3 / DEG, -7 / DEG];
  close(mapOnce(bp.g, bw).pitch, -mapOnce(bi.g, bw).pitch, 1e-9, 'invY must flip the banked pitch too');

  // resync / lifecycle keep their SHIPPED semantics: resync forgets the attitude and clears the
  // smoothing state but deliberately leaves the pending delta alone (discard() is what clears it).
  const { g: lg } = await at(FLAT);
  lg._sample(t[0], t[1], t[2], 1 / 60);
  assert.ok(Math.abs(lg.dYaw) > 0, 'accumulation happens');
  const pending = lg.dYaw;
  lg.resync();
  assert.equal(lg._hasQ, false, 'resync must forget the attitude');
  assert.equal(lg._rr, null, 'resync must drop the rotationRate buffer');
  assert.equal(lg._sm.y, 0, 'resync must clear the smoothing state');
  assert.equal(lg._sm.p, 0, 'resync must clear the smoothing state');
  assert.equal(lg.dYaw, pending, 'resync must leave the pending delta alone, as upstream does');
  lg.discard();
  assert.equal(lg.dYaw, 0, 'discard must clear the pending delta');
  assert.equal(lg.dPitch, 0, 'discard must clear the pending pitch');
});

test('#678: the mapping is fail-closed and inkwave-public stays byte-locked', async () => {
  const raw = rawUpstream();
  assert.equal(raw.includes('ux * ux'), false, 'published upstream must not contain the mapping');
  assert.equal(raw.includes('1.41'), true, 'published upstream must still be the original file');
  const once = adaptUpstream();
  assert.ok(once.includes('ux * ux'), 'mapping present after adapt');
  assert.throws(() => adaptQualitySource(REL, ''), /conflict/, 'empty source must be rejected');
  assert.throws(() => adaptQualitySource(REL, once), /conflict/, 're-applying must be rejected');
  assert.throws(() => adaptQualitySource(REL, raw.replace('1.41', '1.42')),
    /conflict/, 'a drifted anchor must be rejected');
});

test('#678: baseline negative control — the player-space source fails the world-orientation identities', async () => {
  // Drives the real shipped mapping WITHOUT the fix. These are the properties the partial gx-only
  // fix still violated, so they must fail here.
  const checks = [];
  for (const [name, p] of [['flat', FLAT], ['upright portrait', UPRIGHT], ['banked 45', BANK45]]) {
    const { g } = await at(p, { adapted: false });
    const { yaw: horizYaw } = mapOnce(g, p.toDevice([1 * BIG, 0, 0]));
    checks.push([`${name}: world-horizontal yaw must be 0`, Math.abs(horizYaw) < 1e-9, horizYaw]);
    const { yaw: vertYaw, pitch: vertPitch } = mapOnce(g, p.toDevice([0, 0, BIG]));
    checks.push([`${name}: world-vertical yaw must be Omega`, Math.abs(vertYaw - BIG) < 1e-9, vertYaw]);
    checks.push([`${name}: world-vertical pitch must be 0`, Math.abs(vertPitch) < 1e-9, vertPitch]);
  }
  {
    const { g } = await at(BANK45, { adapted: false });
    const w = [20 / DEG, 3 / DEG, -7 / DEG];
    const { pitch } = mapOnce(g, w);
    checks.push(['banked pitch must differ from local pitch', Math.abs(pitch - w[0]) > 1e-6, pitch]);
  }
  // Honest scope: the player-space defects are only OBSERVABLE once gravity has a screen-x
  // component. At flat and upright portrait the gx term is zero and the hypot cap happens to cancel
  // the 1.41 relax, so the unfixed code coincidentally agrees there. Every banked identity must
  // therefore fail, and at least one failure is mandatory.
  const flatAndUpright = checks.slice(0, 6).map(([, ok]) => ok);
  const banked = checks.slice(6);
  for (const [what, ok, got] of banked) {
    assert.equal(ok, false,
      `unfixed player-space code must violate "${what}" (got ${got}) — the negative control is not testing the defect`);
  }
  assert.ok(banked.length >= 4, 'the negative control must cover the banked attitudes');
  assert.ok(flatAndUpright.some((ok) => ok),
    'flat/upright should coincidentally agree on unfixed code; if not, the fixture is wrong');
  assert.ok(banked.some(([, ok]) => !ok), 'the negative control must actually fail something');
});