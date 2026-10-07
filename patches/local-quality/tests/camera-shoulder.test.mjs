// #363 / #367 - persistent right-shoulder framing in the normal follow camera.
//
// Root (inkwave-public/src/game/cameraRig.js, _follow):
//   const closeK = clamp((2.8 - this.curDist) / 1.8, 0, 1);
//   let shT = 0.55 * closeK * closeK * (3 - 2 * closeK);
// closeK reaches 0 at curDist >= 2.8, so the over-the-shoulder shift only ever appeared
// as a wall-proximity nudge. With a clear boom (curDist -> this.dist = 4.5) normal follow
// stayed vertically centred, with the player's head sitting exactly on the crosshair axis.
// The fix adds a persistent baseline SH0 while keeping the obstruction-driven shift at its
// original full range (0.55) at closeK = 1.
//
// The correction is a fail-closed build-time replacement in patches/local-quality/adapter.mjs,
// so the published upstream file stays byte-locked to HEAD.
//
// HOW THIS SUITE AVOIDS SELF-CONFIRMATION
// Every behavioural assertion below drives the SHIPPED rig module (upstream source through
// the real build adapters) against a REAL THREE.PerspectiveCamera, and reads the rendered
// forward off the camera quaternion. Nothing here re-derives the shoulder formula locally,
// so these assertions genuinely fail on unfixed code. The primary proof is the differential
// harness: the same scenario runs on the complete adapted module and a negative control
// that restores only its locked upstream shoulder block. Unrelated owners remain equal.
//
// Scope note: SH0's MAGNITUDE IS DELIBERATELY UNQUANTIFIED. Splatoon 3 publishes no shoulder
// offset and this repository pins none (patches/splatoon3/reference/curated-numbers.json
// carries only camera.gyro, with status "unknown"). 0.28 m is a small, source-supported
// over-the-shoulder offset chosen for feel, NOT a claimed Nintendo constant.
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
import { adaptQualitySource, replaceOnce } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || `${ROOT}inkwave-public`;
const REL = 'src/game/cameraRig.js';

// The persistent baseline the adapter installs, and the obstruction endpoint it must preserve.
// These mirror the adapter's literals; the adapter's own output is asserted verbatim further down.
const SH0 = 0.28;
const OBSTRUCTED_ENDPOINT = 0.55;

const rawUpstream = () => fs.readFileSync(`${UPSTREAM}/${REL}`, 'utf8');
// the exact chain scripts/build-inkwave.mjs applies to every source file, so this exercises
// what actually ships rather than a shortened stand-in
const adaptUpstream = () => adaptRange(REL,
  adaptNetworkSource(REL,
    adaptQualitySource(REL,
      adaptReliability(REL,
        adaptTouchLayout(REL,
          adaptSource(REL, rawUpstream()))))));

// ---- one shared VM context; the rig module is re-linked per scenario ---------------------
// three.js ships as a split build: three.module.js re-exports from './three.core.js', so the
// core module must be linked and evaluated before the facade can resolve it.
let shared = null;
async function boot() {
  if (shared) return shared;
  const V = 'vendor/three/build';
  const context = vm.createContext({
    console, performance: { now: () => 1000 }, Math, Object, Array, JSON,
    navigator: { userAgent: 'test' }, window: undefined,
  });
  const mk = (src, id) => new vm.SourceTextModule(src, { context, identifier: id });
  const core = mk(fs.readFileSync(`${UPSTREAM}/${V}/three.core.js`, 'utf8'), 'three.core.js');
  await core.link(() => { throw new Error('three.core.js must be self-contained'); });
  await core.evaluate();
  const three = mk(fs.readFileSync(`${UPSTREAM}/${V}/three.module.js`, 'utf8'), 'three.module.js');
  await three.link((spec) => {
    if (spec === './three.core.js') return core;
    throw new Error(`unexpected three.module.js import ${spec}`);
  });
  await three.evaluate();
  const ctx = mk(fs.readFileSync(`${UPSTREAM}/src/core/ctx.js`, 'utf8'), 'ctx.js');
  await ctx.link(() => { throw new Error('ctx.js must be self-contained'); });
  await ctx.evaluate();
  // physics.js is imported for the Hit record only; _follow reads just .hit/.dist from it.
  const physics = mk(`import * as THREE from 'three';
export class Hit {
  constructor() { this.hit = false; this.dist = 0; this.point = new THREE.Vector3(); this.normal = new THREE.Vector3(); this.block = -1; this.face = -1; this.u = 0; this.v = 0; }
}`, 'physics.js');
  await physics.link((spec) => {
    if (spec === 'three') return three;
    throw new Error(`unexpected physics.js import ${spec}`);
  });
  await physics.evaluate();
  shared = { THREE: three.namespace, G: ctx.namespace.G, mk, three, ctx, physics };
  return shared;
}

