import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptEightFollowup } from '../inkwave-eight-followup-adapter.mjs';
import { replaceOnce } from '../input-adapter.mjs';
import { adaptHostTeams } from '../../splatoon3/lobby-host-team-adapter.mjs';

const rel = 'src/net/session.js';
const source = fs.readFileSync(new URL('../../../inkwave-public/src/net/session.js', import.meta.url), 'utf8');
function composed(host) {
  // Use the actual native class: _applyMe and setSettings must keep their own
  // complete method boundaries even when host assignment inserts methods.
  return adaptEightFollowup(rel, host ? adaptHostTeams(rel, source, replaceOnce) : source);
}
function nativeMethods(code) {
  const apply = code.match(/  _applyMe\(id, o\) \{([\s\S]*?)\n  \}/)?.[1];
  const settings = code.match(/  setSettings\(s = \{\}\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(apply); assert.ok(settings);
  return {
    apply: new Function('WEAPONS', 'TEAM', `return function (id, o) {${apply}\n};`)({ shooter: {}, roller: {} }, 4),
    settings: new Function('MAPS', 'TEAM_PALETTES', 'mapNoBots', 'mapBossOk', 'bossFallbackMap',
      `return function (s = {}) {${settings}\n};`)([{ id: 'floor' }, { id: 'next' }], [{}, {}], () => false, () => true, () => 'floor'),
  };
}
for (const withHostTeams of [false, true]) test('readiness invalidation composes with host teams ' + withHostTeams, () => {
  const code = composed(withHostTeams), { apply, settings } = nativeMethods(code);
  for (const name of ['beforeWeapon', 'beforeTeams', 'beforeSettings', 'afterSettings']) assert.ok(code.includes(name));
  if (withHostTeams) assert.match(code, /oldMode !== l.mode/);
  let broadcasts = 0, rebalance = false;
  const host = { isHost: true, hostId: 'host', _botsPref: true,
    lobby: { mode: 'turf', teamsConfirmed: true, map: 'floor', time: 'day', duration: 180,
      bots: true, difficulty: 'normal', palette: 0,
      players: [{ id: 'host', team: 0, weapon: 'shooter', ready: true },
        { id: 'guest', team: 1, weapon: 'shooter', ready: true },
        { id: 'other', team: 0, weapon: 'shooter', ready: true }] },
    _fixTeams() { if (rebalance) this.lobby.players[2].team = 1; },
    _broadcastLobby() { broadcasts++; },
  };
  const [owner, guest, other] = host.lobby.players;
  apply.call(host, 'guest', { weapon: 'roller' });
  assert.equal(guest.weapon, 'roller'); assert.equal(guest.ready, false);
  assert.equal(owner.ready, true); assert.equal(other.ready, true);
  guest.ready = true;
  apply.call(host, 'guest', { weapon: 'roller' });
  assert.equal(guest.ready, true, 'unchanged weapon does not erase a new ready confirmation');
  if (withHostTeams) {
    apply.call(host, 'guest', { team: 0 });
    assert.equal(guest.team, 1, 'guest cannot bypass host-owned team assignment');
  }
  rebalance = true;
  apply.call(host, 'guest', {});
  assert.equal(guest.ready, false); assert.equal(other.ready, false);
  assert.equal(owner.ready, true, 'team rebalance invalidates every guest without changing host readiness');
  rebalance = false;
  for (const change of [{ map: 'next' }, { time: 'dusk' }, { duration: 240 }, { bots: false }, { difficulty: 'hard' }, { palette: 1 }]) {
    guest.ready = other.ready = true;
    settings.call(host, change);
    assert.equal(guest.ready, false); assert.equal(other.ready, false);
    assert.equal(owner.ready, true);
    guest.ready = other.ready = true;
    settings.call(host, change);
    assert.equal(guest.ready, true); assert.equal(other.ready, true, 'unchanged setting retains confirmation');
  }
  settings.call(host, { mode: 'boss' });
  assert.equal(guest.ready, false); assert.equal(other.ready, false);
  assert.equal(owner.ready, !withHostTeams);
  if (withHostTeams) assert.equal(host.lobby.teamsConfirmed, false);
  const priorBroadcasts = broadcasts;
  host.isHost = false;
  settings.call(host, { duration: 300 });
  assert.equal(host.lobby.duration, 240); assert.equal(broadcasts, priorBroadcasts);
  assert.throws(() => adaptEightFollowup(rel, code), /anchor mismatch|conflict/, 'duplicate installation fails closed');
});

test('malformed composition and missing native method boundaries fail closed', () => {
  assert.throws(() => adaptEightFollowup(rel, 'bad'), /anchor mismatch|conflict/);
  assert.throws(() => adaptEightFollowup(rel, source.replace('  _applyMe(id, o) {', '  renamedApply(id, o) {')), /Missing _applyMe boundary/);
  assert.throws(() => adaptEightFollowup(rel, source.replace('  setSettings(s = {}) {', '  renamedSettings(s = {}) {')), /Missing setSettings boundary/);
});
