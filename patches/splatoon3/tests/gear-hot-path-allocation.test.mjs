import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';

const source = fs.readFileSync(new URL('../runtime/gear.mjs', import.meta.url), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `source section ${start} exists`);
  return source.slice(from, to);
}

test('gear actor tick wrappers save and restore scalars without scratch objects', () => {
  const horizontal = section('Actor.prototype._horizontal = function', 'const splat = Actor.prototype.splat;');
  const weaponUpdate = section('WeaponRunner.prototype.update = function', 'if (api.Menus) {');
  assert.doesNotMatch(horizontal, /\bconst\s+\w+\s*=\s*\{[^}]*\bswimSpeed\s*:/s);
  assert.doesNotMatch(horizontal, /\bconst\s+\w+\s*=\s*\{[^}]*\benemyInkSpeed\s*:/s);
  assert.doesNotMatch(weaponUpdate, /\bconst\s+\w+\s*=\s*\{[^}]*\binkCost\s*:/s);
  assert.doesNotMatch(weaponUpdate, /\bconst\s+\w+\s*=\s*\{[^}]*\bthrowSpeed\s*:/s);
  const horizontalFinally = horizontal.slice(horizontal.lastIndexOf('finally'));
  const weaponFinally = weaponUpdate.slice(weaponUpdate.lastIndexOf('finally'));
  assert.match(horizontalFinally, /api\.PLAYER\.swimSpeed\s*=/);
  assert.match(horizontalFinally, /api\.PLAYER\.enemyInkSpeed\s*=/);
  assert.match(weaponFinally, /api\.SUB\.bomb\.inkCost\s*=/);
  assert.match(weaponFinally, /api\.SUB\.bomb\.throwSpeed\s*=/);
});

test('normal local and remote actor wrappers restore shared values when native calls throw', async () => {
  const f = await fixture();
  for (const isLocal of [true, false]) {
    const actor = f.make();
    actor.isLocal = isLocal;
    actor.s3.modifiers.swimSpeed = 1.25;
    actor.s3.modifiers.enemyMoveSpeed = 42;
    actor.intent = { fire: false };
    Object.defineProperty(actor.intent, 'move', { get() { throw new Error('horizontal probe'); } });
    const playerBefore = [f.PLAYER.swimSpeed, f.PLAYER.enemyInkSpeed];
    assert.throws(() => actor._horizontal(1 / 60, false, false), /horizontal probe/);
    assert.deepEqual([f.PLAYER.swimSpeed, f.PLAYER.enemyInkSpeed], playerBefore);

    actor.s3.modifiers.inkSaverSub = 0.5;
    actor.s3.modifiers.subPower = 1.5;
    const bombBefore = [f.SUB.bomb.inkCost, f.SUB.bomb.throwSpeed];
    const input = { get fire() { throw new Error('weapon probe'); } };
    assert.throws(() => actor.weaponRunner.update(1 / 60, input), /weapon probe/);
    assert.deepEqual([f.SUB.bomb.inkCost, f.SUB.bomb.throwSpeed], bombBefore);
  }
});
