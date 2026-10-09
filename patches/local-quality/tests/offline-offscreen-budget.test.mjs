// #845 offline-bot residual: retain the native pose/gameplay clock while
// suppressing only foot-IK physics samples and hair integration after long
// absence from the renderer. The fixture composes the public source adapters
// and both production runtime stacks; only rendering/physics sinks are stubbed.
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
const api = await fixture({
  productionComposition: true,
  fullRuntime: true,
  adaptRuntime: compose,
  extraExports: "export { Character } from './inkwave-public/src/game/character.js'; export { installQuality } from './patches/local-quality/install.mjs';",
});
const { G, THREE } = api;
const DT = 1 / 60;
const renderer = {
  getRenderTarget: () => null,
  getPixelRatio: () => 1,
  getSize: (target) => { target.x = 1280; target.y = 720; return target; },
  info: { render: { frame: 0 } },
};
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 6500);
camera.position.set(0, 1.5, 8);
camera.lookAt(0, 1.5, 100);
camera.updateMatrixWorld(true);
const counters = { raycast: 0, groundProbe: [], bodyCollision: [] };

function physicsStub() {
  return {
    los: () => true,
    raycast: (_origin, _direction, _distance, hit) => {
      counters.raycast++;
      hit.hit = false;
      return hit;
    },
    groundProbe: (x, y, z, up, down, radius, hit, isSquid) => {
      counters.groundProbe.push([x, y, z, up, down, radius, !!isSquid]);
      hit.hit = true;
      hit.y = 0;
      hit.normal.set(0, 1, 0);
      hit.face = 0;
      hit.u = 0;
      hit.v = 0;
      hit.block = -1;
      return hit;
    },
    collideBody: (pos, radius, lift, height, contacts, stick, isSquid) => {
      counters.bodyCollision.push([
        ...pos.toArray(), radius, lift, height, !!stick, !!isSquid,
      ]);
      contacts.ceiling = false;
      contacts.wall = false;
      contacts.wallNormal.set(0, 0, 1);
      return contacts;
    },
  };
}

api.installQuality(api.profile);
function resetWorld() {
  counters.raycast = 0;
  counters.groundProbe.length = 0;
  counters.bodyCollision.length = 0;
  G.scene = new THREE.Scene();
  G.renderer = renderer;
  G.camera = camera;
  G.rig = null;
  G.match = { state: 'playing', attract: false, local: null, opts: { range: false } };
  G.physics = physicsStub();
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 2, splat: () => 0 };
  G.time = 0;
}

function makeBot({ name = 'offline-residual', isBot = true, isLocal = false } = {}) {
  const actor = new api.Actor({
    team: 1, name, weapon: 'shooter', isLocal, isBot, CharacterClass: api.Character,
  });
  const ch = actor.character;
  G.scene.add(ch.root);
  ch._warmed = true;
  actor.pos.set(0, 0, 0);
  actor.vel.set(0, 0, -2.4);
  actor.grounded = true;
  actor.ground.hit = true;
  actor.ground.y = 0;
  actor.ground.normal.set(0, 1, 0);
  actor.ground.face = 0;
  actor.ground.block = -1;
  actor.ground.u = 0;
  actor.ground.v = 0;
  actor.intent.move.set(0, 0, 1);
  return { actor, ch };
}

function submit(ch, frame) {
  renderer.info.render.frame = frame;
  const set = Object.values(ch.lodSets || {}).find((candidate) => candidate?.list?.length);
  assert.ok(set?.list?.[0]?.onBeforeRender, 'native Character LOD has a render hook');
  set.list[0].onBeforeRender(renderer, G.scene, camera);
}

