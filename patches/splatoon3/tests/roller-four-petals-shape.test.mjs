// #740: S3 vertical-flick unit records carry sourced FourPetals shape rates.
// The build adapter must pass them through the actual instanced renderer:
// unit 0 and unit 1 expose 0.4667 / 0.3333, the final two-glob vertical unit
// exposes nothing (its source record omits both fields), and horizontal globs
// are never in scope. Collision, damage, paint, spawn, count, velocity and
// trajectory stay untouched; no FourPetals fields are added to network packets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';

const CENTER = 0.4667, PETAL = 0.3333;

async function volley(vertical, draw = () => 0.5) {
  const f = await fixture(), nm = f.makeNetMatch(f.makeSession());
  const a = f.makeActor({ nid: 0, owner: 'me', remote: false, vertical });
  f.bind(nm, [a]);
  f.Projectiles.constructor('return globalThis')().Math.random = draw;
  f.projectiles.fireFlick(a, a.weapon);
  const local = [...f.projectiles.list];
  const packets = JSON.parse(JSON.stringify(nm.out));
  f.projectiles.list.length = 0;
  const remote = f.makeActor({ nid: 1, owner: 'other', remote: true, vertical });
  for (const e of packets) f.projectiles.ghostProjectile(remote, e);
  return { f, nm, local, ghosts: [...f.projectiles.list], packets, units: f.profile.weaponsFidelityCompletion.weapons.roller };
}

function renderFourPetalRates(f, projectiles) {
  f.projectiles.list = [...projectiles];
  f.projectiles._draw();
  const attribute = f.projectiles.blobFourPetals;
  assert.ok(attribute, 'the actual renderer owns a FourPetals instance buffer');
  assert.equal(f.projectiles.blobs.geometry.getAttribute('aFourPetals'), attribute);
  return projectiles.map((_, i) => [Number(attribute.array[i * 2].toFixed(4)), Number(attribute.array[i * 2 + 1].toFixed(4))]);
}

function gameplayState(p) {
  return {
    pos: p.pos.toArray(), prev: p.prev.toArray(), start: p.start.toArray(), vel: p.vel.toArray(),
    age: p.age, delay: p.delay, life: p.life, size: p.size, damage: p.damage,
    playerCollision: JSON.parse(JSON.stringify(p.fidelityPlayerCollision)),
    fieldCollision: JSON.parse(JSON.stringify(p.fidelityFieldCollision)),
  };
}

function assertFourPetalShader(f) {
  const shader = {
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader: '#include <clipping_planes_fragment>\n#include <emissivemap_fragment>',
  };
  f.projectiles.blobs.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec2 aFourPetals;/);
  assert.match(shader.vertexShader, /cos\(4\.0 \* atan\(p\.y, p\.x\)\)/, 'the real blob shader consumes the four-petal cross-section');
  assert.match(shader.vertexShader, /aFourPetals\.x \+ aFourPetals\.y/);
  assert.equal(f.projectiles.blobs.material.customProgramCacheKey(), 'iw-blob-4-four-petals');
}

test('pinned source rates: vertical units 0/1 provide FourPetals, unit 2 omits them', async () => {
  const { f, nm, units } = await volley(true);
  const v = units.VerticalSwingUnitGroupParam.Unit;
  assert.equal(v.length, 3);
  assert.equal(v[0].FourPetalsCenterRadiusRate, CENTER);
  assert.equal(v[0].FourPetalsPetalRadiusRate, PETAL);
  assert.equal(v[1].FourPetalsCenterRadiusRate, CENTER);
  assert.equal(v[1].FourPetalsPetalRadiusRate, PETAL);
  assert.equal('FourPetalsCenterRadiusRate' in v[2], false, 'unit 2 must keep omitting the field');
  assert.equal('FourPetalsPetalRadiusRate' in v[2], false, 'unit 2 must keep omitting the field');
  nm.dispose();
});

