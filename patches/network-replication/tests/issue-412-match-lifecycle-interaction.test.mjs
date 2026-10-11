import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { installRespawnLifecycle } from '../../splatoon3/runtime/respawn-lifecycle.mjs';

// #412 online: the owner's committed Super Jump destination rides the adopted
// sample into the #1110 epoch state, so a local teammate can chain to a remote
// owner that is mid-jump. Packets below are real owner -> receiver NetMatch ticks.
const DEST = [14, 0, -6], RESTART = [-20, 0, 9];
const point = v => v ? [v.x, v.y, v.z] : null;

async function runtimeFixture() {
  const f = await fixture({ network: true, fullRuntime: true });
  installRespawnLifecycle(f,f.profile);
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


for(const hz of [30,60,120])test(`#412/#1203 living second jump keeps destination and owner epoch at ${hz} Hz`,async()=>{
  const o=await owner();const life=o.source.netLife;
  assert.equal(o.source.superJump(new o.f.THREE.Vector3(...DEST)),true);
  const first=runOwner(o,hz,s=>!s);
  assert.equal(o.source.superJumpState,null);assert.equal(o.source.alive,true);assert.equal(o.source.netLife,life);
  const r=await receiver(first[0].ts);deliver(r,first);render(r,first.at(-1).ts,hz);
  assert.equal(r.remote.superJumpState,null);
  assert.equal(o.source.superJump(new o.f.THREE.Vector3(...RESTART)),true,'second live jump needs no actor reset or respawn');
  const second=runOwner(o,hz,s=>s?.phase==='flight');deliver(r,second);render(r,second.at(-1).ts,hz);
  assert.equal(o.source.netLife,life);assert.equal(r.remote.superJumpState?.sjEpoch,2);
  assert.deepEqual(point(r.remote.superJumpState.to),RESTART);assert.deepEqual(chainFrom(r,r.remote),RESTART);
});

for(const hz of [30,60,120])test(`#412/#1203 old respawn packet cannot retire a later live jump at ${hz} Hz`,async()=>{
  const o=await owner();o.f.on('respawn',event=>o.sender._onLocalEvent('respawn',event));
  assert.equal(o.source.superJump(new o.f.THREE.Vector3(...DEST)),true);
  const first=runOwner(o,hz,s=>s?.phase==='flight');
  const r=await receiver(first[0].ts);deliver(r,first);render(r,first.at(-1).ts,hz);
  o.source.splat(null,'water');assert.equal(o.source.s3.squidSpawn,undefined);
  o.source.respawn();assert.equal(o.source.s3.squidSpawn.phase,'aim');
  o.f.clock.advance(1/hz);const respawnPacket=sendTick(o.sender);
  assert.ok(respawnPacket.e.some(e=>e[1]==='ev'&&e[2]==='respawn'),'actual native respawn is serialized');
  deliver(r,[respawnPacket]);
  const peer=r.nm.peers.get('p2');peer.tr=respawnPacket.ts;peer.sim=respawnPacket.u;r.nm._playEvents();
  assert.equal(r.remote.net.spawnPending,true,'actual remote respawn played before the later jump');
  assert.equal(r.remote.superJumpState,null,'accepted respawn ended the prior action');
  o.source.intent.fire=true;o.source.update(1/60);o.source.intent.fire=false;
  for(let n=0;n<70&&o.source.s3.squidSpawn;n++){o.f.G.time+=1/60;o.f.clock.advance(1/60);o.source.update(1/60);}
  assert.equal(o.source.s3.squidSpawn,undefined,'real Squid Spawn completes before the next jump');
  assert.equal(o.source.superJump(new o.f.THREE.Vector3(...RESTART)),true);
  const next=runOwner(o,hz,s=>s?.phase==='flight');deliver(r,next);render(r,next.at(-1).ts,hz);
  assert.equal(r.remote.superJumpState?.sjEpoch,2);assert.deepEqual(point(r.remote.superJumpState.to),RESTART);
  deliver(r,[respawnPacket]);render(r,next.at(-1).ts+1/hz,hz);
  assert.equal(r.remote.superJumpState?.sjEpoch,2);assert.deepEqual(point(r.remote.superJumpState.to),RESTART);
  assert.equal(r.remote.net.lastLife,o.source.netLife);assert.equal(r.remote.alive,true);
  // Even inside a fresh accepted owner tick, the already-played respawn event
  // keeps its old sequence and cannot close the current Super Jump epoch.
  const replay=step(o,hz);replay.e=structuredClone(respawnPacket.e);
  deliver(r,[replay]);peer.tr=replay.ts;peer.sim=replay.u;r.nm._playEvents();
  render(r,replay.ts,hz);
  assert.equal(r.remote.superJumpState?.sjEpoch,2);assert.deepEqual(point(r.remote.superJumpState.to),RESTART);
  assert.deepEqual(chainFrom(r,r.remote),RESTART);
});