test('wiring: only bot identity is added to Character state; install is idempotent and build-pinned', () => {
  resetWorld();
  const installed = Object.hasOwn(api.Character.prototype,
    Symbol.for('inkwave.local-quality.offline-offscreen-budget.v1'));
  assert.equal(installed, true, 'installQuality wires the offline residual');
  assert.equal(installOfflineOffscreenBudget({ Character: api.Character }, G), false, 'second install is a no-op');
  const identity = qualityIdentity();
  assert.ok(identity['offline-offscreen-budget.mjs'], 'new runtime helper is identity-pinned');

  const { actor, ch } = makeBot();
  actor._finishFrame(DT);
  assert.equal(actor.anim.isBot, true, 'Actor._finishFrame carries bot identity in the presentation record');
  ch.dispose();
});

test('long-undrawn offline bot: no foot-IK raycasts or hair integration, while pose and clocks continue', () => {
  resetWorld();
  const { actor, ch } = makeBot();
  actor._finishFrame(DT);
  submit(ch, 100);
  renderer.info.render.frame = 100 + GRACE_FRAMES;

  let poseCalls = 0;
  const nativeBuildPose = ch._buildPose.bind(ch);
  ch._buildPose = (dt, state) => { poseCalls++; return nativeBuildPose(dt, state); };
  const t0 = ch.t;
  const timer0 = ch.tr[0];
  const rays0 = counters.raycast;
  for (let i = 0; i < 59; i++) {
    actor.pos.z -= 0.04;
    actor._finishFrame(DT);
  }

  assert.equal(ch._oobWasBudgeted, true, 'offline bot is budgeted after the renderer-frame grace');
  assert.equal(ch._oobBudgetTicks, 59, 'every undrawn update uses the visual budget');
  assert.equal(counters.raycast - rays0, 0, 'grounded foot-IK raycasts are suppressed');
  assert.ok(ch._oobRaycastsSkipped > 0, 'native Character._ground path was intercepted');
  assert.ok(ch._oobHairSkips > 0, 'native hair integration was suppressed');
  assert.equal(poseCalls, 59, 'native pose rebuild still runs every simulation tick');
  assert.ok(Math.abs(ch.t - t0 - 59 * DT) < 1e-9, 'Character pose clock advances normally');
  assert.ok(ch.tr[0] > timer0, 'animation state timers continue advancing');
  assert.ok(Math.abs(actor.pos.z + 59 * 0.04) < 1e-12, 'Actor-owned movement state is untouched by the visual budget');
  ch.dispose();
});

test('first visible render after a camera turn replants feet and advances hair once before submission', () => {
  resetWorld();
  const { actor, ch } = makeBot();
  actor._finishFrame(DT);
  submit(ch, 200);
  renderer.info.render.frame = 200 + GRACE_FRAMES;
  for (let i = 0; i < 3; i++) {
    actor.pos.z -= 0.04;
    actor._finishFrame(DT);
  }
  assert.equal(ch._oobWasBudgeted, true, 'bot entered the long-undrawn budget');

  // Actor/Character update precedes the camera-dependent render. Simulate the
  // stale-camera decision, then invoke the native mesh hook for the newly visible frame.
  const clockBeforeZeroDelta = ch.t;
  actor._finishFrame(0);
  assert.equal(ch._oobWasBudgeted, true, 'the update before the new draw still sees the old render frame');
  assert.equal(ch.t, clockBeforeZeroDelta, 'zero-delta simulation update preserves the native pose clock');
  ch.lifeLv = 2; // Ensure the native pose rebuild exercises its ordinary hair-update branch.
  ch._hairAcc = 0.05; // Model the native far-tier half-rate accumulator at return.
  const hairSpringsBeforeSubmit = [...ch.hx, ...ch.hv];
  const clockAtSubmit = ch.t;
  const raysBeforeSubmit = counters.raycast;
  submit(ch, 231);

  assert.equal(ch._oobWasBudgeted, false, 'the pre-submission hook consumes the pending return');
  assert.equal(ch._oobCatchUps, 1, 're-entry work runs once before the mesh is submitted');
  assert.equal(ch._oobHairCatchUps, 1, 'hair receives this tick once without hidden-time debt');
  assert.ok(counters.raycast > raysBeforeSubmit, 'real foot ground queries resume before visible submission');
  assert.equal(ch.feetValid, true, 'feet are replanted for the first visible frame');
  assert.equal(ch.headInit, true, 'head/hair history is initialized before the first visible frame');
  assert.equal(ch._camFrame, 231, 'native draw hook records the returning render frame');
  assert.equal(ch.t, clockAtSubmit, 'render catch-up does not advance the native pose clock');
  assert.equal(ch._hairAcc, 0, 're-entry drops any hidden half-rate hair accumulator');
  assert.deepEqual([...ch.hx, ...ch.hv], hairSpringsBeforeSubmit,
    'zero-delta render re-entry does not integrate hidden-time hair debt');

  renderer.info.render.frame = 232;
  actor.pos.z -= 0.04;
  actor._finishFrame(DT);
  assert.equal(ch._oobWasBudgeted, false, 'freshly drawn bot stays full-rate on the next simulation update');
  ch.dispose();
});

