import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MOVEMENT_EPSILON,
  dodgeIntervalDistance,
  rollingMovementActive,
  rollingMovementSpeed,
} from '../../splatoon3/runtime/movement-physics.mjs';
import { adaptMovementPhysics } from '../../splatoon3/movement-physics-adapter.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const replaceOnce = (code, before, after, label) => {
  const i = code.indexOf(before);
  assert.ok(i >= 0, label);
  assert.equal(code.indexOf(before, i + before.length), -1, label);
  return code.slice(0, i) + after + code.slice(i + before.length);
};
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

test('dodge curve integrates exactly to configured distance under irregular partitions', () => {
  for (const D of [.1, 2.8, 4, 10]) for (const duration of [.12, .2, .31]) {
    let x = 0, t = 0, i = 0;
    const parts = [.001, .037, .019, .08];
    while (t < duration) {
      const dt = parts[i++ % parts.length];
      x += dodgeIntervalDistance(D, duration, t, dt);
      t += dt;
    }
    close(x, D);
  }
});

test('roller movement is active only for grounded kid rolling outside flick/recovery/sub/special', () => {
  const runner = { rolling: true, flick: -1, flickRecover: 0, aimingSub: false, rollT: 0,
    a: null };
  const actor = { weaponRunner: runner, weapon: { kind: 'roller', rollBaseSpeed: 6.48, rollSpeed: 7.92, rollDashTime: 1.5 },
    form: 'kid', grounded: true, specialActive: null, superJumpState: null };
  runner.a = actor;
  assert.equal(rollingMovementActive(actor), true);
  close(rollingMovementSpeed(runner), 6.48);
  runner.rollT = actor.weapon.rollDashTime - MOVEMENT_EPSILON * .5;
  close(rollingMovementSpeed(runner), 7.92);
  for (const [obj, key, value] of [
    [runner, 'flick', .1], [runner, 'flickRecover', .1], [runner, 'aimingSub', true],
    [actor, 'grounded', false], [actor, 'form', 'squid'], [actor, 'specialActive', {}], [actor, 'superJumpState', {}],
  ]) {
    const old = obj[key]; obj[key] = value;
    assert.equal(rollingMovementActive(actor), false, key);
    obj[key] = old;
  }
});

test('build-only adapter changes only its explicit actor/weapons anchors', () => {
  const actor = read('src/game/actor.js');
  const weapons = read('src/game/weapons.js');
  const actorAfter = adaptMovementPhysics('src/game/actor.js', actor, replaceOnce);
  const weaponsAfter = adaptMovementPhysics('src/game/weapons.js', weapons, replaceOnce);
  assert.match(actorAfter, /integrateMovement\(this, dt, isSquid, jumped, PLAYER\.radius\)/);
  assert.match(actorAfter, /if \(mh > 1\) side\.multiplyScalar\(1 \/ mh\)/);
  assert.match(actorAfter, /rollingMovementActive\(this\)/);
  assert.match(weaponsAfter, /rollingMovementSpeed\(this\)/);
  assert.match(weaponsAfter, /MOVEMENT_EPSILON/);
  assert.match(weaponsAfter, /writeDodgeVelocity\(this, vel, dt\)/);
  for (const rel of ['src/game/player.js','src/core/input.js','src/core/gyro.js','src/net/netmatch.js','src/game/character.js']) {
    assert.equal(adaptMovementPhysics(rel, 'UNCHANGED', replaceOnce), 'UNCHANGED');
  }
});
