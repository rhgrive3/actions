// Composed-module coverage for the Splat Charger Ink Vac special (issue 177,
// SpBlower). Drives the actual Actor activation/update lifecycle, the actual
// Projectiles exhale entry and the projectile-collision candidate hook. Helpers
// alone are not treated as proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installKitInkVac, inkVacAbsorbCandidate, disposeInkVac, blastRadius, intakeRadius, INK_VAC_CALIBRATION } from '../runtime/kit-ink-vac.mjs';

function setup() {
  const f = fixture();
  return f.then(f => {
    installKitInkVac(f, f.profile);
    const system = new f.Projectiles(new f.THREE.Scene());
    f.G.projectiles = system;                 // use the real native projectile pipeline
    const a = f.make('charger');
    a.weapon = { ...a.weapon, special: 'inkvac', specialCost: 190 };
    a.special = 190;
    return { f, system, a };
  });
}
const activate = (f, a) => { a.intent.special = true; f.tick(a); a.intent.special = false; };
const enemyShot = (f, x, y, z, vx, vy, vz) => ({ pos: new f.THREE.Vector3(x, y, z),
  vel: new f.THREE.Vector3(vx, vy, vz), team: 1, damage: 30 });

test('activation consumes the special once, refills the tank once, and opens a held intake', async () => {
  const { f, a } = await setup();
  a.ink = 10;
  activate(f, a);
  assert.equal(a.special, 0, 'the special gauge is consumed on activation');
  assert.equal(a.ink, f.PLAYER.inkMax, 'the ink tank is refilled on activation');
  assert.ok(a.specialActive && a.specialActive.id === 'inkvac', 'the held special is an inkvac token');
  assert.equal(a.weapon.special, 'inkvac');
  assert.notEqual(a.weapon.special, 'storm', 'Ink Vac is not a Storm alias');
});

test('the intake absorbs a frontal enemy projectile and disables its damage', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);          // in front, travelling toward the player
  const cand = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
  assert.ok(cand, 'a frontal incoming shot is accepted');
  assert.ok(Number.isFinite(cand.distance), 'the hook returns a first-contact distance');
  assert.equal(typeof cand.onHit, 'function');
  cand.onHit();
  assert.equal(p.damage, 0, 'an absorbed projectile deals zero damage');
});

test('the intake rejects a backside projectile (not a Storm alias / no omnidirectional pickup)', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, -5, 0, 0, 3);          // behind, travelling away
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null);
});

test('an intervening wall blocks intake absorption (LOS-limited)', async () => {
  const { f, a } = await setup();
  activate(f, a);
  f.G.physics.los = () => false;                     // wall between intake and projectile
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null);
});

test('intake range is limited to the pinned intake length', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const near = enemyShot(f, 0, 1, 12, 0, 0, -3);
  assert.ok(inkVacAbsorbCandidate(a, near.pos.clone(), near.pos.clone().addScaledVector(near.vel, 1 / 60), near), 'inside length');
  const far = enemyShot(f, 0, 1, 20, 0, 0, -3);
  assert.equal(inkVacAbsorbCandidate(a, far.pos.clone(), far.pos.clone().addScaledVector(far.vel, 1 / 60), far), null, 'beyond length');
});

test('charge accrues once per accepted absorption and never double-credits a projectile', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const s0 = f.inkVacState(a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  const cand = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
  cand.onHit();
  const afterFirst = f.inkVacState(a).charge;
  assert.ok(afterFirst > 0, 'charge accrued');
  cand.onHit();                                      // idempotent
  cand.onHit();
  assert.equal(f.inkVacState(a).charge, afterFirst, 're-invoking onHit does not double-credit');
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null,
    'an already-absorbed projectile is not re-offered');
});

test('normal movement and main weapon remain usable while the special is held', async () => {
  const { f, a } = await setup();
  activate(f, a);
  assert.ok(a.specialActive, 'special still held');
  a.intent.squid = true; f.tick(a);                 // the normal form pipeline runs, not a frozen special
  assert.equal(a.form, 'squid', 'squid form is reachable during Ink Vac');
  a.intent.squid = false; f.tick(a, 30);            // pop out and clear the native emerge delay
  a.intent.fire = true; f.tick(a);                  // charger begins its charge during the special
  assert.equal(a.weaponRunner.charging, true, 'the main weapon still responds during the special');
  a.intent.fire = false; f.tick(a);
  assert.ok(a.specialActive, 'the special is not cancelled by normal weapon use');
});

