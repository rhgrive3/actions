import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { adaptIssue484 } from '../issue-484-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

async function createFixture({ apply484 = true } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };

  const context = vm.createContext({
    console,
    performance,
    Math: Object.create(Math),
    setTimeout,
    clearTimeout,
    localStorage,
  });
  const modules = new Map();

  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }

  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    let source = file.startsWith(UPSTREAM + path.sep)
      ? adaptSource(relative, fs.readFileSync(file, 'utf8'))
      : fs.readFileSync(file, 'utf8');

    if (apply484 && file.startsWith(UPSTREAM + path.sep)) {
      source = adaptIssue484(relative, source);
    }

    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }

  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/player.js';
    export * from './inkwave-public/src/net/netmatch.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * as THREE from 'three';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });

  await root.link((spec, from) => load(resolve(spec, from.identifier)));
  await root.evaluate();

  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB, SPECIALS } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player);
  Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) {
    api[install](api, profile);
  }

  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0, spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }] };
  G.time = 0;
  G.physics = {
    los: () => true,
    raycast: (_a, _b, _c, h) => { h.hit = false; return h; },
    groundProbe: () => ({ hit: true, y: 0, normal: new THREE.Vector3(0, 1, 0) })
  };
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true };

  class Character {
    constructor() { this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {}
    setHurt() {}
    setWeapon() {}
  }

  function setLocalLoadout(loadout) {
    store.set('inkwave.splatoon3.gear.v1', JSON.stringify(loadout));
  }

  function make(team = 0, name = 'fixture', weapon = 'charger') {
    const a = new api.Actor({ team, name, weapon, CharacterClass: Character });
    a.grounded = true;
    a.ground.hit = true;
    a.ground.face = 0;
    a._spawnBarrier = () => {};
    a._finishFrame = () => {};
    a._integrate = () => {};
    return a;
  }

  return { ...api, profile, make, setLocalLoadout };
}

// ---------------------------------------------------------------------------
// Test 1: Adapter syntax and connections
// ---------------------------------------------------------------------------
test('issue-484 adapter transforms Actor and NetMatch with exact connections', () => {
  const actorSrc = fs.readFileSync(path.join(UPSTREAM, 'src/game/actor.js'), 'utf8');
  const netSrc = fs.readFileSync(path.join(UPSTREAM, 'src/net/netmatch.js'), 'utf8');

  const patchedActor = adaptIssue484('src/game/actor.js', actorSrc);
  assert.ok(patchedActor.includes('this.s3SpecialCost ?? this.weapon.specialCost'));
  assert.ok(patchedActor.includes('if (this.remote && this.s3SpecialReady !== undefined)'));

  const patchedNet = adaptIssue484('src/net/netmatch.js', netSrc);
  assert.ok(patchedNet.includes('specialReady: 1048576'));
  assert.ok(patchedNet.includes('if (a.specialReady?.()) f |= F.specialReady;'));
  assert.ok(patchedNet.includes('spCost: s[21]'));
  assert.ok(patchedNet.includes('a.s3SpecialReady = !!(f & F.specialReady)'));
  assert.ok(patchedNet.includes('delete a.s3SpecialReady;'));
  assert.ok(patchedNet.includes('export { F as NET_FLAGS, WEAPONS as _W, packActor, unpackActor };'));

  // Non-matching file is passed through untouched
  assert.equal(adaptIssue484('src/config.js', 'const x = 1;'), 'const x = 1;');
});

