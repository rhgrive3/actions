// Issue #739 — Blaster field (environment) collision radius.
//
// Splatoon 3 gives the Blaster projectile a 0.2 field collision radius in addition to
// its player radius, so a round whose centreline clears a wall still detonates on it.
// The repository never edits upstream: `patches/splatoon3/weapons-adapter.mjs` rewrites
// Projectiles._step's terrain query to `fidelityWorldHit`, which sweeps the real sphere
// primitive with the sourced CollisionParam. These tests pin that chain, exercise the
// primitive on the real Physics level, and carry a negative control so a silent revert
// to the centreline path fails here rather than in a match.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { sweptWorldHit, roundedBoxEntry } from '../runtime/weapons-collision.mjs';
import { adaptSource } from '../adapter.mjs';

const root = new URL('../../../', import.meta.url);
const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root), 'utf8'));
const fidelitySource = fs.readFileSync(new URL('patches/splatoon3/runtime/weapons-fidelity.mjs', root), 'utf8');
const adapterSource = fs.readFileSync(new URL('patches/splatoon3/weapons-adapter.mjs', root), 'utf8');
const collision = profile.weaponsFidelityCompletion.weapons.blaster.CollisionParam;
const FIELD = collision.InitRadiusForField;

function section(code, start, end) {
  const a = code.indexOf(start), b = code.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `actual source boundary: ${start}`);
  return code.slice(a, b);
}

// Real Physics + a level holding one slab whose near face sits exactly at the sourced
// field radius, so every sampled centreline misses while the swept volume decides.
async function world() {
  const f = await fixture();
  const { Physics, Hit, THREE } = f;
  const slab = {
    id: 0, solid: true, grate: false, center: new THREE.Vector3(5, 0, 0.7), half: new THREE.Vector3(0.5, 10, 0.5),
    axes: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], faces: [-1, -1, -1, -1, -1, -1],
  };
  const grate = {
    id: 1, solid: true, grate: true, center: new THREE.Vector3(5, 0, 0.7), half: new THREE.Vector3(0.5, 10, 0.5),
    axes: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], faces: [-1, -1, -1, -1, -1, -1],
  };
  const blocks = [slab, grate];
  const level = {
    blocks, faces: [],
    queryBlocks(minX, minZ, maxX, maxZ, out) { if (maxX >= 4 && minX <= 6) out.push(0, 1); return out; },
  };
  const physics = new Physics(level);
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const shoot = (offset, radius, skipGrates = true, out = new Hit()) => {
    from.set(0, 0, offset); to.set(6, 0, offset);
    return sweptWorldHit(physics, from, to, radius, radius, out, skipGrates);
  };
  return { ...f, physics, shoot, Hit, THREE };
}

test('#739: the profile field radius is the sourced 0.2, kept apart from the player radius', () => {
  assert.equal(FIELD, 0.2);
  assert.equal(collision.EndRadiusForField, 0.2, 'Blaster field radius does not grow after launch');
  assert.equal(collision.InitRadiusForPlayer, 0.285, 'player radius is a separate sourced value (#463)');
  assert.equal(profile.referenceVersion, '11.3.0');
  assert.equal(profile.weapons.blaster.fieldCollisionRadius, FIELD, 'the profile weapon entry agrees');
});