// The positive rig is the complete production composition. Its negative control
// restores only the locked shoulder block, retaining all unrelated owners,
// including #862 probe cadence, for an exact differential of shoulder framing.
async function loadRig({ adapted }) {
  const { THREE, mk, three, ctx, physics } = await boot();
  const installed = adaptUpstream();
  const start = '    const closeK = clamp((2.8 - this.curDist) / 1.8, 0, 1);';
  const end = '    if (this.shoulder > 1e-3) cam.position.addScaledVector(_right, this.shoulder);';
  const block = source => {
    assert.equal(source.split(start).length, 2); assert.equal(source.split(end).length, 2);
    return source.slice(source.indexOf(start), source.indexOf(end) + end.length);
  };
  const code = adapted ? installed : replaceOnce(installed, block(installed), block(rawUpstream()), 'test-only upstream shoulder control');
  const mod = mk(code, REL);
  await mod.link((spec) => {
    if (spec === 'three') return three;
    if (spec === '../core/ctx.js') return ctx;
    if (spec === './physics.js') return physics;
    throw new Error(`unexpected cameraRig import ${spec}`);
  });
  await mod.evaluate();
  return { CameraRig: mod.namespace.CameraRig, THREE };
}

// The rig reads G.physics / G.level / G.settings lazily off the shared ctx singleton, so each
// scenario just reconfigures them in place.
function setWorld({ probe, ray } = {}) {
  const { G } = shared;
  G.time = 0;
  G.mode = 'match';
  G.match = null;
  G.settings = { fov: 82, cameraShake: 0 };
  G.level = { groundHeight: () => -Infinity };
  G.physics = {
    // clear boom: nothing obstructs behind the player
    cameraProbe: (pivot, dir, dist, r, out) => { out.hard = dist; out.soft = dist; out.floor = false; return out; },
    // a real raycast only reports a hit inside maxDist
    raycast: (o, dir, maxDist) => ({ hit: false, dist: maxDist }),
  };
  if (probe) G.physics.cameraProbe = probe;
  if (ray) G.physics.raycast = ray;
  return G;
}
// A wall `d` metres along camera right; misses when it is further away than the ray reaches.
const wallAt = (d) => (o, dir, maxDist) => (d <= maxDist ? { hit: true, dist: d } : { hit: false, dist: maxDist });
const fixedProbe = (d) => (pivot, dir, dist, r, out) => { out.hard = d; out.soft = d; out.floor = false; return out; };

// A right-side wall that can APPEAR mid-run. C19-CAMERA-COLLISION-TRANSITION: the existing
// settled-wall test starts with a fresh rig and leaves the wall present for 240 frames, so it only
// ever checked the settled 0.05 m value and never the first frame after SH0 had already settled.
// `state.at` is the distance along camera right, or null for clear.
function mutableWall() {
  const state = { at: null };
  state.ray = (o, dir, maxDist) => (state.at != null && state.at <= maxDist
    ? { hit: true, dist: state.at } : { hit: false, dist: maxDist });
  return state;
}

// Run the rig, letting the caller drive frames and move the wall between them.
async function live(opts = {}) {
  const wall = mutableWall();
  setWorld({ probe: opts.probe, ray: wall.ray });
  const a = actor(opts.actor);
  const ns = await loadRig({ adapted: true });
  const THREE = ns.THREE;
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
  const rig = new ns.CameraRig(cam);
  rig.yaw = opts.yaw ?? 0;
  rig.pitch = opts.pitch ?? -0.1;
  rig.follow(a, true);
  const dt = opts.dt ?? 1 / 60;
  // let the mode-change pose blend finish before anything is measured
  for (let i = 0; i < 40; i++) rig.update(dt);
  return {
    rig, cam, a, wall, THREE: ns.THREE, dt,
    step(n = 1) { for (let i = 0; i < n; i++) rig.update(dt); return this; },
    shoulder() { return rig.shoulder; },
    /** lateral offset actually applied to the lens, along camera right */
    applied() {
      const R = rightOf(rig.yaw);
      const d = { x: cam.position.x - rig.pivot.x, y: cam.position.y - rig.pivot.y, z: cam.position.z - rig.pivot.z };
      return dot(d, R);
    },
    view() { return renderedForward(ns.THREE, cam); },
  };
}

function actor(over = {}) {
  return {
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, visualPos: null,
    form: 'kid', alive: true, nid: 1, team: 0, grounded: true,
    anim: { form: 'kid' }, weaponRunner: { charging: false, charge: 0 },
    superJumpState: null, specialActive: null, invuln: 0,
    ...over,
  };
}

// A super jump in flight: _follow swings the yaw toward the landing spot and pitches down.
const superJumpFlight = (t = 0.4) => ({
  phase: 'flight', t, dur: 1, from: { x: 0, y: 0, z: 0 }, to: { x: 3, y: 0, z: 4 },
});

