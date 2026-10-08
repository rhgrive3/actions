// Composed-module coverage for the Splat Charger Ink Vac special (issue 177,
// SpBlower). Drives the actual Actor activation/update lifecycle, the actual
// Projectiles exhale entry and the projectile-collision candidate hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './kit-composed-fixture.mjs';
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
const shoot = (f, a, n = Math.ceil(INK_VAC_CALIBRATION.absorbCapacityDamage / 30)) => {
  for (let i = 0; i < n; i++) {
    const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
    const c = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
    c.onHit();
  }
};
const enterExhale = (f, a, max = 400) => {
  for (let i = 0; i < max && f.inkVacState(a)?.phase === 'inhale'; i++) f.tick(a);
  assert.equal(f.inkVacState(a)?.phase, 'exhale', 'suction transitioned to the return-shot hold');
};
const fireReturn = (f, a) => {
  enterExhale(f, a);
  a.intent.fire = true; f.tick(a); a.intent.fire = false;
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

test('#1042 primary fire cannot skip the suction phase', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  f.tick(a, 40);
  a.intent.fire = true; f.tick(a); a.intent.fire = false;
  assert.equal(f.inkVacState(a)?.phase, 'inhale', 'manual fire is ignored while suction is active');
  assert.equal(system.list.length, 0, 'no return shot exists during suction');
});

test('#1042 unfilled suction lasts 360F, then a separate 150F return-shot hold auto-fires', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  const state = f.inkVacState(a);
  assert.equal(INK_VAC_CALIBRATION.inhaleDurationSeconds, 6);
  assert.equal(INK_VAC_CALIBRATION.exhaleHoldSeconds, 2.5);

  let inhaleTicks = 0;
  while (state.phase === 'inhale' && inhaleTicks < 400) { f.tick(a); inhaleTicks++; }
  assert.equal(state.phase, 'exhale');
  assert.ok(inhaleTicks >= 359 && inhaleTicks <= 360, `suction transition stayed on the 360F boundary: ${inhaleTicks}`);
  assert.equal(system.list.length, 0, 'ending suction does not itself fire the countershot');
  assert.ok(a.specialActive, 'special remains active in the return-shot hold');

  for (let i = 0; i < 149; i++) {
    f.tick(a);
    assert.equal(system.list.length, 0, `no forced return shot before hold frame ${i + 1}`);
  }
  f.tick(a);
  assert.equal(a.specialActive, null, '150F hold auto-fires and ends the special');
  assert.equal(system.list.length, 1, 'exactly one return projectile is authored');
});

test('#1042 filling the Vac ends suction early but still enters the return-shot hold', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  shoot(f, a);
  enterExhale(f, a, 30);
  assert.ok(f.inkVacState(a).t < 0.1, 'post-suction hold owns a fresh clock');
  assert.equal(system.list.length, 0, 'full charge transitions state without auto-firing immediately');
  a.intent.fire = true; f.tick(a); a.intent.fire = false;
  assert.equal(f.inkVacState(a), null, 'manual fire is accepted in the exhale phase');
  assert.equal(system.list.length, 1);
});

test('zero-length segments, tangent contact and a zero aim vector are safe', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const st = f.inkVacState(a);
  const inside = new f.THREE.Vector3(0, 1, 3);
  const outside = new f.THREE.Vector3(0, 1, 30);
  // zero-length INSIDE
  assert.doesNotThrow(() => inkVacAbsorbCandidate(a, inside, inside.clone(), enemyShot(f, 0, 1, 3, 0, 0, -3)));
  assert.ok(inkVacAbsorbCandidate(a, inside, inside.clone(), enemyShot(f, 0, 1, 3, 0, 0, -3)),
    'a zero-length segment inside the volume is an entry at distance 0');
  // zero-length OUTSIDE
  assert.equal(inkVacAbsorbCandidate(a, outside, outside.clone(), enemyShot(f, 0, 1, 30, 0, 0, -3)), null);
  // zero-length BEHIND
  assert.equal(inkVacAbsorbCandidate(a, new f.THREE.Vector3(0, 1, -3), new f.THREE.Vector3(0, 1, -3),
    enemyShot(f, 0, 1, -3, 0, 0, 3)), null);
  // tangent: exactly on the far boundary surface (F == 0 within rounding)
  const tangent = new f.THREE.Vector3(0, 1 + st.farR, 15);
  assert.ok(inkVacAbsorbCandidate(a, tangent, tangent.clone(), enemyShot(f, 0, 1 + st.farR, 15, 0, 0, -3)),
    'tangent contact on the surface is accepted despite floating-point rounding');
  // zero aim direction must not degenerate the intake
  a.aimDir.set(0, 0, 0);
  assert.doesNotThrow(() => inkVacAbsorbCandidate(a, inside, inside.clone(), enemyShot(f, 0, 1, 3, 0, 0, -3)));
  a.aimDir.set(0, 0, 1);
});

test('a disposed actor state yields no intake candidate', async () => {
  const { f, a } = await setup();
  activate(f, a);
  disposeInkVac(a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  assert.equal(inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p), null);
});

test('a ghost projectile is neither credited nor neutralised', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  p.ghost = true;
  const cand = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
  assert.ok(cand, 'a ghost is still intercepted geometrically');
  cand.onHit();
  assert.equal(f.inkVacState(a).charge, 0, 'no charge is credited for a ghost projectile');
  assert.equal(p.damage, 30, 'a ghost projectile is not neutralised either');
});

