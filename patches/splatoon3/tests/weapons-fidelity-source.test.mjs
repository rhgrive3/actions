import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptWeaponsFidelity } from '../weapons-adapter.mjs';

const root = new URL('../../../', import.meta.url);
const source = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');
const replaceOnce = (code, before, after, label) => {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw new Error('conflict ' + label);
  return code.slice(0, at) + after + code.slice(at + before.length);
};

test('weapons fidelity adapter connects only to the intended projectile paths', () => {
  const out = adaptWeaponsFidelity(source, replaceOnce);
  assert.match(out, /advanceFidelityProjectile\(p, dt\)/);
  assert.match(out, /fidelityProjectileTargets\(this, p\)/);
  assert.match(out, /configureFidelityFlick\(p, a, w, i, ang, sp\)/);
  assert.match(out, /applyFidelitySlosherSplash/);
  assert.match(out, /WEAPONS_FIDELITY_EPSILON/);
});

test('critical native anchor changes fail closed', () => {
  for (const anchor of [
    `      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);`,
    '      // actors\n      for (const e of G.actors) {',
    '      if (!dead && p.age > p.life) {',
  ]) {
    assert.throws(() => adaptWeaponsFidelity(source.replace(anchor, ''), replaceOnce), /conflict/);
    assert.throws(() => adaptWeaponsFidelity(source + anchor, replaceOnce), /conflict/);
  }
});

test('profile and pinned reference retain explicit provenance boundaries', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
  const ref = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/reference/weapons-fidelity-reference.json', root)));
  assert.equal(profile.referenceVersion, '11.3.0');
  assert.equal(profile.referenceHz, 60);
  assert.equal(profile.weaponsFidelity.schema, 1);
  assert.equal(ref.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(ref.explicitFields.length, 51);
  assert.equal(ref.analystDefaults.every(x => x.official === false), true);
  assert.equal(ref.uncertainties.some(x => /world distance calibration/i.test(x)), true);
});
