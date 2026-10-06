// #845 — offscreen (frustum-culled) Character visual budget.
//
// Focused, cheap and installed: it drives the *real* composed Character module
// (patches/splatoon3/tests/real-character-fixture.mjs loads the byte-locked
// inkwave-public/src/game/character.js through the build adapters) plus the
// native `_camHook` draw signal. Only the renderer and the physics raycast are
// stubbed, exactly as the other local-quality tests do. One Character is
// constructed (its construction dominates the runtime) and reset between cases.
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
import { realCharacter } from '../../splatoon3/tests/real-character-fixture.mjs';
import { installOffscreenVisualBudget, offscreenBudgeted, inViewVolume, GRACE_FRAMES, OUTSIDE_STREAK } from '../offscreen-visual-budget.mjs';
import { qualityIdentity } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DT = 1 / 60;
const counts = { pose: 0 };
const counters = { ray: 0 };

// Counters are installed *before* the budget so the wrapper chain is
// count -> budget -> native (the same order the composed build produces).
const api = await realCharacter();
const G = api.G, THREE = api.THREE;
const proto = api.Character.prototype;
const nativeUpdate = proto.update;
{
  const rawBuild = proto._buildPose, rawApply = proto._applyPose;
  proto._buildPose = function (...a) { counts.pose++; return rawBuild.apply(this, a); };
  proto._applyPose = function (...a) { counts.pose++; return rawApply.apply(this, a); };
}
const installed = installOffscreenVisualBudget({ Character: api.Character }, G);

const renderer = {
  getRenderTarget: () => null,
  getPixelRatio: () => 1,
  getSize: (t) => { t.x = 1280; t.y = 720; return t; },
  info: { render: { frame: 0 } },
};

G.scene = new THREE.Scene();
G.physics = { raycast: (_o, _d, _f, hit) => { counters.ray++; hit.hit = false; return hit; }, los: () => true };
G.renderer = renderer;
G.match = {};
G.rig = null;
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 6500);
G.camera = camera;

