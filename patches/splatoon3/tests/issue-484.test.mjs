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
  assert.ok(patchedActor.includes('if (this.remote && typeof this.s3SpecialCost === \'number\''));
  assert.ok(patchedActor.includes('if (this.remote && this.s3SpecialReady !== undefined)'));
  assert.ok(!patchedActor.includes('- 0.01'), 'Must not contain -0.01 epsilon');

  const patchedNet = adaptIssue484('src/net/netmatch.js', netSrc);
  assert.ok(patchedNet.includes('specialReady: 1048576'));
  assert.ok(patchedNet.includes('if (a.specialReady?.()) f |= F.specialReady;'));
  assert.ok(patchedNet.includes('spCost: s[21]'));
  assert.ok(patchedNet.includes('o.spCost = a.spCost;'));
  assert.ok(patchedNet.includes('a.s3SpecialReady = !!(f & F.specialReady)'));
  assert.ok(patchedNet.includes('delete a.s3SpecialCost;'));
  assert.ok(patchedNet.includes('delete a.s3SpecialReady;'));
  assert.ok(!patchedNet.includes('a.weapon.specialCost ='), 'applyRemote must never write to weapon.specialCost');
  assert.ok(patchedNet.includes('export { F as NET_FLAGS, WEAPONS as _W };'), 'Must not add synthetic pack/unpack exports');

  // Non-matching file is passed through untouched
  assert.equal(adaptIssue484('src/config.js', 'const x = 1;'), 'const x = 1;');
});