test('release emits a charge-scaled countershot blast + turf through the native projectile pipeline', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  f.G.paint.splat = () => 1.0;                       // deterministic area per splat
  f.G.physics.raycast = (from, dir, _d, out) => {     // ground hit for the downward blast probe
    out.hit = dir.y < -0.5; out.dist = from.y; out.point.set(from.x, 0, from.z); out.normal.set(0, 1, 0); return out;
  };
  f.G.physics.los = () => true;
  const victim = f.make(); victim.team = 1; f.G.actors = [a, victim];
  // Fill the charge via three accepted absorptions (0.34 each).
  for (let i = 0; i < 3; i++) {
    const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
    inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p).onHit();
  }
  assert.ok(f.inkVacState(a).charge >= 1, 'charge is full');
  const before = system.list.length;
  f.tick(a);                                          // release on the next update
  assert.equal(a.specialActive, null, 'release ends the held special');
  assert.equal(f.inkVacState(a), null, 'release clears the intake state');
  assert.ok(system.list.length > before, 'a countershot entry was pushed onto the native projectile list');
  const exhale = system.list[system.list.length - 1];
  assert.equal(exhale.wid, 'inkvac', 'the countershot is an inkvac native projectile, not a storm cloud');
  assert.ok(victim.hp < f.PLAYER.hp, 'the charge-scaled countershot damaged the enemy');
  assert.ok(a.stats.turf > 0, 'the countershot laid turf');
});

test('a remote ghost authors neither damage nor turf nor a projectile on release', async () => {
  const { f, a, system } = await setup();
  a.remote = true;
  activate(f, a);
  f.G.paint.splat = () => 1.0;
  f.G.physics.raycast = (from, dir, _d, out) => { out.hit = dir.y < -0.5; out.dist = from.y; out.point.set(from.x, 0, from.z); out.normal.set(0, 1, 0); return out; };
  f.G.physics.los = () => true;
  const victim = f.make(); victim.team = 1; f.G.actors = [a, victim];
  for (let i = 0; i < 3; i++) {
    const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
    inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p).onHit();
  }
  const before = system.list.length, hp = victim.hp, turf = a.stats.turf;
  f.tick(a);
  assert.equal(system.list.length, before, 'a remote ghost authors no projectile');
  assert.equal(victim.hp, hp, 'a remote ghost authors no damage');
  assert.equal(a.stats.turf, turf, 'a remote ghost authors no turf');
  assert.equal(a.specialActive, null, 'the remote special still ends cleanly');
});

test('death disposes the intake state and its GPU resource', async () => {
  const { f, a } = await setup();
  f.G.scene = new f.THREE.Scene();                   // enable the owned visual so disposal is exercised
  activate(f, a);
  assert.equal(f.G.scene.children.length, 1, 'the held intake owns a visual');
  a.hp = 1; a.damage(60, null, 'inkvac');
  assert.equal(f.inkVacState(a), null, 'death clears the intake state');
  assert.equal(a.specialActive, null, 'death clears the special token');
  assert.equal(f.G.scene.children.length, 0, 'death disposes the GPU resource');
});

test('an explicit dispose resets state and disposes the visual', async () => {
  const { f, a } = await setup();
  f.G.scene = new f.THREE.Scene();
  activate(f, a);
  assert.equal(f.G.scene.children.length, 1);
  disposeInkVac(a);
  assert.equal(f.inkVacState(a), null);
  assert.equal(f.G.scene.children.length, 0);
  assert.equal(a.specialActive, null);
});

test('pinned geometry helpers expose the calibrated intake/blast radii', async () => {
  await setup();
  assert.equal(intakeRadius(0), 0.8, 'pinned RadiusMin.Low');
  assert.equal(intakeRadius(1), 3.3, 'pinned RadiusMax.Low');
  assert.equal(blastRadius(0), 6.0, 'pinned min-charge blast radius');
  assert.equal(blastRadius(1), 11.0, 'pinned max-charge blast radius');
  assert.ok(INK_VAC_CALIBRATION.status.includes('calibration'));
});