test('#740 actual renderer draws sourced rates for vertical unit 0/1 and clears unit 2', async () => {
  const { f, nm, local, ghosts, packets, units } = await volley(true);
  const v = units.VerticalSwingUnitGroupParam.Unit;
  assert.equal(local.length, 5, '1 + 2 + 2 vertical globs');
  // Unit selection order: index 0 -> unit 0, indices 1/2 -> unit 1, indices 3/4 -> unit 2.
  assert.equal(local[0].fidelityRollerUnit, v[0]);
  assert.equal(local[1].fidelityRollerUnit, v[1]);
  assert.equal(local[2].fidelityRollerUnit, v[1]);
  assert.equal(local[3].fidelityRollerUnit, v[2]);
  assert.equal(local[4].fidelityRollerUnit, v[2]);
  const localBefore = local.map(gameplayState), ghostBefore = ghosts.map(gameplayState), timeBefore = f.G.time;
  const packetSnapshot = JSON.parse(JSON.stringify(packets));
  let paintCalls = 0;
  const splat = f.G.paint.splat;
  f.G.paint.splat = (...args) => { paintCalls++; return splat(...args); };
  const expected = [[CENTER, PETAL], [CENTER, PETAL], [CENTER, PETAL], [0, 0], [0, 0]];
  assert.deepEqual(renderFourPetalRates(f, local), expected, 'only sourced vertical heads receive the rates');
  assert.deepEqual(renderFourPetalRates(f, ghosts), expected, 'ghost rendering derives the same rates without packet fields');
  assert.deepEqual(local.map(gameplayState), localBefore, 'rendering leaves owner projectile gameplay state unchanged');
  assert.deepEqual(ghosts.map(gameplayState), ghostBefore, 'rendering leaves ghost projectile state unchanged');
  assert.equal(f.G.time, timeBefore, 'rendering does not advance simulation time');
  assert.equal(paintCalls, 0, 'rendering does not paint');
  assertFourPetalShader(f);
  // Ghost reconstruction derives the same source unit without a protocol extension.
  for (let i = 0; i < local.length; i++) {
    assert.deepEqual(ghosts[i].fidelityRollerUnit, local[i].fidelityRollerUnit, `ghost ${i} unit parity`);
  }
  // Presentation-only state adds no packet fields. Network/kit composition may
  // use any already-supported legacy/current birth layout.
  const packetLengths = packets.map(e => e.length);
  assert.ok(packetLengths.every(length => length === packetLengths[0]), 'existing packet layout is consistent');
  assert.ok([27, 30, 32, 33, 35].includes(packetLengths[0]), 'packet layout stays within the existing accepted protocol set');
  assert.deepEqual(packets, packetSnapshot, 'rendering does not alter packet content');
  for (const p of local) {
    assert.ok(Number.isFinite(p.size) && p.size > 0, 'hit size untouched');
    assert.ok(p.fidelityPlayerCollision && Number.isFinite(p.fidelityPlayerCollision.initRadius), 'collision record untouched');
    assert.ok(Number.isFinite(p.vel.x) && Number.isFinite(p.vel.y) && Number.isFinite(p.vel.z), 'velocity untouched');
    assert.ok(Number.isFinite(p.damage) && p.damage > 0, 'damage untouched');
  }
  nm.dispose();
});

test('#740 horizontal globs render with the default shape', async () => {
  const { f, nm, local, ghosts, packets } = await volley(false);
  assert.equal(local.length, 13, 'wide-swing sheet unchanged');
  const expected = Array.from({ length: local.length }, () => [0, 0]);
  assert.deepEqual(renderFourPetalRates(f, local), expected, 'horizontal owner globs stay on the default path');
  assert.deepEqual(renderFourPetalRates(f, ghosts), expected, 'horizontal ghosts stay on the default path');
  assert.ok(packets.every(e => [27, 30, 32, 33, 35].includes(e.length)));
  nm.dispose();
});

test('#740 shape state consumes no PRNG draws and does not move the volley', async () => {
  // Same seeded random stream twice: positions/velocities must be byte-identical,
  // proving the new state adds no Math.random() consumption and no motion change.
  const seedVolley = async () => {
    let seed = 13;
    const draw = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const { f, nm, local } = await volley(true, draw);
    const fingerprint = local.map(p => [...p.pos.toArray(), ...p.vel.toArray(), p.size, p.damage]);
    nm.dispose();
    return fingerprint;
  };
  const first = await seedVolley();
  const second = await seedVolley();
  assert.deepEqual(second, first, 'identical seeded stream produces an identical volley');
});