const ch = new api.Character({ name: 'offscreen-budget', weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
G.scene.add(ch.root);
ch._warmed = true;                       // warmAll needs a real GL renderer
const s = { form: 'kid', grounded: true, speed: 2.4, localMove: { x: 0, z: -1 }, firing: false, charge: 0, ink: 1, hp: 1, vy: 0, isLocal: false };

function turnTo()   { camera.position.set(0, 1.5, 8); camera.lookAt(0, 1, 0); }
function turnAway() { camera.position.set(0, 1.5, 8); camera.lookAt(0, 1.5, 100); }

function step() { ch.root.position.z -= 0.04; ch.update(DT, s); }

/** Record the native draw signal exactly the way `_camHook` does on a real submit. */
function markDrawn(frame) {
  renderer.info.render.frame = frame;
  ch._camHook(renderer, G.scene, camera);
  assert.equal(ch._camFrame, frame, '_camHook must record the renderer frame');
}

/** Reset the world and settle into a walking gait with the camera facing the actor. */
function reset({ range = false, frames = 120 } = {}) {
  counters.ray = 0;
  G.physics = { raycast: (_o, _d, _f, hit) => { counters.ray++; hit.hit = false; return hit; }, los: () => true };
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

let offlineActor;
function liveOfflineActor() {
  if (!offlineActor) {
    G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
    offlineActor = new api.Actor({ team: 0, slot: 1, name: 'offline authority', weapon: 'shooter', isLocal: false, isBot: true, CharacterClass: api.Character });
    offlineActor.character.inWorld = true;
    offlineActor.character.setVisible(true);
    offlineActor.character._warmed = true;
    offlineActor.weaponRunner.firingPose = () => true;
    G.scene.add(offlineActor.character.root);
  }
  G.actors = [offlineActor];
  G.match = { actors: G.actors, opts: {} };
  G.local = null;
  return offlineActor;
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
  offset.view = { enabled: true, offsetX: 0, offsetY: 0, width: 1, height: 1, fullWidth: 1, fullHeight: 1 };
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

test('#845 presentation-only control: a detached Character can defer offscreen pose/IK work', () => {
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

test('#845 authoritative muzzle guard: offline shooter and both Dualies hands keep native shot parity offscreen', () => {
  const native = new api.Projectiles(G.scene);
  const actor = liveOfflineActor();
  const target = actor.character;
  const slope = { value: 0 };
  G.physics = {
    los: () => true,
    raycast: (origin, _direction, _distance, hit) => {
      counters.ray++;
      hit.hit = true;
      hit.point.set(origin.x, slope.value * origin.x, origin.z);
      hit.normal.set(-slope.value, 1, 0).normalize();
      return hit;
    },
  };
  target.phys = G.physics;
  G.audio = null; G.fx = null;
  turnAway();
  actor._nearCamera = () => false;
  const scenarios = [
    { weapon: 'shooter', hand: 0, slope: 0.18, pitch: 0.12, label: 'Shooter on a slope' },
    { weapon: 'shooter', hand: 0, slope: 0, pitch: Math.PI / 2 - 0.03, label: 'Shooter near vertical aim' },
    { weapon: 'dualies', hand: 0, slope: 0.18, pitch: 0.12, label: 'Dualies right hand on a slope' },
    { weapon: 'dualies', hand: 1, slope: 0.18, pitch: 0.12, label: 'Dualies left hand on a slope' },
    { weapon: 'dualies', hand: 0, slope: 0, pitch: Math.PI / 2 - 0.03, label: 'Dualies right hand near vertical' },
    { weapon: 'dualies', hand: 1, slope: 0, pitch: Math.PI / 2 - 0.03, label: 'Dualies left hand near vertical' },
  ];
  let nativeMuzzleCalls = 0, nativeHandCalls = 0;
  const rawMuzzle = native._muzzle, rawMuzzleHand = native._muzzleHand;
  native._muzzle = function (...args) { nativeMuzzleCalls++; return rawMuzzle.apply(this, args); };
  native._muzzleHand = function (...args) { nativeHandCalls++; return rawMuzzleHand.apply(this, args); };
  const xyz = v => [v.x, v.y, v.z];
  const fireSnapshot = scenario => {
    const w = api.WEAPONS[scenario.weapon];
    assert.ok(w, `native weapon data exists for ${scenario.weapon}`);
    actor.character.setWeapon(scenario.weapon);
    if (scenario.weapon === 'dualies') assert.ok(actor.character.weapon?.left, 'native Dualies rig owns its left pistol');
    actor.weaponRunner.rumbleT = 1;
    const muzzle = new THREE.Vector3();
    if (scenario.weapon === 'shooter') native._muzzle(actor, muzzle);
    else native._muzzleHand(actor, scenario.hand, muzzle);
    const before = native.list.length;
    if (scenario.weapon === 'shooter') native.fireShooter(actor, w, 0);
    else native.fireDualies(actor, w, 0, scenario.hand);
    const shot = native.list[before];
    assert.ok(shot, `${scenario.label}: native Projectiles firing creates a projectile`);
    const out = { muzzle: xyz(muzzle), origin: xyz(shot.pos), velocity: xyz(shot.vel) };
    native.clear();
    return out;
  };

  for (const scenario of scenarios) {
    actor.character.setWeapon(scenario.weapon);
    actor.weapon = api.WEAPONS[scenario.weapon];
    actor.weaponId = scenario.weapon;
    slope.value = scenario.slope;
    actor.pos.set(0.35, slope.value * 0.35, 0);
    actor.aimPitch = scenario.pitch;
    actor.aimDir.set(Math.sin(scenario.pitch), Math.cos(scenario.pitch), -0.15).normalize();
    actor.aimPoint.copy(actor.pos).addScaledVector(actor.aimDir, 24);
    actor.grounded = scenario.pitch < 1;
    actor.vel.set(0.3, 0, 0);
    const subject = actor.character;
    subject.phys = G.physics;
    // A real Match roster must protect the native Actor.anim state from the
    // visual budget; Actor._finishFrame passes that state, not the Actor.
    renderer.info.render.frame = 1000 + GRACE_FRAMES;
    subject._camFrame = 1000;
    subject._ovbOutsideStreak = 0;
    assert.equal(actor.isLocal, false, 'the native bot is non-local');
    const match = G.match, actors = G.actors;
    G.match = { actors: [] }; G.actors = [];
    assert.equal(offscreenBudgeted(subject, actor.anim, G), false, `${scenario.label}: first outside verdict`);
    assert.equal(offscreenBudgeted(subject, actor.anim, G), true, `${scenario.label}: without roster ownership the non-local state would be deferred`);
    G.match = match; G.actors = actors; subject._ovbOutsideStreak = 0;
    assert.equal(offscreenBudgeted(subject, actor.anim, G), false, `${scenario.label}: native Match roster owns this Character`);
    assert.equal(offscreenBudgeted(subject, actor.anim, G), false, `${scenario.label}: offline bots remain full rate`);

    const installedUpdate = subject.update;
    subject.update = nativeUpdate;
    try { actor._finishFrame(DT); } finally { subject.update = installedUpdate; }
    const baseline = fireSnapshot(scenario);
    subject._ovbOutsideStreak = 0;
    subject._ovbWasBudgeted = false;
    actor._finishFrame(0); // Actor -> Character installed path, at the same pose time
    assert.equal(subject._ovbWasBudgeted, false, `${scenario.label}: no offscreen defer for an authoritative Actor`);
    const patched = fireSnapshot(scenario);
    for (const key of ['muzzle', 'origin', 'velocity']) for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(patched[key][axis] - baseline[key][axis]) <= 1e-8,
        `${scenario.label}: ${key}[${axis}] parity (${baseline[key][axis]} vs ${patched[key][axis]})`);
    }
  }
  assert.ok(nativeMuzzleCalls >= 4, 'Shooter launches used Projectiles._muzzle');
  assert.ok(nativeHandCalls >= 8, 'both Dualies launches used Projectiles._muzzleHand');
});

test('#845 camera return guard: an offline Actor is full-rate before the first visible native render hook', () => {
  reset();
  turnAway();
  const actor = liveOfflineActor();
  const subject = actor.character;
  subject.phys = G.physics;
  actor.vel.set(0.3, 0, 0);
  subject._camFrame = renderer.info.render.frame;
  renderer.info.render.frame += GRACE_FRAMES;
  subject._ovbOutsideStreak = 0;
  const before = counts.pose;
  actor._finishFrame(DT);
  actor._finishFrame(DT);
  assert.equal(subject._ovbWasBudgeted, false, 'offline authoritative actors are never deferred');
  assert.equal(counts.pose - before, 4, 'both pose passes ran for each offscreen tick');
  turnTo();
  const current = renderer.info.render.frame;
  subject._camHook(renderer, G.scene, camera);
  assert.equal(subject._camFrame, current, 'native _camHook marks the first returned visible submission');
  assert.equal(subject._ovbWasBudgeted, false, 'no deferred catch-up or stale pose remains on return');
});
