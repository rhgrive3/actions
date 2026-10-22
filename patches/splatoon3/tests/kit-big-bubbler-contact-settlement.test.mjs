// CPU contract for the real composed Big Bubbler query. Source-band/volley
// accounting belongs to the projectile winner; this API only refreshes its
// chosen contact using the existing 11.3.0 object rate and raw-HP conversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './kit-composed-fixture.mjs';
import {
  installKitBigBubbler, bigBubblerDomes, bigBubblerRemoteDomes,
  kitBarrierCandidate, clearBigBubblers, tickBigBubblers,
  replayBigBubbler, BIG_BUBBLER_RAW,
} from '../runtime/kit-big-bubbler.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
async function setup(remote = false) {
  const f = await fixture(), V = f.THREE.Vector3;
  f.G.scene = new f.THREE.Scene();
  f.G.projectiles = new f.Projectiles(f.G.scene);
  f.SPECIALS.bubbler = { id: 'bubbler', cost: 180 };
  installKitBigBubbler(f, { ...f.profile, kits: { bigBubbler: {} } });
  clearBigBubblers('settlement-test');
  const center = new V(0, -0.5, 0), half = new V(100, 0.5, 100);
  const block = { id: 0, solid: true, center, half,
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  const level = { blocks: [block], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, pointInside: () => false,
    spawnPads: [new V(), new V(80, 0, 80)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  f.G.level = level; f.G.physics = new f.Physics(level);
  const owner = f.make('roller'); owner.team = 1; owner.nid = 9;
  owner.weapon = { ...owner.weapon, special: 'bubbler' }; f.G.actors = [owner];
  if (remote) {
    owner.remote = true;
    assert.equal(replayBigBubbler('deploy', owner, { domeId: '1:n9:3', serial: 3, team: 1, t: 1,
      pos: [0, 0, 0], hp: BIG_BUBBLER_RAW.maxFieldHp, fieldHp: BIG_BUBBLER_RAW.maxHp }).ok, true);
  } else {
    owner.special = owner.specialCost(); owner.intent.special = true; f.tick(owner);
    for (let i = 0; i < 90; i++) tickBigBubblers(1 / 60);
  }
  const dome = (remote ? bigBubblerRemoteDomes() : bigBubblerDomes())[0];
  assert.ok(dome);
  const shooter = f.make('shooter'); shooter.team = 0; shooter.nid = 12;
  function query(amount = 0, options = {}, target = 'canopy') {
    const y = dome.pos.y + (target === 'field' ? dome.emitterY : 1.05);
    const start = new V(dome.pos.x, y, dome.pos.z - 20);
    const end = new V(dome.pos.x, y, target === 'field' ? dome.pos.z : dome.pos.z + 20);
    const p = { type: 'shot', pos: start.clone(), size: 0.15, team: 0, damage: amount, owner: shooter, ...options };
    const c = kitBarrierCandidate(p, start, end);
    assert.ok(c); assert.equal(c.target, target);
    return c;
  }
  return { f, dome, query };
}

test('chosen canopy/emitter damage replaces the pure cache, applies existing rates once, and settles once', async () => {
  for (const target of ['canopy', 'field']) {
    const { f, dome, query } = await setup();
    let events = 0, paints = 0;
    const stop = f.on('kit:bubbler:hit', () => events++);
    f.G.paint.splat = () => { paints++; return 0; };
    const hp = dome.hp, field = dome.fieldHp;
    // A non-default source row exercises both the per-object rate and conversion;
    // the untouched native query is the independent legacy contract.
    const options = { s3BubblerRow: 'ChargerFull' };
    const legacy = query(42, options, target).damage;
    assert.ok(legacy > 0);
    const c = query(0, options, target);
    assert.equal(c.damage, 0); assert.equal(c.damageTarget, dome);
    assert.equal(c.setDamageAtContact(21), true);
    close(c.damage, legacy / 2);
    assert.equal(c.setDamageAtContact(42), true);
    close(c.damage, legacy); // replacement, never multiply an already scaled cache
    for (const invalid of [-1, NaN, Infinity, '42']) assert.equal(c.setDamageAtContact(invalid), false);
    close(c.damage, legacy);
    assert.equal(c.settled, false); assert.equal(c.eventId, 0);
    assert.equal(dome.hp, hp); assert.equal(dome.fieldHp, field);
    assert.equal(events, 0); assert.equal(paints, 0);
    close(c.onHit(), legacy);
    close(target === 'canopy' ? hp - dome.hp : field - dome.fieldHp, legacy);
    assert.equal(c.onHit(), 0); assert.equal(c.setDamageAtContact(84), false);
    close(c.damage, legacy); assert.equal(events, 1); assert.equal(paints, 0);
    stop();
  }
});

test('discarded candidates and visual copies never spend HP or emit proposals', async () => {
  const { f, dome, query } = await setup();
  const hp = dome.hp, field = dome.fieldHp;
  let hits = 0, proposals = 0;
  const stops = [f.on('kit:bubbler:hit', () => hits++), f.on('kit:bubbler:damage-proposal', () => proposals++)];
  const discarded = query();
  assert.equal(discarded.setDamageAtContact(42), true);
  assert.equal(discarded.settled, false);
  for (const options of [{ ghost: true }, { team: undefined }, { team: 0.5 }]) {
    const c = query(0, options);
    assert.equal(c.visualOnly, true); assert.equal(c.setDamageAtContact(42), false);
    assert.equal(c.onHit(), 0);
  }
  assert.equal(dome.hp, hp); assert.equal(dome.fieldHp, field);
  assert.equal(hits, 0); assert.equal(proposals, 0);
  stops.forEach(stop => stop());
});

test('remote settlement proposes the refreshed amount once and stale activation still cannot pay', async () => {
  const { f, dome, query } = await setup(true);
  const hp = dome.hp, field = dome.fieldHp, proposals = [];
  const stop = f.on('kit:bubbler:damage-proposal', p => proposals.push(p));
  const expected = query(42).damage;
  const c = query();
  assert.equal(c.damageTarget, dome); assert.equal(c.setDamageAtContact(42), true);
  assert.equal(proposals.length, 0); assert.equal(c.eventId, 0);
  assert.equal(c.onHit(), 0); assert.equal(c.onHit(), 0);
  assert.equal(c.setDamageAtContact(84), false);
  assert.equal(proposals.length, 1); close(proposals[0].amount, expected);
  assert.equal(proposals[0].shooter, 'n12'); assert.equal(proposals[0].domeOwner, 'n9');
  assert.equal(proposals[0].serial, dome.serial); assert.ok(proposals[0].eventId > 0);
  assert.equal(dome.hp, hp); assert.equal(dome.fieldHp, field);
  const stale = query(); assert.equal(stale.setDamageAtContact(42), true);
  replayBigBubbler('expire', dome.owner, { domeId: dome.id, serial: dome.serial });
  assert.equal(stale.onHit(), 0); assert.equal(proposals.length, 1);
  stop();
});
