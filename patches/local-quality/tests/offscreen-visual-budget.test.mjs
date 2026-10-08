// #845 — offscreen (frustum-culled) Character visual budget.
//
// Focused installed regression: the source fixture applies all six build
// adapters in production order, then installs both native runtime stacks. The
// cases drive native Actor._finishFrame -> Character.update and the real
// Character `_camHook`; only renderer submission and physics queries are stubbed.
// One Character is constructed and reset between cases.
//
// What is proved here:
//   * baseline (in view / just drawn): the native path still runs pose+hair and
//     the foot-IK physics raycast on every tick;
//   * frustum-culled: pose/hair and every foot-IK physics raycast stop, while
//     the native clocks and the Actor state stay untouched;
//   * return to view: the first visible tick replants feet and re-inits
//     head/hair (the native not-drawn invalidation), with no stale flags;
//   * owner / remote / Range / pause / unknown-camera controls;
//   * 30/60/120 Hz: the decision is a function of renderer frames, not of the
//     simulation step size;
//   * the owned build-adapter wiring is present and idempotent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { installOffscreenVisualBudget, offscreenBudgeted, inViewVolume, GRACE_FRAMES, OUTSIDE_STREAK } from '../offscreen-visual-budget.mjs';
import { qualityIdentity } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const DT = 1 / 60;
const counts = { pose: 0 };
const counters = { ray: 0 };

// Load the exact six source adapters in build order and both installed runtime
// stacks (Splatoon runtime + local-quality bootstrap) before creating an actor.
const api = await fixture({ productionComposition: true, fullRuntime: true, adaptRuntime: compose,
  extraExports: "export { Character } from './inkwave-public/src/game/character.js'; export { installQuality } from './patches/local-quality/install.mjs';" });
const G = api.G, THREE = api.THREE;
const proto = api.Character.prototype;
{
  const rawBuild = proto._buildPose, rawApply = proto._applyPose;
  proto._buildPose = function (...a) { counts.pose++; return rawBuild.apply(this, a); };
  proto._applyPose = function (...a) { counts.pose++; return rawApply.apply(this, a); };
}
const renderer = {
  getRenderTarget: () => null,
  getPixelRatio: () => 1,
  getSize: (t) => { t.x = 1280; t.y = 720; return t; },
  info: { render: { frame: 0 } },
};

G.scene = new THREE.Scene();
G.physics = { raycast: (_o, _d, _f, hit) => { counters.ray++; hit.hit = false; return hit; } };
G.renderer = renderer;
G.match = {};
G.rig = null;
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 6500);
G.camera = camera;
api.installQuality(api.profile);
const installed = Object.hasOwn(proto, Symbol.for('inkwave.local-quality.offscreen-visual-budget.v1'));

