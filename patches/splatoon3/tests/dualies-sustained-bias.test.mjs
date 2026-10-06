import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function rig() {
  const f = await fixture();
  const { G, THREE } = f;
  G.scene = new THREE.Scene();
  const a = f.make('dualies');
  a.isLocal = true; a.form = 'human'; a.grounded = a.ground.hit = true; a.ink = 1;
  const spreads = [];
  const projectiles = Object.create(f.Projectiles.prototype);
  projectiles.list = [];
  projectiles._muzzleHand = (_actor, _hand, out) => out.set(0, 1, 0);
  projectiles._fireRound = (_actor, _weapon, spread) => {
    spreads.push(spread);
    return new THREE.Vector3(0, 0, -1);
  };
  projectiles._new = () => ({
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(), vel: new THREE.Vector3(),
  });
  G.projectiles = projectiles;
  const step = (dt, fire, intentFire = fire) => {
    a.intent.fire = intentFire; a.intent.sub = false; G.time += dt;
    a.update(dt);
  };
  return { f, a, r: a.weaponRunner, G, projectiles, spreads, step };
}

test('#891 Dualies bias state, outer HUD envelope, real emissions, and recovery boundaries', async t => {
  await t.test('HUD reports the grounded/air outer endpoint separately from probability', async () => {
    const { a, r } = await rig();
    const state = r.s3DualiesBiasState(a.weapon);
    assert.equal(state.bias, 0.01);
    assert.equal(state.innerEndpoint, 0);
    assert.equal(state.groundEnvelope, 2);
    assert.equal(state.airEnvelope, 7.5);
    assert.equal(r._spreadDeg(a.weapon), 2);
    assert.notEqual(r._spreadDeg(a.weapon), 2 * (1 - state.bias) + 7.5 * state.bias);
    a.grounded = false;
    assert.equal(r._spreadDeg(a.weapon), 7.5);
  });

  await t.test('normal emitted rounds use the existing endpoint sampler and stop at the documented cap', async () => {
    const { f, a, r, spreads, step } = await rig();
    f.setRandom(() => 0);
    for (let i = 0; i < 12 && spreads.length < 1; i++) step(1 / 60, true);
    assert.equal(spreads.length, 1);
    assert.equal(spreads.length, 1);
    assert.equal(spreads[0], 2);
    assert.equal(r.s3DualiesBias, 0.02);
    f.setRandom(() => 0.99);
    for (let i = 0; i < 30 && spreads.length < 2; i++) step(1 / 60, true);
    assert.equal(spreads.length, 2);
    assert.equal(spreads[1], 0);
    a.ink = Infinity;
    for (let i = 0; i < 300 && r.s3DualiesNormalEmissionCount < 24; i++) step(1 / 60, true);
    assert.equal(r.s3DualiesNormalEmissionCount, 24);
    assert.equal(r.s3DualiesBias, 0.25);
    f.restoreRandom();
  });

  await t.test('empty clicks do not advance bias; held squid form does not masquerade as trigger release', async () => {
    const { a, r, spreads, step } = await rig();
    a.ink = 0; a.intent.fire = true; r.s3DualiesHeld = true; r.s3DualiesStart = 0;
    r.update(1 / 60, { fire: true, sub: false, firePressed: true });
    assert.equal(spreads.length, 0);
    assert.equal(r.s3DualiesBias, 0.01);
    a.ink = 1; r.s3DualiesBias = 0.2; r.s3DualiesBiasHold = 0;
    a.form = 'squid'; a.intent.fire = true;
    r.update(1 / 60, { fire: false, sub: false, firePressed: false });
    assert.equal(r.s3DualiesBias, 0.2);
    assert.equal(r.s3DualiesNormalEmissionCount, 0);
  });

  await t.test('5F hold and 0.005/F recovery agree at 30/60/120Hz', async () => {
    const results = [];
    for (const hz of [30, 60, 120]) {
      const { a, r, step } = await rig();
      a.intent.fire = false; r.s3DualiesBias = 0.2; r.s3DualiesBiasHold = 5;
      r.s3DualiesBiasFrameAccumulator = 0;
      const stepsToSixFrames = hz / 10;
      for (let i = 0; i < stepsToSixFrames; i++) step(1 / hz, false);
      results.push([r.s3DualiesBias, r.s3DualiesBiasHold]);
      r.onDeath();
      assert.equal(r.s3DualiesBias, 0.01);
      assert.equal(r.s3DualiesBiasFrameAccumulator, 0);
    }
    assert.deepEqual(results, [[0.195, 0], [0.195, 0], [0.195, 0]]);
  });

  await t.test('jump bias uses the pinned maximum and incoming wire velocity is copied without resampling', async () => {
    const { f, a, r, G, projectiles, spreads, step } = await rig();
    f.setRandom(() => 0);
    a.grounded = false; a.ink = 1;
    a.ground.hit = false;
    a.intent.fire = true; r.s3DualiesHeld = true; r.s3DualiesStart = 0; r.cooldown = 0;
    r.update(1 / 60, { fire: true, sub: false, firePressed: true });
    assert.equal(spreads.length, 1);
    assert.equal(r.s3DualiesBias, 0.4);
    assert.equal(spreads[0], 7.5);
    const before = spreads.length, bias = r.s3DualiesBias;
    const dir = new f.THREE.Vector3(0.25, 0.5, -0.75);
    a._nearCamera = () => false;
    projectiles.ghostFire(a, { weapon: a.weapon.id, dir, hand: 0 });
    assert.equal(spreads.length, before);
    assert.equal(r.s3DualiesBias, bias);
    const wire = [0, 0, 0, 'shot', a.weapon.id, 1, 2, 3, 1.25, -2.5, 3.75, 0, 1.2, 0, 0.2, 0.15, 0, 0.8, 0.2, false, 0, 0, 0, 0, 0, 0];
    projectiles.ghostProjectile(a, wire);
    const velocity = projectiles.list.at(-1).vel;
    assert.equal(velocity.x, 1.25); assert.equal(velocity.y, -2.5); assert.equal(velocity.z, 3.75);
  });
});
