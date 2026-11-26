import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { webcrypto as _wc } from 'node:crypto';

if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: _wc.getRandomValues.bind(_wc),
    randomUUID: _wc.randomUUID.bind(_wc),
    subtle: _wc.subtle,
  };
}

import { RoomDurableObject } from '../../../server/src/index.js';
import { adaptResults } from '../results-adapter.mjs';
import { adaptStart } from '../start-adapter.mjs';
import { reliabilityIdentity } from '../adapter.mjs';
import { accountDevServer } from '../../../account/dev/vite-plugins.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MAIN_SRC = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/main.js'), 'utf8');

class FakeSocket {
  constructor() {
    this.sent = [];
    this.events = new Map();
    this.closed = null;
    this.bufferedAmount = 0;
    this.accepted = false;
    this._attachment = null;
  }
  accept() { this.accepted = true; }
  send(v) { this.sent.push(v); }
  addEventListener(k, f) { this.events.set(k, f); }
  emit(k, data) { this.events.get(k)?.({ data }); }
  close(code, reason) { this.closed = { code, reason }; this.emit('close'); }
  serializeAttachment(obj) { this._attachment = JSON.parse(JSON.stringify(obj)); }
  deserializeAttachment() { return this._attachment ? JSON.parse(JSON.stringify(this._attachment)) : null; }
  get id() { return JSON.parse(this.sent.find(x => x.startsWith('{"t":"welcome"'))).id; }
}

function section(source, start, end) {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i);
  assert.ok(i >= 0 && j > i, `expected section starting with ${start}`);
  return source.slice(i, j);
}

// -----------------------------------------------------------------------------
// P0-13: server/src/index.js — non-host b|{"k":"start"} blocked on ALL compats
// -----------------------------------------------------------------------------
test('P0-13: server blocks non-host start broadcasts across legacy and arbitrary compat rooms', () => {
  const room = new RoomDurableObject({}, {});
  room.compat = 'iw-gameplay-20261020-legacy-non-admission';
  const hostWs = new FakeSocket();
  const guestWs = new FakeSocket();
  room.handleSession(hostWs, 'Host');
  room.handleSession(guestWs, 'Guest');

  const hostBefore = hostWs.sent.length;
  const guestStart = JSON.stringify({ k: 'start', id: 'spoof-1', host: guestWs.id, roster: [] });
  guestWs.emit('message', `b|${guestStart}`);
  assert.equal(hostWs.sent.length, hostBefore, 'non-host start must not be forwarded to host on non-admission compat');

  const guestBefore = guestWs.sent.length;
  const hostStart = JSON.stringify({ k: 'start', id: 'legit-1', host: hostWs.id, roster: [] });
  hostWs.emit('message', `b|${hostStart}`);
  assert.ok(
    guestWs.sent.slice(guestBefore).some(m => m.includes('"k":"start"') && m.includes('"legit-1"')),
    'host start remains allowed on non-admission compat',
  );
});

// -----------------------------------------------------------------------------
// P1-22: results-adapter.mjs & start-adapter.mjs — netMatchEnd flow & recovery
// -----------------------------------------------------------------------------
function makeNetMatchEndHarness(adaptedSource, { endMatchImpl = () => true, netState = 'match', hasTr = true } = {}) {
  const methodSrc = section(adaptedSource, '  async netMatchEnd() {', '\n  // the room went away mid-match');
  const helperSrc = adaptedSource.includes('  _beginMatchFlow() {')
    ? section(adaptedSource, '  _beginMatchFlow() {', '\n  async _startMenuMatch')
    : '';
  const calls = [];
  let resolveFade;
  const roomTr = hasTr ? { id: 'room-1' } : null;
  const netm = { id: 'nm-1' };
  const net = {
    tr: roomTr,
    state: netState,
    match: netm,
    endMatch() {
      calls.push('endMatch');
      return endMatchImpl(this, game, G);
    },
  };
  const match = { state: 'results' };
  const G = { mode: 'match', net, netm };
  const Game = vm.runInNewContext(`class Game {\n${helperSrc}\n${methodSrc}\n}; Game`, { G, clearTimeout });
  const game = new Game();
  Object.assign(game, {
    match,
    _netEnding: false,
    _netEndT: 0,
    input: { exitLock() { calls.push('exitLock'); } },
    menus: {
      current: 'results',
      show(v) { calls.push(['show', v]); this.current = v; },
      hasScreen: () => true,
    },
    hud: {
      setVisible(v) { calls.push(['visible', v]); },
      hideSplatted() { calls.push('hideSplatted'); },
    },
    showcase: { hide() { calls.push('hidePodium'); } },
    _fade(to, ms) {
      calls.push(['fade', to, ms]);
      if (to === 1) return new Promise(r => { resolveFade = r; });
      return Promise.resolve();
    },
    _startAttract() { calls.push('attract'); },
    _playMusic(m) { calls.push(['music', m]); },
    quitToMenu() {
      calls.push('quitToMenu');
      if (typeof this._beginMatchFlow === 'function') this._beginMatchFlow();
    },
  });
  return { game, G, calls, resolveFade: () => resolveFade?.() };
}

