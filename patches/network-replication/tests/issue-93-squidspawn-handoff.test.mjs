import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const NETMATCH_EXPORT = "export { NetMatch } from './inkwave-public/src/net/netmatch.js';";
const HZ = [30, 60, 120];
const close = (actual, expected, message, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);

async function rig(hz) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: NETMATCH_EXPORT });
  const level = new f.Level({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 40 },
    spawnPads: [[0, 2.2, 0], [0, 2.2, 18]], spawnBarrier: 4.2,
    single: [{ kind: 'box', min: [-6, -1, -12], max: [6, 0, 12] }], half: [],
  });
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  f.G.projectiles = { list: [], bombs: [], clouds: [], beams: [], beamPool: [], sights: new Map(), scene: { remove() {} },
    _releaseBomb() {}, _releaseCloud() {} };
  f.G.time = 0;
  f.G.match = { mode: 'turf', opts: {}, playing: () => true, canRespawn: () => false };

  const actor = f.make('shooter');
  actor.nid = 7; actor.owner = 'p2'; actor.team = 0; actor.isLocal = true;
  actor.spawnAt(new f.THREE.Vector3(0, 0, 0), 0);
  actor.invuln = 0;
  const outgoing = [];
  const sender = new f.NetMatch({
    myId: 'p2', hostId: 'host', isHost: false, _members: new Map([['p2', 'Owner'], ['host', 'Host']]),
    tr: { broadcast(value) { outgoing.push(JSON.parse(JSON.stringify(value))); }, sendTo() {} },
  }, { id: 'fixture-match', map: 'normal', difficulty: 'normal' });
  const match = { actors: [actor], mode: 'turf', opts: {}, state: 'playing', time: 180, playing: () => true,
    canRespawn: () => false, removeActor() {} };
  sender.bind(match);
  f.G.match = match;

  const host = await fixture({ fullRuntime: true, productionComposition: true, extraExports: NETMATCH_EXPORT });
  const hostLevel = new host.Level({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 40 },
    spawnPads: [[0, 2.2, 0], [0, 2.2, 18]], spawnBarrier: 4.2,
    single: [{ kind: 'box', min: [-6, -1, -12], max: [6, 0, 12] }], half: [],
  });
  host.G.level = hostLevel;
  host.G.physics = new host.Physics(hostLevel);
  host.G.projectiles = { list: [], bombs: [], clouds: [], beams: [], beamPool: [], sights: new Map(), scene: { remove() {} },
    _releaseBomb() {}, _releaseCloud() {} };
  host.G.time = 0;
  host.G.match = { mode: 'turf', opts: {}, playing: () => true, canRespawn: () => false };
  const local = host.make('shooter');
  local.nid = 8; local.owner = 'host'; local.team = 1;
  const remote = host.make('shooter');
  remote.nid = 7; remote.owner = 'p2'; remote.team = 0;
  remote.spawnAt(new host.THREE.Vector3(0, 0, 0), 0);
  const receiver = new host.NetMatch({
    myId: 'host', hostId: 'host', isHost: true, _members: new Map([['host', 'Host'], ['p2', 'Owner']]),
    tr: { broadcast() {}, sendTo() {} },
  }, { id: 'fixture-match', map: 'normal', difficulty: 'normal' });
  const hostMatch = { actors: [local, remote], mode: 'turf', opts: {}, state: 'playing', time: 180, follower: true,
    playing: () => true, canRespawn: () => false, removeActor() {} };
  receiver.bind(hostMatch);
  host.G.match = hostMatch;
  receiver._remoteSplat(remote, null, 'shooter');
  receiver._remoteRespawn(remote);
  return { f, actor, sender, outgoing, host, remote, receiver, hz };
}

function step(f, actor, dt) {
  f.G.time += dt;
  actor.update(dt);
}

function publish(r) {
  r.sender.out.length = 0;
  r.sender._sendTick();
  const packet = r.outgoing.pop();
  assert.ok(packet?.a?.length === 1, 'the actual NetMatch owner published an actor snapshot');
  return packet;
}