function mount(CameraRig, THREE, a, { yaw = 0, pitch = -0.1, frames = 240, dt = 1 / 60, log = false } = {}) {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
  const rig = new CameraRig(cam);
  rig.yaw = yaw;
  rig.pitch = pitch;
  rig.follow(a, true);
  const trace = log ? [] : null;
  for (let i = 0; i < frames; i++) {
    // _follow samples _right and fwd at the top of the function, BEFORE the super-jump block
    // swings the yaw and pitches the rig down. Sample them the same way.
    const right = rightOf(rig.yaw);
    const fwd = rig.forward(new THREE.Vector3());
    rig.update(dt);
    if (trace) trace.push({
      i, right, fwd, shoulder: rig.shoulder, curDist: rig.curDist, lift: rig.lensLift.x, kick: rig.kick,
      // while a mode-change pose blend is running the rendered pose is an interpolation of the
      // previous one, so the geometric decomposition does not (and should not) hold there
      blending: !!(rig.blend && rig.blend.active),
      pivot: rig.pivot.clone(),
      pos: cam.position.clone(), q: cam.quaternion.clone(),
    });
  }
  return { rig, cam, THREE, trace };
}

// How far the rendered lens sits from the exact geometric decomposition the rig is documented
// to use:   lens == pivot - fwd*curDist + (0, 0.15 + lensLift, 0) + _right * shoulder
// This is the whole of the rendered framing. Anything the shoulder changed had to arrive
// through the final term alone.
const lensResidual = (f) => {
  const ex = f.pivot.x - f.fwd.x * f.curDist + f.right.x * f.shoulder;
  const ey = f.pivot.y - f.fwd.y * f.curDist + 0.15 + f.lift + f.right.y * f.shoulder;
  const ez = f.pivot.z - f.fwd.z * f.curDist + f.right.z * f.shoulder;
  return Math.hypot(f.pos.x - ex, f.pos.y - ey, f.pos.z - ez);
};

// Flatten the whole follow state to plain numbers so upstream and adapted can be compared
// field by field without tripping over Vector3 / Spring object shapes.
function snap(rig) {
  const o = {};
  for (const k of ['pivotY', 'curDist', 'wantDist', 'dist', 'zoom', 'fovKick', 'kick', 'trauma', 'baseFov', 'time', 'yaw', 'pitch']) o[k] = rig[k];
  o['pivot.x'] = rig.pivot.x; o['pivot.y'] = rig.pivot.y; o['pivot.z'] = rig.pivot.z;
  for (const s of ['sx', 'sy', 'sz', 'boom', 'hgt', 'side', 'lensLift', 'kickS']) { o[`${s}.x`] = rig[s].x; o[`${s}.v`] = rig[s].v; }
  o['dipS.x'] = rig.dipS.x; o['dipS.v'] = rig.dipS.v;
  return o;
}