const ch = new api.Character({ name: 'offscreen-budget', weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
G.scene.add(ch.root);
ch._warmed = true;                       // warmAll needs a real GL renderer
ch.inWorld = true;
const s = { localMove: { x: 0, z: 0 } };
const actor = Object.assign(Object.create(api.Actor.prototype), {
  remote: true, isLocal: false, team: 1, netTurnRate: 0, anim: s, form: 'kid',
  pos: new THREE.Vector3(), vel: new THREE.Vector3(0, 0, -2.4), yaw: 0,
  smoothY: 0, smoothYV: 0, grounded: true, aimPitch: 0, ink: 100,
  weaponRunner: { firingPose: () => false, charge: 0, rolling: false, aimingSub: false },
  character: ch, hurtFlash: 0, hp: 100, invuln: 0,
  onEnemy: false, groundTeam: 0, specialActive: null,
  specialFrac: () => 0, _events() {},
});

function turnTo()   { camera.position.set(0, 1.5, 8); camera.lookAt(0, 1, 0); }
function turnAway() { camera.position.set(0, 1.5, 8); camera.lookAt(0, 1.5, 100); }

function step() { actor.pos.z -= 0.04; actor._finishFrame(DT); }

/** Record the native draw signal exactly the way `_camHook` does on a real submit. */
function markDrawn(frame) {
  renderer.info.render.frame = frame;
  ch._camHook(renderer, G.scene, camera);
  assert.equal(ch._camFrame, frame, '_camHook must record the renderer frame');
}

/** Reset the world and settle into a walking gait with the camera facing the actor. */
function reset({ range = false, frames = 120 } = {}) {
  counters.ray = 0;
  G.physics = { raycast: (_o, _d, _f, hit) => { counters.ray++; hit.hit = false; return hit; } };
  G.match = range ? { opts: { range: true } } : {};
  G.camera = camera;
  G.renderer = renderer;
  ch.root.position.set(0, 0, 0);
  ch.root.rotation.set(0, 0, 0);
  ch._camFrame = -1;
  ch._rendered = false;
  ch._ovbOutsideStreak = 0;
  ch._ovbWasBudgeted = false;
  ch._ovbBudgetTicks = 0;
  ch._ovbRaycastsSkipped = 0;
  ch._ovbPoseSkips = 0;
  ch.replant = true; ch.feetValid = false; ch.headInit = false; ch._headSet = false;
  ch.lod.force = -1;
  ch.isLocal = false;
  s.isLocal = false;
  turnTo();
  for (let i = 0; i < frames; i++) step();
}

test('wiring: the owned helper is connected from installQuality and carries a build identity', () => {
  assert.equal(installed, true, 'the budget installs exactly once on the composed prototype');
  assert.equal(installOffscreenVisualBudget({ Character: api.Character }, G), false, 'idempotent');
  const src = fs.readFileSync(ROOT + 'patches/local-quality/install.mjs', 'utf8');
  assert.match(src, /import \{ installOffscreenVisualBudget \} from '\.\/offscreen-visual-budget\.mjs';/);
  assert.match(src, /installOffscreenVisualBudget\(api,G\);/);
  const id = qualityIdentity()['offscreen-visual-budget.mjs'];
  assert.ok(id && /^[0-9a-f]{64}$/.test(id), 'shipped file is part of the build identity');
});

test('view-volume test: facing / away / unusable cameras', () => {
  reset({ frames: 1 });
  turnTo();   assert.equal(inViewVolume(ch, camera), true, 'facing the actor');
  turnAway(); assert.equal(inViewVolume(ch, camera), false, 'looking away');
  assert.equal(inViewVolume(ch, null), null, 'no camera -> unknown');
  const holder = new THREE.Object3D();
  const parented = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 6500);
  parented.position.set(0, 1.5, 8); holder.add(parented);
  assert.equal(inViewVolume(ch, parented), null, 'parented camera -> unknown');
  const offset = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 6500);
  offset.setViewOffset(1280, 720, 120, 0, 1280, 720);
  assert.equal(inViewVolume(ch, offset), null, 'offset view -> unknown');
});

test('baseline: while in view / just drawn the native pose+hair and foot-IK raycast still run every tick', () => {
  reset();
  markDrawn(10);
  turnTo();
  const pose0 = counts.pose, ray0 = counters.ray, ticks0 = ch._ovbBudgetTicks;
  for (let i = 0; i < 30; i++) step();
  assert.equal(counts.pose - pose0, 30 * 2, 'both pose passes run on every native tick (build + apply)');
  assert.ok(counters.ray - ray0 > 0, `baseline must exercise foot-IK physics raycasts, got ${counters.ray - ray0}`);
  assert.equal(ch._ovbBudgetTicks - ticks0, 0, 'nothing is budgeted while in view');
});