function receive(r, packet) {
  r.receiver.onMessage('p2', structuredClone(packet));
  const peer = r.receiver.peers.get('p2');
  peer.tr = packet.ts; peer.sim = packet.u;
  r.receiver._sample(r.remote, packet.ts, 1 / r.hz);
  r.receiver.applyRemote(r.remote, 1 / r.hz);
}

function transfer(r) {
  r.receiver.onLeave('p2', false);
  assert.equal(r.remote.owner, 'host');
  assert.equal(r.remote.remote, false);
  assert.equal(r.remote.isBot, true);
}

function countActorEvents(f, actor, name) {
  return actor.character.events.filter(event => event[0] === name).length;
}

for (const hz of HZ) {
  test(`#93 aim snapshot handoff resumes its collision-supported target at ${hz}Hz without a second respawn`, async () => {
    const r = await rig(hz), dt = 1 / hz;
    const ownerEvents = { splat: 0, respawn: 0, launch: 0, land: 0 };
    const hostEvents = { splat: 0, respawn: 0, launch: 0, land: 0 };
    for (const [name, key] of [['splatted', 'splat'], ['respawn', 'respawn'], ['squidspawn:launch', 'launch'], ['squidspawn:land', 'land']])
      r.f.on(name, event => { if ((event.victim || event.actor) === r.actor) ownerEvents[key]++; });
    for (const [name, key] of [['splatted', 'splat'], ['respawn', 'respawn'], ['squidspawn:launch', 'launch'], ['squidspawn:land', 'land']])
      r.host.on(name, event => { if ((event.victim || event.actor) === r.remote) hostEvents[key]++; });

    r.actor.special = 80;
    r.actor.aimPoint.set(4, 0, 7);
    r.actor.splat(null, 'shooter');
    const finalizedGauge = r.actor.special;
    r.actor.respawn();
    assert.equal(r.actor.s3.squidSpawn.phase, 'aim');
    assert.equal(r.actor.invuln, Infinity);
    step(r.f, r.actor, dt);
    const packet = publish(r);
    assert.equal(packet.a[0][23][10][0], 'inkwave-squidspawn-v1');
    assert.equal(packet.a[0][23][10][1], 0, 'the existing aim phase is carried');
    assert.equal(packet.a[0][23][10][5], 'infinity', 'JSON-safe sidecar retains nonfinite aim invulnerability');
    const selected = packet.a[0][23][10][3];
    assert.ok(r.f.G.physics && r.actor.ground, 'the source uses the native level/physics composition');

    receive(r, packet);
    assert.equal(r.remote.s3.squidSpawn, undefined, 'the proxy does not author or advance Squid Spawn state');
    transfer(r);
    assert.equal(r.remote.s3.squidSpawn.phase, 'aim');
    assert.deepEqual([r.remote.s3.squidSpawn.target.x, r.remote.s3.squidSpawn.target.y, r.remote.s3.squidSpawn.target.z], selected);
    assert.equal(r.remote.special, finalizedGauge, 'the finalized post-splat gauge is authoritative');
    assert.equal(r.remote.invuln, Infinity);
    assert.equal(r.remote.s3.spawnArmor, null, 'aim has no finite launch armor');
    assert.equal(r.remote.damage(10, null, 'shooter'), false, 'aim cannot become vulnerable before launch');

    step(r.host, r.remote, dt);
    assert.equal(r.remote.s3.squidSpawn.phase, 'flight');
    assert.deepEqual([r.remote.s3.squidSpawn.to.x, r.remote.s3.squidSpawn.to.y, r.remote.s3.squidSpawn.to.z], selected);
    assert.deepEqual(ownerEvents, { splat: 1, respawn: 1, launch: 0, land: 0 });
    assert.deepEqual(hostEvents, { splat: 0, respawn: 0, launch: 1, land: 0 }, 'adoption itself emits no second spawn or splat');
    assert.equal(countActorEvents(r.host, r.remote, 'spawn'), 1, 'the resumed aim launches once');
    const armor = r.remote.s3.spawnArmor;
    assert.equal(armor.hp, r.host.profile.spawnArmor.hp);
    assert.equal(armor.remaining, r.host.profile.spawnArmor.duration);
    assert.equal(armor.breakRemaining, null);
    let elapsed = 0;
    while (r.remote.s3.squidSpawn && elapsed < 2) { step(r.host, r.remote, dt); elapsed += dt; }
    assert.equal(r.remote.s3.squidSpawn, undefined, 'native Actor._resolve confirmed touchdown');
    assert.equal(r.remote.grounded, true);
    assert.equal(r.remote.invuln, 0);
    assert.equal(r.remote.s3.spawnArmor, armor, 'touchdown does not restart the launch-owned armor clock');
    close(armor.remaining, r.host.profile.spawnArmor.duration - elapsed, 'aim launch armor consumes only owner flight time');
    assert.deepEqual(hostEvents, { splat: 0, respawn: 0, launch: 1, land: 1 });
    assert.deepEqual(ownerEvents, { splat: 1, respawn: 1, launch: 0, land: 0 });
  });

  test(`#93 flight snapshot handoff consumes the existing remaining clock and armor once at ${hz}Hz`, async () => {
    const r = await rig(hz), dt = 1 / hz;
    const counts = { sourceLaunch: 0, sourceLand: 0, hostLaunch: 0, hostLand: 0, hostRespawn: 0, hostSplat: 0 };
    r.f.on('squidspawn:launch', event => { if (event.actor === r.actor) counts.sourceLaunch++; });
    r.f.on('squidspawn:land', event => { if (event.actor === r.actor) counts.sourceLand++; });
    r.host.on('squidspawn:launch', event => { if (event.actor === r.remote) counts.hostLaunch++; });
    r.host.on('squidspawn:land', event => { if (event.actor === r.remote) counts.hostLand++; });
    r.host.on('respawn', event => { if (event.actor === r.remote) counts.hostRespawn++; });
    r.host.on('splatted', event => { if (event.victim === r.remote) counts.hostSplat++; });

    r.actor.special = 64.125;
    r.actor.aimPoint.set(4, 0, 7);
    r.actor.splat(null, 'shooter');
    const finalizedGauge = r.actor.special;
    r.actor.respawn();
    r.actor.intent.fire = true;
    step(r.f, r.actor, dt);
    r.actor.intent.fire = false;
    assert.equal(r.actor.s3.squidSpawn.phase, 'flight');
    for (let i = 0; i < Math.round(0.2 * hz); i++) step(r.f, r.actor, dt);
    const remaining = r.actor.s3.squidSpawn.duration - r.actor.s3.squidSpawn.t;
    const armorAtSnapshot = r.actor.s3.spawnArmor.remaining;
    const packet = publish(r);
    const spawnRow = packet.a[0][23][10];
    assert.equal(spawnRow[1], 1);
    close(spawnRow[2], remaining, 'flight remaining clock is sampled from the owner phase');
    assert.equal(spawnRow[5], r.actor.invuln);
    assert.equal(packet.a[0][23][4][4][1], armorAtSnapshot, 'the launch-owned armor state shares the existing protection slot');

    receive(r, packet);
    assert.equal(r.remote.s3.squidSpawn, undefined, 'remote timeline remains presentation-only');
    const handoffAge = 6 / 60;
    r.receiver.peers.get('p2').sim = packet.u + 6;
    transfer(r);
    assert.equal(r.remote.s3.squidSpawn.phase, 'flight');
    assert.deepEqual([r.remote.s3.squidSpawn.to.x, r.remote.s3.squidSpawn.to.y, r.remote.s3.squidSpawn.to.z], spawnRow[3]);
    assert.equal(r.remote.special, finalizedGauge);
    close(r.remote.s3.squidSpawn.duration, remaining - handoffAge, 'handoff re-bases the path using only fresh remaining flight time');
    close(r.remote.s3.spawnArmor.remaining, armorAtSnapshot - handoffAge, 'handoff ages the profile armor from the owner simulation clock');
    const armor = r.remote.s3.spawnArmor;
    close(r.remote.invuln, Math.max(0, spawnRow[5] - handoffAge), 'flight invulnerability ages with the same owner clock as the phase');
    assert.equal(r.remote.damage(10, null, 'shooter'), false, 'flight remains protected until native touchdown');

    let elapsed = 0;
    while (r.remote.s3.squidSpawn && elapsed < 2) { step(r.host, r.remote, dt); elapsed += dt; }
    assert.equal(r.remote.s3.squidSpawn, undefined, 'the adopted actor resolved one supported touchdown');
    assert.equal(r.remote.grounded, true);
    assert.equal(r.remote.invuln, 0);
    assert.equal(r.remote.s3.spawnArmor, armor, 'touchdown keeps the same finite armor object');
    close(armor.remaining, armorAtSnapshot - handoffAge - elapsed, 'armor is consumed through the adopted flight without restart');
    assert.deepEqual(counts, { sourceLaunch: 1, sourceLand: 0, hostLaunch: 0, hostLand: 1, hostRespawn: 0, hostSplat: 0 });
    assert.equal(r.actor.stats.deaths, 1, 'the source life was splatted once');
    assert.equal(r.remote.stats.deaths, 1, 'adoption did not replay the accepted splat');
    assert.equal(countActorEvents(r.host, r.remote, 'spawn'), 0, 'flight adoption did not replay the spawn trigger');
  });
}

