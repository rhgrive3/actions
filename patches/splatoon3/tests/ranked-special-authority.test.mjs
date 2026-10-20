// #1669: an authenticated guest's `rki.special: null` must not clear a Special
// the host already observes as active (owner snapshot flag), because objective
// eligibility (clam pickup/throw, Rainmaker pickup) is keyed on that state.
// Logic-level regression through the installed NetMatch/ranked runtime; not a
// two-browser or Switch measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankedRig } from './ranked-host-rig.mjs';
import { canCollectClam, canThrowClam, canCollectRainmaker } from '../runtime/ranked/clams.mjs';
import { objectiveSpecialFor } from '../runtime/ranked/objective-special.mjs';

// Drive `ticks` owner packets through the real wire path and render the host proxy.
function run(r, ticks, mutate = null, dt = 0.05) {
  for (let i = 0; i < ticks; i++) {
    r.advance(dt);
    r.deliver(0, r.tick(0, mutate));
    r.nm.update(dt); r.nm.applyRemote(r.proxies[0], dt);
  }
}
function activate(r, id) {
  const g = r.guests[0];
  g.actor.weapon.special = id; r.proxies[0].weapon.special = id;
  g.actor.specialActive = { id, t: 1, phase: 'active' };
}
const forgeNull = packet => { packet.rki.special = null; packet.rki.specialDeployed = false; };

for (const id of ['krakenRoyale', 'zipcaster', 'inkjet', 'crabTank']) {
  test(`${id}: a fresh authenticated null command cannot clear the host-observed active Special`, async () => {
    const r = await rankedRig({ mode: 'clams' });
    activate(r, id);
    run(r, 8); // honest ticks: snapshot flag and command both say `id`
    assert.equal(r.proxies[0].specialActive?.id, id, 'the host observes the active Special from the owner snapshot');
    assert.equal(r.frameActor(0).special, id, 'control: honest command');
    run(r, 4, forgeNull); // the owner keeps its snapshot flag but forges rki.special = null
    assert.equal(r.nm.rankedInputs.get('2').special, null, 'the forged null is the freshest accepted command');
    const actor = r.frameActor(0);
    assert.equal(actor.special, id, 'objective frame keeps the active Special');
    assert.equal(canCollectClam(actor), !['zipcaster', 'crabTank', 'krakenRoyale'].includes(id));
    assert.equal(canThrowClam(actor), false, 'no clam throw while the prohibited Special is active');
  });
}

for (const id of ['zipcaster', 'inkjet']) {
  test(`${id}: a forged null command cannot admit a Rainmaker pickup`, async () => {
    const r = await rankedRig({ mode: 'rainmaker' });
    r.engine.rule.state.barrier.active = false;
    r.proxies[0].pos.set(0, 0, 0); r.guests[0].actor.pos.set(0, 0, 0);
    activate(r, id);
    run(r, 8);
    run(r, 4, forgeNull);
    assert.equal(canCollectRainmaker(r.frameActor(0)), false);
    r.engine.update(1 / 60, r.frame());
    assert.equal(r.engine.rule.state.carrier, null, 'the restricted actor standing on the Rainmaker cannot pick it up');
  });
}

test('positive controls: no active Special lets the same actor collect clams and the Rainmaker', async () => {
  const r = await rankedRig({ mode: 'rainmaker' });
  r.engine.rule.state.barrier.active = false;
  r.proxies[0].pos.set(0, 0, 0); r.guests[0].actor.pos.set(0, 0, 0);
  run(r, 8, forgeNull);
  const actor = r.frameActor(0);
  assert.equal(actor.special, null);
  assert.equal(canCollectRainmaker(actor), true);
  r.engine.update(1 / 60, r.frame());
  assert.equal(r.engine.rule.state.carrier, '2', 'the unrestricted actor picks up the Rainmaker');
});

test('normal end of a Special: the owner snapshot flag and null command release the restriction, with no permanent state', async () => {
  const r = await rankedRig({ mode: 'clams' });
  activate(r, 'krakenRoyale');
  run(r, 8);
  assert.equal(r.frameActor(0).special, 'krakenRoyale');
  r.guests[0].actor.specialActive = null; // genuine mid-Special cancellation / expiry
  run(r, 8);
  assert.equal(r.proxies[0].specialActive, null);
  const actor = r.frameActor(0);
  assert.equal(actor.special, null);
  assert.equal(canCollectClam(actor) && canThrowClam(actor), true);
});

test('a command may request a restriction before the snapshot flag arrives, and it expires with the 0.75 s command window', async () => {
  const r = await rankedRig({ mode: 'clams' });
  const g = r.guests[0];
  g.actor.weapon.special = 'zipcaster'; r.proxies[0].weapon.special = 'zipcaster';
  r.advance(0.05);
  const packet = r.tick(0);
  packet.rki.special = 'zipcaster'; // owner command only: the snapshot still says no Special
  r.deliver(0, packet);
  assert.equal(r.proxies[0].specialActive, null);
  assert.equal(r.frameActor(0).special, 'zipcaster', 'command-only initiation still restricts');
  r.advance(0.8);
  assert.equal(r.frameActor(0).special, null, 'stale command no longer restricts');
});

test('out-of-order or replayed commands cannot unset the restriction either', async () => {
  const r = await rankedRig({ mode: 'clams' });
  activate(r, 'inkjet');
  run(r, 8);
  r.advance(0.05);
  const stale = r.tick(0, forgeNull);
  stale.rki.seq = 1; // reordered/replayed: rejected by the existing monotonic sequence
  r.deliver(0, stale);
  assert.equal(r.frameActor(0).special, 'inkjet');
});

test('host promotion clears retained commands but the observed snapshot state still restricts', async () => {
  const r = await rankedRig({ mode: 'clams' });
  activate(r, 'krakenRoyale');
  run(r, 8, forgeNull);
  r.nm.rankedInputs.clear(); // what onLeave(changed) does to retained command state
  assert.equal(r.frameActor(0).special, 'krakenRoyale');
});

test('objectiveSpecialFor: the host-observed Special has precedence over any command value', () => {
  for (const id of ['krakenRoyale', 'zipcaster', 'inkjet', 'crabTank', 'booyahBomb']) {
    assert.equal(objectiveSpecialFor({ specialActive: { id } }, { special: null }), id);
    assert.equal(objectiveSpecialFor({ specialActive: { id } }, { special: 'storm' }), id);
  }
  assert.equal(objectiveSpecialFor({ specialActive: null }, { special: 'storm' }), 'storm');
  assert.equal(objectiveSpecialFor({ specialActive: null }, { special: null }), null);
  assert.equal(objectiveSpecialFor({ specialActive: null }, null), null);
});