test('the countershot bursts automatically at its finite lifetime in the native step', async () => {
  const { f, a, system } = await setup();
  f.G.physics.segment = () => ({ hit: false });
  activate(f, a);
  shoot(f, a);                                      // absorb at ground level first
  a.pos.y = 40;                    // then isolate the lifetime: drop must not reach the water line
  fireReturn(f, a);                                  // exhale phase release queues the countershot
  const ex = system.list[system.list.length - 1];
  assert.equal(ex.delay, 0, 'no launch delay: the native integrator runs immediately');
  assert.ok(Math.abs(ex.life - 50 / 60) < 1e-9, 'SpawnBlastWaitFrame 50 is the native lifetime');
  let bursts = 0, frames = 0;
  system._blastBurst = () => { bursts++; };
  while (system._step(ex, 1 / 60) === false && frames < 600) frames++;
  assert.ok(bursts >= 1, 'the native step bursts the countershot at its finite deadline');
  assert.ok(frames <= 52, `the burst happens at the lifetime, took ${frames} frames`);
});

test('a dt0 frame is a strict no-op: no release, no countershot, no main shot', async () => {
  const { f, a, system } = await setup();
  activate(f, a);
  f.tick(a, 40);
  a.intent.fire = true;
  f.G.time += 0; a.update(0);
  assert.ok(a.specialActive, 'a paused frame never releases');
  assert.equal(system.list.length, 0, 'no countershot is queued on a paused frame');
  assert.equal(a.weaponRunner.charging, false, 'no main shot on a paused frame');
});

test('the release frame does not also fire the replaced main weapon or sub', async () => {
  const { f, a } = await setup();
  activate(f, a); shoot(f, a); enterExhale(f, a, 30);
  const seen = [];
  const runner = a.weaponRunner, real = runner.update;
  runner.update = function (dt, inp) { seen.push({ ...inp }); return real.call(this, dt, inp); };
  a.intent.fire = true; a.intent.sub = true; f.tick(a);
  assert.equal(a.specialActive, null, 'the return shot released');
  assert.ok(seen.every(i => !i.fire && !i.sub && !i.subReleased),
    'main and sub stay suppressed on the release frame');
});

test('primary fire releases the countershot only after suction has entered exhale', async () => {
  const { f, a, system } = await setup();
  activate(f, a); shoot(f, a); enterExhale(f, a, 30);
  const before = system.list.length;
  a.intent.fire = true; f.tick(a); a.intent.fire = false;
  assert.equal(a.specialActive, null);
  assert.equal(f.inkVacState(a), null);
  assert.ok(system.list.length > before);
});

