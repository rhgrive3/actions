import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptSixFollowup } from '../inkwave-six-followup-adapter.mjs';

const source = fs.readFileSync(new URL('../../../inkwave-public/src/net/session.js', import.meta.url), 'utf8');
test('current full composition retains host team confirmation and two-human Turf admission', () => {
  const built = adaptBuildSource('src/net/session.js', source);
  const body = built.match(/  canStart\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(body, 'native canStart is present');
  const canStart = new Function(body);
  const host = { isHost: true, state: 'lobby', myId: 'host', startBlock: () => null,
    lobby: { mode: 'turf', teamsConfirmed: true, bots: true, players: [{ id: 'host', ready: true }] } };
  assert.equal(canStart.call(host), false, 'bots cannot rescue solo Turf');
  host.lobby.players.push({ id: 'guest', ready: true });
  assert.equal(canStart.call(host), true);
  host.lobby.teamsConfirmed = false;
  assert.equal(canStart.call(host), false, 'two humans do not bypass host confirmation');
  host.lobby.teamsConfirmed = true; host.lobby.players[0].ready = false;
  assert.equal(canStart.call(host), false, 'Turf host also readies after confirmation');
  host.lobby.mode = 'boss'; host.lobby.players.pop();
  assert.equal(canStart.call(host), true, 'solo Boss retains its distinct start policy');
  assert.match(built, /!this\.canStart\(\) \|\| \(this\.lobby\.mode === 'turf' && this\.lobby\.players\.length < 2\)/);
  assert.throws(() => adaptSixFollowup('src/net/session.js', built), /anchor mismatch/, 'double patching fails closed');
});


test('current host-team composition retains weapon and room-setting ready invalidation', () => {
  const built = adaptBuildSource('src/net/session.js', source);
  const applyBody = built.match(/  _applyMe\(id, o\) \{([\s\S]*?)\n  \}/)?.[1];
  const settingsBody = built.match(/  setSettings\(s = \{\}\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(applyBody); assert.ok(settingsBody);
  const apply = new Function('WEAPONS', 'id', 'o', applyBody);
  const settings = new Function('s', 'MAPS', 'TEAM_PALETTES', 'mapNoBots', 'mapBossOk', 'bossFallbackMap', settingsBody);
  let broadcasts = 0;
  const host = { isHost: true, state: 'lobby', hostId: 'host', _botsPref: true,
    _fixTeams() {}, _broadcastLobby() { broadcasts++; },
    lobby: { mode: 'turf', teamsConfirmed: true, map: 'floor', time: 'day', duration: 180,
      bots: true, difficulty: 'normal', palette: 0,
      players: [{ id: 'host', team: 0, weapon: 'shooter', ready: true },
        { id: 'guest', team: 1, weapon: 'shooter', ready: true }] } };
  apply.call(host, { shooter: {}, roller: {} }, 'guest', { weapon: 'roller', team: 0 });
  assert.equal(host.lobby.players[1].weapon, 'roller');
  assert.equal(host.lobby.players[1].ready, false, 'weapon mutation invalidates ready');
  assert.equal(host.lobby.players[1].team, 1, 'untrusted team write stays rejected');
  host.lobby.players[1].ready = true;
  settings.call(host, { duration: 240 }, [{ id: 'floor' }], [{}, {}], () => false, () => true, () => 'floor');
  assert.equal(host.lobby.players[1].ready, false, 'launch-critical settings invalidate guest ready');
  assert.equal(host.lobby.teamsConfirmed, true, 'same mode keeps host confirmation');
  settings.call(host, { mode: 'boss' }, [{ id: 'floor' }], [{}, {}], () => false, () => true, () => 'floor');
  assert.equal(host.lobby.teamsConfirmed, false, 'mode transition invalidates team confirmation');
  assert.ok(host.lobby.players.every(p => !p.ready), 'mode transition also invalidates host ready');
  assert.equal(broadcasts, 3);
});