test('#845: frustum-culled actors stop pose/hair work and every foot-IK physics raycast', () => {
  reset();
  markDrawn(100);
  turnAway();
  step();                                       // grace window: full rate
  assert.equal(ch._ovbWasBudgeted, false, 'inside the grace window');
  renderer.info.render.frame = 101;
  step();
  assert.equal(ch._ovbWasBudgeted, false, 'still inside the grace window');

  renderer.info.render.frame = 100 + GRACE_FRAMES;
  step();                                       // first outside verdict
  assert.equal(ch._ovbWasBudgeted, false, 'the first outside verdict alone does not budget');
  const pose0 = counts.pose, ray0 = counters.ray, t0 = ch.t, tr0 = ch.tr[0], ticks0 = ch._ovbBudgetTicks;
  for (let i = 0; i < 59; i++) step();
  assert.equal(counts.pose - pose0, 0, 'no _buildPose/_applyPose while offscreen');
  assert.equal(counters.ray - ray0, 0, 'no foot-IK physics raycast while offscreen');
  assert.equal(ch._ovbBudgetTicks - ticks0, 59, 'every tick in the window is budgeted');
  assert.ok(ch._ovbRaycastsSkipped > 0, 'the native _ground was intercepted instead of being bypassed');
  // clocks and animation state keep advancing on the fixed simulation clock
  assert.ok(Math.abs(ch.t - t0 - 59 * DT) < 1e-9, 'Character clock stays continuous');
  assert.ok(ch.tr[0] > tr0, 'state timers keep advancing offscreen');
  // authoritative Actor state is untouched by the budget
  const before = JSON.stringify(s);
  step();
  assert.equal(JSON.stringify(s), before, 'the Actor (owner/remote state) is never written');
});

test('#845: the first visible tick replants feet and re-inits head/hair', () => {
  reset();
  markDrawn(200);
  turnAway();
  renderer.info.render.frame = 200 + GRACE_FRAMES;
  step(); step(); step();
  assert.equal(ch._ovbWasBudgeted, true, 'budgeted before the turn');
  turnTo();
  const pose0 = counts.pose, ray0 = counters.ray;
  step();
  assert.equal(ch._ovbWasBudgeted, false, 'in view again -> full rate on the same tick');
  assert.ok(counts.pose - pose0 >= 2, 'both pose passes run on the return tick');
  assert.ok(counters.ray - ray0 > 0, 'the replant query runs with the real physics raycast');
  assert.equal(ch.feetValid, true, 'feet replanted on the return tick');
  assert.equal(ch._ovbBudget, false, 'the suppression flag is cleared after every update');
  assert.equal(ch._ovbOutsideStreak, 0, 'the outside streak restarts on re-entry');
});

test('controls: owner, local actor, Range, pause/unrendered and unknown camera stay at full rate', () => {
  reset();
  markDrawn(300);
  renderer.info.render.frame = 320;
  turnAway();
  const savedPhysics = G.physics;
  const fullRate = (label, mutate, restore) => {
    mutate();
    ch._ovbOutsideStreak = 0;
    for (let i = 0; i < OUTSIDE_STREAK + 2; i++) step();
    assert.equal(ch._ovbWasBudgeted, false, `${label} must never be budgeted`);
    restore();
    ch._ovbOutsideStreak = 0;
  };

  fullRate('local actor (s.isLocal)', () => { s.isLocal = true; }, () => { s.isLocal = false; });
  fullRate('local Character (ch.isLocal)', () => { ch.isLocal = true; }, () => { ch.isLocal = false; });
  fullRate('Practice Range', () => { G.match = { opts: { range: true } }; }, () => { G.match = {}; });
  fullRate('unknown camera', () => { G.camera = null; }, () => { G.camera = camera; });
  fullRate('never-drawn character', () => { ch._camFrame = -1; }, () => { ch._camFrame = 300; });
  fullRate('drawn on the previous renderer frame', () => { renderer.info.render.frame = 301; }, () => { renderer.info.render.frame = 320; });
  fullRate('not in the live match scene', () => { G.physics = null; }, () => { G.physics = savedPhysics; });
  fullRate('forced LOD (lab / portrait)', () => { ch.lod.force = 0; }, () => { ch.lod.force = -1; });

  // pause / unrendered: the renderer frame stops advancing while the actor is off-screen
  turnAway(); ch._ovbOutsideStreak = 0; renderer.info.render.frame = 400;
  for (let i = 0; i < OUTSIDE_STREAK; i++) step();
  assert.equal(ch._ovbWasBudgeted, true, 'the off-screen actor is budgeted before the pause');
  const frozen = counts.pose;
  for (let i = 0; i < 10; i++) step();          // renderer never advances
  assert.equal(counts.pose, frozen, 'an unrendered world keeps its visual work deferred');
  assert.equal(renderer.info.render.frame, 400, 'the frame counter really was frozen');
  // resume: camera back on the actor on the very first tick after the frame moves
  renderer.info.render.frame = 401;
  turnTo(); ch._ovbOutsideStreak = 0;
  step();
  assert.equal(ch._ovbWasBudgeted, false, 'resume puts the actor back at full rate immediately');
});