// ---------------------------------------------------------------------------
// Test 2: Negative control (Unpatched reproduces bug)
// ---------------------------------------------------------------------------
test('negative control: unpatched INKWAVE loses special ready glow on remote client with Special Charge Up', async () => {
  const env = await createFixture({ apply484: false });
  const { make, setLocalLoadout, NetMatch } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  let hostPacket = null;
  const hostSession = {
    myId: 'host-id',
    isHost: true,
    tr: { broadcast: (msg) => { hostPacket = JSON.parse(JSON.stringify(msg)); } },
    _members: new Set(['host-id', 'client-id']),
  };
  const clientSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };

  const hostNM = new NetMatch(hostSession, { map: 'arena' });
  const clientNM = new NetMatch(clientSession, { map: 'arena' });

  const owner = make(0, 'owner', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 1;
  owner.owner = 'host-id';
  owner.reset();

  const ownerCost = owner.specialCost();
  assert.ok(ownerCost < 180, `Owner specialCost should be reduced by 10 AP gear, got ${ownerCost}`);
  assert.equal(Math.round(ownerCost), 165);

  // Fill owner gauge to its effective cost
  owner.special = ownerCost;
  assert.equal(owner.specialReady(), true, 'Owner should be specialReady at 165p');

  const remoteProxy = make(0, 'remote-proxy', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 1;
  remoteProxy.owner = 'host-id';
  remoteProxy.reset();

  hostNM.bind({ actors: [owner] });
  clientNM.bind({ actors: [remoteProxy] });

  // Host sends tick
  hostNM.tickT = 0;
  hostNM.update(1 / 20);
  assert.ok(hostPacket);
  assert.equal(hostPacket.a[0].length, 21, 'Unpatched snapshot has only 21 elements');

  // Client receives tick
  clientNM.onMessage('host-id', hostPacket);
  const peer = clientNM._peer('host-id');
  peer.tr = hostPacket.ts;
  clientNM.update(1 / 20);
  clientNM.applyRemote(remoteProxy, 1 / 20);

  // Verification of the bug:
  assert.equal(owner.specialReady(), true);
  assert.equal(remoteProxy.specialReady(), false, 'UNPATCHED BUG: Remote proxy is NOT ready despite owner being ready');
  assert.ok(remoteProxy.specialFrac() < 1.0, 'UNPATCHED BUG: Remote proxy specialFrac is not 1.0');
});

// ---------------------------------------------------------------------------
// Test 3: Root acceptance (10 AP Special Charge Up) via real tick transport
// ---------------------------------------------------------------------------
test('root acceptance: patched INKWAVE synchronizes specialReady and effective specialCost across peers (10 AP)', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  let hostPacket = null;
  const hostSession = {
    myId: 'host-id',
    isHost: true,
    tr: { broadcast: (msg) => { hostPacket = JSON.parse(JSON.stringify(msg)); } },
    _members: new Set(['host-id', 'client-id']),
  };
  const clientSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };

  const hostNM = new NetMatch(hostSession, { map: 'arena' });
  const clientNM = new NetMatch(clientSession, { map: 'arena' });

  const owner = make(0, 'owner', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 1;
  owner.owner = 'host-id';
  owner.reset();

  const ownerCost = owner.specialCost();
  assert.equal(Math.round(ownerCost), 165);

  owner.special = ownerCost;
  assert.equal(owner.specialReady(), true);

  const remoteProxy = make(0, 'remote-proxy', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 1;
  remoteProxy.owner = 'host-id';
  remoteProxy.reset();

  hostNM.bind({ actors: [owner] });
  clientNM.bind({ actors: [remoteProxy] });

  hostNM.tickT = 0;
  hostNM.update(1 / 20);
  assert.ok(hostPacket);
  assert.equal(hostPacket.a[0].length, 22, 'Patched snapshot has 22 elements');
  assert.equal(Math.round(hostPacket.a[0][21]), 165, 'Element 21 is effective specialCost');
  assert.ok(hostPacket.a[0][10] & 1048576, 'Flags contain specialReady bit');

  // Deliver tick to client
  clientNM.onMessage('host-id', hostPacket);
  const peer = clientNM._peer('host-id');
  peer.tr = hostPacket.ts;
  clientNM.update(1 / 20);
  clientNM.applyRemote(remoteProxy, 1 / 20);

  // Verification of the fix:
  assert.equal(remoteProxy.specialReady(), true, 'PATCHED: Remote proxy is specialReady');
  assert.equal(Math.round(remoteProxy.specialCost()), 165, 'PATCHED: Remote proxy has synchronized specialCost (165)');
  assert.ok(remoteProxy.specialFrac() > 0.99 && remoteProxy.specialFrac() <= 1.0, 'PATCHED: Remote proxy specialFrac is near full');

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
// Test 4: Fractional effective cost preservation (57 AP) without Math.round
// ---------------------------------------------------------------------------
test('fractional effective cost preservation: 57 AP does not round 180/1.3 = 138.4615 across tick transport', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['specialCharge', 'specialCharge', 'specialCharge'] },
    { main: 'specialCharge', subs: ['specialCharge', 'specialCharge', 'specialCharge'] },
    { main: 'specialCharge', subs: ['specialCharge', 'specialCharge', 'specialCharge'] }
  ]);

  let hostPacket = null;
  const hostSession = {
    myId: 'host-id',
    isHost: true,
    tr: { broadcast: (msg) => { hostPacket = JSON.parse(JSON.stringify(msg)); } },
    _members: new Set(['host-id', 'client-id']),
  };
  const clientSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };

  const hostNM = new NetMatch(hostSession, { map: 'arena' });
  const clientNM = new NetMatch(clientSession, { map: 'arena' });

  const owner = make(0, 'owner-57ap', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 2;
  owner.owner = 'host-id';
  owner.reset();

  const exactOwnerCost = owner.specialCost();
  // 180 / 1.3 ≈ 138.46153846153845
  assert.ok(Math.abs(exactOwnerCost - (180 / 1.3)) < 1e-4, 'Owner cost must be exact fraction ~138.4615');
  assert.notEqual(exactOwnerCost, 138, 'Owner cost must not be pre-rounded to 138');

  owner.special = exactOwnerCost;
  assert.equal(owner.specialReady(), true);

  const remoteProxy = make(0, 'remote-57ap', 'charger');
  remoteProxy.isLocal = false;
  remoteProxy.remote = true;
  remoteProxy.nid = 2;
  remoteProxy.owner = 'host-id';
  remoteProxy.reset();

  hostNM.bind({ actors: [owner] });
  clientNM.bind({ actors: [remoteProxy] });

  hostNM.tickT = 0;
  hostNM.update(1 / 20);
  assert.ok(hostPacket);

  // Appended cost must NOT be Math.round: it preserves the exact float
  const transmittedCost = hostPacket.a[0][21];
  assert.ok(Math.abs(transmittedCost - exactOwnerCost) < 1e-6, `Transmitted cost must preserve float, got ${transmittedCost}`);
  // Points tuple stays native-rounded (Math.round(138.4615) = 138)
  assert.equal(hostPacket.a[0][13], 138);

  clientNM.onMessage('host-id', hostPacket);
  const peer = clientNM._peer('host-id');
  peer.tr = hostPacket.ts;
  clientNM.update(1 / 20);
  clientNM.applyRemote(remoteProxy, 1 / 20);

  assert.equal(remoteProxy.specialReady(), true, 'Remote proxy is ready');
  assert.ok(Math.abs(remoteProxy.specialCost() - exactOwnerCost) < 1e-6, 'Remote proxy has unrounded exact cost');
  assert.ok(remoteProxy.specialFrac() > 0.99 && remoteProxy.specialFrac() <= 1.0);
});

