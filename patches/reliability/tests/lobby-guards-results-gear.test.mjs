// Online Turf results: a guest who changes gear and then keeps going must enter
// the next lobby with that gear. The host is still in the 'match' state while
// results are shown, so the lobby guard records only weapon/style there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installLobbyGuards } from '../lobby-guards.mjs';
import { validMeUpdate } from '../session-admission.mjs';

const WEAPONS = { shooter: {}, roller: {} };
function rig({ state = 'match', matchState = 'results' } = {}) {
  const applied = [];
  class Session {
    _applyMe(id, o) { applied.push([id, o]); }
    _broadcastLobby() {}
    leave() {}
    _control() {}
    _begin() {}
    _message() {}
  }
  installLobbyGuards(Session, p => typeof p.weapon === 'string' && validMeUpdate(p, WEAPONS));
  const s = new Session();
  Object.assign(s, {
    state, isHost: true, myId: 'host', hostId: 'host',
    _members: new Map([['host', 'Host'], ['guest', 'Guest']]),
    match: { match: { state: matchState } },
    lobby: { players: [
      { id: 'host', weapon: 'shooter', style: null, ready: false, team: 0 },
      { id: 'guest', weapon: 'shooter', style: null, ready: false, team: 1 },
    ] },
  });
  return { s, applied, guest: () => s.lobby.players[1] };
}

test('results: a guest gear change is recorded for the next lobby without a lobby broadcast', () => {
  const { s, applied, guest } = rig();
  s._applyMe('guest', { weapon: 'roller' });
  assert.equal(guest().weapon, 'roller');
  assert.deepEqual(applied, [], 'the lobby path (and its broadcast) is not used mid-match');
});

test('results: ready, team and invalid weapons are not accepted', () => {
  const { s, guest } = rig();
  s._applyMe('guest', { ready: true, team: 0 });
  s._applyMe('guest', { weapon: 'not-a-weapon' });
  assert.deepEqual([guest().weapon, guest().ready, guest().team], ['shooter', false, 1]);
});

test('results: an unknown peer is ignored', () => {
  const { s } = rig();
  s._applyMe('stranger', { weapon: 'roller' });
  assert.ok(s.lobby.players.every(p => p.weapon === 'shooter'));
});

test('live match: gear changes stay rejected', () => {
  const { s, applied, guest } = rig({ matchState: 'playing' });
  s._applyMe('guest', { weapon: 'roller' });
  assert.equal(guest().weapon, 'shooter');
  assert.deepEqual(applied, []);
});
