import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

// #512 two-peer contract: a remote human's opening Squid Spawn is owned by the
// owner. The receiver must not launch it from its own fallback aim; it mirrors
// the owner's replicated aim target, launch target and flight clock instead.
const NETMATCH_EXPORT = "export { NetMatch } from './inkwave-public/src/net/netmatch.js';";
const HZ = [30, 60, 120];
const close = (actual, expected, message, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
const samePoint = (actual, expected, message, tolerance = 1e-9) => {
  for (const key of ['x', 'y', 'z']) close(actual[key], expected[key], `${message} ${key}`, tolerance);
};

function stage(f) {
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
}

const CONFIG = { id: 'fixture-match', map: 'normal', difficulty: 'normal' };

// Owner peer: the human is local, so its aim is driven by its own input.
async function ownerPeer(hz) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: NETMATCH_EXPORT });
  stage(f);
  const actor = f.make('shooter');
  actor.nid = 7; actor.owner = 'p2'; actor.team = 0; actor.slot = 0; actor.isLocal = true;
  const outgoing = [];
  const netm = new f.NetMatch({
    myId: 'p2', hostId: 'host', isHost: false, _members: new Map([['p2', 'Owner'], ['host', 'Host']]),
    tr: { broadcast(value) { outgoing.push(JSON.parse(JSON.stringify(value))); }, sendTo() {} },
  }, CONFIG);
  const match = { actors: [actor], mode: 'turf', opts: {}, state: 'playing', time: 180, playing: () => true,
    canRespawn: () => false, removeActor() {} };
  netm.bind(match);
  f.G.match = match;
  return { f, actor, netm, outgoing, hz };
}

// Receiver peer: the same human is a remote proxy that only sees owner snapshots.
async function receiverPeer(hz) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: NETMATCH_EXPORT });
  stage(f);
  const remote = f.make('shooter');
  remote.nid = 7; remote.owner = 'p2'; remote.team = 0; remote.slot = 0; remote.isLocal = false;
  const netm = new f.NetMatch({
    myId: 'host', hostId: 'host', isHost: true, _members: new Map([['host', 'Host'], ['p2', 'Owner']]),
    tr: { broadcast() {}, sendTo() {} },
  }, CONFIG);
  const match = { actors: [remote], mode: 'turf', opts: {}, state: 'playing', time: 180, follower: true,
    playing: () => true, canRespawn: () => false, removeActor() {} };
  netm.bind(match);
  f.G.match = match;
  return { f, remote, netm, hz };
}

function step(peer, dt) {
  peer.f.G.time += dt;
  peer.actor.update(dt);
}

function publish(owner) {
  owner.netm.out.length = 0;
  owner.netm._sendTick();
  const packet = owner.outgoing.pop();
  assert.ok(packet?.a?.length === 1, 'the actual NetMatch owner published its local human snapshot');
  return packet;
}

function receive(receiver, packet, dt) {
  receiver.netm.onMessage('p2', structuredClone(packet));
  receiver.netm.update(dt);
  receiver.netm.applyRemote(receiver.remote, dt);
}

