import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { ROSTER_PRIVACY_MARKER } from '../top-roster-privacy-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `source section exists: ${start}`);
  return source.slice(a, b);
}
const loadout = ability => Array.from({ length: 3 }, () => ({ main: ability, subs: [ability, ability, ability] }));

function makeHudHarness(f) {
  const raw = read('inkwave-public/src/ui/hud.js');
  const adapted = adaptSource('src/ui/hud.js', raw);
  const mapMethod = section(adapted, '  _beaconTargets() {', '\n  _updBeacons(');
  const originalMapMethod = section(raw, '  _beaconTargets() {', '\n  _updBeacons(');
  assert.equal(mapMethod, originalMapMethod, 'the separate Turf Map controls stay owned by their existing path');
  const methods = [
    section(adapted, '  _updSquads(teams) {', '\n  _buildReticle('),
    section(adapted, '  showSplatted({', '\n  hideSplatted('),
    mapMethod,
  ].join('\n');
  const globals = {
    G: f.G, PLAYER: f.PLAYER, WEAPONS: {}, BUMP: { duration: 1 },
    kindOf: id => id, weaponIcon: id => `weapon:${id}`, tr: value => value,
    h(tag, attrs, ...children) {
      return { tag, attrs, children, textContent: children.find(x => typeof x === 'string') || '',
        innerHTML: attrs?.html || '', style: {}, classList: { add() {}, remove() {}, toggle() {} },
        animate() {}, remove() {} };
    },
    colorVars() {}, toHex: value => value, splatSVG: () => '', richText: value => value,
  };
  const HUD = vm.runInNewContext(`class HUD { ${methods} }; HUD`, globals);
  const wrapperAt = adapted.indexOf(ROSTER_PRIVACY_MARKER);
  assert.ok(wrapperAt >= 0, 'the build adapter installs the privacy wrapper');
  vm.runInNewContext(adapted.slice(wrapperAt), { HUD });
  return { HUD, globals };
}

function element() {
  const state = new Map(), parts = new Map();
  return {
    children: [], style: {}, innerHTML: '', textContent: '',
    classList: { add: key => state.set(key, true), remove: key => state.set(key, false), toggle: (key, on) => state.set(key, !!on), state },
    querySelector(key) {
      if (!parts.has(key)) parts.set(key, element());
      return parts.get(key);
    },
    animate() {},
  };
}
function squads() {
  return Array.from({ length: 2 }, () => ({ children: Array.from({ length: 4 }, element) }));
}