test('scope guards keep local, remote, non-bot, attract, Practice Range and unknown actors full-rate', () => {
  const ch = { isLocal: false, inWorld: true, lod: { force: -1 }, _camFrame: 70 };
  const state = { isBot: true };
  const G2 = {
    match: { local: null, attract: false, opts: {} },
    renderer: { info: { render: { frame: 100 } } },
  };
  assert.equal(offlineBudgeted(ch, state, G2), true, 'eligible long-undrawn offline bot');
  assert.equal(offlineBudgeted(ch, { isBot: false }, G2), false, 'non-bot');
  assert.equal(offlineBudgeted(ch, { isBot: true, remote: true }, G2), false, 'remote actor owned by PR #1175');
  assert.equal(offlineBudgeted({ ...ch, isLocal: true }, state, G2), false, 'local Character');
  assert.equal(offlineBudgeted({ ...ch, _camFrame: -1 }, state, G2), false, 'never-drawn Character');
  assert.equal(offlineBudgeted({ ...ch, inWorld: false }, state, G2), false, 'not in the live world');
  assert.equal(offlineBudgeted({ ...ch, lod: { force: 0 } }, state, G2), false, 'forced LOD');
  G2.match.opts.range = true;
  assert.equal(offlineBudgeted(ch, state, G2), false, 'Practice Range');
  G2.match.opts.range = false;
  G2.match.attract = true;
  assert.equal(offlineBudgeted(ch, state, G2), false, 'menu attract scene');
  G2.match.attract = false;
  assert.equal(offlineBudgeted(ch, state, { ...G2, match: null }), false, 'no active match');
  assert.equal(offlineBudgeted(null, state, G2), false, 'missing Character');
});

test('30/60/120 Hz fixed-step schedules preserve the native Character clock', () => {
  for (const hz of [30, 60, 120]) {
    resetWorld();
    const { actor, ch } = makeBot({ name: 'clock-' + hz });
    const dt = 1 / hz;
    actor._finishFrame(dt);
    submit(ch, 500);
    renderer.info.render.frame = 500 + GRACE_FRAMES;
    const t0 = ch.t;
    const timer0 = ch.tr[0];
    for (let i = 0; i < 2 * hz; i++) {
      actor.pos.z -= 2.4 / hz;
      actor._finishFrame(dt);
    }
    assert.equal(ch._oobBudgetTicks, 2 * hz, 'budget coverage at ' + hz + ' Hz');
    assert.ok(Math.abs(ch.t - t0 - 2) < 1e-6, 'pose clock advances two seconds at ' + hz + ' Hz');
    assert.ok(ch.tr[0] > timer0, 'state timers continue at ' + hz + ' Hz');
    ch.dispose();
  }
});