test('30/60/120 Hz: the budget is a function of renderer frames, never of the step size', () => {
  const covered = [];
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    reset();
    markDrawn(500);
    renderer.info.render.frame = 520;
    turnAway();
    ch._ovbOutsideStreak = 0;
    let budgeted = 0;
    const prevT = ch.t;
    for (let i = 0; i < 4 * hz; i++) {          // 4 simulated seconds
      ch.root.position.z -= 0.04;
      ch.update(dt, s);
      if (ch._ovbWasBudgeted) budgeted++;
    }
    assert.ok(Math.abs(ch.t - prevT - 4) < 1e-6, `the fixed clock advances 4 s at ${hz} Hz`);
    // only the single outside warm-up verdict stays full rate; the rest is budgeted
    assert.equal(budgeted, 4 * hz - 1, `identical budget coverage at ${hz} Hz`);
    covered.push(4 * hz - budgeted);
  }
  assert.deepEqual(covered, [1, 1, 1], 'the full-rate warm-up is exactly one tick at every step size');
});

test('#845 ordering regression: update with the OLD camera, then the camera turns, then the actual visible render hook', () => {
  // Reproduces main.js::_frame literally: `m.update(dt)` decides with last
  // frame's camera, `this.rig.update(dt)` turns the camera afterwards, and only
  // then does the renderer submit the mesh. A static-camera proof would hide
  // this race, so the camera orientation genuinely differs between the two phases.
  reset();
  markDrawn(600);
  renderer.info.render.frame = 600 + GRACE_FRAMES;
  turnAway();
  assert.equal(inViewVolume(ch, camera), false, 'phase 1 (old camera): the actor is outside the view volume');
  step();                                        // first outside verdict -> full rate
  assert.equal(ch._ovbWasBudgeted, false, 'first outside verdict stays full rate');
  const pose0 = counts.pose, ray0 = counters.ray, catch0 = ch._ovbCatchUps;
  step();                                        // second verdict -> budgeted
  assert.equal(ch._ovbWasBudgeted, true, 'budgeted while the old camera still looks away');
  assert.equal(counts.pose, pose0, 'the budgeted tick really deferred _buildPose/_applyPose');

  // phase 2: rig.update(dt) turns the camera ONTO the actor after that decision.
  turnTo();
  assert.equal(inViewVolume(ch, camera), true, 'phase 2 (new camera): the actor is now visible');
  assert.equal(counts.pose, pose0, 'no Character.update runs in between — the draw is next');

  // phase 3: the actual visible submission. Find the tier mesh whose
  // onBeforeRender chain carries our catch-up plus the native _camHook.
  const sets = ch.lodSets || {};
  let mesh = (sets[ch.lod?.tier] && sets[ch.lod.tier].list && sets[ch.lod.tier].list[0]) || null;
  if (!mesh) for (const k of Object.keys(sets)) { const L = sets[k]; if (L && L.list && L.list[0]) { mesh = L.list[0]; break; } }
  assert.ok(mesh && typeof mesh.onBeforeRender === 'function', 'the native draw hook is chained on a tier mesh');

  mesh.onBeforeRender(renderer, G.scene, camera, mesh.geometry);   // pre-submission hook

  assert.equal(ch._ovbCatchUps, catch0 + 1, 'exactly one pre-submission catch-up for the budgeted tick');
  assert.ok(counts.pose - pose0 >= 2, `pose + hair rebuilt before the draw call (got ${counts.pose - pose0})`);
  assert.ok(counters.ray - ray0 > 0, 'the replant ground query ran with the real physics raycast');
  assert.equal(ch.feetValid, true, 'feet replanted before the first visible submission');
  assert.equal(ch._ovbWasBudgeted, false, 'the deferred work is consumed, so it cannot run twice');
  assert.equal(ch._ovbBudget, false, 'the suppression flag is never left on outside update');
  assert.equal(ch._camFrame, renderer.info.render.frame, 'the native _camHook still runs after ours (chain intact)');

  const p1 = counts.pose;                         // a second pass (shadow / multi-part) in the same frame
  mesh.onBeforeRender(renderer, G.scene, camera, mesh.geometry);
  assert.equal(counts.pose, p1, 'the catch-up is idempotent within a frame');
  assert.equal(ch._ovbCatchUps, catch0 + 1, 'no second catch-up is charged');
});

