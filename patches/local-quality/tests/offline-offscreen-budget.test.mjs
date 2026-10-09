// #845 residual: long-undrawn OFFLINE bots stop hair + foot-IK raycasts.
// Cheap real composed native test: full six-adapter production composition +
// both runtime stacks; only renderer submission and physics are stubbed. One
// real Actor (offline BotBrain path, remote unset) is driven through native
// Actor._finishFrame -> Character.update with the native _camHook draw signal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { installOfflineOffscreenBudget, offlineBudgeted, GRACE_FRAMES } from '../offline-offscreen-budget.mjs';
import { qualityIdentity } from '../adapter.mjs';

const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const DT = 1 / 60;

const api = await fixture({ productionComposition: true, fullRuntime: true, adaptRuntime: compose,
  extraExports: "export { Character } from './inkwave-public/src/game/character.js'; export { installQuality } from './patches/local-quality/install.mjs';" });
const THREE = api.THREE;
const renderer = { getRenderTarget: () => null, getPixelRatio: () => 1,
  getSize: (t) => { t.x = 1280; t.y = 720; return t; }, info: { render: { frame: 0 } } };
const counters = { ray: 0 };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 6500);
camera.position.set(0, 1.5, 8); camera.lookAt(0, 1.5, 100);

api.installQuality(api.profile);
// api.G is the live context the composed Character reads: overlay stubs onto it.
api.G.scene = new THREE.Scene();
api.G.renderer = renderer;
api.G.match = {};
api.G.rig = null;
api.G.camera = camera;
const G = api.G;
G.physics = { raycast: (_o, _d, _f, hit) => { counters.ray++; hit.hit = false; return hit; } };
const installed = Object.hasOwn(api.Character.prototype,
  Symbol.for('inkwave.local-quality.offline-offscreen-budget.v1'));

