import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const DT = 1 / 60;
const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

async function runtimeFixture() {
  const f = await fixture({ network: true, fullRuntime: true });
  const oldPhysics = f.G.physics;
  f.G.physics = {
    ...oldPhysics,
    groundProbe(_x, y, _z, up, down, _radius, out) {
      out.hit = y + up >= -1e-6 && y - down <= 1e-6;
      out.y = 0; out.normal.set(0, 1, 0); out.face = 0; out.block = -1;
      out.u = out.v = 0; out.center = true; out.grate = false;
      return out;
    },
    collideBody() { return { ceiling: false, wall: false, wallNormal: new f.THREE.Vector3() }; },
    raycast(_origin, _direction, _range, out) { out.hit = false; return out; },
  };
  f.G.level = { blocks: [], groundHeight: () => 0, pointInside: () => false,
    spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] };
  f.G.paint = { sample: () => 1, splat: () => 0 };
  f.G.fx = null; f.G.audio = null; f.G.time = 0;
  f.G.match = { playing: () => true, canRespawn: () => false };
  return f;
}

function makeActor(f, { nid, owner, remote = false } = {}) {
  class NativeVisual {
    constructor() { this.root = new f.THREE.Object3D(); }
    trigger() {}
    getMuzzle(out) { return out.copy(this.root.position).add(new f.THREE.Vector3(0, 1.1, 0.35)); }
    setVisible(value) { this.root.visible = value; }
    setHurt() {}
    setWeapon() {}
    update() {}
  }
  const actor = new f.Actor({ team: 0, name: `actor-${nid}`, weapon: 'blaster', isLocal: !remote, CharacterClass: NativeVisual });
  actor.nid = nid; actor.owner = owner; actor.remote = remote; actor.isBot = false;
  actor.spawnAt(new f.THREE.Vector3(0, 0, 0), 0);
  actor.invuln = 0;
  return actor;
}

function bindActors(f, nm, actors) {
  const match = f.bind(nm, actors);
  match.mode = 'turf'; match.opts = {}; match.playing = () => true; match.canRespawn = () => false;
  f.G.match = match; f.G.actors = actors;
  return match;
}

function sendTick(nm, record = null) {
  let packet = null;
  nm.s.tr.broadcast = value => { packet = structuredClone(value); record?.push(packet); };
  nm._sendTick();
  assert.ok(packet);
  return packet;
}

function receiveTick(nm, actor, packet, at = packet.ts) {
  nm.onMessage('p2', structuredClone(packet));
  const peer = nm.peers.get('p2');
  peer.tr = at; peer.sim = packet.u;
  nm._sample(actor, at, DT);
  nm.applyRemote(actor, DT);
}

function packetFor(packet, nid) {
  const row = packet.a.find(value => value[0] === nid);
  assert.ok(row, `missing owner actor ${nid}`);
  return row;
}

function resequenceAdoption(packet, actor) {
  const row = packetFor(packet, actor.nid);
  assert.ok(Array.isArray(row[23]), 'expected the existing tagged adoption payload');
  row[23][2] = Math.max(row[23][2], actor.net._adoptionSeq || 0) + 1;
  return packet;
}

