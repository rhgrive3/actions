import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { enemyRevealedOnMap, MAP_REVEAL_DAMAGE } from '../runtime/map-reveal.mjs';

const root = new URL('../../../', import.meta.url);
const MAX = 100;
const actor = (over = {}) => ({ alive: true, hp: MAX, ...over });

test('reveal threshold: 17.9 hidden, 18.0 and above shown', () => {
  assert.equal(MAP_REVEAL_DAMAGE, 18);
  assert.equal(enemyRevealedOnMap(actor({ hp: MAX - 17.9 }), MAX), false);
  assert.equal(enemyRevealedOnMap(actor({ hp: MAX - 18.0 }), MAX), true);
  assert.equal(enemyRevealedOnMap(actor({ hp: MAX - 18.1 }), MAX), true);
  assert.equal(enemyRevealedOnMap(actor({ hp: MAX - 20 }), MAX), true);
  assert.equal(enemyRevealedOnMap(actor(), MAX), false);
});

test('recovery boundary re-hides an enemy below 18 damage', () => {
  assert.equal(enemyRevealedOnMap(actor({ hp: 82 }), MAX), true);
  assert.equal(enemyRevealedOnMap(actor({ hp: 82.1 }), MAX), false);
  assert.equal(enemyRevealedOnMap(actor({ hp: MAX }), MAX), false);
});

test('death and respawn produce no reveal', () => {
  assert.equal(enemyRevealedOnMap(actor({ alive: false, hp: 40 }), MAX), false);
  // Respawn restores max HP, so the damage reveal is cleared.
  assert.equal(enemyRevealedOnMap(actor({ hp: MAX }), MAX), false);
});

test('explicit recon marking reveals regardless of form or damage', () => {
  assert.equal(enemyRevealedOnMap({ alive: true, hp: MAX, s3: { revealed: true } }, MAX), true);
  assert.equal(enemyRevealedOnMap({ alive: true, hp: MAX, s3: { revealed: false } }, MAX), false);
});

test('missing or non-finite HP fails closed', () => {
  assert.equal(enemyRevealedOnMap({ alive: true }, MAX), false);
  assert.equal(enemyRevealedOnMap({ alive: true, hp: NaN }, MAX), false);
  assert.equal(enemyRevealedOnMap({ alive: true, hp: 90, s3: {} }, NaN), false);
  assert.equal(enemyRevealedOnMap(null, MAX), false);
});

test('adapter replaces the form-only swim gate and keeps teammate handling', () => {
  const src = fs.readFileSync(new URL('inkwave-public/src/main.js', root), 'utf8');
  const out = adaptSource('src/main.js', src);
  assert.match(out, /import \{ enemyRevealedOnMap \} from '\.\.\/patches\/splatoon3\/runtime\/map-reveal\.mjs';/);
  assert.match(out, /if \(!enemyRevealedOnMap\(o, PLAYER\.hp\)\) continue;/);
  assert.doesNotMatch(out, /if \(o\.anim\.form === 'swim'\) continue;/);
  // The enemy-only branch and teammate/self dots are otherwise preserved.
  assert.match(out, /if \(o\.team !== a\.team && !o\.isLocal\) \{/);
});

test('adapter fails closed if the reveal anchor is missing or duplicated', () => {
  const src = fs.readFileSync(new URL('inkwave-public/src/main.js', root), 'utf8');
  const anchor = "          // enemies only show on the map when visible to your team (not submerged far away)\n          if (o.anim.form === 'swim') continue;";
  assert.throws(() => adaptSource('src/main.js', src.replace(anchor, '')), /conflict/);
  assert.throws(() => adaptSource('src/main.js', src + anchor), /conflict/);
});