test('offline firing retains the native bone muzzle while the bot is long-undrawn', () => {
  resetWorld();
  G.projectiles = new api.Projectiles(G.scene);
  const { actor, ch } = makeBot({ name: 'offline-muzzle' });
  const { actor: renderedActor, ch: renderedCh } = makeBot({ name: 'offline-muzzle' });
  actor._finishFrame(DT);
  renderedActor._finishFrame(DT);
  submit(ch, 700);
  submit(renderedCh, 700);
  for (let i = 0; i < 60; i++) {
    const frame = 701 + i;
    renderer.info.render.frame = frame;
    actor.pos.z -= 0.04;
    actor._finishFrame(DT);
    renderedActor.pos.z -= 0.04;
    renderedActor._finishFrame(DT);
    submit(renderedCh, frame);
  }
  assert.equal(ch._oobWasBudgeted, true, 'bot remains in the offline visual budget');
  assert.equal(renderedCh._oobWasBudgeted, false, 'control bot stays fully rendered');
  const firstShot = G.projectiles.list.length;
  G.projectiles.fireShooter(actor, actor.weaponRunner.weapon || actor.weapon, 0);
  G.projectiles.fireShooter(renderedActor, renderedActor.weaponRunner.weapon || renderedActor.weapon, 0);
  const [budgetedShot, renderedShot] = G.projectiles.list.slice(firstShot);
  assert.ok(budgetedShot && renderedShot, 'native shooter path emitted both projectiles');
  const muzzleComparison = {
    budgeted: budgetedShot.start.toArray(), rendered: renderedShot.start.toArray(),
    budgetedBone: ch.getMuzzle(new THREE.Vector3()).toArray(),
    renderedBone: renderedCh.getMuzzle(new THREE.Vector3()).toArray(),
  };
  assert.ok(budgetedShot.start.distanceTo(renderedShot.start) < 1e-8,
    'offline bot projectile origin matches the fully rendered native bone muzzle: ' + JSON.stringify(muzzleComparison));
  ch.dispose();
  renderedCh.dispose();
});

test('movement input and body/ground collision match a fully rendered offline bot', () => {
  resetWorld();
  const budgeted = makeBot({ name: 'movement-pair' });
  const rendered = makeBot({ name: 'movement-pair' });
  budgeted.actor.vel.set(0, 0, 0);
  rendered.actor.vel.set(0, 0, 0);
  budgeted.actor._finishFrame(DT);
  rendered.actor._finishFrame(DT);
  submit(budgeted.ch, 800);
  submit(rendered.ch, 800);

  for (let i = 0; i < 60; i++) {
    const frame = 801 + i;
    renderer.info.render.frame = frame;
    G.time += DT;
    const bodyStart = counters.bodyCollision.length;
    const groundStart = counters.groundProbe.length;
    budgeted.actor.update(DT);
    const budgetBody = counters.bodyCollision.slice(bodyStart);
    const budgetGround = counters.groundProbe.slice(groundStart);
    const bodyMiddle = counters.bodyCollision.length;
    const groundMiddle = counters.groundProbe.length;
    rendered.actor.update(DT);
    const renderedBody = counters.bodyCollision.slice(bodyMiddle);
    const renderedGround = counters.groundProbe.slice(groundMiddle);
    submit(rendered.ch, frame);

    assert.deepEqual(
      [...budgeted.actor.pos.toArray(), ...budgeted.actor.vel.toArray(), budgeted.actor.hp, budgeted.actor.ink],
      [...rendered.actor.pos.toArray(), ...rendered.actor.vel.toArray(), rendered.actor.hp, rendered.actor.ink],
      'authoritative Actor state matches at tick ' + i,
    );
    assert.deepEqual(budgetBody, renderedBody, 'body collision inputs match at tick ' + i);
    assert.deepEqual(budgetGround, renderedGround, 'ground collision inputs match at tick ' + i);
  }
  assert.ok(budgeted.ch._oobBudgetTicks > 0, 'one bot exercised the long-undrawn path');
  assert.ok(budgeted.actor.pos.z > 0, 'movement input was applied through native Actor.update');
  budgeted.ch.dispose();
  rendered.ch.dispose();
});
