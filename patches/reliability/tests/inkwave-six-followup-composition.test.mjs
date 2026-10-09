import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSixFollowup } from '../inkwave-six-followup-adapter.mjs';
import { replaceOnce } from '../input-adapter.mjs';
import { adaptHostTeams } from '../../splatoon3/lobby-host-team-adapter.mjs';

const rel = 'src/net/session.js';
const source = fs.readFileSync(new URL('../../../inkwave-public/src/net/session.js', import.meta.url), 'utf8');
function composed(host) {
  // Exercise complete native methods, including the start() ownership boundary.
  // The host-team layer runs before reliability in the production composition.
  return adaptSixFollowup(rel, host ? adaptHostTeams(rel, source, replaceOnce) : source);
}
function nativeMethod(code, name, dependencies = {}) {
  const body = code.match(new RegExp(`  ${name}\\(\\) \\{([\\s\\S]*?)\\n  \\}`))?.[1];
  assert.ok(body, `native ${name} method is present`);
  return new Function(...Object.keys(dependencies), `return function () {${body}\n};`)(...Object.values(dependencies));
}
function room(code) {
  const launches = [], broadcasts = [], locks = [];
  const host = { isHost: true, state: 'lobby', myId: 'host', hostId: 'host',
    lobby: { mode: 'turf', teamsConfirmed: true, bots: false, map: 'floor',
      players: [{ id: 'host', team: 0, ready: true, weapon: 'shooter' }] },
    startBlock: () => null,
    tr: { lock(value) { locks.push(value); }, broadcast(cfg) { broadcasts.push(cfg); } },
    _begin(cfg) { launches.push(cfg); },
    canStart: nativeMethod(code, 'canStart'),
    start: nativeMethod(code, 'start', { mapNoBots: () => false, mapBossOk: () => true,
      BOT_NAMES: [], WEAPON_ORDER: ['shooter'], randomStyle: () => ({}), TEAM: 4 }),
  };
  return { host, launches, broadcasts, locks };
}

for (const withHostTeams of [true, false]) {
  test(withHostTeams ? 'turf min two humans composes after host-owned readiness' : 'pre-host-team native fallback remains valid', () => {
    const code = composed(withHostTeams), { host, launches, broadcasts, locks } = room(code);
    assert.match(code, /this\.lobby\.players\.length >= 2/);
    assert.match(code, /this\.lobby\.players\.length < 2/);
    assert.doesNotMatch(code, /&&\nreturn !this\.startBlock/);
    if (withHostTeams) {
      assert.match(code, /this\.lobby\.teamsConfirmed/);
      assert.match(code, /!this\.canStart\(\)/);
    }
    for (const bots of [false, true]) {
      host.lobby.bots = bots;
      assert.equal(host.canStart(), false, 'solo Turf cannot become ready through bots');
      assert.equal(host.start(), false, 'native start independently rejects solo Turf');
    }
    assert.equal(launches.length, 0); assert.equal(broadcasts.length, 0); assert.equal(locks.length, 0);
    host.lobby.bots = false;
    host.lobby.players.push({ id: 'guest', team: 1, ready: true, weapon: 'shooter' });
    if (withHostTeams) {
      host.lobby.teamsConfirmed = false;
      assert.equal(host.canStart(), false); assert.equal(host.start(), false);
      host.lobby.teamsConfirmed = true;
      for (const player of host.lobby.players) {
        player.ready = false;
        assert.equal(host.canStart(), false); assert.equal(host.start(), false);
        player.ready = true;
      }
    }
    assert.equal(host.canStart(), true); assert.equal(host.start(), true);
    assert.equal(launches.length, 1); assert.equal(broadcasts.length, 1); assert.deepEqual(locks, [true]);
    assert.equal(launches[0].roster.length, 2);
    assert.deepEqual(launches[0].roster.map(player => player.owner), ['host', 'guest']);
    assert.equal(launches[0].mode, 'turf');
    host.lobby.mode = 'boss'; host.lobby.players.pop(); host.lobby.players[0].ready = false;
    host.lobby.teamsConfirmed = false;
    assert.equal(host.canStart(), true, 'solo Boss retains its independent admission policy');
    assert.equal(host.start(), true); assert.equal(launches[1].mode, 'boss');
    assert.throws(() => adaptSixFollowup(rel, code), /anchor mismatch/, 'duplicate installation fails closed');
  });
}

test('missing or duplicated native start boundaries fail closed', () => {
  assert.throws(() => adaptSixFollowup(rel, 'bad'), /anchor mismatch/);
  assert.throws(() => adaptSixFollowup(rel, source.replace('  start() {', '  renamedStart() {')), /anchor mismatch/);
  assert.throws(() => adaptSixFollowup(rel, source + '\n  start() {'), /anchor mismatch/);
});