test('P1-22: results-adapter recovers via quitToMenu when endMatch() returns false even if net.tr becomes null', async () => {
  const afterResults = adaptResults('src/main.js', MAIN_SRC);
  const h = makeNetMatchEndHarness(afterResults, {
    endMatchImpl(net) {
      net.tr = null;
      return false;
    },
  });
  const pending = h.game.netMatchEnd();
  h.resolveFade();
  await pending;
  assert.equal(h.calls.includes('quitToMenu'), true, 'quitToMenu must recover when endMatch returns false');
  assert.equal(h.calls.includes('attract'), false, 'must not continue lobby attract after failed endMatch');
  assert.equal(h.game._netEnding, false);
});

test('P1-22: start-adapter reserves flow after !net?.tr guard and gates failed endMatch recovery with flow.current()', async () => {
  const composed = adaptStart('src/main.js', adaptResults('src/main.js', MAIN_SRC));

  // 1. Early return when !net?.tr must NOT overwrite an existing _matchFlow (e.g. quitToMenu fade)
  const hGuard = makeNetMatchEndHarness(composed, { hasTr: false });
  const existingFlow = { sentinel: true };
  hGuard.game._matchFlow = existingFlow;
  await hGuard.game.netMatchEnd();
  assert.equal(hGuard.game._matchFlow, existingFlow, 'early return before _netEnding must preserve active flow');
  assert.equal(hGuard.game._netEnding, false);

  // 2. When endMatch returns false and flow.current() is still true, quitToMenu is called once
  const hRecover = makeNetMatchEndHarness(composed, {
    endMatchImpl() { return false; },
  });
  const pRecover = hRecover.game.netMatchEnd();
  hRecover.resolveFade();
  await pRecover;
  assert.equal(hRecover.calls.filter(c => c === 'quitToMenu').length, 1);
  assert.equal(hRecover.calls.includes('attract'), false);
  assert.equal(hRecover.game._netEnding, false);

  // 3. When endMatch already triggered a new flow (e.g. netMatchAborted -> quitToMenu), do not double-call quitToMenu
  const hAlreadyAborted = makeNetMatchEndHarness(composed, {
    endMatchImpl(_net, game) {
      game._beginMatchFlow();
      return false;
    },
  });
  const pAborted = hAlreadyAborted.game.netMatchEnd();
  hAlreadyAborted.resolveFade();
  await pAborted;
  assert.equal(hAlreadyAborted.calls.filter(c => c === 'quitToMenu').length, 0);
  assert.equal(hAlreadyAborted.game._netEnding, false);
});

