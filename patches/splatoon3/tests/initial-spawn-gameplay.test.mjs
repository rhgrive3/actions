import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const adaptBuildSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

async function boot() {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const source = file.startsWith(SRC + path.sep) ? adaptBuildSource(rel, raw) : raw;
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installQuality } from './patches/local-quality/install.mjs';
    export { Level } from './src/world/level.js';
    export { NetMatch, NET_FLAGS } from './src/net/netmatch.js';
  `, { context, identifier: path.join(SRC, 'initial-spawn-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', spec.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  entry.namespace.installQuality(profile);
  const { G, THREE, Physics, Projectiles, Match, NetMatch } = api;
  // Rendering is outside this gameplay regression. Production Match, Actor,
  // PlayerController and NetMatch stay installed; only Character's mesh rig is light.
  class LogicCharacter {
    constructor({ color }) { this.root = new THREE.Group(); this.color = color; this.onEvent = null; this.inWorld = true; }
    _owner() { return this.actor || G.actors.find(actor => actor.character === this) || null; }
    setVisible(value) { this.root.visible = value; }
    setHurt() {}
    setWeapon() {}
    trigger() {}
    update() {}
    dispose() {}
  }
  const level = new api.Level({
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -0.5, -100], max: [100, 0, 100] }], half: [],
  });
  const paintCalls = [], bursts = [];
  Object.assign(G, {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match', match: null, netm: null,
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')], teamHex: ['#ff8a14', '#2f5bff'],
    paint: { sample: () => 1, coverage: () => [0.5, 0.5], splat: (_p, radius, team, opts = {}) => { paintCalls.push({ radius, team, seed: opts.seed }); return 0; } },
    fx: { burst: (...args) => bursts.push(args), ring() {}, spawnFlash() {}, clear() {} },
    audio: { play() {}, duck() {} }, game: { menus: { current: null } },
  });
  G.projectiles = new Projectiles(G.scene);

  function disposeCurrent() {
    if (G.netm) G.netm.dispose();
    if (G.match) G.match.dispose();
    G.projectiles.clear();
    G.netm = null; G.match = null; G.actors = []; G.mode = 'match'; G.time = 0;
    G.game.menus.current = null;
  }

  function makeMatch({ networkId = null, localId = null, noBots = false } = {}) {
    disposeCurrent();
    const input = {
      keys: new Set(), pad: null, mobile: null,
      mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false },
      down(key) { return this.keys.has(key); }, wasPressed() { return false; },
      padButton() { return false; }, padValue() { return 0; },
    };
    const rig = { yaw: 0, pitch: 0 };
    const roster = localId ? [
      { nid: 101, owner: 'p1', bot: false, team: 0, slot: 0, name: 'Alpha', weapon: 'shooter', style: { hair: 0, skin: 0 } },
      { nid: 102, owner: 'p2', bot: false, team: 1, slot: 0, name: 'Bravo', weapon: 'shooter', style: { hair: 0, skin: 0 } },
    ] : null;
    const match = new Match({
      duration: 99, difficulty: 'easy', mode: 'turf', weapon: 'shooter', playerName: 'Player',
      CharacterClass: LogicCharacter, rig, input, noBots, roster, myId: localId, host: localId === 'p1',
      style: { hair: 0, skin: 0 },
    });
    G.match = match;
    match.setup();
    for (const actor of match.actors) if (actor.bot) actor.bot.update = () => {};
    if (networkId) {
      const sent = [];
      const session = {
        myId: localId, isHost: localId === 'p1', hostId: 'p1', _members: new Map([['p1', {}], ['p2', {}]]),
        tr: { broadcast(message) { sent.push(message); }, sendTo() {}, rtt: 0 },
      };
      const netmatch = new NetMatch(session, { id: networkId, map: 'test' });
      netmatch.bind(match);
      match.testSent = sent;
    }
    return { match, input, rig, api };
  }

  return { ...api, paintCalls, bursts, disposeCurrent, makeMatch, STEP };
}

const f = await boot();

test('native Match gives every initial Turf actor an individual spawner and a bounded own-team landing choice before GO', t => {
  const { match, input } = f.makeMatch(); t.after(f.disposeCurrent);
  match.start();
  const session = match.initialSpawnSession;
  assert.ok(session);
  assert.equal(session.actors.size, 8);
  assert.equal(new Set([...session.actors.values()]).size, 8);
  assert.ok([...session.actors.values()].every(s => s.sourceMarker));
  assert.equal(match.state, 'intro');

  const local = match.local, state = local.initialSpawn, start = state.target.clone();
  input.keys.add('KeyA');
  match.updateController(2);
  input.keys.clear();
  assert.ok(state.target.x > start.x + 1, 'movement changes the selected landing point');
  const pad = f.G.level.spawnPads[local.team];
  assert.ok(Math.hypot(state.target.x - pad.x, state.target.z - pad.z) <= f.profile.initialSpawn.ownZoneRadius + 1e-6);
  assert.ok(local.team === 0 ? state.target.x < 0 : state.target.x > 0, 'the target stays on the player team side');
  assert.equal(state.target.y, 0);
  assert.deepEqual(local.pos.toArray(), state.origin.toArray(), 'choice input does not move the actor off its spawner');

  let selected = state.target.clone();
  f.G.game.menus.current = 'pause';
  for (let i = 0; i < 20; i++) { input.keys.add('KeyA'); match.updateController(STEP); }
  input.keys.clear(); f.G.game.menus.current = null;
  assert.ok(state.target.distanceTo(selected) < 1e-6, 'menu input cannot move the landing cursor');
  match.paused = true;
  for (let i = 0; i < 20; i++) { input.keys.add('KeyA'); match.updateController(STEP); }
  input.keys.clear(); match.paused = false;
  assert.ok(state.target.distanceTo(selected) < 1e-6, 'paused input cannot move the landing cursor');

  input.pad = {};
  input.padStick = (_left, _right, out) => out.set(1, 0);
  const beforePad = state.target.clone();
  match.updateController(0.25);
  assert.ok(state.target.distanceTo(beforePad) > 1, 'the native left stick moves the landing cursor');
  input.pad = null;
  let gyroDiscards = 0;
  input.lastDevice = 'touch';
  input.mobile = { active: true, root: {}, moveX: 0, moveY: 1, gyro: { discard() { gyroDiscards++; } } };
  const beforeTouch = state.target.clone();
  match.updateController(0.25);
  assert.ok(state.target.distanceTo(beforeTouch) > 1, 'the active touch stick moves the landing cursor');
  assert.equal(gyroDiscards, 1, 'intro selection discards unused camera gyro input');
  input.mobile = null; input.lastDevice = null;
  const selectionOffsets = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    state.target.copy(pad);
    input.keys.add('KeyA');
    for (let i = 0; i < 0.5 / dt; i++) match.updateController(dt);
    input.keys.clear();
    selectionOffsets.push(state.target.x - pad.x);
  }
  for (const offset of selectionOffsets) assert.ok(Math.abs(offset - 4) < 1e-5, 'landing cursor speed is stable across frame intervals');
  selected = state.target.clone();

  match.stateT = 4.2 - STEP / 2;
  f.G.time += STEP; match.updateController(STEP); match.update(STEP);
  assert.equal(match.state, 'playing', 'native intro countdown owns GO');
  assert.equal(state.phase, 'flight');
  assert.equal(local.superJumpState.phase, 'flight');
  assert.ok(local.superJumpState.initialSpawn);
  assert.ok(local.superJumpState.to.distanceTo(selected) < 1e-6);
});

test('eight slots launch independently; native Actor flight and landing hold at 30, 60 and 120 Hz with deterministic bot targets and paint seeds', t => {
  const result = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const { match } = f.makeMatch(); t.after(f.disposeCurrent);
    match.start();
    const destinations = match.actors.map(a => [a.team, a.slot, ...a.initialSpawn.target.toArray()]);
    const independent = [...match.initialSpawnSession.actors.values()];
    assert.equal(independent.length, 8);
    match.setState('playing');
    assert.ok(match.actors.every(a => a.superJumpState?.phase === 'flight' && a.form === 'squid'));
    const local = match.local;
    local.character.update = () => {}; // preserve native Actor/Match physics while skipping mesh-only work
    local.intent.move.set(5, 0, 0); local.intent.fire = true;
    const bot = match.actors.find(a => a.isBot && a.team === local.team);
    if (dt === 1 / 60) bot.character.update = () => {};
    f.paintCalls.length = 0;
    let frames = 0;
    while (local.initialSpawn.phase === 'flight' && frames++ < Math.ceil(2 / dt) + 4) {
      f.G.time += dt; local.update(dt);
    }
    assert.ok(frames < Math.ceil(2 / dt) + 4, `flight completes at dt=${dt}`);
    assert.equal(local.initialSpawn.phase, 'landed');
    assert.equal(local.superJumpState, null);
    assert.ok(local.pos.distanceTo(local.initialSpawn.target) < 0.2, `local actor lands at its selected point at dt=${dt}`);
    assert.equal(local.form, 'kid', 'ordinary ground form returns only after the authoritative landing');
    assert.equal(Math.hypot(local.vel.x, local.vel.z), 0, 'input cannot steer ordinary movement during launch flight');
    if (dt === 1 / 60) {
      let botFrames = 0;
      while (bot.initialSpawn.phase === 'flight' && botFrames++ < Math.ceil(2 / dt) + 4) bot.update(dt);
      assert.equal(bot.initialSpawn.phase, 'landed');
      assert.ok(bot.pos.distanceTo(bot.initialSpawn.target) < 0.2, 'deterministic bot reaches its assigned landing');
    }
    assert.equal(f.paintCalls.length, dt === 1 / 60 ? 2 : 1);
    assert.ok(f.paintCalls.every(p => p.radius === f.profile.initialSpawn.landingRadius && Number.isFinite(p.seed)));
    const expectedLocalSeed = (((local.team + 1) * 131 + (local.slot + 1) * 197) % 997) / 997;
    assert.equal(f.paintCalls[0].seed, expectedLocalSeed);
    if (dt === 1 / 60) {
      const expectedBotSeed = (((bot.team + 1) * 131 + (bot.slot + 1) * 197) % 997) / 997;
      assert.equal(f.paintCalls[1].seed, expectedBotSeed);
    }
    result.push({ destinations, seed: f.paintCalls[0].seed, botSeed: dt === 1 / 60 ? f.paintCalls[1].seed : null });
  }
  assert.deepEqual(result[1].destinations, result[0].destinations);
  assert.deepEqual(result[2].destinations, result[0].destinations);
  assert.equal(result[1].seed, result[0].seed);
  assert.equal(result[2].seed, result[0].seed);
});

test('owner destination rides the existing NetMatch superjump event, late playback is ordered once, and reconnect/session guards reject stale or invalid targets', t => {
  const owner = f.makeMatch({ networkId: 'battle-a', localId: 'p1' }); t.after(f.disposeCurrent);
  owner.match.start();
  const origin = owner.match.local.initialSpawn.target.clone();
  owner.input.keys.add('KeyA');
  for (let i = 0; i < 25; i++) owner.match.updateController(STEP);
  owner.input.keys.clear();
  const chosen = owner.match.local.initialSpawn.target.clone();
  assert.ok(chosen.distanceTo(origin) > 1);
  owner.match.setState('playing');
  const ownerNet = f.G.netm;
  ownerNet._sendTick();
  const sent = owner.match.testSent.findLast(message => message.k === 't');
  const opening = sent?.e?.find(event => event[1] === 'ev' && event[2] === 'superjump' && event[3]?.initialSpawn);
  assert.ok(opening, 'owner sends through the existing event stream');
  assert.equal(opening[3].initialSpawnSession, 'battle-a');
  assert.deepEqual(opening[3].to, chosen.toArray().map(v => Math.round(v * 100) / 100));

  ownerNet.dispose(); owner.match.dispose(); f.G.match = null;
  const receiver = f.makeMatch({ networkId: 'battle-a', localId: 'p2' });
  receiver.match.start(); receiver.match.setState('playing');
  const receiverNet = f.G.netm;
  const remote = receiver.match.actors.find(a => a.nid === 101);
  remote.net.ready = true;
  remote.net.cur = {
    t: 1, x: remote.pos.x, y: remote.pos.y + 1, z: remote.pos.z, vx: 0, vy: 3, vz: 0,
    yaw: 0, aimYaw: 0, aimPitch: 0, f: f.NET_FLAGS.alive | f.NET_FLAGS.sjFlight,
    hp: 100, ink: 100, sp: 0, ch: 0, turf: 0, tp: 0, wx: 0, wy: 1, wz: 0, lock: 0,
  };
  receiverNet.applyRemote(remote, STEP);
  const remoteState = remote.initialSpawn;
  assert.equal(remoteState.phase, 'awaiting-owner');
  assert.equal(remoteState.sawFlight, true, 'the native remote sample reached flight before the delayed event');

  const invalid = [opening[0], ...opening.slice(1)];
  invalid[3] = { ...opening[3], to: [80, 0, 0] };
  receiverNet._play('p1', invalid);
  assert.equal(remoteState.phase, 'awaiting-owner', 'enemy-side destination is rejected');
  receiverNet._play('p2', opening);
  assert.equal(remoteState.phase, 'awaiting-owner', 'a non-owner cannot publish the landing');

  const peer = receiverNet._peer('p1'); peer.tr = opening[0] + 1; peer.events.push(opening);
  const burstCount = f.bursts.length;
  receiverNet._playEvents();
  assert.equal(remoteState.phase, 'flight');
  assert.equal(remoteState.eventAccepted, true);
  assert.ok(remoteState.target.distanceTo(chosen) < 0.02, 'the actual owner destination is replicated');
  assert.ok(remote.net.sjTo.distanceTo(chosen) < 0.02, 'the native remote superjump effect receives the same target');
  const afterAccepted = f.bursts.length;
  receiverNet._play('p1', opening);
  assert.equal(f.bursts.length, afterAccepted, 'duplicate event is ignored');
  assert.ok(afterAccepted > burstCount);

  receiverNet.dispose(); receiver.match.dispose(); f.G.match = null;
  const reconnected = f.makeMatch({ networkId: 'battle-b', localId: 'p2' });
  reconnected.match.start(); reconnected.match.setState('playing');
  const newNet = f.G.netm, newRemote = reconnected.match.actors.find(a => a.nid === 101);
  newNet._play('p1', opening);
  assert.equal(newRemote.initialSpawn.phase, 'awaiting-owner');
  assert.equal(newRemote.net.sjTo, null, 'an old match packet cannot affect the reconnected match');
});

test('initial deployment stays isolated from boss, practice-range, no-bot and non-match menu lifecycles', t => {
  const boss = f.makeMatch(); t.after(f.disposeCurrent);
  boss.match.mode = 'boss'; boss.match.start();
  assert.equal(boss.match.initialSpawnSession, undefined);

  const range = f.makeMatch({ noBots: true });
  range.match.start();
  assert.equal(range.match.initialSpawnSession, undefined);
  assert.equal(range.match.actors.length, 1);

  const menu = f.makeMatch();
  f.G.mode = 'range'; menu.match.start();
  assert.equal(menu.match.initialSpawnSession, undefined);
});