test('release queues a native type-blast countershot carrying the resolved descriptor', async () => {
  const { f, a, system } = await setup();
  activate(f, a); shoot(f, a); fireReturn(f, a);
  assert.equal(system.list.length, 1);
  const ex = system.list[0];
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
  activate(f, a); shoot(f, a); fireReturn(f, a);
  const ex = system.list[system.list.length - 1];
  const speed = ex.vel.length();
  assert.ok(Math.abs(speed - 42) < 1e-6, `full-charge speed is 0.7*60 = 42 u/s, got ${speed}`);
  assert.ok(Math.abs(ex.grav - 0.003 * 3600) < 1e-6, 'gravity is the pinned per-frame^2 value x3600');
  assert.ok(Math.abs(ex.drag - 0.01 * 60) < 1e-6, 'air resistance is the pinned per-frame value x60');
  assert.ok(Number.isFinite(ex.life), 'the countershot lifetime is finite, never claimed bounded by Infinity');
  assert.ok(Math.abs(ex.life - 50 / 60) < 1e-9, 'SpawnBlastWaitFrame 50 is the native lifetime');
  assert.equal(ex.delay, 0, 'no launch delay');
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
  enterExhale(f, a, 30);
  const before = system.list.length;
  a.intent.fire = true; f.tick(a); a.intent.fire = false;
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
  let dealt=false;a._finishFrame = () => {if(!dealt){dealt=true;a.hp=0;a.damage(60,enemy,'inkvac');}};
  f.tick(a);
  assert.equal(a.alive,true,'the accepted lethal hit waits for the existing1F determination');f.tick(a);
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

test('#1010 absorbed charge does not resize suction; Special Power Up does', async () => {
  const { f, a } = await setup();
  a.s3.modifiers.specialPower = 0.5;
  activate(f, a);
  const state = f.inkVacState(a);
  assert.equal(state.specialPower, 0.5);
  assert.equal(state.nearR, intakeNearRadius(0.5));
  assert.equal(state.farR, intakeFarRadius(0.5));
  const before = [state.nearR, state.farR];
  shoot(f, a, 2);
  assert.ok(state.charge > 0.5, 'precondition: absorbed charge increased');
  assert.deepEqual([state.nearR, state.farR], before, 'absorption never changes suction geometry');
});

test('pinned/calibrated geometry helpers expose the labelled values', async () => {
  await setup();
  assert.equal(intakeNearRadius(0), 0.8, '0 AP uses RadiusMin.Low');
  assert.equal(intakeNearRadius(1), 1.4, 'max Special Power Up uses RadiusMin.High');
  assert.equal(intakeFarRadius(0), 3.3, '0 AP uses RadiusMax.Low');
  assert.equal(intakeFarRadius(1), 4.3, 'max Special Power Up uses RadiusMax.High');
  assert.equal(blastRadius(0), 6.0);
  assert.equal(blastRadius(1), 11.0);
  assert.ok(Math.abs(exhaleSpeed(0) - 33) < 1e-9, '0.55*60 = 33 u/s');
  assert.ok(Math.abs(exhaleSpeed(1) - 42) < 1e-9, '0.7*60 = 42 u/s');
  assert.ok(INK_VAC_CALIBRATION.geometryStatus.includes('unconfirmed'));
  assert.ok(INK_VAC_CALIBRATION.damageStatus.includes('scale limitation'));
});

// ===========================================================================
// REMOTE REPLAY: two composed actors, NetMatch-shaped JSON packets
// ===========================================================================
//
// packEvent/unpackEvent below mirror the PRIVATE functions in
// inkwave-public/src/net/netmatch.js (packEvent, ~L765). Native packEvent keeps
// only TOP-LEVEL actors, [x,y,z] vectors, numbers, strings and booleans: any
// nested object -- and any other array -- is DROPPED, so the payloads must be
// flat. Every packet here is round-tripped through JSON.stringify.
//
// Two machines are modelled in one composed context, exactly as a NetMatch
// session addresses them: a nid is session-wide, and each machine resolves it
// through ITS OWN byNid.
//   machine P: p1 = P's local Ink Vac owner (nid 1, remote false)
//              p2 = P's proxy for Q's player      (nid 2, remote true)
//   machine Q: q1 = Q's proxy for P's owner      (nid 1, remote true)
//              q2 = Q's local shooter            (nid 2, remote false)
const r3 = v => Math.round(v * 1000) / 1000;
function packEvent(e) {
  const o = {};
  for (const k in e) {
    const v = e[k];
    if (v && v.nid !== undefined && v.character) o[k] = { n: v.nid };
    else if (v && v.isVector3) o[k] = [r3(v.x), r3(v.y), r3(v.z)];
    else if (typeof v === 'number') o[k] = r3(v);
    else if (typeof v === 'string' || typeof v === 'boolean') o[k] = v;
  }
  return o;
}
function unpackEvent(d, byNid, f) {
  const e = {};
  for (const k in d) {
    const v = d[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && v.n !== undefined) e[k] = byNid.get(v.n) || null;
    else if (Array.isArray(v) && v.length === 3) e[k] = new f.THREE.Vector3(v[0], v[1], v[2]);
    else e[k] = v;
  }
  return e;
}
// One real transport hop: local emit -> native pack -> JSON wire -> the
// RECEIVER's unpack -> replayInkVac with `e.actor || e.victim`, as native
// _onLocalEvent/_playEvent do.
function hop(f, view, payload, name) {
  const e = unpackEvent(JSON.parse(JSON.stringify(packEvent(payload))), view, f);
  return { verdict: f.replayInkVac(name, e.actor || e.victim, e), wire: e };
}

async function twoActorSetup() {
  const { f, system } = await setup();
  f.G.scene = new f.THREE.Scene();
  const p1 = f.make('charger');
  p1.nid = 1; p1.remote = false; p1.team = 0;
  p1.weapon = { ...p1.weapon, special: VAC_ID, specialCost: 190 }; p1.special = 190;
  const p2 = f.make('charger'); p2.nid = 2; p2.remote = true; p2.team = 1;
  const q1 = f.make('charger'); q1.nid = 1; q1.remote = true; q1.team = 0;
  q1.aimDir.set(0, 0, 1); q1.aimYaw = 0;
  const q2 = f.make('shooter'); q2.nid = 2; q2.remote = false; q2.team = 1;
  const viewP = new Map([[1, p1], [2, p2]]);       // machine P resolves nids its own way
  const viewQ = new Map([[1, q1], [2, q2]]);       // machine Q likewise
  const rec = [];
  for (const name of Object.values(f.INK_VAC_EVENTS)) f.on(name, payload => rec.push({ name, payload }));
  return { f, system, p1, p2, q1, q2, viewP, viewQ, rec };
}
const at = (f, a, z) => new f.THREE.Vector3(a.pos.x, a.pos.y + 1, a.pos.z + z);
const step = (f, p, z) => { const s = at(f, p, z), e = s.clone(); e.z -= 0.05; return [s, e]; };

test('every replay payload is flat, JSON-safe and survives the native packer', async () => {
  const { f, p1, viewQ, rec } = await twoActorSetup();
  activate(f, p1);
  assert.equal(rec.length, 1, 'activation emitted exactly one replayable event');
  const packed = packEvent(rec[0].payload);
  assert.deepEqual(Object.keys(packed).sort(), ['actor', 'charge', 'kit', 'nid', 'power', 'serial'],
    'the activation payload is flat and includes the Special Power Up scalar');
  assert.ok(!Object.values(packed).some(v => v && typeof v === 'object' && !Array.isArray(v) && v.n === undefined),
    'no nested object survives, so nothing is silently dropped by the native packer');
  const wire = JSON.parse(JSON.stringify(packed));
  assert.equal(wire.kit, VAC_ID);
  assert.ok(Number.isInteger(wire.serial) && Number.isInteger(wire.nid), 'serial and nid stay integers on the wire');
  const e = unpackEvent(wire, viewQ, f);
  assert.equal(e.actor, viewQ.get(1), 'the actor resolves to the RECEIVER\'s own actor for that nid');
  assert.equal(e.kit, VAC_ID);
});

test('a replayed activation opens a replica cone; duplicates and out-of-order are dropped', async () => {
  const { f, p1, q1, viewQ, rec } = await twoActorSetup();
  activate(f, p1);
  const activation = rec.find(r => r.name === f.INK_VAC_EVENTS.activation).payload;
  const serial = activation.serial;
  assert.equal(hop(f, viewQ, activation, f.INK_VAC_EVENTS.activation).verdict.applied, true);
  assert.ok(f.inkVacState(q1), 'the replica holds presentation state');
  assert.equal(f.inkVacState(q1).remote, true, 'the replica state is marked remote');
  assert.equal(f.G.scene.children.length, 2, 'the replica cone is a real scene object');
  // DUPLICATE: the same activation serial again.
  assert.equal(hop(f, viewQ, activation, f.INK_VAC_EVENTS.activation).verdict.reason, 'duplicate-or-out-of-order-activation');
  // OUT OF ORDER: an older serial arriving after a newer one was accepted.
  assert.equal(hop(f, viewQ, { ...activation, serial: serial + 5 }, f.INK_VAC_EVENTS.activation).verdict.applied, true);
  assert.equal(hop(f, viewQ, { ...activation, serial: serial - 1 }, f.INK_VAC_EVENTS.activation).verdict.reason,
    'duplicate-or-out-of-order-activation');
  // A charge naming the now-superseded activation must not land.
  const stale = hop(f, viewQ, { actor: activation.actor, kit: VAC_ID, serial, charge: 0.9 }, f.INK_VAC_EVENTS.charge);
  assert.equal(stale.verdict.reason, 'stale-or-mismatched-serial');
  assert.notEqual(f.inkVacState(q1).charge, 0.9, 'the stale charge never landed');
});

test('malformed, foreign and target-less packets are dropped, never half-applied', async () => {
  const { f, p1, p2, q1, q2, viewP, viewQ, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const activation = rec.find(r => r.name === EV.activation).payload;
  hop(f, viewQ, activation, EV.activation);
  const before = f.inkVacState(q1).charge;
  const malformed = [
    [null, 'malformed-payload'], [[1, 2], 'malformed-payload'], ['nope', 'malformed-payload'], [42, 'malformed-payload'],
    [{ ...activation, kit: 'storm' }, 'not-inkvac'],
    [{ ...activation, serial: 1.5 }, 'malformed-serial'], [{ ...activation, serial: 'three' }, 'malformed-serial'],
    [{ ...activation, serial: -4 }, 'malformed-serial'], [{ ...activation, serial: undefined }, 'malformed-serial'],
    [{ ...activation, serial: NaN }, 'malformed-serial'],
  ];
  for (const [payload, reason] of malformed) {
    const got = f.replayInkVac(EV.absorb, p1, payload);
    assert.equal(got.applied, false, `a malformed proposal is rejected (${reason})`);
    assert.equal(got.reason, reason);
  }
  // A proposal addressed to a proxy of the shooter, or to nobody, is refused.
  assert.equal(f.replayInkVac(EV.absorb, p1, { actor: p2, kit: VAC_ID, serial: activation.serial, key: 'k1' }).reason, 'malformed-subject');
  assert.equal(f.replayInkVac(EV.absorb, p2, { actor: p2, target: q1, kit: VAC_ID, serial: activation.serial, key: 'k2' }).reason,
    'replica-is-not-an-authority');
  // An unknown event name and a replica packet aimed at a local actor.
  assert.equal(f.replayInkVac('special:unknown', q1, activation).reason, 'unknown-event');
  assert.equal(f.replayInkVac(EV.charge, p1, activation).reason, 'replica-events-need-a-remote-actor');
  assert.equal(f.replayInkVac(EV.release, null, activation).reason, 'missing-event-or-actor');
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: activation.actor, kit: VAC_ID, serial: activation.serial }).reason,
    'malformed-charge');
  // A replica is never a credit authority, whoever sends the proposal.
  assert.equal(hop(f, viewQ, { actor: q2, target: q1, kit: VAC_ID, serial: activation.serial, key: 'k3' }, EV.absorb).verdict.reason,
    'replica-is-not-an-authority');
  assert.equal(f.inkVacState(q1).charge, before, 'no malformed packet changed the replica charge');
  assert.equal(f.inkVacState(p1).charge, 0, 'no malformed packet changed the owner charge');
});

