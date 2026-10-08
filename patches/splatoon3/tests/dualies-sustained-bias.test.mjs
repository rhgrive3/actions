// #891 — Splat Dualies sustained-fire outer-reticle bias (Ver.11.3.0
// WeaponManeuverNormal: Stand_DegBiasMin 0.01 / Stand_DegBiasKf 0.01 /
// Stand_DegBiasDecrease 0.005 / Jump_DegBiasMax 0.40; grounded 0.25 cap and
// 5F post-release hold from the Splat Dualies mechanics entry).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function rig() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { G, THREE } = f;
  G.scene = new THREE.Scene();
  const a = f.make('dualies');
  a.aimPoint.set(0, 1.05, 100); a.aimDir.set(0, 0, 1);
  a.isLocal = true; a.form = 'human'; a.grounded = true; a.ground.hit = true; a.ink = 1;
  const step = (dt, fire) => {
    a.intent.fire = fire; a.intent.sub = false; G.time += dt;
    a.update(dt);
  };
  return { f, a, r: a.weaponRunner, G, step };
}
test('#891 HUD reports the sourced outer endpoint separately from probability', async () => {
  const { a, r } = await rig();
  const state = r.s3DualiesBiasState(a.weapon);
  assert.equal(state.supported, true);
  assert.equal(state.bias, 0.01);
  assert.equal(state.innerEndpoint, 0);
  assert.equal(state.groundEnvelope, 2);
  assert.equal(state.airEnvelope, 7.5);
  assert.equal(state.outerEndpoint, 2);
  assert.equal(r._spreadDeg(a.weapon), 2);
  a.grounded = false;
  assert.equal(r._spreadDeg(a.weapon), 7.5);
});

test('#891 successful normal emissions advance +0.01 to the 0.25 cap', async () => {
  const { f, a, r, G, step } = await rig();
  f.setRandom(() => 0);
  let emitted = 0;
  for (let i = 0; i < 30 && emitted < 1; i++) { const b = G.projectiles.list.length; step(1 / 60, true); emitted += G.projectiles.list.length - b; }
  assert.equal(emitted, 1);
  assert.equal(r.s3DualiesNormalEmissionCount, 1);
  assert.equal(r.s3DualiesBias, 0.02);
  assert.equal(r.s3DualiesBiasHold, 5);
  f.setRandom(() => 0.99);
  emitted = 0;
  for (let i = 0; i < 60 && emitted < 1; i++) { const b = G.projectiles.list.length; step(1 / 60, true); emitted += G.projectiles.list.length - b; }
  assert.equal(emitted, 1);
  assert.equal(r.s3DualiesNormalEmissionCount, 2);
  assert.equal(r.s3DualiesBias, 0.03);
  a.ink = Infinity;
  f.setRandom(() => 0);
  for (let i = 0; i < 3000 && r.s3DualiesNormalEmissionCount < 24; i++) step(1 / 60, true);
  assert.equal(r.s3DualiesNormalEmissionCount, 24);
  assert.equal(r.s3DualiesBias, 0.25);
  f.restoreRandom();
});
test('#891 seeded distribution chooses inner vs outer at the existing endpoint', async () => {
  const { f, a, G, step } = await rig();
  // Force the outer Bernoulli branch, then drive the scalar sampler to its
  // rim: bias draw 0 < bias, radius draw ~1, azimuth draw 0.25 (vertical).
  // The composed round must reach the existing 2deg endpoint, not an
  // interpolated cone.
  let n = 0; const outerSeq = [0, 1 - 1e-12, 0.25, 0.5];
  f.setRandom(() => outerSeq[n++ % outerSeq.length]);
  let emitted = 0;
  for (let i = 0; i < 30 && emitted < 1; i++) { const b = G.projectiles.list.length; step(1 / 60, true); emitted += G.projectiles.list.length - b; }
  assert.equal(emitted, 1);
  const outer = G.projectiles.list.at(-1).vel.clone().normalize();
  const aimDir = a.aimDir.clone().normalize();
  const outerDeg = outer.angleTo(aimDir) * 180 / Math.PI;
  assert.ok(Math.abs(outerDeg - 2) < 0.6, `outer branch near 2deg, got ${outerDeg}`);
  // Force the inner branch: bias draw above bias lands on the aim (0deg).
  n = 0; const innerSeq = [0.999999, 0.5, 0.5, 0.5];
  f.setRandom(() => innerSeq[n++ % innerSeq.length]);
  emitted = 0;
  for (let i = 0; i < 60 && emitted < 1; i++) { const b = G.projectiles.list.length; step(1 / 60, true); emitted += G.projectiles.list.length - b; }
  const inner = G.projectiles.list.at(-1).vel.clone().normalize();
  const innerDeg = inner.angleTo(aimDir) * 180 / Math.PI;
  assert.ok(innerDeg < 0.6, `inner branch near aim, got ${innerDeg}`);
  f.restoreRandom();
});