// ---------------------------------------------------------------------------
// Test 2: Negative control (Unpatched reproduces bug)
// ---------------------------------------------------------------------------
test('negative control: unpatched INKWAVE loses special ready glow on remote client with Special Charge Up', async () => {
  const env = await createFixture({ apply484: false });
  const { make, setLocalLoadout, NetMatch } = env;

  // Configure local loadout with 10 AP Special Charge Up (1 main = 10 AP)
  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  // Create owner with charger (base specialCost = 180). With 10 AP (~1.0909x), effective cost is ~165
  const owner = make(0, 'owner', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 1;
  owner.owner = 'host';
  owner.reset();

  const ownerCost = owner.specialCost();
  assert.ok(ownerCost < 180, `Owner specialCost should be reduced by 10 AP gear, got ${ownerCost}`);
  assert.equal(Math.round(ownerCost), 165);

  // Fill owner gauge to its effective cost
  owner.special = ownerCost;
  assert.equal(owner.specialReady(), true, 'Owner should be specialReady at 165p');

  // Create remote peer session and NetMatch
  const fakeSession = { myId: 'peer', isHost: false, tr: { broadcast: () => {} } };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  // Remote proxy actor on observing peer (no peer gear data in session, base cost 180)
  const remoteProxy = make(0, 'remote-proxy', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 1;
  remoteProxy.owner = 'host';
  remoteProxy.reset();

  // On unpatched INKWAVE, remote proxy has base 180p cost
  assert.equal(remoteProxy.specialCost(), 180, 'Remote proxy has unadjusted 180p cost');

  // In unpatched INKWAVE, packActor only sends Math.round(a.special) = 165, no spCost, no specialReady flag
  const unpatchedSnapshot = [
    owner.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, // f: alive=1, no specialReady bit
    100, 100, Math.round(owner.special), 0, 0, 0, 0, 0, 0, 0
  ];

  // Feed into NetMatch on remote client
  nm._setupActor(remoteProxy);
  const sample = {
    t: 1.0,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, aimYaw: 0, aimPitch: 0,
    f: unpatchedSnapshot[10],
    hp: unpatchedSnapshot[11],
    ink: unpatchedSnapshot[12],
    sp: unpatchedSnapshot[13],
    ch: 0, turf: 0, tp: 0, wx: 0, wy: 0, wz: 0, lock: 0
  };

  remoteProxy.net.ready = true;
  remoteProxy.net.cur = sample;
  nm.applyRemote(remoteProxy, 0.05);

  // Verification of the bug:
  // Owner is ready (165 >= 165)
  assert.equal(owner.specialReady(), true);
  // BUT remote proxy evaluates (165 >= 180) -> FALSE!
  assert.equal(remoteProxy.specialReady(), false, 'UNPATCHED BUG: Remote proxy is NOT ready despite owner being ready');
  assert.ok(remoteProxy.specialFrac() < 1.0, 'UNPATCHED BUG: Remote proxy specialFrac is not 1.0');
});

// ---------------------------------------------------------------------------
// Test 3: Root acceptance (Patched INKWAVE with 10 AP Special Charge Up)
// ---------------------------------------------------------------------------
test('root acceptance: patched INKWAVE synchronizes specialReady and effective specialCost across peers (10 AP)', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch, packActor, unpackActor } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  const owner = make(0, 'owner', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 1;
  owner.owner = 'host';
  owner.reset();

  const ownerCost = owner.specialCost();
  assert.equal(Math.round(ownerCost), 165);

  // Fill owner gauge to 165p
  owner.special = ownerCost;
  assert.equal(owner.specialReady(), true);

  // Pack with patched packActor
  const packed = packActor(owner);
  assert.equal(packed[13], 165, 'Packed special points is 165');
  assert.equal(packed[21], 165, 'Packed specialCost is 165');
  assert.ok(packed[10] & 1048576, 'Packed flags has F.specialReady bit set');

  // Unpack with patched unpackActor
  const unpacked = unpackActor(packed, 1.0);
  assert.equal(unpacked.sp, 165);
  assert.equal(unpacked.spCost, 165);
  assert.ok(unpacked.f & 1048576);

  // Apply on remote proxy
  const fakeSession = { myId: 'peer', isHost: false, tr: { broadcast: () => {} } };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const remoteProxy = make(0, 'remote-proxy', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 1;
  remoteProxy.owner = 'host';
  remoteProxy.reset();

  nm._setupActor(remoteProxy);
  remoteProxy.net.ready = true;
  remoteProxy.net.cur = unpacked;
  nm.applyRemote(remoteProxy, 0.05);

  // Verification of the fix:
  assert.equal(remoteProxy.specialReady(), true, 'PATCHED: Remote proxy is specialReady');
  assert.equal(remoteProxy.specialCost(), 165, 'PATCHED: Remote proxy has synchronized specialCost (165)');
  assert.equal(remoteProxy.specialFrac(), 1.0, 'PATCHED: Remote proxy specialFrac is 1.0');

  // HUD match roster entry check
  const rosterEntry = {
    name: remoteProxy.name,
    weapon: remoteProxy.weaponId,
    alive: remoteProxy.alive,
    specialReady: remoteProxy.specialReady(),
    isSelf: remoteProxy.isLocal,
  };
  assert.equal(rosterEntry.specialReady, true, 'HUD roster displays specialReady glow for remote teammate');
});

// ---------------------------------------------------------------------------
// Test 4: Root acceptance with maximum 57 AP Special Charge Up
// ---------------------------------------------------------------------------
test('root acceptance: maximum 57 AP Special Charge Up synchronizes correctly', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch, packActor, unpackActor } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['specialCharge', 'specialCharge', 'specialCharge'] },
    { main: 'specialCharge', subs: ['specialCharge', 'specialCharge', 'specialCharge'] },
    { main: 'specialCharge', subs: ['specialCharge', 'specialCharge', 'specialCharge'] }
  ]);

  const owner = make(0, 'owner-57ap', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 2;
  owner.owner = 'host';
  owner.reset();

  const ownerCost = owner.specialCost();
  // 180 / 1.3 ≈ 138.46 -> 138
  assert.equal(Math.round(ownerCost), 138);

  owner.special = ownerCost;
  assert.equal(owner.specialReady(), true);

  const packed = packActor(owner);
  assert.equal(packed[13], 138);
  assert.equal(packed[21], 138);
  assert.ok(packed[10] & 1048576);

  const unpacked = unpackActor(packed, 2.0);
  const fakeSession = { myId: 'peer', isHost: false, tr: { broadcast: () => {} } };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const remoteProxy = make(0, 'remote-57ap', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 2;
  remoteProxy.owner = 'host';
  remoteProxy.reset();

  nm._setupActor(remoteProxy);
  remoteProxy.net.ready = true;
  remoteProxy.net.cur = unpacked;
  nm.applyRemote(remoteProxy, 0.05);

  assert.equal(remoteProxy.specialReady(), true);
  assert.equal(remoteProxy.specialCost(), 138);
  assert.equal(remoteProxy.specialFrac(), 1.0);
});