test('a remote state never authors a countershot, paint, gauge, refill or damage', async () => {
  const { f, system, p1, q1, viewQ, rec } = await twoActorSetup();
  let painted = 0;
  f.G.paint.splat = () => { painted++; return 0; };
  activate(f, p1);
  const activation = rec.find(r => r.name === f.INK_VAC_EVENTS.activation).payload;
  const serial = activation.serial;
  hop(f, viewQ, activation, f.INK_VAC_EVENTS.activation);
  const projectiles = system.list.length, tank = q1.ink, gauge = q1.special, hp = q1.hp, count = f.G.scene.children.length;
  const charged = hop(f, viewQ, { actor: activation.actor, kit: VAC_ID, serial, charge: 1 }, f.INK_VAC_EVENTS.charge);
  assert.equal(charged.verdict.applied, true);
  assert.ok(f.inkVacState(q1).charge > 0.9, 'the replica shows the owner-approved charge');
  const rel = hop(f, viewQ, { actor: activation.actor, kit: VAC_ID, serial, charge: 1 }, f.INK_VAC_EVENTS.release);
  assert.equal(rel.verdict.applied, true);
  assert.equal(system.list.length, projectiles, 'the replica authors no projectile (no second ghost allocation)');
  assert.equal(painted, 0, 'the replica paints nothing');
  assert.equal(q1.ink, tank, 'the replica tank is not refilled');
  assert.equal(q1.special, gauge, 'the replica gauge is not consumed');
  assert.equal(q1.hp, hp, 'the replica takes no damage');
  assert.equal(q1.specialActive, null, 'a replica never holds a real special token');
  assert.equal(f.inkVacState(q1), null, 'the replica cone is gone after the release');
  assert.equal(f.G.scene.children.length, count - 1, 'only the replica mesh was disposed');
});

