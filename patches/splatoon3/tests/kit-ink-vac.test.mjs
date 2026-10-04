// Composed-module coverage for the Splat Charger Ink Vac special (issue 177,
// SpBlower). Drives the actual Actor activation/update lifecycle, the actual
// Projectiles exhale entry and the projectile-collision candidate hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installKitInkVac, inkVacAbsorbCandidate, disposeInkVac, blastRadius, intakeNearRadius,
  intakeFarRadius, exhaleDamage, exhaleSpeed, inkVacBlastDescriptor, INK_VAC_CALIBRATION, VAC_ID }
  from '../runtime/kit-ink-vac.mjs';

async function setup() {
  const f = await fixture();
  installKitInkVac(f, f.profile);
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = system;                       // real native projectile pipeline
  const a = f.make('charger');
  a.weapon = { ...a.weapon, special: VAC_ID, specialCost: 190 };
  a.special = 190;
  return { f, system, a };
}
const activate = (f, a) => { a.intent.special = true; f.tick(a); a.intent.special = false; };
const enemyShot = (f, x, y, z, vx, vy, vz) => ({ pos: new f.THREE.Vector3(x, y, z),
  vel: new f.THREE.Vector3(vx, vy, vz), team: 1, damage: 30 });
const shoot = (f, a, n = 3) => {
  for (let i = 0; i < n; i++) {
    const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
    const c = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
    c.onHit();
  }
};

test('activation consumes the special once, refills the tank once, and opens a held intake', async () => {
  const { f, a } = await setup();
  a.ink = 10;
  activate(f, a);
  assert.equal(a.special, 0, 'the special gauge is consumed on activation');
  assert.equal(a.ink, f.PLAYER.inkMax, 'the ink tank is refilled on activation');
  assert.equal(a.specialActive.id, VAC_ID, 'the held special uses the normalized id');
  assert.notEqual(a.weapon.special, 'storm', 'Ink Vac is not a Storm alias');
  f.tick(a);
  assert.equal(a.special, 0, 'the gauge is consumed exactly once');
});

test('the intake absorbs a frontal enemy projectile and disables its damage', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  const cand = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
  assert.ok(cand, 'a frontal incoming shot is accepted');
  assert.ok(Number.isFinite(cand.distance), 'the hook returns a first-contact distance');
  cand.onHit();
  assert.equal(p.damage, 0, 'an absorbed projectile deals zero damage');
});

test('the intake rejects a backside projectile', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, -5, 0, 0, 3);
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null);
});

test('an intervening wall blocks intake absorption (LOS at first contact)', async () => {
  const { f, a } = await setup();
  activate(f, a);
  f.G.physics.los = () => false;
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null);
});

test('intake range is limited to the pinned intake length', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const near = enemyShot(f, 0, 1, 12, 0, 0, -3);
  assert.ok(inkVacAbsorbCandidate(a, near.pos.clone(), near.pos.clone().addScaledVector(near.vel, 1 / 60), near));
  const far = enemyShot(f, 0, 1, 20, 0, 0, -3);
  assert.equal(inkVacAbsorbCandidate(a, far.pos.clone(), far.pos.clone().addScaledVector(far.vel, 1 / 60), far), null);
});

test('a projectile that only SWEEPS THROUGH the volume is absorbed at its analytic first entry', async () => {
  const { f, a } = await setup();
  activate(f, a);
  // Both endpoints are outside the volume; the segment crosses it. The old
  // endpoint-inside gate missed this entirely.
  const start = new f.THREE.Vector3(0, 1, 20), end = new f.THREE.Vector3(0, 1, -20);
  const p = { pos: start.clone(), vel: new f.THREE.Vector3(0, 0, -4000), team: 1, damage: 30 };
  const cand = inkVacAbsorbCandidate(a, start, end, p);
  assert.ok(cand, 'a full swept crossing is detected');
  // Travelling from z=20 to z=-20, the first entry is the far boundary z=15, i.e.
  // 5 units along a 40 unit segment.
  assert.ok(Math.abs(cand.distance - 5) < 1e-6, `first entry at the far boundary, got ${cand.distance}`);
});

test('the intake is aim-aligned including vertical aim', async () => {
  const { f, a } = await setup();
  activate(f, a);
  // Aim level: a high incoming shot above the cone is not absorbed.
  const high = enemyShot(f, 0, 12, 5, 0, -3, -3);
  assert.equal(inkVacAbsorbCandidate(a, high.pos.clone(), high.pos.clone().addScaledVector(high.vel, 1 / 60), high), null,
    'a shot far above the level aim is outside the frustum');
  // Aim upward: the same incoming shot now lies on the aim axis.
  a.aimDir.set(0, 1, 0).normalize(); a.aimPitch = Math.PI / 2;
  const onAxis = enemyShot(f, 0, 12, 0.001, 0, -3, -0.001);
  const cand = inkVacAbsorbCandidate(a, onAxis.pos.clone(), onAxis.pos.clone().addScaledVector(onAxis.vel, 1 / 60), onAxis);
  assert.ok(cand, 'the intake follows the vertical aim axis');
});