function makeOfflineBot() {
  const actor = new api.Actor({ team: 1, name: 'offline-residual', weapon: 'shooter',
    isLocal: false, isBot: true, CharacterClass: api.Character });
  const ch = actor.character;
  G.scene.add(ch.root); ch._warmed = true; ch.inWorld = true;
  actor.vel.set(0, 0, -2.4);
  return { actor, ch };
}
function resetWorld() {
  counters.ray = 0;
  G.physics = { raycast: (_o, _d, _f, hit) => { counters.ray++; hit.hit = false; return hit; } };
  G.match = {}; G.rig = null; G.camera = camera;
}
test('wiring: residual adapter installed once, identity covers the new file', () => {
  assert.equal(installed, true, 'installQuality wires the residual budget');
  assert.equal(api.Character.prototype._oobWasBudgeted !== undefined, true, 'observability fields present');
  const again = installOfflineOffscreenBudget({ Character: api.Character }, G);
  assert.equal(again, false, 'second install is a no-op');
  const identity = qualityIdentity();
  assert.ok(identity['offline-offscreen-budget.mjs'], 'new file is identity-pinned');
});
test('offline long-undrawn bot: hair + every foot-IK raycast stop, clocks + Actor state untouched', () => {
  resetWorld();
  const { actor, ch } = makeOfflineBot();
  let hair = 0;
  const nativeHair = ch._updateHair.bind(ch);
  ch._updateHair = (...a) => { hair++; return nativeHair(...a); };
  renderer.info.render.frame = 100;
  ch._camHook(renderer, G.scene, camera);
  renderer.info.render.frame = 100 + GRACE_FRAMES;
  console.log(JSON.stringify({ dbg: 'pre', camFrame: ch._camFrame, frame: renderer.info.render.frame,
    inWorld: ch.inWorld, lodForce: ch.lod?.force, isLocalS: actor.isLocal, isLocalCh: ch.isLocal,
    remote: actor.remote ?? null, hasOOB: Object.hasOwn(api.Character.prototype, Symbol.for('inkwave.local-quality.offline-offscreen-budget.v1')) }));
  for (let i = 0; i < 59; i++) { actor.pos.z -= 0.04; actor._finishFrame(DT); }
  console.log(JSON.stringify({ dbg: 'post', budgeted: ch._oobWasBudgeted, ticks: ch._oobBudgetTicks, protoGround: api.Character.prototype._ground?.name }));
  assert.equal(ch._oobWasBudgeted, true, 'budgeted once past the grace window');
  assert.equal(ch._oobBudgetTicks, 59, 'every tick in the window is budgeted');
  assert.equal(counters.ray, 0, 'no foot-IK physics raycast while long-undrawn');
  assert.equal(hair, 0, 'no hair integration while long-undrawn');
  assert.ok(ch._oobRaycastsSkipped > 0, 'native _ground intercepted, not bypassed');
  assert.ok(ch._oobHairSkips > 0, 'native _updateHair intercepted, not bypassed');
  const t0 = ch.t, tr0 = ch.tr[0];
  const before = actor.pos.clone();
  actor.pos.z -= 0.04; actor._finishFrame(DT);
  assert.ok(Math.abs(ch.t - t0 - DT) < 1e-9, 'Character clock stays continuous');
  assert.ok(ch.tr[0] > tr0, 'state timers keep advancing');
  assert.ok(Number.isFinite(actor.pos.z) && actor.pos.z < before.z, 'authoritative Actor motion continues');
  ch.dispose();
});
test('return to view: first visible tick replants feet + re-inits head/hair', () => {
  resetWorld();
  const { actor, ch } = makeOfflineBot();
  renderer.info.render.frame = 200;
  ch._camHook(renderer, G.scene, camera);
  renderer.info.render.frame = 200 + GRACE_FRAMES;
  for (let i = 0; i < 3; i++) { actor.pos.z -= 0.04; actor._finishFrame(DT); }
  assert.equal(ch._oobWasBudgeted, true, 'budgeted before the return');
  renderer.info.render.frame = 203 + GRACE_FRAMES;
  ch._camHook(renderer, G.scene, camera);
  const ray0 = counters.ray;
  actor.pos.z -= 0.04; actor._finishFrame(DT);
  assert.equal(ch._oobWasBudgeted, false, 'fresh draw -> full rate on the same tick');
  assert.ok(counters.ray - ray0 > 0, 'replant query runs with the real physics raycast');
  assert.equal(ch.feetValid, true, 'feet replanted on the return tick');
  assert.equal(ch._oobBudget, false, 'suppression flag cleared after every update');
  ch.dispose();
});
test('controls: local, remote, Range, forced LOD, never-drawn stay full rate', () => {
  resetWorld();
  const { actor, ch } = makeOfflineBot();
  renderer.info.render.frame = 300;
  ch._camHook(renderer, G.scene, camera);
  renderer.info.render.frame = 330;
  const fullRate = (label, mutate, restore) => {
    mutate();
    ch._oobWasBudgeted = false;
    for (let i = 0; i < 5; i++) { actor.pos.z -= 0.04; actor._finishFrame(DT); }
    assert.equal(ch._oobWasBudgeted, false, label + ' must never be budgeted');
    restore();
    ch._oobWasBudgeted = false;
  };
  fullRate('local actor', () => { actor.isLocal = true; }, () => { actor.isLocal = false; });
  fullRate('remote replica (sibling adapter owns it)', () => { actor.remote = true; }, () => { actor.remote = false; });
  fullRate('Practice Range', () => { G.match = { opts: { range: true } }; }, () => { G.match = {}; });
  fullRate('forced LOD', () => { ch.lod.force = 0; }, () => { ch.lod.force = -1; });
  fullRate('never-drawn', () => { ch._camFrame = -1; }, () => { ch._camFrame = 300; });
  ch.dispose();
  assert.equal(offlineBudgeted(null, {}, G), false, 'null character');
  assert.equal(offlineBudgeted({ inWorld: true }, { remote: true }, G), false, 'remote excluded');
});
test('30/60/120 Hz: Character clock advances equally; stale-draw budget independent of step size', () => {
  for (const hz of [30, 60, 120]) {
    resetWorld();
    const dt = 1 / hz;
    const { actor, ch } = makeOfflineBot();
    renderer.info.render.frame = 500;
    ch._camHook(renderer, G.scene, camera);
    renderer.info.render.frame = 520;
    const prevT = ch.t;
    for (let i = 0; i < 2 * hz; i++) { actor.pos.z -= 0.04; actor._finishFrame(dt); }
    assert.ok(Math.abs(ch.t - prevT - 2) < 1e-6, 'fixed clock advances 2 s at ' + hz + ' Hz');
    assert.equal(ch._oobBudgetTicks, 2 * hz, 'identical budget coverage at ' + hz + ' Hz');
    ch.dispose();
  }
});
test('offline firing keeps the native bone muzzle at 60 Hz while long-undrawn', () => {
  resetWorld();
  G.projectiles = new api.Projectiles(G.scene);
  const { actor, ch } = Object.assign(makeOfflineBot(), {});
  actor.weapon = 'shooter';
  renderer.info.render.frame = 700;
  ch._camHook(renderer, G.scene, camera);
  for (let i = 0; i < 60; i++) { actor.pos.z -= 0.04; actor._finishFrame(DT); }
  assert.equal(ch._oobWasBudgeted, true, 'budgeted while long-undrawn');
  const expected = ch.getMuzzle(new THREE.Vector3()).clone();
  G.projectiles.fireShooter(actor, actor.weaponRunner.weapon || actor.weapon, 0);
  const shot = G.projectiles.list.at(-1);
  assert.ok(shot, 'native shooter path emitted a shot while budgeted');
  assert.ok(shot.start.distanceTo(expected) < 1e-8, 'projectile origin is the live bone muzzle');
  ch.dispose();
});