test('a shooter proposal neutralises its damage and the owner credits it exactly once', async () => {
  const { f, p1, p2, q1, q2, viewP, viewQ, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const activation = rec.find(r => r.name === EV.activation).payload;
  const serial = activation.serial;
  hop(f, viewQ, activation, EV.activation);
  // Machine Q: Q's local player shoots a native round at P's actor on Q's machine.
  const p = { pos: at(f, q1, 5), vel: new f.THREE.Vector3(0, 0, -3), owner: q2, team: 2, damage: 30 };
  const [s, e] = step(f, q1, 5);
  const cand = f.inkVacAbsorbCandidate(q1, s, e, p);
  assert.ok(cand, 'the round enters the replica intake');
  assert.equal(cand.onHit(), true, 'the replica authorises the absorption by proposing, not by crediting');
  assert.equal(p.damage, 0, 'the shooter-authoritative damage is neutralised at first contact');
  assert.equal(f.inkVacState(q1).charge, 0, 'a replica never claims charge from a replayed ghost');
  const proposal = rec.find(r => r.name === EV.absorb);
  assert.ok(proposal, 'an absorption PROPOSAL was emitted');
  assert.equal(proposal.payload.actor, q2, 'the proposal names the SHOOTER as actor');
  assert.equal(proposal.payload.target, q1, 'and the Vac owner as target');
  assert.equal(proposal.payload.serial, serial, 'keyed by the source activation');
  assert.equal(typeof proposal.payload.key, 'string', 'keyed by the source projectile');
  assert.deepEqual(Object.keys(packEvent(proposal.payload)).sort(), ['actor', 'key', 'kit', 'serial', 'target'],
    'the proposal is flat so the native packer keeps both actor references');
  // Machine P consumes the proposal exactly once, over the real wire shape.
  const { wire, verdict: c1 } = hop(f, viewP, proposal.payload, EV.absorb);
  assert.equal(wire.actor, p2, 'P resolves the shooter nid to its own proxy');
  assert.equal(wire.target, p1, 'and the owner nid to its own actor');
  assert.equal(c1.applied, true, 'the owner credits the proposal');
  const credited = f.inkVacState(p1).charge;
  assert.ok(credited > 0, 'the owner charged');
  assert.equal(credited, c1.charge, 'the owner applied its OWN calibration, not a remote number');
  const c2 = hop(f, viewP, proposal.payload, EV.absorb);
  assert.equal(c2.verdict.reason, 'duplicate-proposal', 'a duplicated packet credits nothing');
  assert.equal(f.inkVacState(p1).charge, credited, 'no double credit');
  // A proposal for a finished activation is refused even with a fresh key.
  disposeInkVac(p1);                                             // end the first activation
  assert.equal(f.inkVacState(p1), null, 'the first activation really ended');
  // activate() leaves the prior special press in _prevIntent until one neutral
  // actor tick consumes the physical release edge.
  p1.intent.special = false; f.tick(p1);
  p1.special = 190; activate(f, p1);
  const serial2 = f.inkVacState(p1).serial;
  assert.notEqual(serial2, serial, 'a second activation gets a new serial');
  assert.equal(f.replayInkVac(EV.absorb, p2, { actor: p2, target: p1, kit: VAC_ID, serial, key: 'fresh' }).reason,
    'stale-or-mismatched-serial');
  assert.equal(f.inkVacState(p1).charge, 0, 'the new activation was not credited from the old packet');
});

test('a ghost round in a replica intake is consumed visually and proposes nothing', async () => {
  const { f, p1, q1, q2, viewQ, rec } = await twoActorSetup();
  activate(f, p1);
  const activation = rec.find(r => r.name === f.INK_VAC_EVENTS.activation).payload;
  hop(f, viewQ, activation, f.INK_VAC_EVENTS.activation);
  rec.length = 0;
  const p = { pos: at(f, q1, 5), vel: new f.THREE.Vector3(0, 0, -3), owner: q2, team: 2, damage: 0, ghost: true };
  const [s, e] = step(f, q1, 5);
  const cand = f.inkVacAbsorbCandidate(q1, s, e, p);
  assert.ok(cand, 'the ghost is intercepted geometrically');
  cand.onHit();
  assert.ok(p.s3InkVacAbsorbed, 'the ghost is consumed visually');
  assert.equal(f.inkVacState(q1).charge, 0, 'a ghost credits nothing');
  assert.equal(rec.filter(r => r.name === f.INK_VAC_EVENTS.absorb).length, 0, 'a ghost sends no proposal');
  assert.equal(f.inkVacState(p1).charge, 0, 'the owner is never charged for a ghost');
  assert.equal(rec.length, 0, 'a ghost emits no replay packet at all');
});

test('death and disposal drop the replica state and its GPU resource', async () => {
  const { f, p1, q1, viewQ, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const activation = rec.find(r => r.name === EV.activation).payload;
  hop(f, viewQ, activation, EV.activation);
  assert.equal(f.G.scene.children.length, 2, 'both machines hold a cone');
  // P dies: the owner dispose must travel and drop Q's replica.
  p1.alive = false; p1.splat(0, q1, VAC_ID);
  const dispose = rec.find(r => r.name === EV.dispose);
  assert.ok(dispose, 'owner disposal emits a dispose packet');
  assert.equal(dispose.payload.serial, activation.serial, 'dispose carries the activation serial');
  assert.equal(hop(f, viewQ, dispose.payload, EV.dispose).verdict.applied, true);
  assert.equal(f.inkVacState(q1), null, 'the replica state is gone');
  assert.equal(f.inkVacState(p1), null, 'the owner state is gone');
  assert.equal(f.G.scene.children.length, 0, 'both GPU resources are released');
  // A repeated or late dispose is harmless.
  assert.equal(hop(f, viewQ, dispose.payload, EV.dispose).verdict.reason, 'no-replica-activation');
  // A dead actor never opens a new replica cone.
  q1.alive = false;
  assert.equal(f.replayInkVac(EV.activation, q1, { ...activation, serial: activation.serial + 9 }).reason, 'dead-actor');
  assert.equal(f.inkVacState(q1), null);
});

test('a replica cone advances on the remote-actor path only, and never on dt 0', async () => {
  const { f, p1, q1, viewQ, rec } = await twoActorSetup();
  activate(f, p1);
  const activation = rec.find(r => r.name === f.INK_VAC_EVENTS.activation).payload;
  hop(f, viewQ, activation, f.INK_VAC_EVENTS.activation);
  const t0 = f.inkVacState(q1).t;
  assert.equal(f.advanceInkVacReplica(q1, 0), false, 'dt 0 is a strict no-op for a replica');
  assert.equal(f.advanceInkVacReplica(q1, -1 / 60), false, 'a negative step is refused too');
  assert.equal(f.advanceInkVacReplica(q1, NaN), false, 'a NaN step is refused');
  assert.equal(f.inkVacState(q1).t, t0, 'the replica clock never moved on a paused step');
  assert.equal(f.advanceInkVacReplica(q1, 1 / 60), true);
  assert.ok(f.inkVacState(q1).t > t0, 'the replica cone advances on a real step');
  assert.equal(f.advanceInkVacReplica(p1, 1 / 60), false, 'a locally owned intake is never a replica');
  // The cone follows the owner actor, not a fixed origin.
  q1.pos.set(9, 0, 4);
  f.advanceInkVacReplica(q1, 1 / 60);
  const mesh = f.G.scene.children.at(-1);       // the replica cone was added last
  assert.ok(Math.abs(mesh.position.x - 9) < 1e-6 && Math.abs(mesh.position.z - 4) < 1e-6,
    'the replica cone follows the actor it represents');
});

test('a stale onHit closure captured before disposal is a no-op', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const p = enemyShot(f, 0, 1, 5, 0, 0, -3);
  const cand = inkVacAbsorbCandidate(a, p.pos.clone(), p.pos.clone().addScaledVector(p.vel, 1 / 60), p);
  assert.ok(cand);
  disposeInkVac(a);
  const before = p.damage;
  assert.equal(cand.onHit(), false, 'a disposed state credits nothing');
  assert.equal(p.damage, before, 'a disposed state neutralises nothing either');
  assert.ok(!p.s3InkVacAbsorbed, 'a disposed state does not even mark the round');
});

test('_startSpecial activates genuinely once and refuses dead, reentrant and not-ready calls', async () => {
  const { f, a } = await setup();
  a.special = 10;                       // below the special cost: not ready
  a._startSpecial();
  assert.equal(f.inkVacState(a), null, 'an unready special does not activate');
  assert.equal(a.special, 10, 'the gauge is untouched');
  assert.equal(a.stats.specials, 0, 'nothing was counted');
  a.special = 190; a.alive = false;     // dead
  a._startSpecial();
  assert.equal(f.inkVacState(a), null, 'a dead actor does not activate');
  assert.equal(a.special, 190, 'a dead actor keeps the gauge');
  a.alive = true;
  activate(f, a);
  const serial = f.inkVacState(a).serial;
  a._startSpecial(); a._startSpecial();
  assert.equal(f.inkVacState(a).serial, serial, 'the held special is not re-activated');
  assert.equal(a.stats.specials, 1, 'the activation is counted exactly once');
  assert.ok(Number.isInteger(serial) && serial > 0, 'the activation carries a usable serial');
});

test('a strictly paused frame changes nothing at all on the held special', async () => {
  const { f, a } = await setup();
  activate(f, a);
  const s = f.inkVacState(a);
  const before = { t: s.t, charge: s.charge, absorbed: s.absorbed, form: a.form, prev: a._prevIntent,
    ink: a.ink, active: a.specialActive, gauge: a.special };
  a.intent.fire = true; a.intent.sub = true; a.intent.squid = true; a.intent.special = true;
  a.update(0); a.update(0); a.update(NaN);
  assert.equal(f.inkVacState(a).t, before.t, 'the inhale clock does not advance');
  assert.equal(f.inkVacState(a).charge, before.charge, 'no charge is granted');
  assert.equal(f.inkVacState(a).absorbed, before.absorbed);
  assert.equal(a.form, before.form, 'the form is untouched by a paused frame');
  assert.equal(a._prevIntent, before.prev, '_prevIntent is not snapshotted on a paused frame');
  assert.equal(a.ink, before.ink, 'no refill on a paused frame');
  assert.equal(a.special, before.gauge, 'the gauge is not consumed on a paused frame');
  assert.equal(a.specialActive, before.active, 'the token object is untouched');
  assert.equal(a.weaponRunner.charging, false, 'no main shot on a paused frame');
  assert.equal(a.stats.specials, 1, 'a paused frame cannot activate a second special');
  a.intent.fire = a.intent.sub = a.intent.squid = a.intent.special = false;
});
// ===========================================================================
// REPLAY AUTHORITY (parent review of 1c37d68)
// ===========================================================================
test('the absorb branch refuses a sender that is not the transport-resolved actor', async () => {
  const { f, p1, p2, q1, q2, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const serial = rec.find(r => r.name === EV.activation).payload.serial;
  const good = { actor: p2, target: p1, kit: VAC_ID, serial, key: 'p1#a' };
  // payload.actor names somebody else than the actor the transport resolved.
  assert.equal(f.replayInkVac(EV.absorb, p2, { ...good, actor: q2 }).reason, 'sender-actor-mismatch');
  assert.equal(f.replayInkVac(EV.absorb, p2, { ...good, actor: null }).reason, 'sender-actor-mismatch');
  // A sender claiming itself as the Vac owner is refused.
  assert.equal(f.replayInkVac(EV.absorb, p1, { ...good, actor: p1, target: p1 }).reason, 'self-proposal');
  assert.equal(f.inkVacState(p1).charge, 0, 'no forged sender credited anything');
  assert.equal(f.replayInkVac(EV.absorb, p2, good).applied, true, 'the honest sender is still accepted');
});

test('the absorb branch requires a live ENEMY sender and a live LOCALLY owned target', async () => {
  const { f, p1, p2, q1, q2, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const serial = rec.find(r => r.name === EV.activation).payload.serial;
  const base = (over = {}) => ({ actor: p2, target: p1, kit: VAC_ID, serial, key: 'p1#k', ...over });

  p2.team = p1.team;                       // friendly fire
  assert.equal(f.replayInkVac(EV.absorb, p2, base()).reason, 'same-team-sender');
  p2.team = 1;
  p2.alive = false;                         // dead sender
  assert.equal(f.replayInkVac(EV.absorb, p2, base()).reason, 'dead-sender');
  p2.alive = true;
  assert.equal(f.replayInkVac(EV.absorb, p2, base()).applied, true, 'the live enemy sender is accepted');
  assert.ok(f.inkVacState(p1).charge > 0);

  // A replica target is never an authority, whoever proposes.
  assert.equal(f.replayInkVac(EV.absorb, q2, base({ actor: q2, target: q1, key: 'q1#k' })).reason, 'replica-is-not-an-authority');
  // A dead owner cannot be credited by a late proposal.
  const held = f.inkVacState(p1).charge;
  p1.alive = false;
  assert.equal(f.replayInkVac(EV.absorb, p2, base({ key: 'p1#late' })).reason, 'dead-target');
  assert.equal(f.inkVacState(p1).charge, held, 'the dead owner was not credited');
  p1.splat(0, q2, VAC_ID);
  assert.equal(f.inkVacState(p1), null, 'the genuine death path still disposes the state');
});

test('proposal keys are bounded and charset-checked', async () => {
  const { f, p1, p2, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const serial = rec.find(r => r.name === EV.activation).payload.serial;
  const base = key => ({ actor: p2, target: p1, kit: VAC_ID, serial, key });
  const reject = key => assert.equal(f.replayInkVac(EV.absorb, p2, base(key)).reason, 'malformed-proposal-key');
  reject('');
  reject('x'.repeat(INK_VAC_CALIBRATION.proposalKeyMaxLength + 1));   // unbounded payload refused
  reject('has space');
  reject('has\ttab');
  reject('semi;colon&evil');
  reject(12345);
  reject(null);
  reject(undefined);
  reject({ nested: 'object' });
  assert.equal(f.inkVacState(p1).charge, 0, 'no malformed key credited anything');
  const ok = '2#p17';
  assert.equal(f.replayInkVac(EV.absorb, p2, base(ok)).applied, true, 'a normal bounded key is accepted');
  assert.equal(f.replayInkVac(EV.absorb, p2, base(ok)).reason, 'duplicate-proposal', 'and then deduped');
});

test('the sender is bound to the peer the packet came from (parent-installed validator)', async () => {
  const { f, p1, p2, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const serial = rec.find(r => r.name === EV.activation).payload.serial;
  const payload = { actor: p2, target: p1, kit: VAC_ID, serial, key: '2#p1' };
  // A spoofed peer cannot claim an actor it does not own.
  const owner = new Map([[p2, 'peerQ']]);
  f.installInkVacSenderValidator((actor, from) => owner.get(actor) === from);
  assert.equal(f.replayInkVac(EV.absorb, p2, payload, { from: 'peerR' }).reason, 'sender-not-owned-by-peer');
  assert.equal(f.replayInkVac(EV.absorb, p2, payload, { from: 'peerZ' }).reason, 'sender-not-owned-by-peer');
  assert.equal(f.replayInkVac(EV.absorb, p2, payload, {}).reason, 'no-peer-binding-for-sender');
  assert.equal(f.replayInkVac(EV.absorb, p2, payload).reason, 'no-peer-binding-for-sender');
  assert.equal(f.inkVacState(p1).charge, 0, 'no unbound packet credited anything');
  assert.equal(f.replayInkVac(EV.absorb, p2, payload, { from: 'peerQ' }).applied, true, 'the real peer is accepted');
  // A throwing validator grants no trust.
  f.installInkVacSenderValidator(() => { throw new Error('boom'); });
  assert.equal(f.replayInkVac(EV.absorb, p2, { ...payload, key: '2#p2' }, { from: 'peerQ' }).reason, 'sender-not-owned-by-peer');
  // Removing the validator restores the unvalidated path (and the recorded gap).
  assert.equal(f.installInkVacSenderValidator(null), null);
});

test('a release that overtakes its activation tombstones the serial and blocks the delayed start', async () => {
  const { f, q1, q2 } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  const view = new Map([[1, q1], [2, q2]]);
  // An activation for serial 41 is still in flight; the release arrives first.
  const early = hop(f, view, { actor: q1, kit: VAC_ID, serial: 41, charge: 0 }, EV.release);
  assert.equal(early.verdict.applied, false, 'there is nothing to release yet');
  assert.equal(early.verdict.reason, 'no-replica-activation');
  assert.equal(early.verdict.tombstoned, true, 'but the serial IS tombstoned');
  // The delayed activation must not resurrect a cone that already ended.
  const late = hop(f, view, { actor: q1, kit: VAC_ID, serial: 41, charge: 0.5 }, EV.activation);
  assert.equal(late.verdict.reason, 'activation-after-release-or-dispose');
  assert.equal(f.inkVacState(q1), null, 'no cone appeared');
  assert.equal(f.G.scene.children.length, 0, 'and no scene object was created');
  // A dispose overtaking its activation is the same story.
  assert.equal(f.replayInkVac(EV.dispose, q1, { actor: q1, kit: VAC_ID, serial: 42 }).tombstoned, true);
  assert.equal(f.replayInkVac(EV.activation, q1, { actor: q1, kit: VAC_ID, serial: 42, charge: 0 }).reason,
    'activation-after-release-or-dispose');
  // The NEXT serial starts normally.
  const next = hop(f, view, { actor: q1, kit: VAC_ID, serial: 43, charge: 0 }, EV.activation);
  assert.equal(next.verdict.applied, true, 'the next activation is unaffected by the tombstones');
  assert.ok(f.inkVacState(q1), 'and its cone appears');
  // A tombstone never blocks a newer live serial, and ordering still holds.
  assert.equal(f.replayInkVac(EV.release, q1, { actor: q1, kit: VAC_ID, serial: 43 }).applied, true);
  assert.equal(f.replayInkVac(EV.activation, q1, { actor: q1, kit: VAC_ID, serial: 44, charge: 0 }).applied, true);
  assert.equal(f.replayInkVac(EV.activation, q1, { actor: q1, kit: VAC_ID, serial: 41, charge: 0 }).reason,
    'activation-after-release-or-dispose', 'the tombstone outranks the ordering check for an ended serial');
});

test('replicated charge is a high-water mark: a reordered packet cannot walk it back', async () => {
  const { f, q1, q2 } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  const serial = 7;
  f.replayInkVac(EV.activation, q1, { actor: q1, kit: VAC_ID, serial, charge: 0 });
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 0.7 }).applied, true);
  assert.equal(f.inkVacState(q1).charge, 0.7);
  // The SAME serial replayed with an older, lower value is refused outright.
  const back = f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 0.2 });
  assert.equal(back.applied, false);
  assert.equal(back.reason, 'charge-regression-rejected');
  assert.equal(back.charge, 0.7, 'the verdict reports the retained high-water mark');
  assert.equal(f.inkVacState(q1).charge, 0.7, 'the replica charge never decreased');
  // Equal and higher values are fine, and out-of-range values clamp.
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 0.7 }).applied, true);
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 1 }).applied, true);
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 5 }).charge, 1, 'clamped to 1');
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: -3 }).reason, 'charge-regression-rejected');
  // A charge for another serial never touches the live cone.
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial: serial + 1, charge: 1 }).reason,
    'stale-or-mismatched-serial');
  assert.equal(f.inkVacState(q1).charge, 1);
});