test('charge accrues once per accepted absorption and never double-credits', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  const cand = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
  cand.onHit();
  const after = f.inkVacState(a).charge;
  assert.ok(after > 0, 'charge accrued');
  cand.onHit(); cand.onHit();
  assert.equal(f.inkVacState(a).charge, after, 're-invoking onHit does not double-credit');
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null);
});

test('the special replaces main and sub while inhaling, but normal movement continues', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const seen = [];
  const runner = a.weaponRunner, realUpdate = runner.update;
  runner.update = function (dt, inp) { seen.push({ ...inp, held: !!f.inkVacState(a) }); return realUpdate.call(this, dt, inp); };
  f.tick(a, 40);
  a.intent.sub = true; a.intent.squid = true; f.tick(a);       // sub + form requested, no trigger
  a.intent.sub = false; a.intent.squid = false; f.tick(a);
  assert.ok(seen.length >= 1, 'the weapon runner was consulted');
  assert.ok(seen.some(i => i.held), 'frames were observed while the special was held');
  assert.ok(seen.filter(i => i.held).every(i => !i.fire && !i.sub && !i.subReleased),
    'while the Vac is held the main and sub are never given; they only reappear once it released');
  assert.equal(a.weaponRunner.charging, false, 'the charger does not begin a charge');
  assert.equal(a.form, 'kid', 'squid form is withheld during the held Vac');
  assert.ok(a.specialActive, 'the special is still held after withheld inputs');
});

test('primary fire inside the pinned 20F window is withheld, and releases after it', async () => {
  const { f, a, system } = await setup();
  activate(f, a);                                   // t = 1/60 after the first tick
  f.tick(a, 10);                                    // ~11 frames: inside InhaleToExhaleWaitFrame
  a.intent.fire = true; f.tick(a);
  assert.ok(a.specialActive, 'fire inside the 20-frame window does not release');
  assert.equal(system.list.length, 0, 'no countershot was queued yet');
  a.intent.fire = false; f.tick(a, 12);             // cross 20 frames
  a.intent.fire = true; f.tick(a);
  assert.equal(a.specialActive, null, 'fire after the 20-frame window releases');
  assert.equal(system.list.length, 1, 'the countershot is queued on release');
});

test('an unfilled inhale auto-releases at the pinned 150F cap', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  f.tick(a, 149);
  assert.ok(a.specialActive, 'still held just before the cap');
  f.tick(a, 2);
  assert.equal(a.specialActive, null, 'the special time cap ends the inhale');
  assert.equal(system.list.length, 1, 'a min-charge countershot was queued at the cap');
});

test('primary fire releases the countershot (exhale transition)', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  f.tick(a, 40);                                   // past the pinned 20F minimum
  assert.ok(a.specialActive, 'still inhaling');
  const before = system.list.length;
  a.intent.fire = true; f.tick(a);
  assert.equal(a.specialActive, null, 'primary fire ends the held special');
  assert.equal(f.inkVacState(a), null, 'state is cleared on release');
  assert.ok(system.list.length > before, 'primary fire queued the countershot');
});

test('release queues a native type-blast countershot carrying the resolved descriptor', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  shoot(f, a);
  const before = system.list.length;
  f.tick(a);
  assert.equal(a.specialActive, null);
  assert.equal(system.list.length, before + 1);
  const ex = system.list[system.list.length - 1];
  assert.equal(ex.type, 'blast');
  assert.equal(ex.wid, VAC_ID, 'wid is the special id used as the splash cause');
  const d = ex.s3SpecialWeapon;
  assert.ok(d, 'the resolved descriptor is set before _push');
  assert.equal(d.id, VAC_ID);
  assert.equal(d.kind, 'special');
  assert.ok(Array.isArray(d.splashBands) && Array.isArray(d.damageBands), 'descriptor supplies both band forms');
  assert.ok(d.splashRadius > 0 && d.burstRadius > 0 && d.impactRadius > 0);
  assert.ok(d.splashDamageMax > 0 && d.splashDamageMin > 0);
  assert.ok(d.provenance, 'descriptor carries tuning provenance');
});

test('the countershot uses the pinned spawn speed, gravity and blast wait', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  shoot(f, a);
  f.tick(a);
  const ex = system.list[system.list.length - 1];
  const speed = ex.vel.length();
  assert.ok(Math.abs(speed - 42) < 1e-6, `full-charge speed is 0.7*60 = 42 u/s, got ${speed}`);
  assert.ok(Math.abs(ex.grav - 0.003 * 3600) < 1e-6, 'gravity is the pinned per-frame^2 value x3600');
  assert.ok(Math.abs(ex.drag - 0.01 * 60) < 1e-6, 'air resistance is the pinned per-frame value x60');
  assert.ok(Math.abs(ex.delay - 50 / 60) < 1e-9, 'SpawnBlastWaitFrame 50 gates the detonation');
  assert.equal(ex.straight, 0, 'the pinned FlyGravity applies from the first frame');
});