// The rendered view direction, read off the camera three.js actually orients.
const renderedForward = (THREE, cam) => new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
const rightOf = (yaw) => ({ x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Run one scenario on both the raw upstream rig and the adapted rig and hand back both states.
async function differential(opts = {}) {
  await boot();
  const cfg = setWorld(opts.world);
  const a = actor(opts.actor);
  const up = await loadRig({ adapted: false });
  const fx = await loadRig({ adapted: true });
  const upRig = mount(up.CameraRig, up.THREE, a, opts);
  const fxRig = mount(fx.CameraRig, fx.THREE, a, opts);
  return { cfg, a, THREE: fx.THREE, up: upRig, fx: fxRig };
}

// ---------------------------------------------------------------------------------------
// 1. the defect itself
// ---------------------------------------------------------------------------------------

test('normal follow now carries a persistent right-shoulder offset (#363/#367)', async () => {
  const { fx } = await differential();
  // clear boom: curDist settles at the configured follow distance, far above the 2.8 cutoff
  assert.ok(fx.rig.curDist > 2.8, `expected a clear boom, got curDist ${fx.rig.curDist}`);
  // SH0 is NOT gated on closeK any more, so the offset survives a fully clear boom
  assert.ok(Math.abs(fx.rig.shoulder - SH0) < 1e-6,
    `normal follow must keep the right-shoulder offset, got ${fx.rig.shoulder}`);
});

test('upstream normal follow is vertically centred - the same scenario on the raw file (#363/#367)', async () => {
  // This is the behavioural "before", driven through the shipped module, not a local re-derivation.
  const { up } = await differential();
  assert.ok(up.rig.curDist > 2.8, 'precondition: a clear boom');
  assert.equal(up.rig.shoulder, 0,
    'unfixed code must produce no shoulder offset at all in normal follow');
  assert.equal(up.rig.shT, undefined, 'sanity: shoulder is the published signal');
});

test('the framing is a RIGHT shoulder: the head sits left of the crosshair axis (#363/#367)', async () => {
  for (const yaw of [0, 0.7, 1.3, -0.9, 2.4, -2.7]) {
    const { fx } = await differential({ yaw });
    const { rig, cam } = fx;
    const R = rightOf(yaw);
    // where the lens sits relative to the follow pivot, measured in camera-right coordinates
    const lat = { x: cam.position.x - rig.pivot.x, y: cam.position.y - rig.pivot.y, z: cam.position.z - rig.pivot.z };
    assert.ok(Math.abs(dot(lat, R) - rig.shoulder) < 1e-9,
      `lens must be displaced purely along camera right at yaw ${yaw}`);
    // the head therefore falls -shoulder to the left of the forward axis: you look over its right side
    const head = { x: rig.pivot.x - cam.position.x, y: rig.pivot.y - cam.position.y, z: rig.pivot.z - cam.position.z };
    assert.ok(Math.abs(dot(head, R) + rig.shoulder) < 1e-9,
      `the head must sit shoulder-metres left of the crosshair at yaw ${yaw}`);
  }
});

// ---------------------------------------------------------------------------------------
// 2. aim is untouched - the offset is a parallel lens+target translation
// ---------------------------------------------------------------------------------------

test('rendered forward is exactly rig.forward, at every heading (#363/#367)', async () => {
  for (const [yaw, pitch] of [[0, -0.1], [0.7, 0.2], [1.3, -0.5], [-0.9, 0.45], [2.4, -0.05]]) {
    const { fx } = await differential({ yaw, pitch });
    const fwd = fx.rig.forward(new fx.THREE.Vector3());
    const view = renderedForward(fx.THREE, fx.cam);
    assert.ok(Math.abs(dot(fwd, view) - 1) < 1e-9,
      `aim must be unrotated at yaw ${yaw} pitch ${pitch}: dot=${dot(fwd, view)}`);
  }
});

test('a large forced shoulder still does not rotate the aim (#363/#367)', async () => {
  const { fx } = await differential();
  const before = renderedForward(fx.THREE, fx.cam).clone();
  const beforePos = fx.cam.position.clone();
  // slam the shoulder spring target far right, well past anything the shipped term produces
  fx.rig.shoulder = 5;
  fx.rig.update(1 / 60);
  const after = renderedForward(fx.THREE, fx.cam);
  const moved = fx.cam.position.distanceTo(beforePos);
  assert.ok(moved > 1, `the lens must actually translate, moved ${moved}`);
  assert.ok(Math.abs(dot(before, after) - 1) < 1e-9, 'a lateral slide must not rotate the view');
  // a pure lateral translation: no vertical component at all
  assert.ok(Math.abs(fx.cam.position.y - beforePos.y) < 1e-12, 'the slide must stay horizontal');
});

// ---------------------------------------------------------------------------------------
// 3. the change is a pure parallel translation - nothing else moved
// ---------------------------------------------------------------------------------------

test('shoulder framing preserves aim and settled rig state with probe-cache cadence (#363/#367/#862)', async () => {
  const scenarios = [
    ['idle clear boom', {}],
    ['steep look up', { yaw: 0.7, pitch: 0.4 }],
    ['looking down', { yaw: -1.4, pitch: -0.6 }],
    ['strafe left', { actor: { vel: { x: -6, y: 0, z: 2 } } }],
    ['strafe right', { actor: { vel: { x: 6, y: 0, z: -2 } } }],
    ['squid', { actor: { form: 'squid' } }],
    ['swimming', { actor: { anim: { form: 'swim' } } }],
    ['super jump flight', { actor: { superJumpState: superJumpFlight() } }],
    ['charger fully charged', { actor: { weaponRunner: { charging: true, charge: 1 } } }],
    ['wall behind, boom free', { world: { ray: wallAt(9) } }],
  ];
  for (const [name, opts] of scenarios) {
    const { fx, up } = await differential({ ...opts, log: true });
    const sf = snap(fx.rig), su = snap(up.rig);
    for (const key of Object.keys(sf)) {
      assert.ok(Math.abs(sf[key] - su[key]) < 1e-9,
        `${name}: rig.${key} drifted (upstream ${su[key]} vs fixed ${sf[key]})`);
    }
    // Per frame, the whole of the rendered framing is boom + lift + shoulder. The fixed build
    // must land on exactly the same decomposition, with the shoulder as the only changed term.
    let checked = 0;
    for (let i = 0; i < fx.trace.length; i++) {
      if (fx.trace[i].blending) { assert.equal(up.trace[i].blending, true, `${name}: frame ${i} blend desync`); continue; }
      checked++;
      const rf = lensResidual(fx.trace[i]), ru = lensResidual(up.trace[i]);
      assert.ok(rf < 1e-9, `${name}: frame ${i} fixed lens off the decomposition by ${rf}`);
      assert.ok(ru < 1e-9, `${name}: frame ${i} upstream lens off the decomposition by ${ru}`);
      assert.ok(Math.abs(rf - ru) < 1e-12, `${name}: frame ${i} decomposition changed`);
      // the aim is identical on every frame, not just the last one
      const qf = new fx.THREE.Vector3(0, 0, -1).applyQuaternion(fx.trace[i].q).normalize();
      const qu = new up.THREE.Vector3(0, 0, -1).applyQuaternion(up.trace[i].q).normalize();
      assert.ok(Math.abs(dot(qf, qu) - 1) < 1e-9, `${name}: frame ${i} rendered aim differs from upstream`);
      // Both controls retain the same cache owner, so pivot and boom remain identical per frame.
      assert.ok(Math.abs(fx.trace[i].pivot.x - up.trace[i].pivot.x) < 1e-9
        && Math.abs(fx.trace[i].pivot.y - up.trace[i].pivot.y) < 1e-9
        && Math.abs(fx.trace[i].pivot.z - up.trace[i].pivot.z) < 1e-9, `${name}: frame ${i} pivot drifted`);
      assert.ok(Math.abs(fx.trace[i].curDist - up.trace[i].curDist) < 1e-9, `${name}: frame ${i} boom drifted`);
    }
    assert.ok(checked > 200, `${name}: only ${checked} settled frames were checked`);
    // and therefore the rendered view direction is identical to the unfixed build
    const vf = renderedForward(fx.THREE, fx.cam), vu = renderedForward(up.THREE, up.cam);
    assert.ok(Math.abs(dot(vf, vu) - 1) < 1e-9, `${name}: the rendered aim must match upstream exactly`);
    assert.ok(Math.abs(fx.cam.fov - up.cam.fov) < 1e-12, `${name}: field of view must be unchanged`);
    // and the fix did something in every one of these scenarios
    assert.ok(fx.rig.shoulder - up.rig.shoulder > 1e-6, `${name}: expected a persistent offset`);
  }
});

test('the Charger zoom profile is untouched (#363/#367)', async () => {
  const { fx, up } = await differential({ actor: { weaponRunner: { charging: true, charge: 1 } } });
  assert.ok(Math.abs(fx.rig.zoom - 14) < 1e-6, `charger zoom drifted: ${fx.rig.zoom}`);
  assert.ok(Math.abs(up.rig.zoom - 14) < 1e-6, `precondition: upstream also reaches 14, got ${up.rig.zoom}`);
  // charging pulls the boom in by 0.6 exactly as before, and the offset rides on top of it
  assert.ok(Math.abs(fx.rig.curDist - 3.9) < 1e-6, `boom drifted: ${fx.rig.curDist}`);
  assert.ok(Math.abs(fx.rig.shoulder - SH0) < 1e-6);
  assert.ok(Math.abs(fx.cam.fov - up.cam.fov) < 1e-12, 'charging must not change the field of view');
  // a partial charge still tracks the same ramp
  const half = await differential({ actor: { weaponRunner: { charging: true, charge: 0.5 } } });
  assert.ok(Math.abs(half.fx.rig.zoom - half.up.rig.zoom) < 1e-12, 'partial charge ramp must match upstream');
  assert.ok(Math.abs(half.fx.rig.zoom - 3) < 1e-6, `charge*6 ramp broken: ${half.fx.rig.zoom}`);
});

// ---------------------------------------------------------------------------------------
// 4. existing behaviour preserved
// ---------------------------------------------------------------------------------------

test('a fully obstructed boom still reaches the original 0.55 shoulder endpoint (#363/#367)', async () => {
  const { fx } = await differential({ world: { probe: fixedProbe(0.6) } });
  assert.ok(fx.rig.curDist < 1.0, `precondition: the boom is forced short, got ${fx.rig.curDist}`);
  // closeK saturates at 1, so the obstruction term must be reproduced at full strength
  assert.ok(Math.abs(fx.rig.shoulder - OBSTRUCTED_ENDPOINT) < 1e-6,
    `the obstruction-driven shoulder must still reach ${OBSTRUCTED_ENDPOINT}, got ${fx.rig.shoulder}`);
});

test('obstacle avoidance still pulls the boom in and still widens the shoulder (#363/#367)', async () => {
  const clear = await differential();
  const mid = await differential({ world: { probe: fixedProbe(1.2) } });
  const hard = await differential({ world: { probe: fixedProbe(0.6) } });
  assert.ok(mid.fx.rig.curDist < clear.fx.rig.curDist, 'an obstructed boom must pull in');
  assert.ok(hard.fx.rig.curDist < mid.fx.rig.curDist, 'a tighter obstacle must pull in further');
  // and the ordering stays monotonic: clearer boom => smaller shoulder
  assert.ok(clear.fx.rig.shoulder < mid.fx.rig.shoulder, 'a pulled-in boom must widen the shoulder');
  assert.ok(mid.fx.rig.shoulder < hard.fx.rig.shoulder, 'a tighter boom must widen it further');
  // the clearance is a lower bound, never negative, never reversed
  for (const r of [clear, mid, hard]) assert.ok(r.fx.rig.shoulder > 0, 'the offset must never invert');
});

test('a right-side wall still clamps the offset so the lens never enters it (#363/#367)', async () => {
  const clear = await differential();
  // wall 0.30 along camera right, inside the probe reach: the rig must stop the lens 0.25 clear
  const walled = await differential({ world: { ray: wallAt(0.30) } });
  assert.ok(Math.abs(walled.fx.rig.shoulder - 0.05) < 1e-6,
    `expected the lens to stop 0.05 short of the wall, got ${walled.fx.rig.shoulder}`);
  assert.ok(walled.fx.rig.shoulder < clear.fx.rig.shoulder,
    'a wall on the right must reduce the offset, not increase it');
  // upstream ran no probe at all on a clear boom, so this clamp is newly reachable there too
  assert.ok(Math.abs(clear.up.rig.shoulder - 0) < 1e-12, 'precondition: upstream never offset it');
  // a wall beyond the requested offset leaves it alone
  const far = await differential({ world: { ray: wallAt(4.0) } });
  assert.ok(Math.abs(far.fx.rig.shoulder - SH0) < 1e-6, 'an out-of-reach wall must not reduce the offset');
  // a wall flush against the lens still clamps to zero rather than inverting
  const flush = await differential({ world: { ray: wallAt(0.20) } });
  assert.ok(flush.fx.rig.shoulder >= 0, 'the offset must never invert through a wall');
});

test('a clear right side keeps the full offset (#363/#367)', async () => {
  const { fx } = await differential({ world: { ray: wallAt(9) } });
  assert.ok(Math.abs(fx.rig.shoulder - SH0) < 1e-6, 'with a clear right side the offset must persist');
});

test('rotation and pitch framing still track the input-owned angles (#363/#367)', async () => {
  const { fx } = await differential({ yaw: 1.0, pitch: -0.4 });
  assert.ok(Math.abs(fx.rig.yaw - 1.0) < 1e-12, `yaw must be owned by input, got ${fx.rig.yaw}`);
  assert.ok(Math.abs(fx.rig.pitch + 0.4) < 1e-12, `pitch must be owned by input, got ${fx.rig.pitch}`);
  // and the whole rig rotates coherently: the offset follows the heading around the yaw circle
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI * 1.75]) {
    const r = await differential({ yaw });
    const R = rightOf(yaw);
    const lat = {
      x: r.fx.cam.position.x - r.fx.rig.pivot.x,
      y: r.fx.cam.position.y - r.fx.rig.pivot.y,
      z: r.fx.cam.position.z - r.fx.rig.pivot.z,
    };
    assert.ok(Math.abs(r.fx.rig.shoulder - SH0) < 1e-6, `offset must hold all the way round at yaw ${yaw}`);
    // camera-right is perpendicular to the boom, so the whole lateral term is the shoulder
    assert.ok(Math.abs(dot(lat, R) - r.fx.rig.shoulder) < 1e-9,
      `the offset must stay in the camera-right plane at yaw ${yaw}`);
    // the boom accounts for the remainder along the aim axis, bar the rig's own +0.15 lens lift
    const fwd = r.fx.rig.forward(new r.THREE.Vector3());
    const lift = 0.15 * Math.sin(r.fx.rig.pitch);
    assert.ok(Math.abs(dot(lat, fwd) + r.fx.rig.curDist - lift) < 1e-9,
      `the boom must stay on the aim axis at yaw ${yaw}`);
  }
});