test('unknown and malformed packets are refused before any state mutation', async () => {
  const { f, q1 } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  const serial = 11;
  f.replayInkVac(EV.activation, q1, { actor: q1, kit: VAC_ID, serial, charge: 0.3 });
  const cones = f.G.scene.children.length;
  f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 0.6 });
  const charge = f.inkVacState(q1).charge;

  // Unknown names never reach a branch, so they cannot tombstone or clean up.
  assert.equal(f.replayInkVac('special:inkvac-evil', q1, { actor: q1, kit: VAC_ID, serial: serial + 1 }).reason, 'unknown-event');
  assert.equal(f.replayInkVac('special:inkvac', undefined, { actor: q1, kit: VAC_ID, serial }).reason, 'missing-event-or-actor');
  assert.equal(f.replayInkVac(EV.activation, q1, { actor: q1, kit: 'trizooka', serial: serial + 1 }).reason, 'not-inkvac');
  assert.equal(f.replayInkVac(EV.release, q1, { actor: q1, kit: VAC_ID, serial: 1.5 }).reason, 'malformed-serial');
  assert.equal(f.replayInkVac(EV.release, q1, { actor: q1, kit: VAC_ID, serial: Number.MAX_SAFE_INTEGER + 2 }).reason, 'malformed-serial');
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial: '11' }).reason, 'malformed-serial');

  // The live activation is untouched by all of that.
  assert.ok(f.inkVacState(q1), 'the cone survives every rejected packet');
  assert.equal(f.inkVacState(q1).serial, serial);
  assert.equal(f.inkVacState(q1).charge, charge, 'no rejected packet changed the charge');
  assert.equal(f.G.scene.children.length, cones, 'no rejected packet touched the scene');
  // A well-formed release still tombstones, and only then blocks its activation.
  assert.equal(f.replayInkVac(EV.release, q1, { actor: q1, kit: VAC_ID, serial: serial + 1 }).tombstoned, true);
  assert.equal(f.replayInkVac(EV.activation, q1, { actor: q1, kit: VAC_ID, serial: serial + 1, charge: 0 }).reason,
    'activation-after-release-or-dispose');
  // A dead subject still cleans up on a well-formed packet, and nothing else.
  q1.alive = false;
  assert.equal(f.replayInkVac(EV.charge, q1, { actor: q1, kit: VAC_ID, serial, charge: 1 }).reason, 'dead-actor');
  assert.equal(f.inkVacState(q1), null, 'a well-formed packet for a dead replica cleans it up');
  assert.equal(f.replayInkVac('special:inkvac-evil', q1, { actor: q1, kit: VAC_ID, serial, charge: 1 }).reason, 'unknown-event');
});