test('countershot damage uses the repository raw/10 conversion', async () => {
  await setup();
  assert.equal(exhaleDamage(), 220, 'pinned raw 2200 with repository rawDamageToHP /10');
  const d = inkVacBlastDescriptor(1);
  assert.equal(d.splashDamageMax, 220);
  assert.ok(d.provenance.damage.includes('220 HP'));
});

test('a remote ghost authors no projectile (and thus no damage/paint) on release', async () => {
  const { f, a, system } = await setup();
  a.remote = true;
  activate(f, a);
  shoot(f, a);
  const before = system.list.length;
  f.tick(a);
  assert.equal(system.list.length, before, 'a remote ghost authors no projectile');
  assert.equal(a.specialActive, null, 'the remote special still ends cleanly');
});

test('death during an update does not restore the special token', async () => {
  const { f, a } = await setup();
  f.G.scene = new f.THREE.Scene();
  activate(f, a);
  assert.equal(f.G.scene.children.length, 1, 'the held intake owns a visible visual');
  // Die during the native pass of the very update that would restore the token.
  const enemy = f.make(); enemy.team = 1;
  a._finishFrame = () => { a.hp = 0; a.damage(60, enemy, 'inkvac'); };
  f.tick(a);
  assert.equal(a.alive, false, 'the actor really died');
  assert.equal(a.specialActive, null, 'the token is not restored after death');
  assert.equal(f.inkVacState(a), null, 'death disposes the intake state');
  assert.equal(f.G.scene.children.length, 0, 'death disposes the GPU resource');
});

test('dt 0 is a strict no-op for the held special', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const s0 = f.inkVacState(a);
  f.tick(a, 0);
  assert.ok(f.inkVacState(a), 'the special survives a zero-dt tick');
  assert.equal(f.inkVacState(a).t, s0.t, 'the inhale clock does not advance on dt 0');
  assert.ok(a.specialActive, 'still held');
});

test('the held visual is visible, aim-aligned, and never extends behind the owner', async () => {
  const { f, a } = await setup();
  f.G.scene = new f.THREE.Scene();
  activate(f, a);
  const mesh = f.G.scene.children[0];
  assert.ok(mesh.visible, 'the intake visual is visible while active');
  mesh.geometry.computeBoundingBox();
  assert.ok(Math.abs(mesh.geometry.boundingBox.min.y) < 1e-6,
    'the cone apex sits at the origin, so nothing extends behind the owner');
  assert.ok(Math.abs(mesh.geometry.boundingBox.max.y - 15) < 1e-6, 'the wide end is one intake length forward');
  const levelAxis = new f.THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
  assert.ok(levelAxis.distanceTo(new f.THREE.Vector3(0, 0, 1)) < 1e-6, 'the mesh follows the level aim');
  a.aimPitch = Math.PI / 2; a.aimYaw = 0;   // native update rebuilds aimDir from these
  f.tick(a, 1);
  const upAxis = new f.THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
  assert.ok(upAxis.distanceTo(new f.THREE.Vector3(0, 1, 0)) < 1e-6, 'the mesh follows the vertical aim');
});

test('reset clears the state and disposes the GPU resource', async () => {
  const { f, a } = await setup();
  f.G.scene = new f.THREE.Scene();
  activate(f, a);
  assert.equal(f.G.scene.children.length, 1);
  disposeInkVac(a);
  assert.equal(f.inkVacState(a), null);
  assert.equal(a.specialActive, null);
  assert.equal(f.G.scene.children.length, 0);
});

test('pinned/calibrated geometry helpers expose the labelled values', async () => {
  await setup();
  assert.equal(intakeNearRadius(0), 0.8, 'pinned RadiusMin.Low');
  assert.equal(intakeNearRadius(1), 1.4, 'pinned RadiusMin.High');
  assert.equal(intakeFarRadius(0), 3.3, 'pinned RadiusMax.Low');
  assert.equal(intakeFarRadius(1), 4.3, 'pinned RadiusMax.High');
  assert.equal(blastRadius(0), 6.0);
  assert.equal(blastRadius(1), 11.0);
  assert.ok(Math.abs(exhaleSpeed(0) - 33) < 1e-9, '0.55*60 = 33 u/s');
  assert.ok(Math.abs(exhaleSpeed(1) - 42) < 1e-9, '0.7*60 = 42 u/s');
  assert.ok(INK_VAC_CALIBRATION.geometryStatus.includes('unconfirmed'));
  assert.ok(INK_VAC_CALIBRATION.damageStatus.includes('scale limitation'));
});