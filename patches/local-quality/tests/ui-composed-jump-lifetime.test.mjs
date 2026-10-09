import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const dioramaRel = 'src/ui/diorama.js';
const playerRel = 'src/game/player.js';
const readPublic = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
// This is the same six-adapter path used by scripts/build-inkwave.mjs. In
// particular, S3's Bubbler pins are composed before reliability routes them.
const diorama = adaptBuildSource(dioramaRel, readPublic(dioramaRel));
const player = adaptBuildSource(playerRel, readPublic(playerRel));

function section(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `missing composed source section: ${start}`);
  assert.equal(source.indexOf(start, a + start.length), -1, `duplicate composed source section: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, `missing end of composed source section: ${end}`);
  return source.slice(a, b);
}

const jumpMethod = section(diorama, '  _jump(i, me) {', '  _flash(i) {');
const navigationMethods = section(player, '  canRequestMapJump() {', '  clearRespawnNavigation() {');
const DioramaJump = G => new Function('G', `return class {${jumpMethod}}`)(G);
const CurrentNavigation = G => new Function('G', `return class {${navigationMethods}}`)(G);

function vector(x, y, z) {
  return { isVector3: true, x, y, z, clone() { return vector(x, y, z); } };
}

function rig() {
  const calls = { eligibility: 0, mapRequests: [], bubblerRequests: [], jumps: [], bubblerJumps: [], padClones: 0 };
  const me = {
    team: 0, alive: true, grounded: true,
    canSuperJump() { calls.eligibility++; return true; },
    superJump(target) { calls.jumps.push(target); return true; },
    superJumpToBubbler(target) { calls.bubblerJumps.push(target); return true; },
  };
  const ally = { team: 0, alive: true, superJumpState: null, pos: vector(2, 0, 3) };
  const enemy = { team: 1, alive: true, superJumpState: null, pos: vector(-2, 0, -3) };
  const bubbler = { kind: 'bubbler', id: '0:owner:7', serial: 7, team: 0, pos: vector(8, 0, 9) };
  const pad = vector(40, 0, -12);
  pad.clone = () => { calls.padClones++; return vector(pad.x, pad.y, pad.z); };
  const G = {
    actors: [me, ally, enemy],
    match: { local: me, attract: false, controller: null },
    level: { spawnPads: [pad] },
    bigBubblerJumpTargets: team => team === 0 ? [bubbler] : [],
  };
  const controller = new (CurrentNavigation(G))();
  Object.assign(controller, {
    a: me, input: { navigationDevice: 'keyboard', lastDevice: 'keyboard' },
    navigationEnabled: true, menuBlocked: false, mapHeld: false, _respawnNavigationActive: false,
  });
  const requestMapJump = controller.requestMapJump;
  controller.requestMapJump = function (target) {
    calls.mapRequests.push(target);
    return requestMapJump.call(this, target);
  };
  const requestMapBubblerJump = controller.requestMapBubblerJump;
  controller.requestMapBubblerJump = function (target) {
    calls.bubblerRequests.push(target);
    return requestMapBubblerJump.call(this, target);
  };
  G.match.controller = controller;

  const d = new (DioramaJump(G))();
  Object.assign(d, {
    on: true, k: 1,
    // Match the composed target order: three teammate slots, home, live
    // Bubbler pins, then self. The target objects are current production shapes.
    pins: [
      { target: ally }, { target: null }, { target: null }, { target: null },
      { target: null, bubblerTarget: bubbler }, { target: null },
    ],
    _flash() {},
  });
  return { d, G, me, ally, enemy, bubbler, pad, controller, calls };
}

test('#1153 fixture uses the production Bubbler → navigation → lifetime composition', () => {
  assert.ok(diorama.includes('this.pins = [...this.basePins, ...this.bubblerPins.slice(0, count), this.selfPin]'));
  assert.ok(diorama.includes('requestMapBubblerJump(p.bubblerTarget)'));
  assert.ok(diorama.includes('p.target === me || p.target.team !== me.team'));
  assert.ok(player.includes('requestMapBubblerJump(target)'));
});

test('current teammate, home, and live Bubbler pins route through the current navigation owner', () => {
  const h = rig();
  h.d._jump(0, h.me);
  h.d._jump(3, h.me);
  h.d._jump(4, h.me);

  assert.equal(h.calls.eligibility, 6, 'Diorama preflight and request admission each check current eligibility');
  assert.deepEqual(h.calls.mapRequests.slice(0, 1), [h.ally], 'teammate selection reaches requestMapJump with that Actor');
  assert.equal(h.calls.padClones, 1, 'home selection clones the team spawn pad');
  assert.deepEqual(
    [h.calls.mapRequests[1].x, h.calls.mapRequests[1].y, h.calls.mapRequests[1].z],
    [40, 0, -12], 'home selection keeps the spawn pad coordinates');
  assert.notEqual(h.calls.mapRequests[1], h.pad, 'home selection does not hand the shared pad to navigation');
  assert.deepEqual(h.calls.jumps, [h.ally, h.calls.mapRequests[1]], 'the owner admits both the teammate and home target');
  assert.deepEqual(h.calls.bubblerRequests, [h.bubbler], 'the dynamic pin keeps its current structure identity');
  assert.deepEqual(h.calls.bubblerJumps, [{ kind: 'bubbler', id: h.bubbler.id, serial: h.bubbler.serial, team: h.bubbler.team }],
    'the owner resolves the live activation and passes its canonical identity to Actor');
  assert.notEqual(h.calls.bubblerJumps[0], h.bubbler, 'Actor receives the validated identity, not the UI pin object');
});

test('retired UI pins stop before admission, and current navigation rejects stale or invalid targets', () => {
  const rejectBeforeAdmission = [
    h => { h.d.on = false; },
    h => { h.d.k = 0.69; },
    h => { h.G.match.local = {}; },
    h => { h.G.match.attract = true; },
    h => { h.G.actors = [h.me]; },
    h => { h.d.pins[0].target = h.enemy; },
    h => { h.d.pins[0].target = h.me; },
    h => { h.d.pins[0] = null; },
  ];
  for (const mutate of rejectBeforeAdmission) {
    const h = rig(); mutate(h); h.d._jump(0, h.me);
    assert.equal(h.calls.eligibility, 0, 'lifetime guard rejects before eligibility');
    assert.equal(h.calls.mapRequests.length, 0, 'retired or foreign UI state never reaches the current owner');
    assert.equal(h.calls.jumps.length, 0);
  }

  for (const mutate of [h => { h.ally.pos = { isVector3: false }; }]) {
    const h = rig(); mutate(h); h.d._jump(0, h.me);
    assert.equal(h.calls.mapRequests.length, 1, 'a roster pin reaches current owner validation');
    assert.equal(h.calls.eligibility, 2, 'the owner rechecks eligibility when the request arrives');
    assert.equal(h.calls.jumps.length, 0, 'an invalid teammate position is not admitted');
  }

  for (const mutate of [
    h => { h.ally.alive = false; },
    h => { h.ally.superJumpState = { phase: 'charge' }; },
  ]) {
    const h = rig(); mutate(h); h.d._jump(0, h.me);
    assert.equal(h.calls.mapRequests.length, 0, 'unavailable teammate is rejected by the composed Diorama');
    assert.equal(h.calls.jumps.length, 0);
  }

  for (const mutate of [
    h => { h.d.pins[4].bubblerTarget = { ...h.bubbler, serial: h.bubbler.serial - 1 }; },
    h => { h.d.pins[4].bubblerTarget = { ...h.bubbler, team: 1 }; },
    h => { h.G.bigBubblerJumpTargets = () => []; },
  ]) {
    const h = rig(); mutate(h); h.d._jump(4, h.me);
    assert.equal(h.calls.bubblerRequests.length, 1, 'the selected dynamic pin reaches the current Bubbler owner');
    assert.equal(h.calls.bubblerJumps.length, 0, 'stale, enemy, or expired structure identity is rejected');
  }

  const invalidHome = rig();
  invalidHome.G.level.spawnPads[0] = vector(Number.NaN, 0, 0);
  invalidHome.d._jump(3, invalidHome.me);
  assert.equal(invalidHome.calls.mapRequests.length, 1, 'home destination reaches current owner validation');
  assert.equal(invalidHome.calls.jumps.length, 0, 'non-finite spawn target is rejected');
});