// ---------------------------------------------------------------------------
// Test 5: 0 AP regression protection
// ---------------------------------------------------------------------------
test('non-regression: 0 AP players maintain standard 180p threshold and exact fractional gauge', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch, packActor, unpackActor } = env;

  setLocalLoadout([
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  const owner = make(0, 'owner-0ap', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 3;
  owner.owner = 'host';
  owner.reset();

  assert.equal(owner.specialCost(), 180);

  // Half full (90p)
  owner.special = 90;
  assert.equal(owner.specialReady(), false);
  assert.equal(owner.specialFrac(), 0.5);

  let packed = packActor(owner);
  assert.equal(packed[13], 90);
  assert.equal(packed[21], 180);
  assert.equal((packed[10] & 1048576), 0, 'specialReady bit must not be set at 50% charge');

  let unpacked = unpackActor(packed, 1.0);
  const fakeSession = { myId: 'peer', isHost: false, tr: { broadcast: () => {} } };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const remoteProxy = make(0, 'remote-0ap', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 3;
  remoteProxy.owner = 'host';
  remoteProxy.reset();

  nm._setupActor(remoteProxy);
  remoteProxy.net.ready = true;
  remoteProxy.net.cur = unpacked;
  nm.applyRemote(remoteProxy, 0.05);

  assert.equal(remoteProxy.specialReady(), false);
  assert.equal(remoteProxy.specialCost(), 180);
  assert.equal(remoteProxy.specialFrac(), 0.5);

  // Full (180p)
  owner.special = 180;
  assert.equal(owner.specialReady(), true);

  packed = packActor(owner);
  assert.equal(packed[13], 180);
  assert.equal(packed[21], 180);
  assert.ok(packed[10] & 1048576);

  unpacked = unpackActor(packed, 2.0);
  remoteProxy.net.cur = unpacked;
  nm.applyRemote(remoteProxy, 0.05);

  assert.equal(remoteProxy.specialReady(), true);
  assert.equal(remoteProxy.specialCost(), 180);
  assert.equal(remoteProxy.specialFrac(), 1.0);
});

// ---------------------------------------------------------------------------
// Test 6: Complete special lifecycle (charging -> ready -> activation -> splat -> respawn)
// ---------------------------------------------------------------------------
test('lifecycle: special activation, death/splat, and respawn correctly reset readiness on remote client', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch, packActor, unpackActor } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  const owner = make(0, 'owner-lifecycle', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 4;
  owner.owner = 'host';
  owner.reset();

  const fakeSession = { myId: 'peer', isHost: false, tr: { broadcast: () => {} } };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const remoteProxy = make(0, 'remote-lifecycle', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 4;
  remoteProxy.owner = 'host';
  remoteProxy.reset();
  nm._setupActor(remoteProxy);
  remoteProxy.net.ready = true;

  function sync(t) {
    const packed = packActor(owner);
    const unpacked = unpackActor(packed, t);
    remoteProxy.net.cur = unpacked;
    nm.applyRemote(remoteProxy, 0.05);
  }

  // Phase 1: Reaching Ready
  owner.special = 165;
  sync(1.0);
  assert.equal(owner.specialReady(), true);
  assert.equal(remoteProxy.specialReady(), true);

  // Phase 2: Special Activation
  owner.specialActive = { id: 'slam' };
  assert.equal(owner.specialReady(), false, 'Owner specialReady is false during specialActive');
  sync(2.0);
  assert.equal(remoteProxy.specialActive !== null, true, 'Remote proxy recognizes specialActive');
  assert.equal(remoteProxy.specialReady(), false, 'Remote proxy specialReady is false during specialActive');

  // Phase 3: Splat / Death
  owner.specialActive = null;
  owner.alive = false;
  owner.special = Math.round(165 * 0.5); // 82
  assert.equal(owner.specialReady(), false, 'Dead owner is not specialReady');
  nm._remoteSplat(remoteProxy, null, 'splat');
  sync(3.0);
  assert.equal(remoteProxy.alive, false);
  assert.equal(remoteProxy.specialReady(), false, 'Dead remote proxy is not specialReady');

  // Phase 4: Respawn
  owner.alive = true;
  nm._remoteRespawn(remoteProxy);
  assert.equal(owner.specialReady(), false, 'Respawned owner with 82p is not specialReady');
  sync(4.0);
  assert.equal(remoteProxy.alive, true);
  assert.equal(remoteProxy.specialReady(), false, 'Respawned remote proxy with 82p is not specialReady');
});

// ---------------------------------------------------------------------------
// Test 7: Reconnection / Host Adoption (_adopt)
// ---------------------------------------------------------------------------
test('host adoption: _adopt clears s3SpecialReady and returns actor to local simulation', async () => {
  const env = await createFixture({ apply484: true });
  const { make, NetMatch } = env;

  const fakeSession = { myId: 'host', isHost: true, tr: { broadcast: () => {} } };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const actor = make(0, 'peer-actor', 'charger');
  actor.isLocal = false;
  actor.remote = true;
  actor.nid = 5;
  actor.owner = 'leaving-peer';
  nm._setupActor(actor);
  actor.s3SpecialReady = true;
  actor.weapon.specialCost = 165;
  actor.special = 165;

  assert.equal(actor.specialReady(), true);

  // Host adopts the actor
  nm._adopt(actor);

  assert.equal(actor.remote, false, 'Actor is no longer remote');
  assert.equal(actor.isBot, true, 'Actor became a bot');
  assert.equal(actor.s3SpecialReady, undefined, 's3SpecialReady was cleared');

  // Bot evaluates local specialReady()
  assert.equal(actor.specialReady(), true);
});

// ---------------------------------------------------------------------------
// Test 8: Practice Range / Offline isolation
// ---------------------------------------------------------------------------
test('offline isolation: single-player / practice range works without network artifacts', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  const player = make(0, 'offline-player', 'charger');
  player.isLocal = true;
  player.remote = false;
  player.reset();

  assert.equal(Math.round(player.specialCost()), 165);
  player.special = 100;
  assert.equal(player.specialReady(), false);
  player.special = 165;
  assert.equal(player.specialReady(), true);
  player.specialActive = { id: 'slam' };
  assert.equal(player.specialReady(), false);
});

// ---------------------------------------------------------------------------
// Test 9: Deterministic multi-rate Hermite sampling
// ---------------------------------------------------------------------------
test('deterministic interpolation: 30Hz, 60Hz, 120Hz preserves spCost across network timeline', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch, packActor, unpackActor } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    const owner = make(0, `owner-${hz}hz`, 'charger');
    owner.isLocal = true;
    owner.remote = false;
    owner.nid = 10 + hz;
    owner.owner = 'host';
    owner.reset();
    owner.special = 165;

    const packed = packActor(owner);
    const snap1 = unpackActor(packed, 0.0);
    const snap2 = unpackActor(packed, 0.05);

    const fakeSession = { myId: 'peer', isHost: false, tr: { broadcast: () => {} } };
    const nm = new NetMatch(fakeSession, { map: 'arena' });

    const remoteProxy = make(0, `remote-${hz}hz`, 'charger');
    remoteProxy.isLocal = false;
    remoteProxy.remote = true;
    remoteProxy.nid = 10 + hz;
    remoteProxy.owner = 'host';
    remoteProxy.reset();
    nm._setupActor(remoteProxy);

    remoteProxy.net.buf = [snap1, snap2];
    remoteProxy.net.ready = true;

    // Sample timeline
    const peer = nm._peer('host');
    peer.init = true;
    peer.off = 0;
    peer.delay = 0.02;
    peer.tr = 0.025;
    peer.lastTs = 0.05;

    nm._sample(remoteProxy, 0.025, dt);
    nm.applyRemote(remoteProxy, dt);

    assert.equal(remoteProxy.specialReady(), true, `${hz}Hz: Remote proxy must be specialReady`);
    assert.equal(remoteProxy.specialCost(), 165, `${hz}Hz: Remote proxy specialCost must be 165`);
    assert.equal(remoteProxy.specialFrac(), 1.0, `${hz}Hz: Remote proxy specialFrac must be 1.0`);
  }
});