test('#739: the live terrain query is the swept field hit, not the zero-width segment', () => {
  const composed = adaptSource('src/game/weapons.js', fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8'));
  const step = section(composed, '  _step(p, dt) {', '  _blastBurst(p, at, direct) {');
  assert.match(step, /const hit = fidelityWorldHit\(this, p\);/);
  assert.doesNotMatch(step, /G\.physics\.segment\(p\.prev, p\.pos, _hit, true\)/);
  // skipGrates stays true: Blaster ink still passes through grates.
  assert.match(adapterSource, /patch\('        const hit = G\.physics\.segment\(p\.prev, p\.pos, _hit, true\);'/);
  assert.match(adapterSource, /'        const hit = fidelityWorldHit\(this, p\);'/);
  assert.match(fidelitySource, /sweptWorldHit\(api\.G\.physics,p\.prev,p\.pos,fieldRadiusAt/);
  assert.match(fidelitySource, /function fieldRadiusAt\(p,age\) \{ return radiusAt\(p\.fidelityFieldCollision,age,p\.fieldRadius\|\|0\); \}/);
  // Fail-before anchor: the untouched upstream file is exactly the centreline shape that
  // #739 reported as live. Reverting the adapter connection makes this test fail here.
  const raw = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');
  assert.match(section(raw, '  _step(p, dt) {', '  _blastBurst(p, at, direct) {'),
    /const hit = G\.physics\.segment\(p\.prev, p\.pos, _hit, true\);/);
});

test('#739 NEGATIVE: a centreline-only round passes the slab the field volume would catch', async () => {
  const { physics, shoot } = await world();
  const THREE = (await fixture()).THREE;
  for (const offset of [0.05, 0.15, 0.19]) {
    const from = new THREE.Vector3(0, 0, offset), to = new THREE.Vector3(6, 0, offset);
    assert.equal(physics.segment(from, to, new (await fixture()).Hit(), true).hit, false,
      'the centreline genuinely misses, so the field sweep is load-bearing');
    assert.equal(shoot(offset, 0).hit, false, 'a zero-radius sweep reproduces the centreline');
    assert.equal(shoot(offset, FIELD).hit, true, 'the sourced 0.2 field radius must catch it');
  }
});

test('#739: inside the field radius the round stops on the slab; outside it passes', async () => {
  const { shoot } = await world();
  // The slab spans z 0.2..1.2, so a shot at offset o clears it by (0.2 - o).
  const inside = [{ offset: 0.05, contact: 4.3677 }, { offset: 0.15, contact: 4.3064 }, { offset: 0.19, contact: 4.3003 }];
  for (const { offset, contact } of inside) {
    const hit = shoot(offset, FIELD);
    assert.equal(hit.hit, true, `offset ${offset} is inside 0.2 and must contact`);
    assert.ok(Math.abs(hit.dist - contact) < 1e-3, `earliest contact distance at ${offset}: ${hit.dist}`);
  }
  for (const offset of [-0.1, -0.05, -0.2]) {
    assert.equal(shoot(offset, FIELD).hit, false, `offset ${offset} is beyond 0.2 and must pass`);
  }
});

test('#739: earliest swept contact is the terrain burst origin, ahead of any centreline crossing', async () => {
  const { shoot, THREE, Hit } = await world();
  const physics = (await world()).physics;
  const grazing = shoot(0.15, FIELD);
  assert.equal(grazing.hit, true);
  // sweptWorldHit reports the surface point, so the burst origin is the surface itself and
  // the round stops one field radius before the centreline would have reached the face.
  assert.ok(grazing.dist < 4.5, `field contact stops the round before the face at x=4.5 (${grazing.dist})`);
  assert.ok(Math.abs(grazing.point.x - 4.5) < 1e-6, 'the contact point lies on the slab face');
  const travel = new THREE.Vector3(1, 0, 0);
  assert.ok(Math.abs(grazing.normal.length() - 1) < 1e-9, 'the contact normal is a unit vector');
  assert.ok(grazing.normal.dot(travel) < 0, 'the contact normal opposes the flight path');
  assert.notEqual(grazing.block, -1, 'a concrete block index is reported for paint/LOS');
  assert.equal(grazing.face, -1, 'the level had no face table, so none is invented');
  // Same ray from the identical geometry with the centreline primitive never reports it.
  const from = new THREE.Vector3(0, 0, 0.15), to = new THREE.Vector3(6, 0, 0.15);
  assert.equal(physics.segment(from, to, new Hit(), true).hit, false);
});

test('#739: grates still pass through, and the player radius stays independent', async () => {
  const { shoot, physics } = await world();
  // Block 0 is solid, block 1 is a grate at the same place. skipGrates=true must ignore it.
  const through = shoot(0.15, FIELD, true);
  assert.equal(through.hit, true);
  assert.equal(through.block, 0, 'the solid slab is hit, not the grate');
  // Only-grate geometry: a query that returns just the grate must not register.
  const grateOnly = sweptWorldHit(
    { level: { blocks: [physics.level.blocks[1]], faces: [], queryBlocks: (a, b, c, d, out) => { out.push(0); return out; } }, _ids: [] },
    { x: 0, y: 0, z: 0.15 }, { x: 6, y: 0, z: 0.15 }, FIELD, FIELD, new (await world()).Hit(), true);
  assert.equal(grateOnly.hit, false, 'ink projectiles pass through grates at full field radius');
  // The field sweep never substitutes the player radius.
  assert.equal(FIELD < collision.InitRadiusForPlayer, true, 'field and player radii stay distinct values');
  // The primitive really is radius-driven (t is normalised over the whole segment):
  // a sweep from x=-3 to x=+3 touches the skin at x=-1.2 (t=0.3) while a zero-radius
  // ray reaches the face itself at x=-1 (t=1/3).
  assert.ok(Math.abs(roundedBoxEntry([-3, 0, 0], [6, 0, 0], [1, 1, 1], FIELD) - 0.3) < 1e-9);
  assert.ok(Math.abs(roundedBoxEntry([-3, 0, 0], [6, 0, 0], [1, 1, 1], 0) - 1 / 3) < 1e-9);
});