// ---------------------------------------------------------------------------
// Test 5: Exact native authority on local actor (no -0.01 epsilon)
// ---------------------------------------------------------------------------
test('exact native authority: local readiness requires exact threshold without -0.01 early allowance', async () => {
  const env = await createFixture({ apply484: true });
  const { make } = env;

  const actor = make(0, 'local-exact', 'charger');
  actor.isLocal = true;
  actor.remote = false;
  actor.reset();

  // Base charger cost = 180
  assert.equal(actor.specialCost(), 180);

  // Negative test: 179.99 must NOT trigger readiness (must not allow early specials)
  actor.special = 179.99;
  assert.equal(actor.specialReady(), false, '179.99p must NOT trigger specialReady with 180p cost');

  // Exact 180.00 triggers readiness
  actor.special = 180.0;
  assert.equal(actor.specialReady(), true, '180.0p triggers specialReady');

  // Active special blocks ready
  actor.specialActive = { id: 'slam' };
  assert.equal(actor.specialReady(), false);
  actor.specialActive = null;

  // Dead actor is not ready
  actor.alive = false;
  assert.equal(actor.specialReady(), false, 'Dead actor must not be specialReady');
});

// ---------------------------------------------------------------------------
// Test 6: Host adoption & presentation isolation (bot threshold preserved)
// ---------------------------------------------------------------------------
test('host adoption: _adopt clears presentation overrides and preserves original bot weaponCost and threshold', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  let hostPacket = null;
  const hostSession = {
    myId: 'host-id',
    isHost: true,
    tr: { broadcast: (msg) => { hostPacket = JSON.parse(JSON.stringify(msg)); } },
    _members: new Set(['host-id', 'client-id']),
  };
  const clientSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };

  const hostNM = new NetMatch(hostSession, { map: 'arena' });
  const clientNM = new NetMatch(clientSession, { map: 'arena' });

  // Guest player with 10 AP gear (cost ~165)
  const guestActor = make(0, 'guest-player', 'charger');
  guestActor.isLocal = true;
  guestActor.remote = false;
  guestActor.nid = 7;
  guestActor.owner = 'host-id';
  guestActor.reset();
  guestActor.special = guestActor.specialCost();

  // Client proxy receiving guest's state
  const proxy = make(0, 'guest-player', 'charger');
  proxy.isLocal = false;
  proxy.remote = true;
  proxy.nid = 7;
  proxy.owner = 'host-id';
  proxy.reset();
  assert.equal(proxy.weapon.specialCost, 180, 'Original weapon cost before packets is 180');

  hostNM.bind({ actors: [guestActor] });
  clientNM.bind({ actors: [proxy] });

  // Send real discounted tick from guest to proxy
  hostNM.tickT = 0;
  hostNM.update(1 / 20);
  clientNM.onMessage('host-id', hostPacket);

  const peer = clientNM._peer('host-id');
  peer.tr = hostPacket.ts;
  clientNM.update(1 / 20);
  clientNM.applyRemote(proxy, 1 / 20);

  // While remote, proxy displays discounted presentation cost
  assert.equal(proxy.specialReady(), true);
  assert.equal(Math.round(proxy.specialCost()), 165);
  // CRITICAL CHECK: applyRemote MUST NOT have modified proxy.weapon.specialCost!
  assert.equal(proxy.weapon.specialCost, 180, 'proxy.weapon.specialCost MUST remain 180 authoritative bot cost');

  // Now simulate host adoption: guest disconnects and host adopts proxy
  clientNM._adopt(proxy);

  // Verify post-adoption state:
  assert.equal(proxy.remote, false, 'Proxy is no longer remote');
  assert.equal(proxy.isBot, true, 'Proxy is now an adopted bot');
  assert.equal(proxy.s3SpecialCost, undefined, 's3SpecialCost presentation override cleared');
  assert.equal(proxy.s3SpecialReady, undefined, 's3SpecialReady presentation override cleared');

  // Authority check: bot must use its original 180p weapon cost and 180p threshold
  assert.equal(proxy.weapon.specialCost, 180, 'Bot weapon.specialCost is strictly 180');
  assert.equal(proxy.specialCost(), 180, 'Bot specialCost() returns 180');

  // Even though special is ~165, bot is NOT ready because bot activation threshold is 180!
  assert.equal(proxy.specialReady(), false, 'Adopted bot with 165p is NOT ready (needs 180p)');

  // Bot charges 15 more points to 180
  proxy.addTurf(15);
  assert.ok(proxy.special >= 180);
  assert.equal(proxy.specialReady(), true, 'Adopted bot becomes ready only upon reaching full 180p');
});