for (const localTeam of [0, 1]) test(`#886 native roster hides all splat timers with real Quick Respawn data (local team ${localTeam})`, async () => {
  const f = await fixture(), local = f.make(), ally = f.make(), ready = f.make('splatling'), enemy = f.make();
  local.name = 'local'; ally.name = 'ally'; ready.name = 'ready'; enemy.name = 'enemy';
  f.G.level.spawnPads = [{ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
  f.G.teamHex = ['#ff8a14', '#2f5bff'];
  f.G.physics.groundProbe = () => ({ hit: false, y: 0 });
  local.team = ally.team = ready.team = localTeam; enemy.team = 1 - localTeam;
  local.isLocal = true;
  ally.s3.loadout = loadout('quickRespawn'); ally.setWeapon(ally.weaponId);
  ally.splat(null); const unmodified = ally.respawnTimer;
  ally.respawn(); ally.splat(null);
  assert.ok(ally.respawnTimer < unmodified && ally.respawnTimer > 0, 'normal Quick Respawn rules change the real Actor timer');
  local.splat(null);
  enemy.splat(null);
  ready.special = ready.specialCost();

  const rawMatch = read('inkwave-public/src/game/match.js');
  const at = rawMatch.indexOf('  teamSummary() {');
  const end = rawMatch.indexOf('\n  }\n}', at);
  assert.ok(at >= 0 && end > at);
  const summaryMethod = rawMatch.slice(at, end + 4);
  const Match = vm.runInNewContext(`class Match { ${summaryMethod} }; Match`, { G: f.G });
  const match = Object.create(Match.prototype); match.actors = [local, ally, ready, enemy];
  const summary = match.teamSummary();
  const localTimer = local.respawnTimer, allyTimer = ally.respawnTimer, enemyTimer = enemy.respawnTimer;
  assert.equal(summary[localTeam].players[0].respawn, localTimer);
  assert.equal(summary[1 - localTeam].players[0].respawn, enemyTimer);
  const presented = localTeam === 0 ? summary : summary.slice().reverse();
  const { HUD } = makeHudHarness(f);
  const hud = Object.create(HUD.prototype);
  hud._L = {}; hud.squads = squads(); hud._restart = () => {};
  hud._actorFor = () => null;
  hud._updSquads(presented);

  for (const [rosterTeam, player] of [[0, local], [0, ally], [1, enemy]]) {
    const sourceTeam = rosterTeam === 0 ? localTeam : 1 - localTeam;
    const slotIndex = summary[sourceTeam].players.findIndex(row => row.name === player.name);
    assert.notEqual(slotIndex, -1, `${player.name} is included in team ${sourceTeam}`);
    const slot = hud.squads[rosterTeam].children[slotIndex];
    assert.equal(slot.querySelector('.iw-sq__n').textContent, '', `${player.name} has no roster seconds`);
    assert.equal(slot.querySelector('.iw-sq__ring circle').style.display, 'none', `${player.name} has no countdown ring`);
    assert.equal(slot.classList.state.get('is-dead'), true, `${player.name} remains visibly splatted`);
  }
  const readyIndex = summary[localTeam].players.findIndex(row => row.name === ready.name);
  const readySlot = hud.squads[0].children[readyIndex];
  assert.equal(readySlot._w, ready.weaponId, 'weapon badge remains bound');
  assert.equal(readySlot.classList.state.get('is-ready'), true, 'special-ready state remains visible');
  assert.equal(readySlot.classList.state.get('is-dead'), false, 'active state remains visible');
  assert.equal(local.respawnTimer, localTimer, 'presentation does not change the local authoritative timer');
  assert.equal(ally.respawnTimer, allyTimer, 'presentation does not change teammate timing');
  assert.equal(enemy.respawnTimer, enemyTimer, 'presentation does not change opponent timing');
  assert.equal(summary[localTeam].players[0].respawn, localTimer, 'source summary remains unmodified');
  assert.equal(summary[localTeam].players[1].respawn, allyTimer, 'teammate summary remains unmodified');
  assert.equal(summary[1 - localTeam].players[0].respawn, enemyTimer, 'opponent summary remains unmodified');

  const onlineSnapshot = JSON.parse(JSON.stringify(presented));
  hud._L = {}; hud.squads = squads(); hud._updSquads(onlineSnapshot);
  assert.equal(hud.squads[0].children[0].querySelector('.iw-sq__n').textContent, '', 'serialized online roster uses the same status-only presentation');

  f.G.actors = [local, ally];
  f.G.game = { minimap: { w: 100, h: 100, toCanvas(x, z, out) { out.x = x; out.y = z; } } };
  f.G.level = { spawnPads: [{ x: -10, z: 0 }, { x: 10, z: 0 }] };
  hud._local = () => local; hud.lab = null;
  const downMapTarget = hud._beaconTargets()[0];
  assert.equal(downMapTarget.ok, false, 'the Turf Map still disables a splatted jump target');
  assert.equal(downMapTarget.name, ally.name);
  ally.respawn();
  assert.equal(hud._beaconTargets()[0].ok, true, 'the Turf Map target becomes available on actual respawn');

  const fx = [];
  const ownHud = Object.create(HUD.prototype);
  ownHud.hideSplatted = () => {};
  ownHud.el = { prepend() {} }; ownHud.splatLayer = { appendChild() {} };
  ownHud._kills = { lastKiller: null }; ownHud._fxTime = 0;
  ownHud._addFx = (_name, callback) => fx.push(callback); ownHud._snd = () => {};
  ownHud.showSplatted({ respawn: localTimer });
  assert.equal(ownHud._splatted.num.textContent, String(Math.ceil(localTimer)), 'the player keeps their own dedicated death countdown');
  ownHud._fxTime = Math.max(0, localTimer - 1.2); fx[0]();
  assert.equal(ownHud._splatted.num.textContent, String(Math.ceil(localTimer - Math.max(0, localTimer - 1.2))), 'the local countdown continues to tick');
});
