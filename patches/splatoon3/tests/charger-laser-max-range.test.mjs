import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, STEP } from './full-install-fixture.mjs';

// #922: the live Charger laser telegraphs the weapon's maximum reach at every charge level (it used to
// lerp rangeMin..rangeMax by the live charge, and its full endpoint came from the stale base rangeMax).
// Obstruction still shortens it; fired partial shots keep their charge-dependent finite reach.
// Logic-only: real composed Projectiles._updateBeams on the VM; not a browser or Switch comparison.
const sight = (f, a, charge) => {
  const { G } = f; a.weaponRunner.charging = true; a.weaponRunner.charge = charge;
  G.projectiles._updateBeams(0); return G.projectiles.sights.get(a).scale.z;
};
async function rig(blocks) {
  const f = await boot({ blocks }), { G } = f, a = f.make({ weapon: 'charger' });
  f.tick(a); a.aimYaw = 0; a.aimPitch = 0; return { f, G, a };
}

test('#922 unobstructed laser length is the S3 full reach for every charge level', async t => {
  const { f, G, a } = await rig(); t.after(f.close);
  const full = G.projectiles.chargerReach(1);
  assert.equal(full, f.profile.weaponsFidelityCompletion.weapons.charger.MoveParam.DistanceFullCharge);
  for (const charge of [0, 1 / 60, .25, .5, .75, .998, 1]) assert.equal(sight(f, a, charge), full, `charge ${charge}`);
  assert.ok(G.projectiles.chargerReach(0) < full, 'fired partial shots keep their shorter reach');
});

test('#922 the laser follows the installed reach owner, not a duplicated rangeMax constant', async t => {
  const { f, G, a } = await rig(); t.after(f.close);
  G.projectiles.chargerReach = () => 12.5;
  for (const charge of [0, .5, 1]) assert.equal(sight(f, a, charge), 12.5);
});

test('#922 a solid wall still shortens the laser identically at every charge', async t => {
  const { f, G, a } = await rig([{ min: [-5, 0, 6], max: [5, 6, 6.1] }]); t.after(f.close);
  const lengths = [0, .5, 1].map(charge => sight(f, a, charge));
  assert.ok(lengths[0] < G.projectiles.chargerReach(1) && lengths[0] > 4, `${lengths}`);
  assert.deepEqual(lengths, [lengths[0], lengths[0], lengths[0]]);
});

test('#922 partial fired shot reach is unchanged by the laser length', async t => {
  const { f, G, a } = await rig(); t.after(f.close);
  const ps = G.projectiles; ps.fireCharger(a, a.weapon, .5);
  assert.equal(ps._fidelityChargerFlights.at(-1).range, ps.chargerReach(.5));
  assert.ok(ps.chargerReach(.5) < ps.chargerReach(1));
});
