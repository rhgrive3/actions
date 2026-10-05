import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fidelityPlayerCollisionRadius, rollerBodyOverlap, slosherWallDropPlan } from '../runtime/weapons-fidelity.mjs';

const root = new URL('../../../', import.meta.url);
const source = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');

test('weapons fidelity composes through the real gameplay adapter order', () => {
  const out = adaptSource('src/game/weapons.js', source);
  assert.match(out, /advanceFidelityProjectile\(p, dt\)/);
  assert.match(out, /fidelityProjectileTargets\(this, p\)/);
  assert.match(out, /p\.fidelityImpactActor === e/);
  assert.match(out, /p\.fidelityImpactT/);
  assert.match(out, /const elapsed = Math\.max\(0, dt - Math\.max\(0, p\.delay \|\| 0\)\)/);
  assert.match(out, /configureFidelityFlick\(p, a, w, i, ang, sp\)/);
  assert.match(out, /applyFidelitySlosherSplash/);
  assert.match(out, /beginFidelitySlosherWallDrop\(this, p, hit\)/);
  assert.match(out, /stepFidelitySlosherWallDrop\(this, p, dt\)/);
  assert.match(out, /fidelityRollerBodyContact\(a, e, hs\)/);
  assert.match(out, /WEAPONS_FIDELITY_EPSILON/);
});

test('critical native anchor changes fail closed through the full adapter', () => {
  for (const anchor of [
    `      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);`,
    '      // actors\n      for (const e of G.actors) {',
    '      if (!dead && p.age > p.life) {',
    '      if (fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2 && hs > 1.0) {',
    `        if (hit.hit) {
          this._impact(p, hit);
          dead = true;
        }`,
  ]) {
    assert.throws(() => adaptSource('src/game/weapons.js', source.replace(anchor, '')), /conflict/);
    assert.throws(() => adaptSource('src/game/weapons.js', source + anchor), /conflict/);
  }
});

test('profile and pinned reference retain explicit provenance boundaries', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const ref = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/reference/weapons-fidelity-reference.json', root)));
  assert.equal(profile.referenceVersion, '11.3.0');
  assert.equal(profile.referenceHz, 60);
  assert.equal(profile.weaponsFidelity.schema, 1);
  assert.equal(ref.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(ref.explicitFields.length, 63);
  assert.deepEqual(profile.weapons.roller.ballistics.horizontalPlayerCollision, { initRadius: 0.12, endRadius: 1.02, changeTime: 4 / 60 });
  assert.equal(profile.weapons.roller.ballistics.verticalUnits[2].playerCollision.endRadius, 0.82);
  assert.equal(ref.analystDefaults.every(x => x.official === false), true);
  assert.equal(ref.uncertainties.some(x => /world distance calibration/i.test(x)), true);
});


test('roller player collision grows from pinned initial to end radius over four frames', () => {
  const p = { size: 0.15, age: 0, fidelityPlayerCollision: { initRadius: 0.116, endRadius: 0.87, changeTime: 4 / 60 } };
  assert.equal(fidelityPlayerCollisionRadius(p), 0.116);
  p.age = 2 / 60; assert.ok(Math.abs(fidelityPlayerCollisionRadius(p) - 0.493) < 1e-12);
  p.age = 4 / 60; assert.equal(fidelityPlayerCollisionRadius(p), 0.87);
  p.age = 1; assert.equal(fidelityPlayerCollisionRadius(p), 0.87);
  p.fidelityPlayerCollision = null; assert.equal(fidelityPlayerCollisionRadius(p), 0.15);
});


test('roller body contact consumes the pinned 1.4 half-width instead of legacy roll paint width', () => {
  const body = { Radius: 0.4, WidthHalf: 1.4 }, playerRadius = 0.38;
  assert.equal(rollerBodyOverlap(.5, 0, 0, 2, body, playerRadius), true, 'center');
  assert.equal(rollerBodyOverlap(.5, 1.35, 0, 2, body, playerRadius), true, 'old 1.30 cutoff no longer rejects');
  assert.equal(rollerBodyOverlap(.5, 1.4, 0, 2, body, playerRadius), true, 'reference body edge');
  assert.equal(rollerBodyOverlap(.5, 1.779, 0, 2, body, playerRadius), true, 'just inside body + PLAYER.radius');
  assert.equal(rollerBodyOverlap(.5, 1.781, 0, 2, body, playerRadius), false, 'just outside body + PLAYER.radius');
  assert.equal(rollerBodyOverlap(1.36, 0, 0, 2, body, playerRadius), false);
  assert.equal(rollerBodyOverlap(.5, 0, 1.21, 2, body, playerRadius), false);
  assert.equal(rollerBodyOverlap(.5, 0, 0, 1, body, playerRadius), false);
});

test('Slosher wall-drop plan retains pinned per-unit phase and wall-hit splash structure', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const units = profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit;
  const zero = slosherWallDropPlan(units[0], 0, .125);
  assert.ok(zero.main.firstFrames >= 20 && zero.main.firstFrames <= 40);
  assert.equal(zero.main.secondFrames, 20);
  assert.ok(zero.main.lastFrames >= 15 && zero.main.lastFrames <= 35);
  assert.deepEqual(zero.main.paint, { shock: 2, fall: 1, ground: .7 });
  const one = slosherWallDropPlan(units[1], 0, .25);
  assert.deepEqual(one, slosherWallDropPlan(units[1], 0, .25), 'fixed seed is reproducible');
  assert.equal(one.wallHits.length, 4);
  assert.ok(one.wallHits.every(x => x.secondFrames === 10 && x.paint.shock === .9 && x.paint.fall === .65 && x.paint.ground === .4));
  assert.ok(one.wallHits.every(x => x.spawn.FirstDistance === 2.4 && x.spawn.BetweenDistance === 1.3 && x.spawn.DistanceXZRate === 1.333333 && x.spawn.VelocityMinusYRate === .45));
  const two = slosherWallDropPlan(units[2], 3, .5);
  assert.equal(two.wallHits.length, 1);
  assert.equal(slosherWallDropPlan(units[2], 2, .5).wallHits.length, 0);
  assert.equal(two.main.gravity, .008 * 3600);
});