test('#1110 owner epochs restart remote charge age without changing actor row protocol', async () => {
  const owner = await runtimeFixture();
  const source = makeActor(owner, { nid: 91, owner: 'p2' });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
  bindActors(owner, sender, [source]);

  assert.equal(source.superJump(new owner.THREE.Vector3(0, 0, 8)), true);
  source.superJumpState.t = 0.52;
  const first = sendTick(sender);
  assert.equal(first.sjEpochs?.[source.nid], 1);
  assert.equal(packetFor(first, source.nid).length, 26, 'the additive epoch does not extend existing actor rows (main row protocol: 26 fields incl. adoption, hit authority)');
  close(packetFor(first, source.nid)[21], 0.52);

  const host = await runtimeFixture();
  const remote = makeActor(host, { nid: 91, owner: 'p2', remote: true });
  const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
  bindActors(host, receiver, [remote]);
  receiveTick(receiver, remote, first);
  assert.equal(remote.net.buf[0]?.sjEpoch, 1, JSON.stringify(remote.net.buf[0]));
  assert.equal(remote.net.cur?.sjEpoch, 1, JSON.stringify(remote.net.cur));
  assert.equal(remote.superJumpState?.phase, 'charge');
  assert.equal(remote.superJumpState?.sjEpoch, 1, JSON.stringify({ state: remote.superJumpState, epoch: remote._s3SuperJumpEpoch }));
  close(remote.superJumpState.t, 0.52);

  const firstState = remote.superJumpState;
  receiveTick(receiver, remote, first);
  assert.equal(remote.superJumpState, firstState, 'a duplicate cannot restart or replace the active timer');
  close(remote.superJumpState.t, 0.52);

  source.reset(); // a native actor reset ends this owner action
  assert.equal(source.superJumpState, null);
  assert.equal(source.superJump(new owner.THREE.Vector3(0, 0, 8)), true);
  source.superJumpState.t = 0.025;
  owner.clock.advance(0.05);
  const restarted = sendTick(sender);
  assert.equal(restarted.sjEpochs?.[source.nid], 2);
  close(packetFor(restarted, source.nid)[21], 0.025);
  receiveTick(receiver, remote, restarted);
  assert.equal(remote.superJumpState?.phase, 'charge');
  assert.equal(remote.superJumpState?.sjEpoch, 2);
  close(remote.superJumpState.t, 0.025);

  // Even a delayed old action tagged with a later packet timestamp cannot rewind
  // the accepted action. This models timeline resampling/reconnect replay.
  const stale = structuredClone(first);
  stale.ts = restarted.ts + 0.05;
  receiveTick(receiver, remote, stale);
  assert.equal(remote.superJumpState?.sjEpoch, 2);
  close(remote.superJumpState.t, 0.025);

  source.splat(null, 'epoch lifecycle');
  owner.clock.advance(0.05);
  const dead = sendTick(sender);
  receiver._remoteSplat(remote, null, 'epoch lifecycle');
  assert.equal(remote._s3SuperJumpEndedEpoch, 2, 'remote death closes the accepted action before playback can return early');
  receiveTick(receiver, remote, dead);
  assert.equal(remote.superJumpState, null, 'the owner death sample clears the current charge');

  // Stale charge cannot resurrect an ended action after the native respawn event.
  receiver._remoteRespawn(remote);
  const staleAfterEnd = structuredClone(first);
  staleAfterEnd.ts = dead.ts + 0.05;
  resequenceAdoption(staleAfterEnd, remote);
  receiveTick(receiver, remote, staleAfterEnd);
  assert.equal(remote.superJumpState, null);
  const replayedEndedAction = structuredClone(restarted);
  replayedEndedAction.ts = dead.ts + 0.1;
  resequenceAdoption(replayedEndedAction, remote);
  receiveTick(receiver, remote, replayedEndedAction);
  assert.equal(remote.superJumpState, null, 'the ended epoch cannot restart from a late charge snapshot');
  source.respawn();
  assert.equal(source.superJump(new owner.THREE.Vector3(0, 0, 8)), true);
  assert.equal(source.superJumpState.sjEpoch, 3, 'the sender epoch survives action lifecycle changes');
  source._adoptionSequence = Math.max(source._adoptionSequence || 0, remote.net._adoptionSeq || 0);
  owner.clock.advance(0.15);
  const afterRespawn = sendTick(sender);
  receiveTick(receiver, remote, afterRespawn);
  assert.equal(remote.net.buf.at(-1)?.sjEpoch, 3, JSON.stringify({ packet: afterRespawn, last: remote.net.buf.at(-1), life: remote.net.lastLife }));
  assert.equal(remote.superJumpState?.sjEpoch, 3);
  close(remote.superJumpState.t, 0);
});

test('#1110 legacy snapshots keep finite Super Jump age when no epoch sidecar is present', async () => {
  const owner = await runtimeFixture();
  const source = makeActor(owner, { nid: 92, owner: 'p2' });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
  bindActors(owner, sender, [source]);
  assert.equal(source.superJump(new owner.THREE.Vector3(0, 0, 8)), true);
  source.superJumpState.t = 0.18;
  const legacy = sendTick(sender);
  delete legacy.sjEpochs;

  const host = await runtimeFixture();
  const remote = makeActor(host, { nid: 92, owner: 'p2', remote: true });
  const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
  bindActors(host, receiver, [remote]);
  receiveTick(receiver, remote, legacy);
  assert.equal(remote.superJumpState?.phase, 'charge');
  assert.ok(remote.superJumpState?.sjEpoch == null, 'legacy age remains valid without an epoch');
  close(remote.superJumpState.t, 0.18);
});

test('#1110 remote charge interpolation stays tied to the owner timeline at 30/60/120Hz', async () => {
  for (const renderHz of [30, 60, 120]) {
    const owner = await runtimeFixture();
    const source = makeActor(owner, { nid: 93, owner: 'p2' });
    const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
    bindActors(owner, sender, [source]);
    assert.equal(source.superJump(new owner.THREE.Vector3(0, 0, 8)), true);
    const packets = [];
    const start = sendTick(sender, packets);
    const expectedTime = 0.4;
    for (let age = 0.05; age <= 0.6 + 1e-9; age += 0.05) {
      source.superJumpState.t = age;
      owner.clock.advance(0.05);
      sendTick(sender, packets);
    }

    const host = await runtimeFixture();
    const remote = makeActor(host, { nid: 93, owner: 'p2', remote: true });
    const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
    bindActors(host, receiver, [remote]);
    for (const packet of packets) receiver.onMessage('p2', structuredClone(packet));
    const peer = receiver.peers.get('p2');
    for (let frame = 0; frame <= Math.round(expectedTime * renderHz); frame++) {
      const t = start.ts + frame / renderHz;
      peer.tr = t;
      receiver._sample(remote, t, 1 / renderHz);
      receiver.applyRemote(remote, 1 / renderHz);
      assert.ok(Number.isFinite(remote.superJumpState?.t), `${renderHz}Hz frame ${frame}`);
    }
    close(remote.superJumpState.t, expectedTime, 0.001);
    assert.equal(remote.superJumpState.sjEpoch, 1);
  }
});
