// Composed-module coverage for the Splat Charger Ink Vac special (issue 177,
// SpBlower). Drives the actual Actor activation/update lifecycle, the actual
// Projectiles exhale entry and the projectile-collision candidate hook. Helpers
// alone are not treated as proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installKitInkVac, inkVacAbsorbCandidate, disposeInkVac, blastRadius, intakeRadius, inkVacBlastDescriptor, INK_VAC_CALIBRATION } from '../runtime/kit-ink-vac.mjs';

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

test('release queues a native type-blast countershot carrying the resolved inkVac descriptor', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  for (let i = 0; i < 3; i++) {
    const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
    inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p).onHit();
  }
  assert.ok(f.inkVacState(a).charge >= 1, 'charge is full');
  const before = system.list.length;
  f.tick(a);                                          // release on the next update
  assert.equal(a.specialActive, null, 'release ends the held special');
  assert.equal(f.inkVacState(a), null, 'release clears the intake state');
  assert.equal(system.list.length, before + 1, 'countershot pushed onto the native projectile list');
  const ex = system.list[system.list.length - 1];
  assert.equal(ex.type, 'blast', 'native blast type so the native integrator/burst runs');
  assert.equal(ex.wid, 'inkVac', 'wid is the special id used as the splash cause');
  assert.ok(ex.s3SpecialWeapon, 'the resolved descriptor is set before _push for the parent handoff');
  const d = ex.s3SpecialWeapon;
  assert.equal(d.id, 'inkVac');
  assert.equal(d.kind, 'special');
  assert.ok(Array.isArray(d.splashBands) && d.splashBands.length > 0, 'descriptor supplies splashBands');
  assert.ok(d.splashRadius > 0 && d.burstRadius > 0 && d.impactRadius > 0, 'descriptor supplies radii');
  assert.ok(d.splashDamageMax > 0 && d.splashDamageMin > 0, 'descriptor supplies splash damage');
  assert.ok(ex.damage > 0, 'direct damage travels on p.damage');
  assert.equal(d.splashRadius, 11.0, 'max-charge blast radius (pinned)');
  assert.ok(d.provenance, 'descriptor carries tuning provenance');
});

test('the descriptor is charge-scaled and falls back to WEAPONS.blaster only via parent handoff', async () => {
  await setup();
  const min = inkVacBlastDescriptor(0), max = inkVacBlastDescriptor(1);
  assert.equal(min.splashRadius, 6.0, 'pinned min-charge blast radius');
  assert.equal(max.splashRadius, 11.0, 'pinned max-charge blast radius');
  assert.ok(max.splashDamageMax >= min.splashDamageMax, 'damage does not shrink with charge');
  assert.equal(min.provenance.blastRadius.includes('pinned'), true);
  // The descriptor is NOT WEAPONS.blaster: without the parent handoff the native
  // _blastBurst would read WEAPONS.blaster (the known gap), so we must not claim
  // current native integration here.
  assert.notEqual(max.id, 'blaster');
});

test('a remote ghost authors no projectile (and thus no damage/paint) on release', async () => {
  const { f, a, system } = await setup();
  a.remote = true;
  activate(f, a);
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