import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptPlatformSource } from '../platform-adapter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MATCH_PATH = path.join(ROOT, 'inkwave-public/src/game/match.js');
const PLAYER_PATH = path.join(ROOT, 'inkwave-public/src/game/player.js');
const RATES = [30, 60, 120, 144];

function extractMethod(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `native source contains ${marker}`);
  const end = source.indexOf('\n  }\n', start);
  assert.notEqual(end, -1, `method ending for ${marker}`);
  return source.slice(start, end + 4);
}

function controllerUpdate(source, G) {
  const method = extractMethod(source, '  updateController(dt) {');
  return new Function('G', `return ({${method}}).updateController`)(G);
}

function makeMatch() {
  const updates = [];
  const controller = { enabled: false, update(dt) { updates.push({ enabled: this.enabled, dt }); } };
  return {
    match: { state: 'playing', paused: false, local: { alive: true }, controller },
    controller,
    updates,
  };
}

test('online pause keeps local controller disabled across frame rates while its update path runs', () => {
  const source = fs.readFileSync(MATCH_PATH, 'utf8');
  const built = adaptQualitySource('src/game/match.js', source);
  const G = { netm: {}, game: { menus: { current: 'pause' } } };
  const update = controllerUpdate(built, G);

  for (const hz of RATES) {
    const { match, controller, updates } = makeMatch();
    for (let frame = 0; frame < 4; frame++) {
      update.call(match, 1 / hz);
      assert.equal(controller.enabled, false, `online pause at ${hz} Hz, frame ${frame}`);
    }
    assert.equal(updates.length, 4, 'controller update still clears local input while the match advances');
    assert.ok(updates.every(sample => sample.enabled === false && sample.dt === 1 / hz));
  }
});

test('online resume and offline pause retain their existing controller admission', () => {
  const source = fs.readFileSync(MATCH_PATH, 'utf8');
  const update = controllerUpdate(adaptQualitySource('src/game/match.js', source), {
    netm: {}, game: { menus: { current: null } },
  });
  const online = makeMatch();
  update.call(online.match, 1 / 60);
  assert.equal(online.controller.enabled, true, 'resuming online play re-enables local control');

  const offlineG = { netm: null, game: { menus: { current: 'pause' } } };
  const offlineUpdate = controllerUpdate(adaptQualitySource('src/game/match.js', source), offlineG);
  const offline = makeMatch();
  offline.match.paused = true;
  offlineUpdate.call(offline.match, 1 / 60);
  assert.equal(offline.controller.enabled, false, 'offline pause remains governed by Match.paused');
  offline.match.paused = false;
  offlineG.game.menus.current = null;
  offlineUpdate.call(offline.match, 1 / 60);
  assert.equal(offline.controller.enabled, true, 'offline play remains enabled after resume');
});

test('platform adapter changes controller admission only, leaving native match simulation unchanged', () => {
  const source = fs.readFileSync(MATCH_PATH, 'utf8');
  const adapted = adaptPlatformSource('src/game/match.js', source);
  assert.notEqual(adapted, source);
  assert.equal(
    extractMethod(adapted, '  update(dt) {'),
    extractMethod(source, '  update(dt) {'),
    'online match simulation body is preserved',
  );
});

test('native disabled controller path neutralizes held intent and discards gyro samples', () => {
  const source = fs.readFileSync(PLAYER_PATH, 'utf8');
  const methodStart = source.indexOf('  update(dt) {');
  assert.notEqual(methodStart, -1, 'native PlayerController.update exists');
  const branchEnd = source.indexOf('\n    const touch', methodStart);
  assert.notEqual(branchEnd, -1, 'native disabled path precedes input consumption');
  const partialMethod = source.slice(methodStart, branchEnd) + '\n  }';
  const G = { settings: {} };
  const update = new Function('G', `return ({${partialMethod}}).update`)(G);

  for (const hz of RATES) {
    let discarded = 0;
    const intent = {
      move: { x: 1, y: 0, z: -1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      fire: true, jump: true, squid: true, sub: true, special: true,
    };
    const controller = {
      enabled: false,
      a: { intent },
      input: { mobile: { gyro: { discard() { discarded++; } } } },
      assist: { has: true },
    };
    for (let frame = 0; frame < 4; frame++) update.call(controller, 1 / hz);
    assert.deepEqual([intent.move.x, intent.move.y, intent.move.z], [0, 0, 0]);
    assert.deepEqual([intent.fire, intent.jump, intent.squid, intent.sub, intent.special], [false, false, false, false, false]);
    assert.equal(controller.assist.has, false);
    assert.equal(discarded, 4, `gyro deltas discarded at ${hz} Hz`);
  }
});