test('a proposal that arrives after the owner died is stale, not credited', async () => {
  const { f, p1, p2, q1, viewP, rec } = await twoActorSetup();
  const EV = f.INK_VAC_EVENTS;
  activate(f, p1);
  const serial = rec.find(r => r.name === EV.activation).payload.serial;
  // A genuinely serialised proposal, delivered only after the owner is gone.
  const proposal = { actor: p2, target: p1, kit: VAC_ID, serial, key: '2#p9' };
  p1.alive = false; p1.splat(0, q1, VAC_ID);
  assert.equal(f.inkVacState(p1), null, 'the owner state is gone');
  assert.equal(hop(f, viewP, proposal, EV.absorb).verdict.reason, 'dead-target');
  // And a DIFFERENT live owner on a new serial refuses the same stale packet.
  const p3 = f.make('charger');
  p3.nid = 3; p3.remote = false; p3.team = 0;
  p3.weapon = { ...p3.weapon, special: VAC_ID, specialCost: 190 }; p3.special = 190;
  activate(f, p3);
  assert.ok(f.inkVacState(p3), 'the new owner really activated');
  assert.notEqual(f.inkVacState(p3).serial, serial);
  assert.equal(f.replayInkVac(EV.absorb, p2, { ...proposal, target: p3 }).reason, 'stale-or-mismatched-serial');
  // The same stale packet over the real wire shape against the new owner.
  const staleForNew = { ...proposal, target: p3 };
  const viewP3 = new Map([[1, p1], [2, p2], [3, p3]]);
  assert.equal(hop(f, viewP3, staleForNew, EV.absorb).verdict.reason, 'stale-or-mismatched-serial');
  assert.equal(f.inkVacState(p3).charge, 0, 'the new activation was not credited from a dead-owner packet');
});