test('squid, swim, super jump and remote actors all keep the offset (#363/#367)', async () => {
  const cases = [
    ['squid', { form: 'squid' }],
    ['swim', { anim: { form: 'swim' } }],
    ['climb', { anim: { form: 'climb' } }],
    ['super jump flight', { superJumpState: superJumpFlight(0.2) }],
    ['remote actor', { nid: 9 }],
  ];
  for (const [name, over] of cases) {
    const { fx, up } = await differential({ actor: over });
    assert.ok(Math.abs(fx.rig.shoulder - SH0) < 1e-6, `${name}: offset missing, got ${fx.rig.shoulder}`);
    assert.equal(up.rig.shoulder, 0, `${name}: upstream had no offset here either`);
    // every one of them must still aim correctly
    const fwd = fx.rig.forward(new fx.THREE.Vector3());
    assert.ok(Math.abs(dot(fwd, renderedForward(fx.THREE, fx.cam)) - 1) < 1e-9, `${name}: aim must stay exact`);
  }
});

test('a moving remote actor is still framed, and its aim stays exact (#363/#367)', async () => {
  const { fx, a } = await differential();
  const x0 = fx.rig.pivot.x;
  // drive the shared actor for another second of lateral motion; the rig follows the same body
  for (let i = 0; i < 60; i++) {
    a.pos.x += 0.05; a.vel.x = 3; a.vel.z = -1;
    fx.rig.update(1 / 60);
  }
  assert.ok(fx.rig.pivot.x - x0 > 0.5, `the pivot must actually track the moving actor, moved ${fx.rig.pivot.x - x0}`);
  const fwd = fx.rig.forward(new fx.THREE.Vector3());
  assert.ok(Math.abs(dot(fwd, renderedForward(fx.THREE, fx.cam)) - 1) < 1e-9,
    'aim must stay exact while moving');
  assert.ok(Math.abs(fx.rig.shoulder - SH0) < 1e-6, `offset must persist in motion, got ${fx.rig.shoulder}`);
});