// ---------------------------------------------------------------------------
// Test 10: Two-peer live NetMatch message round-trip
// ---------------------------------------------------------------------------
test('live NetMatch transport: host tick broadcast updates client proxy specialReady over synthetic connection', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  let hostToClient = null;
  const hostSession = {
    myId: 'host-id',
    isHost: true,
    tr: { broadcast: (msg) => { hostToClient = JSON.parse(JSON.stringify(msg)); } },
    _members: new Set(['host-id', 'client-id'])
  };
  const clientSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id'])
  };

  const hostNM = new NetMatch(hostSession, { map: 'arena' });
  const clientNM = new NetMatch(clientSession, { map: 'arena' });

  // Host local actor
  const hostActor = make(0, 'host-player', 'charger');
  hostActor.isLocal = true;
  hostActor.remote = false;
  hostActor.nid = 42;
  hostActor.owner = 'host-id';
  hostActor.reset();
  hostActor.special = 165; // Charged to 10 AP threshold

  // Client proxy actor
  const clientProxy = make(0, 'host-player', 'charger');
  clientProxy.isLocal = false;
  clientProxy.remote = true;
  clientProxy.nid = 42;
  clientProxy.owner = 'host-id';
  clientProxy.reset();

  const fakeMatch = { actors: [hostActor] };
  hostNM.bind(fakeMatch);

  const clientMatch = { actors: [clientProxy] };
  clientNM.bind(clientMatch);

  // Host sends tick
  hostNM.tickT = 0;
  hostNM.update(1 / 20);
  assert.ok(hostToClient, 'Host sent tick packet');
  assert.equal(hostToClient.k, 't');

  // Client receives tick
  clientNM.onMessage('host-id', hostToClient);

  // Advance client playback
  const peer = clientNM._peer('host-id');
  peer.tr = hostToClient.ts;
  clientNM.update(1 / 20);
  clientNM.applyRemote(clientProxy, 1 / 20);

  assert.equal(clientProxy.specialReady(), true, 'Client proxy received and applied specialReady');
  assert.equal(clientProxy.specialCost(), 165, 'Client proxy synchronized specialCost to 165');
  assert.equal(clientProxy.specialFrac(), 1.0, 'Client proxy specialFrac is 1.0');
});

