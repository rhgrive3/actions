// #1098 regression: CK muzzle identity, gun-local mapping and network origin.
// Independently extracted ordinary muzzle anchors the INKWAVE rig retarget.
// Nintendo keep-charge frame binding and hardware equivalence are not asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { storedChargerModelMuzzle, CHARGER_SOURCE_MODEL_MUZZLE, installChargerFlight } from '../runtime/weapons-charger-flight.mjs';

test('stored muzzle uses all three pinned S3 coordinates in the procedural gun basis', async () => {
  const f = await fixture();
  const raw = f.profile.weaponsFidelityCompletion.weapons.charger.WeaponKeepChargeParam.MuzzleLocalPos;
  assert.deepEqual(raw, { X: -0.314, Y: 0.2105, Z: 2.0176 });
  const visual = new f.THREE.Vector3(0, 0.058, 0.686), local = new f.THREE.Vector3();
  assert.equal(storedChargerModelMuzzle(raw, visual, local), true);
  const scale = visual.z / 1.717447;
  assert.ok(Math.abs(local.x - raw.X * scale) < 1e-12);
  assert.ok(Math.abs(local.y - (visual.y + (raw.Y - .1781852) * scale)) < 1e-12);
  assert.ok(Math.abs(local.z - raw.Z * scale) < 1e-12);
  assert.notEqual(local.x, visual.x, 'keep and normal muzzle positions differ');
  assert.equal(storedChargerModelMuzzle({ X: 0, Y: 0, Z: 0 }, visual, local), false);
  assert.equal(storedChargerModelMuzzle({ X: NaN, Y: 0, Z: 2 }, visual, local), false);
});

test('independent calibration preserves ordinary anchor and every source-axis delta', async () => {
  const {THREE} = await fixture(), target = new THREE.Vector3(0, .058, .686);
  const out = new THREE.Vector3();
  assert.equal(storedChargerModelMuzzle(CHARGER_SOURCE_MODEL_MUZZLE, target, out), true);
  assert.deepEqual(out.toArray(), target.toArray());
  const raw = {X: -.314, Y: .2105, Z: 2.0176};
  storedChargerModelMuzzle(raw, target, out);
  const baseline = out.clone();
  // An independent Z perturbation used to cancel out in model.z/source.Z.
  for (const [sourceAxis, targetAxis] of [['X','x'],['Y','y'],['Z','z']]) {
    storedChargerModelMuzzle({...raw, [sourceAxis]: raw[sourceAxis] + .1}, target, out);
    const delta = out.clone().sub(baseline);
    assert.ok(Math.abs(delta[targetAxis] - .1 * .686 / 1.717447) < 1e-12);
    delta[targetAxis] = 0;
    assert.ok(delta.length() < 1e-12);
  }
  for (const bad of [NaN, Infinity, -Infinity]) {
    for (const axis of ['X','Y','Z']) assert.equal(storedChargerModelMuzzle({...raw,[axis]:bad}, target, out), false);
    for (const axis of ['x','y','z']) assert.equal(storedChargerModelMuzzle(raw, {...target,[axis]:bad}, out), false);
  }
});

