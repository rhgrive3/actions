import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { enemyRevealedOnMap, MAP_REVEAL_DAMAGE } from '../runtime/map-reveal.mjs';
import { mapActorVisible } from '../runtime/combat-info.mjs';

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

test('an unscoped s3.revealed flag never discloses an enemy (#710)', () => {
  // With no owning team or expiry the flag would leak to both teams indefinitely.
  assert.equal(enemyRevealedOnMap({ alive: true, hp: MAX, s3: { revealed: true } }, MAX), false);
  const flagged = { alive: true, hp: MAX, team: 1, s3: { revealed: true } };
  assert.equal(mapActorVisible(flagged, { team: 0 }, MAX, 0) || enemyRevealedOnMap(flagged, MAX), false);
  // The damage rule still applies independently of the flag.
  assert.equal(enemyRevealedOnMap({ alive: true, hp: 60, s3: { revealed: false } }, MAX), true);
});

test('team-scoped mark is visible only to its team and only until it expires (#710)', () => {
  const enemy = { alive: true, hp: MAX, team: 1, s3: { revealedUntil: { 0: 10 } } };
  assert.equal(mapActorVisible(enemy, { team: 0 }, MAX, 9.9), true);
  assert.equal(mapActorVisible(enemy, { team: 0 }, MAX, 10), false);
  assert.equal(mapActorVisible(enemy, { team: 2 }, MAX, 5), false);
  // A non-finite expiry for the viewer's team discloses nothing.
  const broken = { alive: true, hp: MAX, team: 1, s3: { revealedUntil: { 0: NaN } } };
  assert.equal(mapActorVisible(broken, { team: 0 }, MAX, 0), false);
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
  assert.match(out, /if \(!mapActorVisible\(o, a, PLAYER\.hp, G\.time\) && !enemyRevealedOnMap\(o, PLAYER\.hp\)\) continue;/);
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
