import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { applyRemoteSuperJumpEpoch } from '../superjump-epoch.mjs';

// #412 online: the owner's committed Super Jump destination rides the adopted
// sample into the #1110 epoch state, so a local teammate can chain to a remote
// owner that is mid-jump. Packets below are real owner -> receiver NetMatch ticks.
const DEST = [14, 0, -6], RESTART = [-20, 0, 9];
const point = v => v ? [v.x, v.y, v.z] : null;

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

function sendTick(nm) {
  let packet = null;
  nm.s.tr.broadcast = value => { packet = structuredClone(value); };
  nm._sendTick();
  assert.ok(packet);
  return packet;
}

async function owner() {
  const f = await runtimeFixture();
  const source = makeActor(f, { nid: 91, owner: 'p2' });
  const sender = f.makeNetMatch(f.makeSession('p2', 'p2'));
  bindActors(f, sender, [source]);
  return { f, source, sender };
}

// One owner frame at `hz`: advance the clock, update the jump, return the packet sent.
function step(o, hz) {
  o.f.clock.advance(1 / hz);
  if (o.source.superJumpState) o.source._updateSuperJump(1 / hz);
  return sendTick(o.sender);
}

// Owner ticks at `hz` until `stop(state)`, plus one trailing tick so the receiver's
// render reads the stop state (a render frame exactly at a packet reads the older one).
function runOwner(o, hz, stop) {
  const packets = [sendTick(o.sender)];
  for (let guard = 0; guard < hz * 4 && !stop(o.source.superJumpState); guard++) packets.push(step(o, hz));
  packets.push(step(o, hz));
  return packets;
}

// Make a delayed replay pass the adoption sequence gate, so the epoch guard decides.
function resequence(packet, remote) {
  const row = packet.a.find(value => value[0] === remote.nid);
  row[23][2] = Math.max(row[23][2], remote.net._adoptionSeq || 0) + 1;
  return packet;
}

// The receiver holds the remote owner (nid 91, owner p2) and a local teammate (nid 7).
async function receiver(start) {
  const f = await runtimeFixture();
  const remote = makeActor(f, { nid: 91, owner: 'p2', remote: true });
  const local = makeActor(f, { nid: 7, owner: 'host' });
  const nm = f.makeNetMatch(f.makeSession('host', 'host'));
  bindActors(f, nm, [remote, local]);
  return { f, remote, local, nm, t: start };
}

function deliver(r, packets) {
  for (const packet of packets) r.nm.onMessage('p2', structuredClone(packet));
}

// Render frames at `hz` past `until` (half a frame beyond the newest packet), the way the
// receiver's per-frame remote apply runs; a frame exactly at a packet reads the older one.
function render(r, until, hz) {
  const peer = r.nm.peers.get('p2');
  for (; r.t <= until + 0.5 / hz; r.t += 1 / hz) {
    peer.tr = r.t;
    r.nm._sample(r.remote, r.t, 1 / hz);
    r.nm.applyRemote(r.remote, 1 / hz);
  }
}

function chainFrom(r, target) {
  r.local.superJumpState = null;
  assert.equal(r.local.superJump(target), true, 'local teammate admits the remote jumping owner');
  return point(r.local.superJumpState.to);
}

for (const hz of [30, 60, 120]) for (const phase of ['charge', 'flight']) {
  test(`#412 online: local chain jump inherits the remote owner's ${phase} destination at ${hz} Hz`, async () => {
    const o = await owner();
    assert.equal(o.source.superJump(new o.f.THREE.Vector3(...DEST)), true);
    const packets = runOwner(o, hz, s => phase === 'flight' ? s?.phase === 'flight' : s?.t >= 0.3);
    assert.equal(o.source.superJumpState.phase, phase);
    assert.deepEqual(point(o.source.superJumpState.to), DEST);

    const r = await receiver(packets[0].ts);
    deliver(r, packets);
    render(r, packets.at(-1).ts, hz);
    assert.equal(r.remote.superJumpState?.phase, phase);
    assert.deepEqual(point(r.remote.superJumpState.to), DEST, 'the adopted owner destination is kept on the remote state');
    assert.deepEqual(chainFrom(r, r.remote), DEST, 'chain-jump inherits the owner destination, not the airborne position');
  });
}

