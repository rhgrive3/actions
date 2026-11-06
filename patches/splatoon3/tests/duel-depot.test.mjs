import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { validLobbySnapshot } from '../../reliability/session-admission.mjs';

// The layout imports the site-relative mapkit; point it at the source tree.
const layoutSource = fs.readFileSync(new URL('../duel/depot-layout.mjs', import.meta.url), 'utf8')
  .replace("'../../../src/world/mapkit.js'", JSON.stringify(new URL('../../../inkwave-public/src/world/mapkit.js', import.meta.url).href));
const { LAYOUT } = await import('data:text/javascript,' + encodeURIComponent(layoutSource));
const src = (rel) => adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));

test('Inkbox Depot: indoor, not too wide, no half-height walls', () => {
  const { minX, maxX, minZ, maxZ } = LAYOUT.bounds;
  assert.ok(maxX - minX <= 30, 'not wide');
  assert.ok(maxZ - minZ > (maxX - minX) * 1.8, 'long rather than wide');
  const boxes = [...LAYOUT.single, ...LAYOUT.half].filter((b) => b.kind === 'box');
  assert.ok(boxes.some((b) => /depot-wall/.test(b.tag) && b.max[1] >= 9), 'tall shell walls');
  assert.ok(boxes.some((b) => /roof/.test(b.tag) && b.min[1] >= 8.5), 'roof structure overhead');
  // Anything standing on the floor that could hide part of a body must hide all of it.
  for (const b of boxes) {
    if (b.min[1] !== 0) continue;   // floors, overhead and stacked pieces
    const h = b.max[1] - b.min[1];
    const footprint = (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]);
    if (footprint < 0.2) continue;   // posts and legs are not walls
    assert.ok(h <= 0.2 || h >= 2.2, `${b.tag} is ${h.toFixed(2)} m: a body would stick out of it`);
  }
  const heights = new Set(boxes.map((b) => b.max[1]));
  assert.ok(heights.has(2.6) && heights.has(5.2), 'not flat: dock / container levels');
  assert.ok(LAYOUT.half.some((r) => r.kind === 'ramp'), 'ramps to the high ground');
});

test('2v2 / 1v1 are dedicated lobby modes that own Inkbox Depot', () => {
  const session = src('src/net/session.js');
  assert.match(session, /if \(count\[p\.team\] < \(this\.lobby\.mode === 'solo' \? 1 : this\.lobby\.mode === 'duo' \? 2 : TEAM\)\)/);
  assert.match(session, /if \(l\.mode === 'duo' \|\| l\.mode === 'solo'\) l\.map = 'depot';\n    else if \(l\.map === 'depot'\) l\.map = MAPS\[0\]\.id;/);
  assert.match(session, /while \(slot < \(boss \? TEAM \* 2 : \(l\.mode === 'solo' \? 1 : l\.mode === 'duo' \? 2 : TEAM\)\)\) \{/);
  assert.match(session, /teamSize: boss \? TEAM \* 2 : \(l\.mode === 'solo' \? 1 : l\.mode === 'duo' \? 2 : TEAM\)/);
  assert.match(session, /'1対1：1チーム1人まで' : '2対2：1チーム2人まで'/);
  const menus = src('src/ui/menus.js');
  assert.match(menus, /const LOBBY_MODE_IDS = Object\.freeze\(\[\.\.\.PLAY_MODE_IDS, 'duo', 'solo'\]\);/);
  assert.match(menus, /isSmallTeamMode\(lob\.mode\) \? maps\.filter\(\(m\) => m\.id === DEPOT_MAP\.id\)/);
  assert.match(menus, /maps\.filter\(\(m\) => m\.id !== DEPOT_MAP\.id\)\);/, 'other modes never list it');
  const config = src('src/config.js');
  assert.doesNotMatch(config, /id: 'depot'/, 'not a config MAPS stage (Practice Range style)');
  const main = src('src/main.js');
  assert.match(main, /depotMapFor\(opts\.mapId\)/);
  assert.match(main, /installDuelMenus\(menusMod\.Menus\)/);
  assert.match(src('src/game/match.js'), /o\.teamSize >= 1 && o\.teamSize <= MATCH\.teamSize \? o\.teamSize : MATCH\.teamSize/);
});

test('guests accept a 2v2 / 1v1 room on Inkbox Depot', () => {
  const lobby = { map: 'depot', time: 'day', duration: 180, bots: true, difficulty: 'normal', mode: 'duo', players: [{ id: 'aaaa', name: 'A', team: 0, weapon: 'shooter', ready: true }] };
  const maps = [{ id: 'tidewater' }, { id: 'depot' }];
  const weapons = { shooter: {} };
  assert.equal(validLobbySnapshot(lobby, maps, weapons, 4), true);
  assert.equal(validLobbySnapshot({ ...lobby, mode: 'solo' }, maps, weapons, 4), true);
  assert.equal(validLobbySnapshot({ ...lobby, mode: 'trio' }, maps, weapons, 4), false);
});

test('room settings: 2v2 / 1v1 move the room onto Inkbox Depot and leaving them moves it off', async () => {
  const { isRankedMode } = await import('../runtime/ranked/engine.mjs');
  const body = src('src/net/session.js').match(/  setSettings\(s = \{\}\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(body);
  const run = new Function('isRankedMode', 's', 'MAPS', 'TEAM_PALETTES', 'mapNoBots', 'mapBossOk', 'bossFallbackMap', body);
  const host = { isHost: true, state: 'lobby', _botsPref: true, _fixTeams() {}, _broadcastLobby() {},
    lobby: { mode: 'turf', map: 'tidewater', time: 'day', duration: 180, bots: true, difficulty: 'normal', palette: 0, players: [] } };
  const set = (s) => run.call(host, isRankedMode, s, [{ id: 'tidewater' }, { id: 'kelpline' }], [{}], () => false, () => true, () => 'tidewater');
  set({ mode: 'duo' }); assert.deepEqual([host.lobby.mode, host.lobby.map], ['duo', 'depot']);
  set({ map: 'kelpline' }); assert.equal(host.lobby.map, 'depot', 'the 2v2 room cannot leave its stage');
  set({ mode: 'solo' }); assert.deepEqual([host.lobby.mode, host.lobby.map], ['solo', 'depot']);
  set({ mode: 'turf' }); assert.deepEqual([host.lobby.mode, host.lobby.map], ['turf', 'tidewater'], 'Turf War never runs on Inkbox Depot');
  set({ map: 'depot' }); assert.equal(host.lobby.map, 'tidewater');
});