test('#845: the far-plane half-space is really evaluated (it must not sit inside a comment)', () => {
  reset({ frames: 1 });
  turnTo();
  assert.equal(inViewVolume(ch, camera), true, 'actor in range is inside');
  ch.root.position.set(0, 0, -10000);            // straight ahead, past `far` (6500)
  assert.equal(inViewVolume(ch, camera), false, 'beyond the far plane must be provably outside');
  ch.root.position.set(0, 0, -6000);             // still inside the frustum depth
  assert.equal(inViewVolume(ch, camera), true, 'inside `far` stays inside');
  ch.root.position.set(0, 0, 0);
});

test('#845: unmodelled projections (zoom / filmOffset / invalid near-far) never cull', () => {
  reset({ frames: 1 });
  turnTo();
  assert.equal(inViewVolume(ch, camera), true, 'the plain camera still classifies');
  camera.zoom = 0.5;                             // widens the real frustum: ignoring it would cull visible actors
  assert.equal(inViewVolume(ch, camera), null, 'zoom != 1 -> unknown, never skip');
  camera.zoom = 2;
  assert.equal(inViewVolume(ch, camera), null, 'a different zoom is still an unmodelled projection');
  camera.zoom = 1;
  camera.filmOffset = 4;                         // shifts the frustum sideways
  assert.equal(inViewVolume(ch, camera), null, 'filmOffset -> unknown, never skip');
  camera.filmOffset = 0;
  const near0 = camera.near, far0 = camera.far;
  camera.near = 0;
  assert.equal(inViewVolume(ch, camera), null, 'degenerate near plane -> unknown');
  camera.near = 7000; camera.far = 6000;
  assert.equal(inViewVolume(ch, camera), null, 'near >= far -> unknown');
  camera.near = near0; camera.far = far0;
  assert.equal(inViewVolume(ch, camera), true, 'restored camera classifies exactly as before');
});

test('decision guards are individually testable and never invent a Nintendo timing', () => {
  assert.equal(GRACE_FRAMES, 2, 'grace is counted in renderer frames');
  assert.equal(OUTSIDE_STREAK, 2, 'outside streak is a fixed verdict count');
  const G2 = { renderer: { info: { render: { frame: 100 } } }, camera: null };
  const probe = { inWorld: true, lod: { force: -1 }, _camFrame: 90, _ovbOutsideStreak: 0, root: null };
  assert.equal(offscreenBudgeted(probe, {}, G2), false, 'unknown camera');
  probe.isLocal = true;
  assert.equal(offscreenBudgeted(probe, {}, G2), false, 'local Character');
  probe.isLocal = false;
  probe._camFrame = -1;
  assert.equal(offscreenBudgeted(probe, {}, G2), false, 'no native draw signal');
  probe._camFrame = 90;
  G2.match = { opts: { range: true } };
  assert.equal(offscreenBudgeted(probe, {}, G2), false, 'Practice Range');
  G2.match = {};
  G2.camera = { isPerspectiveCamera: true, view: null, parent: null, fov: 60, aspect: 16 / 9, near: 0.15, far: 6500, updateMatrixWorld() {}, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.5, 8, 1] } };
  probe.root = { position: { x: 0, y: 0, z: 0 }, parent: null };
  assert.equal(offscreenBudgeted(probe, {}, G2), false, 'inside the view volume resets the streak');
  probe.root.position.z = 200;
  assert.equal(offscreenBudgeted(probe, {}, G2), false, 'first outside verdict does not budget');
  assert.equal(offscreenBudgeted(probe, {}, G2), true, 'second consecutive outside verdict budgets');
});