test('muzzle-to-target parallax is preserved, not collapsed (#363/#367)', async () => {
  const { fx, a } = await differential({ yaw: 0.4 });
  const { rig, cam } = fx;
  const R = rightOf(rig.yaw);
  // the ray from the player's own position to the lens is not parallel to the view: that
  // non-parallelism IS the parallax, and it is what the over-the-shoulder offset produces.
  const toLens = { x: cam.position.x - a.pos.x, y: cam.position.y - a.pos.y, z: cam.position.z - a.pos.z };
  const fwd = rig.forward(new fx.THREE.Vector3());
  const lateral = dot(toLens, R);
  assert.ok(Math.abs(lateral) > 0.1, `lens must stay laterally displaced from the player, got ${lateral}`);
  // the offset component is exactly the shoulder; the rest is the boom itself
  assert.ok(Math.abs(Math.abs(lateral) - rig.shoulder) < 1e-6, 'the parallax term is the shoulder offset');
  // parallax is preserved, not mirrored: the lens is displaced, the aim line is not
  const toTarget = { x: rig.pivot.x - cam.position.x, y: 0, z: rig.pivot.z - cam.position.z };
  assert.ok(Math.abs(dot(toTarget, R) + rig.shoulder) < 1e-9, 'the aim line must stay parallel, not collapse onto the lens');
  // upstream collapses this to zero - that is the defect
  assert.ok(Math.abs(lateral) > 0.1, 'sanity');
});