// ---------------------------------------------------------------------------
// Test 7: Legacy 21-element snapshot & invalid field handling (fallback to native)
// ---------------------------------------------------------------------------
test('legacy transport & invalid fields: missing/corrupt cost falls back to native readiness without forcing false', async () => {
  const env = await createFixture({ apply484: true });
  const { make, NetMatch } = env;

  const fakeSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const proxy = make(0, 'remote-legacy', 'charger');
  proxy.isLocal = false;
  proxy.remote = true;
  proxy.nid = 8;
  proxy.owner = 'host-id';
  proxy.reset();
  nm.bind({ actors: [proxy] });

  // 1. Legacy 21-element snapshot with 180 special (no 22nd element, no specialReady bit)
  const legacy21Snapshot = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, // f: grounded=1, no specialReady
    100, 100, 180, 0, 50, 0, 0, 0, 0, 0     // 21 elements total (indices 0..20)
  ];
  assert.equal(legacy21Snapshot.length, 21);

  nm.onMessage('host-id', { k: 't', ts: 1.0, a: [legacy21Snapshot] });
  const peer = nm._peer('host-id');
  peer.tr = 1.0;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  // Proves absence of valid cost falls back to native readiness (180 >= 180) -> true
  assert.equal(proxy.specialCost(), 180, 'Legacy sample uses base weapon cost 180');
  assert.equal(proxy.s3SpecialCost, undefined, 'No presentation cost set');
  assert.equal(proxy.s3SpecialReady, undefined, 'No presentation ready set');
  assert.equal(proxy.specialReady(), true, 'Legacy 180p sample MUST be ready (must not force false!)');

  // When legacy special is 100p (< 180p), native readiness returns false
  legacy21Snapshot[13] = 100;
  nm.onMessage('host-id', { k: 't', ts: 1.05, a: [legacy21Snapshot] });
  peer.tr = 1.05;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);
  assert.equal(proxy.specialReady(), false, 'Legacy 100p sample evaluates native false');

  // 2. Test invalid/corrupt appended fields: NaN, Infinity, -50, "165", null, {}
  const corruptValues = [NaN, Infinity, -Infinity, -50, 0, '165', null, {}];
  let ts = 1.1;
  for (const badCost of corruptValues) {
    ts += 0.05;
    const corruptSnapshot = [
      proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      100, 100, 180, 0, 50, 0, 0, 0, 0, 0, badCost
    ];
    nm.onMessage('host-id', { k: 't', ts, a: [corruptSnapshot] });
    peer.tr = ts;
    nm.update(1 / 20);
    nm.applyRemote(proxy, 1 / 20);

    assert.equal(proxy.s3SpecialCost, undefined, `Corrupt cost ${badCost} must be rejected`);
    assert.equal(proxy.s3SpecialReady, undefined, `Corrupt cost ${badCost} must clear ready override`);
    assert.equal(proxy.specialCost(), 180, 'Falls back to native weapon cost');
    assert.equal(proxy.specialReady(), true, 'Falls back to native readiness without crashing');
  }
});