for (const hz of [30, 60, 120]) test(`#412 online: a restarted owner jump (new epoch) replaces the old destination at ${hz} Hz`, async () => {
  const o = await owner();
  assert.equal(o.source.superJump(new o.f.THREE.Vector3(...DEST)), true);
  const first = runOwner(o, hz, s => s?.phase === 'flight');
  const r = await receiver(first[0].ts);
  deliver(r, first);
  render(r, first.at(-1).ts, hz);
  assert.deepEqual(point(r.remote.superJumpState.to), DEST);
  assert.equal(r.remote.superJumpState.sjEpoch, 1);

  // A native reset ends epoch 1; the new charge is epoch 2 with its own destination.
  o.source.reset();
  assert.equal(o.source.superJump(new o.f.THREE.Vector3(...RESTART)), true);
  o.f.clock.advance(1 / hz);
  const restarted = [sendTick(o.sender), step(o, hz)];
  deliver(r, restarted);
  render(r, restarted.at(-1).ts, hz);
  assert.equal(r.remote.superJumpState?.sjEpoch, 2);
  assert.equal(r.remote.superJumpState?.phase, 'charge');
  assert.deepEqual(point(r.remote.superJumpState.to), RESTART, 'the new epoch never keeps the old destination');
  assert.deepEqual(chainFrom(r, r.remote), RESTART);

  // A delayed epoch-1 flight packet, relabelled as newer, cannot rewind the accepted epoch-2 destination.
  const stale = resequence(structuredClone(first.at(-1)), r.remote);
  stale.ts = restarted.at(-1).ts + 0.05;
  deliver(r, [stale]);
  assert.ok(r.remote.net.buf.some(s => s.t === stale.ts && s.sjEpoch === 1), 'the replay reaches the epoch guard');
  render(r, stale.ts + 1 / hz, hz);
  assert.equal(r.remote.superJumpState?.sjEpoch, 2);
  assert.deepEqual(point(r.remote.superJumpState.to), RESTART, 'stale replay keeps the accepted destination');

  // The owner's jump ends with no Super Jump sample: the remote destination is dropped.
  // The owner continues past the replayed sequence (as #1110 does), so its later ticks are not gated.
  o.f.clock.advance(0.1);
  o.source._adoptionSequence = Math.max(o.source._adoptionSequence || 0, r.remote.net._adoptionSeq || 0);
  o.source.reset();
  o.f.clock.advance(1 / hz);
  const ended = [sendTick(o.sender), step(o, hz)];
  deliver(r, ended);
  render(r, ended.at(-1).ts, hz);
  assert.equal(r.remote.superJumpState, null);
  assert.equal(r.remote.superJumpState?.to, undefined);
});

test('#412 a new Super Jump epoch without a sampled destination carries no old destination', () => {
  const to = { isVector3: true, x: 1, y: 0, z: 1 };
  const actor = { alive: true, _s3RemoteSuperJumpState: null, superJumpState: null };
  const charge = applyRemoteSuperJumpEpoch(actor, { sjEpoch: 1, sjT: 0.1 }, 'charge', to);
  assert.equal(charge.to, to);
  const restarted = applyRemoteSuperJumpEpoch(actor, { sjEpoch: 2, sjT: 0 }, 'charge', null);
  assert.equal(restarted.sjEpoch, 2);
  assert.equal(restarted.to, undefined);
  const continued = applyRemoteSuperJumpEpoch(actor, { sjEpoch: 2, sjT: 0.05 }, 'charge', null);
  assert.equal(continued.to, undefined);
});