test('the offset is frame-rate independent (#363/#367)', async () => {
  // AGENTS.md: the same behaviour must hold at different frame intervals. The shoulder uses the
  // exact exponential damp and the boom uses the exact critically-damped spring, so the settled
  // value must not depend on dt.
  for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 144]) {
    const { fx } = await differential({ frames: Math.ceil(4 / dt), dt });
    assert.ok(Math.abs(fx.rig.shoulder - SH0) < 1e-6, `shoulder drifted at dt=${dt}: ${fx.rig.shoulder}`);
    const fwd = fx.rig.forward(new fx.THREE.Vector3());
    assert.ok(Math.abs(dot(fwd, renderedForward(fx.THREE, fx.cam)) - 1) < 1e-9, `aim drifted at dt=${dt}`);
  }
});

// ---------------------------------------------------------------------------------------
// 5. the patch itself
// ---------------------------------------------------------------------------------------

// ===========================================================================================
// C19-CAMERA-COLLISION-TRANSITION regression
//
// The blocker: with SH0 the shoulder settles at 0.28 m in a clear follow. A right-side wall
// appearing at 0.30 m only moved the *target* to 0.05 m; the damped value kept rendering ~0.2513 m
// on the first 60 Hz frame, i.e. through the 0.25 m clearance envelope. These tests drive the
// installed rig + real THREE and measure the APPLIED offset on the very first frame after the
// transition, which the pre-existing settled-wall test never did.
// ============================================================================================

// Float tolerance for the clearance bound. cam.position is rebuilt from the spring-integrated pivot
// every frame, so dot(cam.position - pivot, _right) carries ~1e-8 of double rounding. The defect being
// guarded against is 0.2513 against a 0.05 limit - a 0.2 m violation - so 1e-6 sits five orders of
// magnitude below it and cannot mask a real regression.
const CLEARANCE_TOL = 1e-6;

test('a wall appearing after SH0 settles is safe on the FIRST frame, at every cadence (#363/#367)', async () => {
  const WALL = 0.30, CLEAR = 0.25, SAFE = WALL - CLEAR;      // 0.05
  for (const hz of [30, 60, 120]) {
    const r = await live({ dt: 1 / hz });
    r.step(240);                                             // settle normally, clear side
    assert.ok(Math.abs(r.shoulder() - SH0) < 1e-6, `${hz}Hz: precondition, shoulder must settle at SH0, got ${r.shoulder()}`);
    r.wall.at = WALL;                                        // the wall arrives between two frames
    for (let i = 0; i < 6; i++) {
      r.step();
      assert.ok(r.shoulder() <= SAFE + CLEARANCE_TOL,
        `${hz}Hz frame ${i}: applied shoulder ${r.shoulder()} must never exceed the ${SAFE} m clearance`);
      assert.ok(r.applied() <= SAFE + CLEARANCE_TOL,
        `${hz}Hz frame ${i}: RENDERED lens offset ${r.applied()} must never exceed the ${SAFE} m clearance`);
    }
  }
});

test('the transition is safe from both corners and for every actor form (#363/#367)', async () => {
  const WALL = 0.30, SAFE = WALL - 0.25;
  // yaw and yaw+PI put the "right" side on opposite world axes; the rig's _right rotates with yaw
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const [form, over] of [['kid', {}], ['squid', { form: 'squid' }],
      ['swim', { anim: { form: 'swim' } }],
      ['super jump', { superJumpState: superJumpFlight(0.4) }]]) {
      const r = await live({ yaw, actor: over });
      r.step(240);
      assert.ok(Math.abs(r.shoulder() - SH0) < 1e-6, `yaw ${yaw} ${form}: precondition SH0, got ${r.shoulder()}`);
      r.wall.at = WALL;
      r.step();
      assert.ok(r.shoulder() <= SAFE + CLEARANCE_TOL, `yaw ${yaw} ${form}: first-frame shoulder ${r.shoulder()} must be <= ${SAFE}`);
      assert.ok(r.applied() <= SAFE + CLEARANCE_TOL, `yaw ${yaw} ${form}: first-frame rendered offset ${r.applied()} must be <= ${SAFE}`);
    }
  }
});

