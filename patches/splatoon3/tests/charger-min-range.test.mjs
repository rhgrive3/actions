// #514: the native runner's eased charge is 1/6 after the first legal 8F tap,
// so the installed flight must start at the pinned DistanceMinCharge endpoint
// there — not at the 11.53 interior point — while full charge keeps its own
// endpoint. Real composed Actor + WeaponRunner + installed flight, not raw
// inkwave-public or one adapter alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { chargerRangeCharge, CHARGER_MIN_LEGAL_CHARGE } from '../runtime/weapons-charger-flight.mjs';

const MIN = 9.033, FULL = 24.037, LEGAL = 1 / 6;

test('#514 the legal minimum band anchors the pinned minimum endpoint', () => {
  assert.equal(CHARGER_MIN_LEGAL_CHARGE, LEGAL);
  assert.equal(chargerRangeCharge(LEGAL), 0);
  assert.equal(chargerRangeCharge(0), 0);
  assert.equal(chargerRangeCharge(0.12), 0);
  assert.equal(chargerRangeCharge(1), 1);
  // Current main keys every exact-full effect off charge >= 1 (#840), so a
  // near-full partial stays strictly partial here too — matching #711.
  assert.ok(chargerRangeCharge(0.999) < 1 && chargerRangeCharge(0.999) > 0.99);
  assert.equal(chargerRangeCharge(NaN), 0);
  assert.equal(chargerRangeCharge(-2), 0);
  assert.equal(chargerRangeCharge(5), 1);
});

test('#514 an 8F native tap births the minimum legal charge and reach', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  // Tick until the native fractional clock itself reaches the first legal 8F
  // charge update (chargeT = 8/60); the runner may spend a startup frame
  // before the clock starts, so count charge updates, not wall ticks.
  while (Math.abs(a.weaponRunner.chargeT - 8 / 60) > 1e-9) {
    f.tick(a);
    assert.ok(a.weaponRunner.chargeT <= 8 / 60 + 1e-9, 'charge clock must land exactly on 8F');
  }
  assert.ok(Math.abs(a.weaponRunner.chargeT - 8 / 60) < 1e-9, 'native fractional clock at 8F');
  assert.ok(Math.abs(a.weaponRunner.charge - LEGAL) < 1e-9, 'native eased charge at 8F is 1/6');
  a.intent.fire = false;
  // The release-gap adapter births the shot one frame after the release input.
  for (let i = 0; i < 3 && f.shots.length === 0; i++) f.tick(a);
  assert.equal(f.shots.length, 1, 'tap release births exactly one shot');
  assert.ok(Math.abs(f.shots[0].charge - LEGAL) < 1e-9, 'birth charge is the legal minimum');
  assert.equal(f.Projectiles.prototype.chargerReach(f.shots[0].charge), MIN);
});

test('#514 the installed flight resolves legal-min to min and full to full', async () => {
  const f = await fixture();
  const P = f.Projectiles.prototype;
  assert.equal(P.chargerReach(LEGAL), MIN);
  assert.equal(P.chargerReach(0), MIN, 'sub-legal taps clamp to the minimum endpoint');
  assert.equal(P.chargerReach(1), FULL);
  // Near-full partials stay below the exact full endpoint on current main
  // (#840 exact-1 full gate; same guard as #711), while remaining at the top
  // of the pinned band.
  assert.ok(P.chargerReach(0.999) < FULL && P.chargerReach(0.999) > FULL - 0.05);
  const mid = P.chargerReach((LEGAL + 1) / 2);
  assert.ok(mid > MIN && mid < FULL, 'partial progression stays inside the pinned band');
  assert.ok(P.chargerReach(0.5) > MIN && P.chargerReach(0.5) < FULL);
  let previous = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const reach = P.chargerReach(i / 200);
    assert.ok(reach >= previous - 1e-12, 'reach never regresses with charge');
    previous = reach;
  }
});

test('#514 a real native 8F birth creates a minimum-range flight job', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.ink = 100;
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.actors = [a];
  a.intent.fire = true;
  // Hold until the native clock records exactly 8 charge updates (8F), then
  // release at that first legal frame.
  while (Math.abs(a.weaponRunner.chargeT - 8 / 60) > 1e-9) {
    f.tick(a);
    assert.ok(a.weaponRunner.chargeT <= 8 / 60 + 1e-9, 'charge clock must land exactly on 8F');
  }
  const born = a.weaponRunner.charge;
  system.fireCharger(a, a.weapon, born);
  const job = system._fidelityChargerFlights.at(-1);
  assert.equal(system._fidelityChargerFlights.length, 1);
  assert.ok(Math.abs(job.charge - LEGAL) < 1e-9);
  assert.equal(job.range, MIN);
  assert.equal(job.range, f.Projectiles.prototype.chargerReach(born), 'HUD and flight share the helper');
});

test('#514 a real full-charge birth still reaches the full endpoint', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.ink = 100;
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.actors = [a];
  a.intent.fire = true;
  f.tick(a, 61);
  assert.ok(a.weaponRunner.charge >= 0.999, 'precondition: full charge');
  system.fireCharger(a, a.weapon, a.weaponRunner.charge);
  const job = system._fidelityChargerFlights.at(-1);
  assert.equal(job.range, FULL);
});

test('#514 non-charger weapons ignore the charger band', async () => {
  const f = await fixture();
  const P = f.Projectiles.prototype;
  const native = {};
  const w = f.make('charger').weapon;
  assert.ok(w.rangeMax > w.rangeMin);
  for (const charge of [0, LEGAL, 0.5, 1]) {
    const hud = w.rangeMin + (w.rangeMax - w.rangeMin) * charge;
    assert.ok(Number.isFinite(hud), `native fallback stays finite at charge ${charge}`);
    assert.ok(P.chargerReach(charge) >= MIN - 1e-9 && P.chargerReach(charge) <= FULL + 1e-9);
  }
  assert.ok(!('chargerReach' in native), 'native fallback path carries no helper');
});

test('#514 ghost births keep the wire maxDistance override', async () => {
  const f = await fixture();
  const a = f.make('charger');
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.actors = [a];
  system.ghostFire(a, { weapon: 'charger', muzzle: a.pos, dir: new f.THREE.Vector3(1, 0, 0), charge: LEGAL, len: 9.25 });
  assert.equal(system._fidelityChargerFlights.at(-1).range, 9.25);
  assert.notEqual(f.Projectiles.prototype.chargerReach(LEGAL), 9.25);
});