test('native 1F release sees kept-charge identity, fresh shots do not, and both clear it', async () => {
  const f = await fixture();
  const flags = [], native = f.G.projectiles.fireCharger;
  f.G.projectiles.fireCharger = (actor, weapon, charge) => {
    flags.push(!!actor.weaponRunner.s3KeepMuzzleFiring);
    return native(actor, weapon, charge);
  };
  const a = f.make('charger'), r = a.weaponRunner;
  a.ink = 100; a.intent.fire = true;
  f.tick(a, 65);
  assert.ok(r.charging && r.charge >= 0.999, 'full charge precondition');
  a.intent.squid = true;
  f.tick(a);
  assert.ok(r.s3Stored, 'full charge kept under own ink');
  a.intent.squid = false;
  for (let i = 0; i < 100 && !r.s3KeepMuzzlePending; i++) f.tick(a);
  assert.equal(r.s3KeepMuzzlePending, true, 'resurfaced keep shot is marked');
  assert.equal(f.shots.length, 0, 'keep readiness does not fire itself');
  a.intent.fire = false;
  f.tick(a);
  assert.equal(f.shots.length, 0, 'release admission has the native 1F gap');
  f.tick(a);
  assert.deepEqual(flags, [true], 'the shot birth consumes keep identity exactly once');
  assert.equal(r.s3KeepMuzzlePending, false);
  assert.equal(r.s3KeepMuzzleFiring, false);

  const b = f.make('charger');
  b.ink = 100; b.intent.fire = true; f.tick(b, 65);
  b.intent.fire = false; f.tick(b, 2);
  assert.deepEqual(flags, [true, false], 'a fresh full shot never reuses keep identity');
  b.weaponRunner.reset();
  assert.equal(b.weaponRunner.s3KeepMuzzlePending, false);
  assert.equal(b.weaponRunner.s3KeepMuzzleFiring, false);
});

test('kept projectile, weapon:fire packet and replay use one origin; ordinary and obstructed fallback stay native', async () => {
  const f = await fixture(), { THREE, G, Hit, PLAYER, WEAPONS, profile } = f;
  class Shots {
    constructor() { this.beams = []; }
    _muzzle(_actor, out) { return out.set(0, 1.05, 0.3); }
    _aimFrom(_actor, _origin, out) { return out.set(0, 0, 1); }
    _ghostBeam() { this.beams.push({ mesh: { scale: { z: 0 }, material: { uniforms: { uLen: { value: 0 } } } } }); }
    ghostFire() {}
    update() {}
    clear() {}
  }
  const events = [];
  installChargerFlight({ Projectiles: Shots, WEAPONS, THREE, G, Hit, PLAYER,
    emit: (name, value) => { if (name === 'weapon:fire') events.push(value); } },
    profile.weaponsFidelityCompletion);
  const off = new THREE.Object3D();
  off.position.set(0, 1.05, 0);
  const actor = {
    pos: new THREE.Vector3(), form: 'kid', team: 0, alive: true,
    weaponRunner: { chargeT: 1, s3KeepMuzzleFiring: true },
    character: { weapon: { off, def: { muzzle: new THREE.Vector3(0, 0.058, 0.686) } } },
    addTurf() {}, isLocal: false, _nearCamera: () => false,
    aimDir: new THREE.Vector3(0, 0, 1)
  };
  const system = new Shots(), weapon = WEAPONS.charger;
  system.fireCharger(actor, weapon, 1);
  const kept = system._fidelityChargerFlights.at(-1).origin;
  assert.ok(kept.x < -0.12 && kept.x > -0.13, 'source X creates an actual lateral CK offset');
  assert.ok(Math.abs(kept.z - 2.0176 * .686 / 1.717447) < 1e-10);
  assert.ok(events[0].muzzle.distanceTo(kept) < 1e-12,
    'network event publishes the authoritative flight origin');
  system.ghostFire(actor, { weapon: weapon.id, muzzle: events[0].muzzle,
    dir: events[0].dir, charge: 1, len: events[0].len });
  assert.ok(system._fidelityChargerFlights.at(-1).origin.distanceTo(kept) < 1e-12,
    'remote ghost consumes transmitted origin, not local character pose');

  actor.weaponRunner.s3KeepMuzzleFiring = false;
  system.fireCharger(actor, weapon, 1);
  assert.ok(system._fidelityChargerFlights.at(-1).origin.distanceTo(
    new THREE.Vector3(0, 1.05, 0.3)) < 1e-12, 'ordinary shot keeps original muzzle');
  actor.weaponRunner.s3KeepMuzzleFiring = true;
  G.physics.los = () => false;
  system.fireCharger(actor, weapon, 1);
  assert.ok(system._fidelityChargerFlights.at(-1).origin.distanceTo(
    new THREE.Vector3(0, 1.05, 0.3)) < 1e-12, 'obstructed source anchor fails closed');
});
