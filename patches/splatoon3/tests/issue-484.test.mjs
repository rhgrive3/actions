import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
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

// Legacy here means the original 21-value actor tuple, with the current main's
// existing authenticated life envelope. #484 must not weaken epoch admission.
function receiveFixtureSnapshot(net, sender, message) {
  const life = Object.fromEntries(message.a.map(sample => [sample[0], net.byNid.get(sample[0])?.netLife ?? 0]));
  net.onMessage(sender, { l: life, ...message });
}

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
      source = adaptQualitySource(relative, adaptReliability(relative, adaptTouchLayout(relative, source)));
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
  const netSrc = adaptSource('src/net/netmatch.js', fs.readFileSync(path.join(UPSTREAM, 'src/net/netmatch.js'), 'utf8'));

  const patchedActor = adaptIssue484('src/game/actor.js', actorSrc);
  assert.ok(patchedActor.includes('if (this.remote && typeof this.s3SpecialCost === \'number\''));
  assert.ok(patchedActor.includes('if (this.remote && this.s3SpecialReady !== undefined)'));
  assert.ok(!patchedActor.includes('- 0.01'), 'Must not contain -0.01 epsilon');

  const patchedNet = adaptIssue484('src/net/netmatch.js', netSrc);
  assert.ok(patchedNet.includes('specialReady: 67108864'));
  assert.ok(patchedNet.includes('if (a.specialReady?.()) f |= F.specialReady;'));
  assert.ok(patchedNet.includes('snap.spCost = d.sc?.[a.nid]'));
  assert.ok(!patchedNet.includes('spCost: s[21]'), 'tuple slot21 remains available for existing statistics extensions');
  assert.ok(patchedNet.includes('o.spCost = a.spCost;'));
  assert.ok(patchedNet.includes('a.s3SpecialReady = !!(f & F.specialReady)'));
  assert.ok(patchedNet.includes('victim.s3SpecialReady = false;'));
  assert.ok(patchedNet.includes('a.s3SpecialReady = false;'));
  assert.ok(!patchedNet.includes('a.weapon.specialCost ='), 'applyRemote must never write to weapon.specialCost');
  assert.ok(patchedNet.includes('export { F as NET_FLAGS, WEAPONS as _W };'), 'Must not add synthetic pack/unpack exports');

  // Verify compatibility when parent composition invokes #482 first
  const netSrcWith482 = netSrc.replace(
    '    a.net.spawnPending = true;',
    '    a.net.spawnPending = true;\n    a.lastAttacker = null; a.lastAttackerHitAge = 99;'
  );
  const patchedNet482Compatible = adaptIssue484('src/net/netmatch.js', netSrcWith482);
  assert.ok(patchedNet482Compatible.includes('a.net.spawnPending = true;\n    delete a.s3SpecialCost;\n    a.s3SpecialReady = false;\n    a.lastAttacker = null;'), 'Must compose cleanly after #482');

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
  assert.equal(hostPacket.a[0].length, 22, 'Current writer includes its existing special-use count slot');

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
  assert.equal(hostPacket.a[0].length, 22, 'current actor tuple and special-use slot are unchanged');
  assert.equal(Math.round(hostPacket.sc[owner.nid]), 165, 'named sidecar carries effective cost');
  assert.ok(hostPacket.a[0][10] & 67108864, 'Flags contain specialReady bit');

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
  const transmittedCost = hostPacket.sc[owner.nid];
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

  // 1. Legacy 21-element snapshot with 180 special (no cost sidecar, no specialReady bit)
  const legacy21Snapshot = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, // f: grounded=1, no specialReady
    100, 100, 180, 0, 50, 0, 0, 0, 0, 0     // 21 elements total (indices 0..20)
  ];
  assert.equal(legacy21Snapshot.length, 21);

  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.0, a: [legacy21Snapshot] });
  const peer = nm._peer('host-id');
  peer.tr = 1.0;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  // Proves absence of valid cost falls back to native readiness (180 >= 180) -> true
  assert.equal(proxy.specialCost(), 180, 'Legacy sample uses base weapon cost 180');
  assert.equal(proxy.s3SpecialCost, undefined, 'No presentation cost set');
  assert.equal(proxy.s3SpecialReady, undefined, 'No presentation ready set');
  assert.equal(proxy.specialReady(), true, 'Legacy 180p sample MUST be ready (must not force false!)');

  // Unrelated tuple extensions (PR328 stats.specials at slot21) are opaque to cost.
  const countedLegacy = [...legacy21Snapshot, 3];
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.025, a: [countedLegacy] });
  peer.tr = 1.025;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);
  assert.equal(proxy.specialCost(), 180, 'stats count at tuple slot21 cannot become a gameplay/display cost');
  assert.equal(proxy.s3SpecialCost, undefined);


  // When legacy special is 100p (< 180p), native readiness returns false
  legacy21Snapshot[13] = 100;
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.05, a: [legacy21Snapshot] });
  peer.tr = 1.05;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);
  assert.equal(proxy.specialReady(), false, 'Legacy 100p sample evaluates native false');

  // 2. Test invalid/corrupt cost sidecars: NaN, Infinity, -50, "165", null, {}
  const corruptValues = [NaN, Infinity, -Infinity, -50, 0, '165', null, {}];
  let ts = 1.1;
  for (const badCost of corruptValues) {
    ts += 0.05;
    const corruptSnapshot = [
      proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      100, 100, 180, 0, 50, 0, 0, 0, 0, 0, badCost
    ];
    receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts, sc: { [proxy.nid]: badCost }, a: [corruptSnapshot] });
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

  // Step 1: Original tuple plus named cost sidecar and ready flag
  const newSnapshot = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 | 67108864,
    100, 100, 165, 0, 50, 0, 0, 0, 0, 0, 165
  ];
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.0, sc: { [proxy.nid]: 165 }, a: [newSnapshot] });
  peer.tr = 1.0;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  assert.equal(proxy.specialCost(), 165);
  assert.equal(proxy.specialReady(), true);

  // Step 2: Legacy 21-element packet arrives with 100p (no cost sidecar)
  const legacySnapshot = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    100, 100, 100, 0, 50, 0, 0, 0, 0, 0
  ];
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.05, a: [legacySnapshot] });
  peer.tr = 1.05;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  // Overrides cleared, falls back to native base 180p
  assert.equal(proxy.specialCost(), 180);
  assert.equal(proxy.specialReady(), false);

  // Step 3: Legacy packet with 180p arrives -> native readiness true
  legacySnapshot[13] = 180;
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.1, a: [legacySnapshot] });
  peer.tr = 1.1;
  nm.update(1 / 20);
  nm.applyRemote(proxy, 1 / 20);

  assert.equal(proxy.specialCost(), 180);
  assert.equal(proxy.specialReady(), true);

  // Step 4: New packet arrives again -> resumes new protocol
  newSnapshot[10] = 1; // not ready
  newSnapshot[13] = 80;
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.15, sc: { [proxy.nid]: 165 }, a: [newSnapshot] });
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
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 | 67108864,
    100, 100, 165, 0, 50, 0, 0, 0, 0, 0, 165
  ];

  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.0, sc: { [proxy.nid]: 180 }, a: [snap0] });
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.1, sc: { [proxy.nid]: 165 }, a: [snap1] });

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
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 | 67108864,
    100, 100, 165, 0, 50, 0, 0, 0, 0, 0, 165
  ];
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 2.0, sc: { [proxy.nid]: 165 }, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1);

  // 2. Late/out-of-order packet at ts=1.5 (older than newest in buffer)
  receiveFixtureSnapshot(nm, 'host-id', { k: 't', ts: 1.5, sc: { [proxy.nid]: 165 }, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1, 'Late packet must be discarded');

  // 3. Non-authoritative packet from 'impostor-id' (owner is 'host-id')
  receiveFixtureSnapshot(nm, 'impostor-id', { k: 't', ts: 2.1, sc: { [proxy.nid]: 165 }, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1, 'Impostor packet must be discarded');

  nm.onMessage('host-id', { k: 't', ts: 2.2, sc: { [proxy.nid]: 165 }, a: [validSnap] });
  assert.equal(proxy.net.buf.length, 1, 'Missing existing life envelope must still be rejected');
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
    if (ts !== undefined) hostPacket.ts = ts;
    clientNM.onMessage('host-id', hostPacket);
    const peer = clientNM._peer('host-id');
    peer.tr = hostPacket.ts;
    clientNM.update(1 / 20);
    clientNM.applyRemote(proxy, 1 / 20);
  }

  // Phase 1: Charge to ready and full gauge
  owner.special = owner.specialCost(); // 165p with 10 AP
  assert.equal(owner.specialReady(), true);
  sync(1.0);
  assert.equal(proxy.specialReady(), true);
  owner.special = 180; // full 180p gauge preserved across death
  sync(1.02);
  assert.equal(proxy.special, 180);
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
  assert.equal(proxy.s3SpecialReady, false, 's3SpecialReady must be explicitly false while dead');
  assert.equal(proxy.s3SpecialCost, undefined, 's3SpecialCost must be cleared on remote splat');

  // Phase 4: Respawn before next snapshot
  // Native _remoteSplat does NOT halve proxy.special, so proxy.special preserves the old full gauge.
  const oldFullGauge = proxy.special;
  assert.equal(oldFullGauge >= proxy.specialCost(), true, 'proxy preserves old full gauge before first packet');

  owner.alive = true;
  owner.special = 82; // halved on splat on owner
  clientNM._remoteRespawn(proxy);

  // CRITICAL NATIVE ASSERTION: immediately after _remoteRespawn BEFORE sync/packet
  assert.equal(proxy.alive, true, 'proxy is alive immediately after _remoteRespawn');
  assert.equal(proxy.special, oldFullGauge, 'old full gauge is preserved on proxy before first packet');
  assert.equal(proxy.s3SpecialCost, undefined, 'presentation cost must be cleared on remote respawn');
  assert.equal(proxy.s3SpecialReady, false, 'readiness must remain explicitly false through death/respawn until live packet');
  assert.equal(proxy.specialReady(), false, 'specialReady must NOT flash ready before first packet arrives');

  // Genuine next alive snapshot arrives (post-respawn owner state: special=82, not ready)
  sync(1.1);
  assert.equal(proxy.alive, true);
  assert.equal(proxy.special, 82, 'special points updated to post-respawn owner value');
  assert.equal(proxy.s3SpecialReady, false, 'presentation readiness remains false for 82p');
  assert.equal(proxy.specialReady(), false);

  // Then verify genuine next alive/ready packet recovers readiness
  owner.special = owner.specialCost();
  assert.equal(owner.specialReady(), true);
  sync(1.15);
  assert.equal(proxy.alive, true);
  assert.equal(proxy.s3SpecialReady, true);
  assert.equal(proxy.specialReady(), true, 'genuine next alive/ready packet recovers readiness');

  // Phase 5: Legacy snapshot fallback restores native evaluation after death/respawn
  clientNM._remoteSplat(proxy, null, 'splat');
  clientNM._remoteRespawn(proxy);
  assert.equal(proxy.specialReady(), false, 'remains false immediately after second respawn before packet');

  // Legacy snapshot arrives without spCost (21 elements) with owner at 82p (< 180p)
  const legacySnap = [
    proxy.nid, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    100, 100, 82, 0, 50, 0, 0, 0, 0, 0
  ];
  receiveFixtureSnapshot(clientNM, 'host-id', { k: 't', ts: 1.2, a: [legacySnap] });
  clientNM._peer('host-id').tr = 1.2;
  clientNM.update(1 / 20);
  clientNM.applyRemote(proxy, 1 / 20);
  assert.equal(proxy.s3SpecialCost, undefined);
  assert.equal(proxy.s3SpecialReady, undefined, 'legacy sample clears s3SpecialReady to restore native evaluation');
  assert.equal(proxy.specialReady(), false, '82p in legacy evaluated as not ready');

  // Legacy owner charges up to 180p (native cost)
  legacySnap[13] = 180;
  receiveFixtureSnapshot(clientNM, 'host-id', { k: 't', ts: 1.25, a: [legacySnap] });
  clientNM._peer('host-id').tr = 1.25;
  clientNM.update(1 / 20);
  clientNM.applyRemote(proxy, 1 / 20);
  assert.equal(proxy.specialReady(), true, 'legacy snapshot fallback restored native evaluation to ready at 180p');
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
