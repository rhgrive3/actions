import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { enemyRevealedOnMap, MAP_REVEAL_DAMAGE } from '../runtime/map-reveal.mjs';
import { mapActorVisible, revealedTo } from '../runtime/combat-info.mjs';

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

test('#710 unscoped boolean reveal is never accepted as recon authority', () => {
  const viewer = { team: 0 };
  const remote = actor({ team: 1, s3: { revealed: true } });
  assert.equal(enemyRevealedOnMap(remote, MAX, viewer, 10), false);
  assert.equal(mapActorVisible(remote, viewer, MAX, 10), false);
  remote.anim = { form: 'kid' };
  assert.equal(mapActorVisible(remote, viewer, MAX, 10), false, 'surfacing never reveals');
});
test('#710 expiring team marks do not disclose to the wrong team', () => {
  const local = { team: 0 }, other = { team: 1 };
  const enemy = actor({ team: 1, s3: { revealedUntil: { 0: 12, 1: 900 } } });
  assert.equal(enemyRevealedOnMap(enemy, MAX, local, 11.999), true);
  assert.equal(mapActorVisible(enemy, local, MAX, 11.999), true);
  assert.equal(revealedTo(enemy, local, 11.999), true);
  assert.equal(enemyRevealedOnMap(enemy, MAX, local, 12), false);
  assert.equal(revealedTo(enemy, local, 12), false);
  assert.equal(enemyRevealedOnMap(enemy, MAX, { team: -1 }, 11), false);
  assert.equal(enemyRevealedOnMap(enemy, MAX, null, 11), false);
  assert.equal(enemyRevealedOnMap(enemy, MAX, local, Infinity), false);
  assert.equal(enemyRevealedOnMap(enemy, MAX, other, 11), false, 'enemy cannot use its own team marker');
  enemy.s3.revealedUntil[0] = NaN;
  assert.equal(enemyRevealedOnMap(enemy, MAX, local, 11), false);
  enemy.s3.revealedUntil[0] = 22;
  enemy.alive = false;
  assert.equal(enemyRevealedOnMap(enemy, MAX, local, 11), false, 'death clears visibility');
  const respawn = actor({ team: 1, s3: {} });
  assert.equal(enemyRevealedOnMap(respawn, MAX, local, 11), false, 'new life has no stale mark');
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
  assert.match(out, /if \(!mapActorVisible\(o, a, PLAYER\.hp, G\.time\) && !enemyRevealedOnMap\(o, PLAYER\.hp, a, G\.time\)\) continue;/);
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