// ---------------------------------------------------------------------------
// Test 8: Mixed old and new sample stream
// ---------------------------------------------------------------------------
test('mixed stream: seamless transitions between new protocol and legacy samples', async () => {
  const env = await createFixture({ apply484: true });
  const { make, NetMatch } = env;

  const fakeSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const proxy = make(0, 'mixed-proxy', 'charger');
  proxy.isLocal = false;
  proxy.remote = true;
  proxy.nid = 9;
  proxy.owner = 'host-id';
  proxy.reset();
  nm.bind({ actors: [proxy] });
  const peer = nm._peer('host-id');

  // Step 1: New 22-element packet with 165p effective cost & ready flag
  const newSnapshot = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 | 1048576,
    100, 100, 165, 0, 50, 0, 0, 0, 0, 0, 165
  ];
  nm.onMessage('host-id', { k: 't', ts: 1.0, a: [newSnapshot] });
  peer.tr = 1.0;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  assert.equal(proxy.specialCost(), 165);
  assert.equal(proxy.specialReady(), true);

  // Step 2: Legacy 21-element packet arrives with 100p (no 22nd element)
  const legacySnapshot = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    100, 100, 100, 0, 50, 0, 0, 0, 0, 0
  ];
  nm.onMessage('host-id', { k: 't', ts: 1.05, a: [legacySnapshot] });
  peer.tr = 1.05;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  // Overrides cleared, falls back to native base 180p
  assert.equal(proxy.specialCost(), 180);
  assert.equal(proxy.specialReady(), false);

  // Step 3: Legacy packet with 180p arrives -> native readiness true
  legacySnapshot[13] = 180;
  nm.onMessage('host-id', { k: 't', ts: 1.1, a: [legacySnapshot] });
  peer.tr = 1.1;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  assert.equal(proxy.specialCost(), 180);
  assert.equal(proxy.specialReady(), true);

  // Step 4: New packet arrives again -> resumes new protocol
  newSnapshot[10] = 1; // not ready
  newSnapshot[13] = 80;
  nm.onMessage('host-id', { k: 't', ts: 1.15, a: [newSnapshot] });
  peer.tr = 1.15;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  assert.equal(proxy.specialCost(), 165);
  assert.equal(proxy.specialReady(), false);
});

// ---------------------------------------------------------------------------
// Test 9: Sampling alignment in Hermite interpolation (future cost does not leak early)
// ---------------------------------------------------------------------------
test('sampling alignment: Hermite interpolation aligns cost with earlier snapshot flags, no future leak', async () => {
  const env = await createFixture({ apply484: true });
  const { make, NetMatch } = env;

  const fakeSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const proxy = make(0, 'hermite-proxy', 'charger');
  proxy.isLocal = false;
  proxy.remote = true;
  proxy.nid = 10;
  proxy.owner = 'host-id';
  proxy.reset();
  nm.bind({ actors: [proxy] });

  // Snapshot 0: t=1.0, spCost=180, sp=90, flags=1 (not ready)
  const snap0 = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    100, 100, 90, 0, 50, 0, 0, 0, 0, 0, 180
  ];
  // Snapshot 1: t=1.1, spCost=165, sp=165, flags=1 | specialReady (ready)
  const snap1 = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 | 1048576,
    100, 100, 165, 0, 50, 0, 0, 0, 0, 0, 165
  ];

  nm.onMessage('host-id', { k: 't', ts: 1.0, a: [snap0] });
  nm.onMessage('host-id', { k: 't', ts: 1.1, a: [snap1] });

  const peer = nm._peer('host-id');
  peer.init = true;
  peer.off = 0;
  peer.delay = 0.02;
  peer.lastTs = 1.1;

  // Sample midway at t = 1.05: Hermite interpolates between snap0 and snap1
  peer.tr = 1.05;
  nm._sample(proxy, 1.05, 1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  // During interpolation between 1.0 and 1.1, flags come from earlier snap0 (f=1, not ready).
  // Cost must be aligned with earlier flags (spCost = 180).
  // Future cost (165) and readiness (true) from snap1 MUST NOT leak early!
  assert.equal(proxy.specialReady(), false, 'Future readiness must not leak early during Hermite interpolation');
  assert.equal(proxy.specialCost(), 180, 'Sampled cost during interpolation must align with earlier sample (180)');

  // Advance playback time to t = 1.1 (at snap1)
  peer.tr = 1.1;
  nm._sample(proxy, 1.1, 1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  // Now at t=1.1, snap1 is active
  assert.equal(proxy.specialReady(), true, 'Ready upon reaching snap1');
  assert.equal(proxy.specialCost(), 165, 'Cost updated to 165 upon reaching snap1');
});

