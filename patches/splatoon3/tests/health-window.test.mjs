import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthMarkers, healthHitAge, ENEMY_HEALTH_SECONDS } from '../runtime/combat-info.mjs';
import { resetEnemyInkRecovery } from '../runtime/issue-415-adapter.mjs';

// #716: the Ver.11 enemy health window must follow HP-loss time, not the shared
// recovery clock (actor.lastDamage), which enemy-ink contact resets to 0 each tick.
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
  distanceTo() { return 1; }
  project() { this.x = 0; this.y = 0; this.z = 0; return this; }
}
const THREE = { Vector3: Vec3 };
const DT = 1 / 60;
globalThis.innerWidth = 800; globalThis.innerHeight = 600;

function scene() {
  const actor = (team) => ({ team, alive: true, hp: 100, pos: new Vec3(), character: {}, anim: { form: 'kid' }, form: 'kid', lastDamage: 99, onEnemy: false, s3: {} });
  const viewer = actor(1), enemy = actor(2), ally = actor(1);
  const G = { time: 0, teamHex: { 1: '#f00', 2: '#00f' }, camera: { position: new Vec3() }, physics: { los: () => true } };
  const game = { match: { local: viewer, actors: [viewer, enemy, ally] } };
  return { G, game, viewer, enemy, ally, PLAYER: { hp: 100 } };
}
function step(s, { inkContact = false } = {}) {
  s.G.time += DT;
  s.enemy.lastDamage += DT; s.ally.lastDamage += DT;
  if (inkContact) { s.enemy.onEnemy = true; resetEnemyInkRecovery(s.enemy); }
  return buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
}
function hit(s, hp) {
  s.enemy.hp = hp; s.enemy.lastDamage = 0;
  return buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
}
const enemyRows = (rows) => rows.filter((row) => row.color === '#00f');

test('enemy-ink contact without HP loss does not extend the 3 s enemy health window', () => {
  const s = scene();
  buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
  assert.equal(enemyRows(hit(s, 70)).length, 1, 'the hit shows the enemy bar');
  let rows = [];
  for (let f = 0; f < Math.round((ENEMY_HEALTH_SECONDS + 1.5) / DT); f++) rows = step(s, { inkContact: true });
  assert.equal(enemyRows(rows).length, 0, 'standing on enemy ink with no new damage must expire the bar');
  assert.equal(s.enemy.hp, 70, 'ink contact alone does not change HP');
});

test('the same window expires without ink contact (control)', () => {
  const s = scene();
  buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
  hit(s, 70);
  let rows = [];
  for (let f = 0; f < Math.round((ENEMY_HEALTH_SECONDS + 1.5) / DT); f++) rows = step(s);
  assert.equal(enemyRows(rows).length, 0);
});

test('a new HP loss refreshes the enemy window and it still expires about 3 s after the last loss', () => {
  const s = scene();
  buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
  hit(s, 70);
  for (let f = 0; f < Math.round(2 / DT); f++) step(s);
  assert.equal(enemyRows(hit(s, 50)).length, 1, 'a new hit at 2 s refreshes the window');
  let shownAt = null;
  for (let f = 0; f < Math.round(4 / DT); f++) {
    if (enemyRows(step(s)).length === 0 && shownAt === null) shownAt = f * DT;
  }
  assert.ok(shownAt !== null && Math.abs(shownAt - ENEMY_HEALTH_SECONDS) < 0.05, `expired at ${shownAt}s, expected about ${ENEMY_HEALTH_SECONDS}s`);
});

test('healthHitAge starts from HP loss, is cleared by death and gives a fresh baseline on respawn', () => {
  const s = scene();
  assert.equal(healthHitAge(s.enemy, s.G.time), Infinity, 'full HP has no hit');
  s.enemy.hp = 60; s.G.time = 5;
  assert.equal(healthHitAge(s.enemy, s.G.time), 0, 'the observed loss is stamped at the observation time');
  s.enemy.alive = false; assert.equal(healthHitAge(s.enemy, s.G.time), Infinity, 'dead actors have no window');
  s.enemy.alive = true; s.enemy.hp = 100; s.G.time = 9;
  assert.equal(healthHitAge(s.enemy, s.G.time), Infinity, 'respawn HP is the baseline and does not count as a hit');
  assert.equal(enemyRows(buildHealthMarkers(s.game, s.G, s.PLAYER, THREE)).length, 0, 'respawned full-HP enemy has no bar');
});

test('teammate damage stays visible regardless of recency; full-HP players never show', () => {
  const s = scene();
  buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
  s.ally.hp = 80; s.G.time += 30;
  let rows = buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hp, 0.8);
  s.ally.hp = 100;
  rows = buildHealthMarkers(s.game, s.G, s.PLAYER, THREE);
  assert.equal(rows.length, 0);
});
