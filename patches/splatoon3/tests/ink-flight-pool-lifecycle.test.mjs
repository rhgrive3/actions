import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const f = await fixture({fullRuntime: true, productionComposition: true, realProjectiles: true,
  extraExports: "export {INK_PROFILES, INK_DT, INK_MODEL} from './inkwave-public/src/game/inkFlight.js';"});
const {THREE, INK_PROFILES, INK_DT, INK_MODEL} = f;
const flight = f.G.projectiles.inkFlight;

function spawn(owner, ghost = false) {
  flight.spawnDrop({owner, team: 0, ghost, inkProfile: INK_PROFILES.shooter,
    inkPlan: {feet: false}, seed: .25, vel: new THREE.Vector3(0, 0, 60),
    inkKey: 'shooter', inkSequence: 0}, new THREE.Vector3(0, 100, 0), 0, 0);
  return flight.drops.at(-1);
}
function prepare() {
  flight.clear();
  flight.world = (_from, _to, _radius, hit) => { hit.hit = false; return hit; };
  return {color: new THREE.Color(), addTurf() {}};
}

test('active detached ink keeps its owner until the final landing paint and event', () => {
  const owner = prepare(), p = spawn(owner), trace = [];
  const paint = flight.paint;
  flight.paint = drop => { assert.equal(drop.owner, owner); trace.push('paint'); };
  flight.world = (_from, _to, _radius, hit) => {
    hit.hit = true; hit.face = 0; hit.point.set(0, 0, 0); hit.normal.set(0, 1, 0); return hit;
  };
  const off = f.on('weapon:impact', event => {
    if (event.kind === 'drop') { assert.equal(p.owner, owner); trace.push('impact'); }
  });
  try {
    assert.equal(p.owner, owner); flight.time = INK_DT; flight.updateDrops();
    assert.deepEqual(trace, ['paint', 'impact']); assert.equal(flight.stats.landed, 1);
    assert.equal(flight.drops.length, 0); assert.equal(flight.pool.at(-1), p);
    assert.equal(p.owner, null, 'landed reusable slot releases its Actor');
  } finally { off(); flight.paint = paint; }
});

for (const ghost of [false, true]) test(`expired detached ink releases its owner (ghost=${ghost})`, () => {
  const owner = prepare(), p = spawn(owner, ghost);
  flight.time = INK_DT; flight.updateDrops();
  assert.equal(flight.drops[0], p); assert.equal(p.owner, owner, 'live draw still has its color owner');
  flight.time = INK_MODEL.dropLife + INK_DT; flight.updateDrops();
  assert.equal(flight.drops.length, 0); assert.equal(flight.pool.at(-1), p);
  assert.equal(p.owner, null); assert.equal(flight.stats.landed, 0);
});

test('clear releases both active and previously pooled owners, preserving slots and clean reuse', () => {
  const oldOwner = prepare(), active = spawn(oldOwner), pooled = {owner: oldOwner};
  let oldTurf = 0, newTurf = 0;
  oldOwner.addTurf = value => { oldTurf += value; };
  flight.pool.push(pooled);
  const count = flight.pool.length + flight.drops.length;
  flight.clear(); flight.clear();
  assert.equal(flight.pool.length, count); assert.equal(flight.drops.length, 0);
  assert.ok(flight.pool.every(drop => drop.owner === null));
  assert.equal(flight.time, 0); assert.equal(flight.stats.spawned, 0);
  const nextOwner = {color: new THREE.Color(), addTurf(value) { newTurf += value; }}, reused = spawn(nextOwner);
  assert.equal(reused, active); assert.equal(reused.owner, nextOwner);
  assert.equal(flight.pool.length, count - 1); assert.equal(flight.stats.spawned, 1);
  const splat = f.G.paint.splat;
  f.G.paint.splat = (_point, _radius, _team, options) => { assert.equal(options.claimOwner, nextOwner); return 3; };
  flight.world = (_from, _to, _radius, hit) => {
    hit.hit = true; hit.face = 0; hit.point.set(0, 0, 0); hit.normal.set(0, 1, 0); return hit;
  };
  try { flight.time = INK_DT; flight.updateDrops(); } finally { f.G.paint.splat = splat; }
  assert.equal(newTurf, 3); assert.equal(oldTurf, 0);
  assert.equal(reused.owner, null); assert.equal(flight.stats.landed, 1);
  flight.clear();
});