// ---------------------------------------------------------------------------
// Test 10: Late packets and non-authoritative packet rejection
// ---------------------------------------------------------------------------
test('admission checks: out-of-order and non-authoritative packets are rejected', async () => {
  const env = await createFixture({ apply484: true });
  const { make, NetMatch } = env;

  const fakeSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id', 'impostor-id']),
  };
  const nm = new NetMatch(fakeSession, { map: 'arena' });

  const proxy = make(0, 'admit-proxy', 'charger');
  proxy.isLocal = false;
  proxy.remote = true;
  proxy.nid = 11;
  proxy.owner = 'host-id';
  proxy.reset();
  nm.bind({ actors: [proxy] });

  // 1. Authoritative packet at ts=2.0
  const validSnap = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 | 1048576,
    100, 100, 165, 0, 50, 0, 0, 0, 0, 0, 165
  ];
  nm.onMessage('host-id', { k: 't', ts: 2.0, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1);

  // 2. Late/out-of-order packet at ts=1.5 (older than newest in buffer)
  nm.onMessage('host-id', { k: 't', ts: 1.5, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1, 'Late packet must be discarded');

  // 3. Non-authoritative packet from 'impostor-id' (owner is 'host-id')
  nm.onMessage('impostor-id', { k: 't', ts: 2.1, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1, 'Impostor packet must be discarded');
});

// ---------------------------------------------------------------------------
// Test 11: Complete actor lifecycle (charging -> ready -> activation -> splat -> respawn)
// ---------------------------------------------------------------------------
test('lifecycle: special activation, death/splat, and respawn correctly reset readiness on remote client', async () => {
  const env = await createFixture({ apply484: true });
  const { make, setLocalLoadout, NetMatch } = env;

  setLocalLoadout([
    { main: 'specialCharge', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] }
  ]);

  let hostPacket = null;
  const hostSession = {
    myId: 'host-id',
    isHost: true,
    tr: { broadcast: (msg) => { hostPacket = JSON.parse(JSON.stringify(msg)); } },
    _members: new Set(['host-id', 'client-id']),
  };
  const clientSession = {
    myId: 'client-id',
    isHost: false,
    hostId: 'host-id',
    tr: { broadcast: () => {} },
    _members: new Set(['host-id', 'client-id']),
  };

  const hostNM = new NetMatch(hostSession, { map: 'arena' });
  const clientNM = new NetMatch(clientSession, { map: 'arena' });

  const owner = make(0, 'owner-life', 'charger');
  owner.isLocal = true;
  owner.remote = false;
  owner.nid = 12;
  owner.owner = 'host-id';
  owner.reset();

  const proxy = make(0, 'proxy-life', 'charger');
  proxy.isLocal = false;
  proxy.remote = true;
  proxy.nid = 12;
  proxy.owner = 'host-id';
  proxy.reset();

  hostNM.bind({ actors: [owner] });
  clientNM.bind({ actors: [proxy] });

  function sync(ts) {
    hostNM.tickT = 0;
    hostNM.update(1 / 20);
    clientNM.onMessage('host-id', hostPacket);
    const peer = clientNM._peer('host-id');
    peer.tr = hostPacket.ts;
    clientNM.update(1 / 20);
    clientNM.applyRemote(proxy, 1 / 20);
  }

  // Phase 1: Charge to ready
  owner.special = owner.specialCost();
  assert.equal(owner.specialReady(), true);
  sync(1.0);
  assert.equal(proxy.specialReady(), true);

  // Phase 2: Special Activation
  owner.specialActive = { id: 'slam' };
  assert.equal(owner.specialReady(), false);
  sync(1.05);
  assert.equal(proxy.specialActive !== null, true);
  assert.equal(proxy.specialReady(), false);

  // Phase 3: Splat / Death
  owner.specialActive = null;
  owner.splat(null, 'splat');
  assert.equal(owner.alive, false);
  assert.equal(owner.specialReady(), false);

  clientNM._remoteSplat(proxy, null, 'splat');
  assert.equal(proxy.alive, false);
  assert.equal(proxy.specialReady(), false);

  // Phase 4: Respawn
  owner.alive = true;
  owner.special = 82; // halved on splat
  clientNM._remoteRespawn(proxy);
  sync(1.1);

  assert.equal(proxy.alive, true);
  assert.equal(proxy.specialReady(), false);
});

// ---------------------------------------------------------------------------
// Test 12: Practice Range / Offline isolation & exact authority
// ---------------------------------------------------------------------------
test('offline isolation: single-player / practice range works without network artifacts and enforces exact authority', async () => {
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

  const exactCost = player.specialCost();
  assert.equal(Math.round(exactCost), 165);

  // Negative authority check: player with 165.000p when cost is 165.001375 must NOT be ready!
  player.special = 165.0;
  assert.equal(player.specialReady(), false, 'Strict authority: 165.0 is less than 165.001375 and must NOT trigger ready');

  // Exact threshold reached via inking turf
  player.addTurf(200);
  assert.equal(player.special, exactCost);
  assert.equal(player.specialReady(), true, 'Ready upon reaching exact cost via turf addition');

  // Special active blocks ready
  player.specialActive = { id: 'slam' };
  assert.equal(player.specialReady(), false);
});