test('the lens never crosses the clearance envelope at any point of the transition (#363/#367)', async () => {
  const WALL = 0.30, SAFE = WALL - 0.25;
  for (const hz of [30, 60, 120]) {
    const r = await live({ dt: 1 / hz });
    r.step(240);
    r.wall.at = WALL;
    let worst = 0;
    for (let i = 0; i < 90; i++) { r.step(); worst = Math.max(worst, r.applied()); }
    assert.ok(worst <= SAFE + CLEARANCE_TOL, `${hz}Hz: worst rendered offset over the whole transition was ${worst}, limit ${SAFE}`);
    // it must still settle to the same value the pre-existing settled-wall test expects
    assert.ok(Math.abs(r.shoulder() - SAFE) < 1e-6, `${hz}Hz: settled shoulder must be ${SAFE}, got ${r.shoulder()}`);
  }
});

test('removing the wall still eases back to SH0 with the original damping (#363/#367)', async () => {
  const WALL = 0.30;
  const r = await live();
  r.step(240);
  r.wall.at = WALL;
  r.step(30);
  const pinned = r.shoulder();
  r.wall.at = null;                                          // side is open again
  r.step();
  assert.ok(r.shoulder() >= pinned - 1e-9, 'the offset must never jump past the pinned value on the way out');
  r.step(240);
  assert.ok(Math.abs(r.shoulder() - SH0) < 1e-6, `open side must return to SH0, got ${r.shoulder()}`);
  // and an unobstructed rig is completely unaffected: the clamp must not engage when nothing hits
  assert.ok(r.applied() <= Math.abs(SH0) + 1e-9, 'clear-side offset stays at the framing value');
});

test('the transition changes only the rendered offset - aim and rig state are untouched (#363/#367)', async () => {
  const WALL = 0.30;
  const a = await live({ yaw: 0.9, pitch: -0.2 });
  const b = await live({ yaw: 0.9, pitch: -0.2 });
  a.step(240); b.step(240);
  const before = snap(a.rig), aimBefore = a.view();
  b.wall.at = WALL;
  b.step();                                                   // one frame with the wall
  b.wall.at = null;
  const after = snap(b.rig), aimAfter = b.view();
  for (const k of ['pivot.x', 'pivot.y', 'pivot.z', 'curDist', 'wantDist', 'zoom', 'fovKick', 'kick', 'yaw', 'pitch']) {
    assert.ok(Math.abs(before[k] - after[k]) < 1e-9,
      `wall transition must not move rig.${k} (${before[k]} -> ${after[k]})`);
  }
  assert.ok(Math.abs(dot(aimBefore, aimAfter) - 1) < 1e-9, 'the wall transition must not rotate the aim');
  // weapon/ink authoritative values are not produced by CameraRig at all; assert the rig exposes
  // nothing that could carry them, so the correction is provably rendering-only
  assert.deepEqual(
    Object.keys(b.rig).filter((k) => /weapon|damage|dmg|ammo/i.test(k) || /(^|_)ink(?!wave)/i.test(k)), [],
    'CameraRig must not carry weapon or ink state that this correction could touch');
});

test('the adapter is fail-closed and upstream stays byte-locked (#363/#367)', async () => {
  const raw = rawUpstream();
  assert.equal(raw.includes('const SH0'), false, 'published upstream must not contain the baseline');
  assert.equal(raw.includes('let shT = 0.55 * closeK'), true, 'published upstream must still be the original file');
  const once = adaptUpstream();
  assert.notEqual(once, raw, 'the adapter must change the source');
  // the whole build chain must leave every other adapter's contribution intact
  assert.equal(once.includes(`const SH0 = ${SH0};`), true, 'baseline present after adapt');
  assert.equal(once.includes(`const SH0 = ${SH0};`), true, 'baseline present after adapt');
  assert.equal(once.includes('let shT = 0.55 * closeK'), false, 'legacy term replaced');
  // the obstruction range must be preserved exactly at closeK = 1
  assert.ok(once.includes(`SH0 + (${OBSTRUCTED_ENDPOINT} - SH0) * closeK * closeK * (3 - 2 * closeK)`),
    'the obstruction-driven term must keep its 0.55 endpoint');
  // the wall-transition correction must be present and fail-closed
  assert.ok(once.includes('Math.max(shT, this.shoulder || 0) + 0.25'),
    'the probe must cover the previously applied shoulder, not just the target');
  assert.ok(once.includes('if (this.shoulder > shMax) this.shoulder = shMax;'),
    'the applied shoulder must be clamped to the probed clearance');
  assert.ok(once.includes('let shMax = Infinity;'), 'an unobstructed side must impose no cap');
  // fail-closed: missing anchor and re-applied anchor both throw
  assert.throws(() => adaptQualitySource(REL, ''), /conflict/, 'empty source must be rejected');
  assert.throws(() => adaptQualitySource(REL, once), /conflict/, 're-applying must be rejected');
  assert.throws(() => adaptQualitySource(REL, raw.replace('2.8', '2.9')), /conflict/, 'a drifted anchor must be rejected');
  // and the adapter must not reach sideways into any other file
  const gyro = fs.readFileSync(`${ROOT}patches/local-quality/adapter.mjs`, 'utf8');
  assert.equal(gyro.includes("rel === 'src/game/cameraRig.js'"), true, 'the camera branch must exist');
});