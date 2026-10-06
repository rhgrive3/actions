// #740: S3 vertical-flick unit records carry sourced FourPetals shape rates.
// The runtime must transfer them onto render-only projectile state per unit:
// unit 0 and unit 1 expose 0.4667 / 0.3333, the final two-glob vertical unit
// exposes nothing (its source record omits both fields), and horizontal globs
// are never in scope. Collision, damage, paint, spawn, count, velocity and
// trajectory are not touched by this state; the network packet stays 32 fields.
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

test('#740 vertical volley render state distinguishes unit 0/1 from unit 2', async () => {
  const { f, nm, local, ghosts, packets, units } = await volley(true);
  const v = units.VerticalSwingUnitGroupParam.Unit;
  assert.equal(local.length, 5, '1 + 2 + 2 vertical globs');
  // Unit selection order: index 0 -> unit 0, indices 1/2 -> unit 1, indices 3/4 -> unit 2.
  assert.equal(local[0].fidelityRollerUnit, v[0]);
  assert.equal(local[1].fidelityRollerUnit, v[1]);
  assert.equal(local[2].fidelityRollerUnit, v[1]);
  assert.equal(local[3].fidelityRollerUnit, v[2]);
  assert.equal(local[4].fidelityRollerUnit, v[2]);
  const shaped = { center: CENTER, petal: PETAL };
  for (const i of [0, 1, 2]) {
    assert.deepEqual(local[i].fidelityFourPetals, shaped, `vertical unit ${i === 0 ? 0 : 1} globs expose the sourced rates`);
  }
  for (const i of [3, 4]) {
    assert.equal(local[i].fidelityFourPetals, null, 'unit 2 must not inherit another unit\'s shape');
  }
  // Ghost reconstruction derives the same state from its recovered unit record.
  for (let i = 0; i < local.length; i++) {
    assert.deepEqual(ghosts[i].fidelityFourPetals, local[i].fidelityFourPetals, `ghost ${i} parity`);
    assert.deepEqual(ghosts[i].fidelityRollerUnit, local[i].fidelityRollerUnit, `ghost ${i} unit parity`);
  }
  // Presentation-only state: the packet layout and gameplay fields are unchanged.
  assert.ok(packets.every(e => e.length === 32), 'packet field count stays 32');
  for (const p of local) {
    assert.ok(Number.isFinite(p.size) && p.size > 0, 'hit size untouched');
    assert.ok(p.fidelityPlayerCollision && Number.isFinite(p.fidelityPlayerCollision.initRadius), 'collision record untouched');
    assert.ok(Number.isFinite(p.vel.x) && Number.isFinite(p.vel.y) && Number.isFinite(p.vel.z), 'velocity untouched');
    assert.ok(Number.isFinite(p.damage) && p.damage > 0, 'damage untouched');
  }
  nm.dispose();
});

test('#740 horizontal volley never carries shape state', async () => {
  const { f, nm, local, ghosts, packets } = await volley(false);
  assert.equal(local.length, 13, 'wide-swing sheet unchanged');
  for (const p of [...local, ...ghosts]) assert.equal(p.fidelityFourPetals, null);
  assert.ok(packets.every(e => e.length === 32));
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