test('#891 empty clicks do not advance; squid-held intent does not recover', async () => {
  const { a, r } = await rig();
  a.ink = 0; a.intent.fire = true; r.s3DualiesHeld = true; r.s3DualiesStart = 0; r.cooldown = 0;
  r.update(1 / 60, { fire: true, sub: false, firePressed: true });
  assert.equal(r.s3DualiesNormalEmissionCount, 0);
  assert.equal(r.s3DualiesBias, 0.01);
  a.ink = 1; r.s3DualiesBias = 0.2; r.s3DualiesBiasHold = 0; r.s3DualiesBiasFrameAccumulator = 0;
  a.form = 'squid'; a.intent.fire = true;
  r.update(1 / 60, { fire: false, sub: false, firePressed: false });
  assert.equal(r.s3DualiesBias, 0.2);
  assert.equal(r.s3DualiesNormalEmissionCount, 0);
});


test('#891 5F hold and 0.005 per-frame recovery agree at 30/60/120Hz', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const { a, r, step } = await rig();
    a.intent.fire = false; r.s3DualiesBias = 0.2; r.s3DualiesBiasHold = 5;
    r.s3DualiesBiasFrameAccumulator = 0;
    for (let i = 0; i < hz / 10; i++) step(1 / hz, false);
    results.push([Number(r.s3DualiesBias.toFixed(12)), r.s3DualiesBiasHold]);
    r.onDeath();
    assert.equal(r.s3DualiesBias, 0.01);
    assert.equal(r.s3DualiesBiasFrameAccumulator, 0);
    assert.equal(r.s3DualiesNormalEmissionCount, 0);
  }
  assert.deepEqual(results, [[0.195, 0], [0.195, 0], [0.195, 0]]);
});

test('#891 jump bias uses pinned 0.40 and turret stays independent', async () => {
  const { a, r, G } = await rig();
  a.grounded = false; a.ground.hit = false; a.ink = 1;
  a.intent.fire = true; r.s3DualiesHeld = true; r.s3DualiesStart = 0; r.cooldown = 0;
  r.update(1 / 60, { fire: true, sub: false, firePressed: true });
  assert.equal(r.s3DualiesBias, 0.4);
  assert.equal(r._spreadDeg(a.weapon), 7.5);
  a.grounded = true; a.ground.hit = true;
  r.s3Turret = true; r.lockT = 0.2;
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadLock);
  const before = r.s3DualiesNormalEmissionCount, bias = r.s3DualiesBias;
  r.s3DualiesHeld = true; r.s3DualiesStart = 0; r.cooldown = 0;
  const shots = G.projectiles.list.length;
  r.update(1 / 60, { fire: true, sub: false, firePressed: true });
  assert.equal(G.projectiles.list.length >= shots, true);
  assert.equal(r.s3DualiesNormalEmissionCount, before);
  assert.equal(r.s3DualiesBias, bias);
});

