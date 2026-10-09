import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as world } from '../../../scripts/weapons-fixture.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('#873 native flight paint consumes sourced intermediate width, independent of radius RNG', async () => {
  for (const seed of [1, 42, 87654]) {
    const f = await world({fidelity: true, seed});
    const a = f.make('shooter');
    f.projectiles.fireShooter(a, a.weapon, 0);
    const p = f.projectiles.list[0];
    // Isolate a source-guided intermediate drop from head-impact/feet scheduling.
    f.projectiles.list.length=0;f.projectiles.inkFlight.spawnDrop(p,p.pos,1,0);
    for(let frame=0;frame<60&&f.projectiles.inkFlight.drops.length;frame++)f.projectiles.update(1/60);
    assert.equal(f.paints.length, 1);
    const raw = f.profile.weaponsFidelityCompletion.weapons.shooter.SplashPaintParam;
    near(f.paints[0].radius, raw.WidthHalf * f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit);
    near(p.s3Weapon.flightPaint.nearest, raw.WidthHalfNearest);
    assert.notEqual(f.paints[0].radius, p.s3Weapon.flightPaint.nearest);
    f.projectiles.clear();
  }
});

test('#873 conversion and independent source fields remain explicit dependencies', async () => {
  const f = await fixture({profileTransform(p) {
    p.weaponsFidelityCompletion.worldUnitsPerSourceUnit = .5;
    const paint = p.weaponsFidelityCompletion.weapons.shooter.SplashPaintParam;
    paint.WidthHalf = 3; paint.WidthHalfNearest = 5;
  }});
  near(f.WEAPONS.shooter.flightPaint.intermediate, 1.5);
  near(f.WEAPONS.shooter.flightPaint.nearest, 2.5);
  near(f.WEAPONS.shooter.flightPaint.worldUnitsPerSourceUnit, .5);
  for (const kind of ['dualies','splatling','roller','slosher','blaster','charger'])
    assert.equal(f.WEAPONS[kind].flightPaint, undefined, kind);
});

test('#873 projectile snapshot survives owner weapon changes and consumes the same RNG draw count', async () => {
  const f = await world({fidelity: true, seed: 5}), a = f.make('shooter');
  f.projectiles.fireShooter(a, a.weapon, 0);
  const p = f.projectiles.list[0];f.projectiles.list.length=0;f.projectiles.inkFlight.spawnDrop(p,p.pos,1,0);
  a.setWeapon('dualies');
  for(let frame=0;frame<60&&f.projectiles.inkFlight.drops.length;frame++)f.projectiles.update(1/60);
  near(f.paints[0].radius, 1.472);
  f.projectiles.clear();
  // The legacy draw is consumed, not used for source-backed gameplay width.
  const g = await fixture(); let draws = 0;
  g.setRandom(() => { draws++; return .25; });
  near(g.fidelityFlightPaintRadius({s3Weapon: g.WEAPONS.shooter, trailRadius: .44}), 1.472);
  near(g.fidelityFlightPaintRadius({s3Weapon: g.WEAPONS.dualies, trailRadius: .44}), .44 * .9);
  assert.equal(draws, 2);
});

test('#873 invalid conversion or missing source paint fields fail closed', async () => {
  for (const invalid of [0, -1, NaN]) await assert.rejects(fixture({profileTransform(p) {
    p.weaponsFidelityCompletion.worldUnitsPerSourceUnit = invalid;
  }}), /Shooter flight paint|source-to-world scale/);
  await assert.rejects(fixture({profileTransform(p) {
    delete p.weaponsFidelityCompletion.weapons.shooter.SplashPaintParam.WidthHalf;
  }}), /Shooter flight paint/);
});