test('#93 rejects stale, malformed, and unsupported Squid Spawn snapshots without advancing life or sequence', async () => {
  const r = await rig(60), dt = 1 / 60;
  r.actor.aimPoint.set(4, 0, 7);
  r.actor.splat(null, 'shooter'); r.actor.respawn(); step(r.f, r.actor, dt);
  const first = publish(r);
  receive(r, first);
  assert.equal(r.remote.net.buf.length, 1);
  const acceptedLife = r.remote.net.lastLife;
  const acceptedSequence = r.remote.net._adoptionSeq;

  const stale = structuredClone(first);
  stale.a[0][23][2]++;
  r.receiver.onMessage('p2', stale);
  assert.equal(r.remote.net.buf.length, 1, 'nonincreasing owner timestamp rejects a replay even with a higher sidecar sequence');

  const staleTick = structuredClone(first);
  staleTick.ts += 0.025; staleTick.a[0][23][2]++;
  r.receiver.onMessage('p2', staleTick);
  assert.equal(r.remote.net.buf.length, 1, 'a fresh packet timestamp cannot replay an already accepted owner simulation tick');

  const tickMismatch = structuredClone(first);
  tickMismatch.ts += 0.05; tickMismatch.u++;
  tickMismatch.a[0][23][2]++;
  r.receiver.onMessage('p2', tickMismatch);
  assert.equal(r.remote.net.buf.length, 1, 'a sidecar from another owner simulation tick is rejected');

  const malformed = structuredClone(first);
  malformed.ts += 0.075; malformed.u = first.a[0][23][3] + 1;
  malformed.a[0][23][2]++; malformed.a[0][23][3] = malformed.u;
  malformed.a[0][23][10][1] = 9;
  r.receiver.onMessage('p2', malformed);
  assert.equal(r.remote.net.buf.length, 1, 'an unknown phase tag is rejected after freshness checks pass');

  const emptyExtension = structuredClone(first);
  emptyExtension.ts += 0.0875; emptyExtension.u = first.a[0][23][3] + 2;
  emptyExtension.a[0][23][2]++; emptyExtension.a[0][23][3] = emptyExtension.u;
  emptyExtension.a[0][23][10] = null;
  r.receiver.onMessage('p2', emptyExtension);
  assert.equal(r.remote.net.buf.length, 1, 'an empty versioned extension is rejected as malformed');

  const unsupported = structuredClone(first);
  unsupported.ts += 0.1;
  unsupported.u = first.a[0][23][3] + 3;
  unsupported.a[0][23][3] = unsupported.u;
  unsupported.a[0][23][2]++;
  unsupported.a[0][23][10][3][1] += 1;
  r.receiver.onMessage('p2', unsupported);
  assert.equal(r.remote.net.buf.length, 1, 'native Actor._resolve rejects a target whose encoded height is unsupported');
  assert.equal(r.remote.net.lastLife, acceptedLife);
  assert.equal(r.remote.net._adoptionSeq, acceptedSequence);
});