for (const hz of HZ) {
  test(`#512 ${hz} Hz: remote human opening Squid Spawn waits for the owner and mirrors its aim, launch and flight`, async () => {
    const dt = 1 / hz;
    const owner = await ownerPeer(hz);
    const receiver = await receiverPeer(hz);
    const launches = [];
    receiver.f.on('squidspawn:launch', ({ actor, initial, target }) => {
      if (actor === receiver.remote) launches.push({ initial, target: { ...target } });
    });
    assert.equal(receiver.remote.remote, true, 'receiver proxy is a remote actor');

    // The receiver has no owner snapshot yet: it must wait at the spawner rather
    // than launch to its own fallback point (the old centre-forward 7.5 m target).
    assert.equal(receiver.f.beginInitialSquidSpawn(receiver.remote), true);
    assert.equal(receiver.remote.s3.squidSpawn.phase, 'aim', 'remote human is not launched before owner replication');
    assert.equal(launches.length, 0, 'no launch event before owner replication');

    // Owner aims at a supported point inside the stage, without pressing FIRE yet.
    assert.equal(owner.f.beginInitialSquidSpawn(owner.actor), true);
    owner.actor.aimPoint.set(4, 0, 9);
    for (let i = 0; i < 3; i++) {
      step(owner, dt);
      receive(receiver, publish(owner), dt);
    }
    const ownerAim = owner.actor.s3.squidSpawn;
    assert.equal(ownerAim.phase, 'aim');
    assert.equal(receiver.remote.s3.squidSpawn?.phase, 'aim', 'receiver keeps the owner aim phase');
    samePoint(receiver.remote.s3.squidSpawn.target, ownerAim.target, 'receiver aim target mirrors owner');
    assert.equal(launches.length, 0, 'aiming alone does not launch on the receiver');

    // Owner presses FIRE: the same target and flight must appear on both peers.
    owner.actor.intent.fire = true;
    step(owner, dt);
    receive(receiver, publish(owner), dt);
    const ownerFlight = owner.actor.s3.squidSpawn;
    assert.equal(ownerFlight.phase, 'flight');
    const launchTarget = { ...ownerFlight.to };
    // The receiver samples owner snapshots with its normal interpolation delay,
    // so pump the owner's real snapshots until the sampled flight is visible.
    for (let i = 0; i < hz && receiver.remote.s3.squidSpawn?.phase !== 'flight'; i++) {
      step(owner, dt);
      receive(receiver, publish(owner), dt);
    }
    assert.equal(receiver.remote.s3.squidSpawn?.phase, 'flight', 'receiver enters flight from owner replication');
    assert.equal(owner.actor.s3.squidSpawn?.phase, 'flight', 'owner is still in its own flight window');
    samePoint(receiver.remote.s3.squidSpawn.to, launchTarget, 'receiver flight target mirrors owner');
    assert.equal(launches.length, 1, 'receiver emits exactly one launch');
    assert.equal(launches[0].initial, true);
    samePoint(launches[0].target, launchTarget, 'receiver launch event target mirrors owner');

    // The receiver's position comes from the owner's sampled path. Mid-flight it
    // must be on the owner's arc, not on the old fallback endpoint.
    for (let i = 0; i < Math.round(hz / 2) && owner.actor.s3.squidSpawn; i++) {
      step(owner, dt);
      receive(receiver, publish(owner), dt);
    }
    const origin = ownerFlight.from, dx = launchTarget.x - origin.x, dz = launchTarget.z - origin.z, len = Math.hypot(dx, dz);
    const offLine = Math.abs(dx * (receiver.remote.pos.z - origin.z) - dz * (receiver.remote.pos.x - origin.x)) / len;
    const fallbackX = 0, fallbackZ = 7.5;
    const offFallback = Math.abs((fallbackX - origin.x) * (receiver.remote.pos.z - origin.z) - (fallbackZ - origin.z) * (receiver.remote.pos.x - origin.x))
      / Math.hypot(fallbackX - origin.x, fallbackZ - origin.z);
    assert.ok(offLine < 0.25, `receiver mid-flight stays on the owner launch line (${offLine})`);
    assert.ok(offLine < offFallback, 'receiver mid-flight is closer to the owner line than the old fallback line');

    // Let the owner finish touchdown and let the receiver's sampled path catch up.
    for (let i = 0; i < hz * 4; i++) {
      if (owner.actor.s3.squidSpawn) step(owner, dt);
      receive(receiver, publish(owner), dt);
      if (!owner.actor.s3.squidSpawn && !receiver.remote.s3.squidSpawn) break;
    }
    assert.equal(owner.actor.s3.squidSpawn, undefined, 'owner completed touchdown');
    assert.equal(receiver.remote.s3.squidSpawn, undefined, 'receiver clears the opening state with the owner');
    assert.equal(launches.length, 1, 'touchdown does not add another launch');
    // The proxy's existing presentation correction decays after the state clears; idle
    // owner snapshots let it settle on the owner's landed position.
    for (let i = 0; i < hz * 2; i++) {
      receive(receiver, publish(owner), dt);
    }
    samePoint(receiver.remote.pos, owner.actor.pos, 'final receiver position matches owner landing', 1e-3);
    samePoint(owner.actor.pos, { x: launchTarget.x, y: launchTarget.y, z: launchTarget.z }, 'owner lands on the launched target', 1e-3);
  });
}

test('#512 remote opening bots keep their deterministic host-side launch on the receiver', async () => {
  const receiver = await receiverPeer(60);
  receiver.remote.isBot = true;
  receiver.remote.aimPoint.set(0, 0, 0);
  assert.equal(receiver.f.beginInitialSquidSpawn(receiver.remote), true);
  assert.equal(receiver.remote.s3.squidSpawn.phase, 'flight', 'bot replication still uses the shared deterministic launch');
  assert.equal(receiver.remote.s3.squidSpawn.ownerReplicated, undefined);
});
