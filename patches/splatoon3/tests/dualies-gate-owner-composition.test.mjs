import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';

// Native Actor/Runner/Projectiles and the exact weapon-gates module. This is
// deliberately a limited composition test, not a full install/build claim.
const readGate = () => fs.readFileSync(new URL('../runtime/weapon-gates.mjs', import.meta.url), 'utf8');
async function setup(legacy = false) {
  const transform = source => legacy ? source.replaceAll('s3GateDodgeShotPending', 's3DodgeShotPending') : source;
  const f = await fixture({extraExports:"export {installWeaponsFidelity} from './patches/splatoon3/runtime/weapons-fidelity.mjs';",adaptRuntime: (rel, source) => rel.endsWith('/weapon-gates.mjs') ? transform(source) : source});
  // Supports a base fixture before this installer was added, and the final
  // composed runner where its idempotent installation already happened.
  const install = new Function(transform(readGate()).replaceAll('export ', '') + '; return installWeaponGates;')();
  install(f); f.installWeaponsFidelity(f,f.profile);
  f.G.scene = new f.THREE.Scene();
  f.G.projectiles = new f.Projectiles(f.G.scene);
  const a = f.make('dualies'), r = a.weaponRunner;
  // Exact 868 profile boundaries; no new tuning values are introduced.
  Object.assign(a.weapon, {rollShotDelay: 4 / 60, rollInkRecoverStop: 70 / 60});
  a.intent.fire = true; a.ink = 100;
  assert.equal(r.tryDodge(new f.THREE.Vector3(1, 0, 0)), true);
  return {f, a, r};
}
async function heldTrace(legacy) {
  const {f, a, r} = await setup(legacy), rows = [];
  for (let frame = 1; frame <= 80; frame++) {
    const before = f.G.projectiles.list.length;
    f.tick(a);
    rows.push({frame, travel: !!r.dodge, turret: r.s3Turret, pending: r.s3DodgeShotPending,
      shots: f.G.projectiles.list.length - before, spread: r.spread, rolls: r.rollsLeft});
  }
  return {rows, count: f.G.projectiles.list.length};
}
test('independent gate flag preserves 4F first shot, held turret and roll-resource recovery', async () => {
  const {rows, count} = await heldTrace(false);
  assert.equal(rows.find(r => !r.travel).frame, 12);
  assert.equal(rows.find(r => r.shots).frame, 16);
  assert.equal(rows[0].pending, 0, 'boolean admission cannot become a one-second timer');
  assert.equal(rows[11].turret, true);
  assert.equal(rows[43].rolls, 2, 'movement recovery replenishes rolls under held ZR');
  assert.equal(rows[59].turret, true);
  assert.equal(rows[59].spread, 0);
  assert.equal(count, 17, 'actual native projectile births over 80 fixed updates');
});
test('negative control: shared boolean/timer loses turret despite retaining the first-shot boundary', async () => {
  const {rows, count} = await heldTrace(true);
  assert.ok(Math.abs(rows[0].pending - (1 - 1 / 60)) < 1e-10);
  assert.equal(rows.find(r => r.shots).frame, 16);
  assert.equal(rows[11].turret, false);
  assert.equal(rows[59].spread, 2);
  assert.equal(count, 15);
});
test('release and reset retain separate native cancellation and gate ownership', async () => {
  const {f, a, r} = await setup();
  f.tick(a, 12);
  assert.equal(r.s3GateDodgeShotPending, true);
  a.intent.fire = false; f.tick(a, 3);
  assert.equal(f.G.projectiles.list.length, 0);
  assert.equal(r.s3DodgeShotPending, 0, 'release cancels the main pending timer');
  assert.equal(r.s3GateDodgeShotPending, true, 'gate keeps its original deferred-admission flag');
  a.intent.fire = true; f.tick(a);
  assert.equal(f.G.projectiles.list.length, 1);
  assert.equal(r.s3GateDodgeShotPending, false);
  assert.equal(r.s3DualiesPostShot, 4 / 60, 'actual shot keeps the existing post-shot timer');
  r.reset();
  assert.equal(r.s3GateDodgeShotPending, false);
  assert.equal(r.s3DodgeShotPending, 0);
  assert.equal(r.s3DualiesPostShot, 0);
  assert.equal(r.s3DodgeShotRemaining, 0);
  assert.equal(r.s3DodgeInkRemaining, 0);
});