// -----------------------------------------------------------------------------
// P1-23: practice-range/runtime/session.mjs — interruptSpecialForObjective
// -----------------------------------------------------------------------------
test('P1-23: RangeSession.setWeapon calls interruptSpecialForObjective on weapon change (including post-commit throw)', () => {
  const sessionSrc = fs.readFileSync(path.join(ROOT, 'patches/practice-range/runtime/session.mjs'), 'utf8');
  assert.match(sessionSrc, /import\s+\{\s*interruptSpecialForObjective\s*\}\s+from\s+['"]\.\.\/\.\.\/splatoon3\/runtime\/all-specials\.mjs['"]/);
  const setWeaponSrc = section(sessionSrc, '  setWeapon(id) {', '\n  resetPaint() {');

  const interrupted = [];
  class FakeProjectiles {}
  const G = { projectiles: new FakeProjectiles(), game: { api: { setLoadout() {} } } };
  const RangeSession = vm.runInNewContext(
    `class RangeSession {\n${setWeaponSrc}\n}; RangeSession`,
    {
      WEAPONS: { shooter: { name: 'Shooter' }, charger: { name: 'Charger' }, roller: { name: 'Roller' } },
      PLAYER: { inkMax: 100 },
      G,
      L: s => s,
      interruptSpecialForObjective(api, actor) { interrupted.push({ api, actor }); },
    },
  );

  const session = new RangeSession();
  const actor = {
    weaponId: 'shooter',
    ink: 10,
    special: 100,
    setWeapon(id) { this.weaponId = id; },
  };
  session.local = actor;
  session.hud = { toast() {} };

  // Same weapon: no-op
  session.setWeapon('shooter');
  assert.equal(interrupted.length, 0);

  // Different weapon: interrupts active special with { G, Projectiles }
  session.setWeapon('charger');
  assert.equal(interrupted.length, 1);
  assert.equal(interrupted[0].actor, actor);
  assert.equal(interrupted[0].api.G, G);
  assert.equal(interrupted[0].api.Projectiles, FakeProjectiles);

  // Downstream throw after committing weaponId still triggers finally cleanup
  actor.setWeapon = function (id) {
    this.weaponId = id;
    throw new Error('downstream setter failed');
  };
  assert.throws(() => session.setWeapon('roller'), /downstream setter failed/);
  assert.equal(interrupted.length, 2);
});

// -----------------------------------------------------------------------------
// P1-24: practice-range/runtime/sparring.mjs — unique slot/name/offset on eviction
// -----------------------------------------------------------------------------
test('P1-24: SparringBots assigns an unused slot, name, and lateral offset after eviction at SPARRING_MAX', () => {
  const sparringSrc = fs.readFileSync(path.join(ROOT, 'patches/practice-range/runtime/sparring.mjs'), 'utf8');
  const classSrc = section(sparringSrc, 'export class SparringBots {', '\n}\n').replace(/^export /, '') + '\n}';

  class FakeVec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  }
  class FakeActor {
    constructor(opts) {
      Object.assign(this, opts);
      this.alive = true;
      this.character = { root: {}, dispose() {}, trigger() {} };
    }
    spawnAt() {}
  }
  class StandDriver { reset() {} }
  const G = { level: { groundHeight: () => 0 }, scene: { add() {}, remove() {} } };
  const SparringBots = vm.runInNewContext(
    `${classSrc}; SparringBots`,
    {
      SPARRING_BEHAVIORS: ['static', 'move', 'combat'],
      SPARRING_MAX: 3,
      SPARRING_DISTANCE: 9,
      SPARRING_RESPAWN: 3,
      WEAPONS: { shooter: {} },
      WEAPON_ORDER: ['shooter'],
      THREE: { Vector3: FakeVec3 },
      _v: new FakeVec3(),
      Actor: FakeActor,
      BotBrain: StandDriver,
      StrafeDriver: StandDriver,
      StandDriver,
      G,
      emit() {},
      insightsOf: () => null,
      blankSparringStats: () => ({ damageTaken: 0, hitsTaken: 0, splats: 0, lastTtk: null, bestTtk: null, damageToPlayer: 0, attacks0: 0, landed0: 0 }),
    },
  );

  const session = {
    m: { actors: [], opts: { CharacterClass: null } },
    local: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
    time: 0,
  };
  const sb = new SparringBots(session);

  const b1 = sb.spawn({ weapon: 'shooter', behavior: 'static' });
  const b2 = sb.spawn({ weapon: 'shooter', behavior: 'static' });
  const b3 = sb.spawn({ weapon: 'shooter', behavior: 'static' });
  assert.deepEqual(Array.from(sb.bots, b => b.slot), [40, 41, 42]);
  assert.deepEqual(Array.from(sb.bots, b => b.name), ['Bot 1', 'Bot 2', 'Bot 3']);

  // Spawning 4th bot evicts b1 (slot 40) and must reuse slot 40 / Bot 1 / offset -2.2
  const b4 = sb.spawn({ weapon: 'shooter', behavior: 'static' });
  assert.equal(sb.bots.length, 3);
  assert.equal(new Set(sb.bots.map(b => b.slot)).size, 3, 'all active bot slots must be unique');
  assert.equal(b4.slot, 40);
  assert.equal(b4.name, 'Bot 1');
  assert.ok(Math.abs(b4.sparring.anchor.x - (-2.2)) < 1e-6);

  // Removing middle bot (slot 41) then spawning reuses slot 41 / Bot 2 / offset 0
  sb.remove(b2);
  const b5 = sb.spawn({ weapon: 'shooter', behavior: 'static' });
  assert.equal(b5.slot, 41);
  assert.equal(b5.name, 'Bot 2');
  assert.ok(Math.abs(b5.sparring.anchor.x - 0) < 1e-6);
  assert.equal(b1.alive, false);
  assert.equal(b3.alive, true);
});

// -----------------------------------------------------------------------------
// P1-25: account/dev/vite-plugins.mjs — directory guard & ReadStream error handler
// -----------------------------------------------------------------------------
test('P1-25: accountDevServer skips directory paths on /game-styles/ and handles ReadStream errors safely', async () => {
  const pluginSrc = fs.readFileSync(path.join(ROOT, 'account/dev/vite-plugins.mjs'), 'utf8');
  assert.match(pluginSrc, /stream\.on\('error'/);
  assert.equal((pluginSrc.match(/fs\.statSync\(f\)\.isFile\(\)/g) || []).length >= 3, true);

  const middlewares = [];
  const plugin = accountDevServer();
  await plugin.configureServer({
    config: { logger: { info() {}, warn() {}, error() {} } },
    middlewares: { use(fn) { middlewares.push(fn); } },
  });
  assert.equal(middlewares.length, 1);

  let nextCalled = false;
  const res = {
    statusCode: 0,
    headers: {},
    headersSent: false,
    setHeader(k, v) { this.headers[k] = v; },
    end() { this.ended = true; },
  };
  await middlewares[0]({ originalUrl: '/game-styles/', url: '/game-styles/', method: 'GET', headers: {} }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'directory request to /game-styles/ must fall through to next() instead of streaming a directory');
});

// -----------------------------------------------------------------------------
// P1-26: patches/reliability/adapter.mjs — lobby-guards.mjs in reliabilityIdentity
// -----------------------------------------------------------------------------
test('P1-26: reliabilityIdentity includes lobby-guards.mjs SHA-256 hash', () => {
  const id = reliabilityIdentity();
  assert.equal(Object.hasOwn(id, 'lobby-guards.mjs'), true);
  assert.match(id['lobby-guards.mjs'], /^[0-9a-f]{64}$/);
});

// -----------------------------------------------------------------------------
// P2-16: touch-layout/mobile.js focus trap & account/client/src/panel.js rate-limit lock
// -----------------------------------------------------------------------------
test('P2-16: mobile focus trap includes summary and account panel delete view honors rate-limit lock across sync()', () => {
  const mobileSrc = fs.readFileSync(path.join(ROOT, 'patches/touch-layout/mobile.js'), 'utf8');
  assert.match(mobileSrc, /querySelectorAll\('button, select, input, summary, \[tabindex="0"\]'\)/);

  const panelSrc = fs.readFileSync(path.join(ROOT, 'account/client/src/panel.js'), 'utf8');
  assert.match(panelSrc, /async function submit\(\{ btn, busyLabel, fields = \{\}, banner: bn, run, onLockChange \}\)/);
  assert.match(panelSrc, /onLockChange\?\.\(true\)/);
  assert.match(panelSrc, /if \(onLockChange\) onLockChange\(false\);\s*else btn\.disabled = false;/);
  assert.match(panelSrc, /let rateLimited = false;/);
  assert.match(panelSrc, /go\.disabled = rateLimited \|\| !matches\(\) \|\| !pw\.value;/);
  assert.match(panelSrc, /onLockChange:\s*\(v\)\s*=>\s*\{\s*rateLimited = v;\s*if \(!closed && ownerEpoch === viewEpoch\) sync\(\);\s*\}/);
});
