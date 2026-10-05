import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fidelityPlayerCollisionRadius } from '../runtime/weapons-fidelity.mjs';

const root = new URL('../../../', import.meta.url);
const source = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');

test('weapons fidelity composes through the real gameplay adapter order', () => {
  const out = adaptSource('src/game/weapons.js', source);
  assert.match(out, /advanceFidelityProjectile\(p, dt\)/);
  assert.match(out, /fidelityProjectileTargets\(this, p\)/);
  assert.doesNotMatch(out, /if \(e\.team === p\.team \|\| !e\.alive\) continue;/, 'the consumer loop must not re-implement team/liveness filtering solved by fidelityProjectileTargets');
  assert.match(out, /p\.fidelityImpactActor === e/);
  assert.match(out, /p\.fidelityImpactT/);
  assert.match(out, /const elapsed = Math\.max\(0, dt - Math\.max\(0, p\.delay \|\| 0\)\)/);
  assert.match(out, /configureFidelityFlick\(p, a, w, i, ang, sp\)/);
  assert.match(out, /applyFidelitySlosherSplash/);
  assert.match(out, /e\.team !== p\.team\) this\._sloshSplash\(p, _v, e\)/, 'an ally-consumed glob must not splash enemies behind the blocker');
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
    '        if (e.team === p.team || !e.alive) continue;\n        const h = e.form === \'squid\' ? PLAYER.squidHeight : PLAYER.height;',
    '      if (!dead && p.age > p.life) {',
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
