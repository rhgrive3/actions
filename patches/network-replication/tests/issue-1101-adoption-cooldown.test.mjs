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
  const a = new f.Actor({ team: 0, name: `actor-${nid}`, weapon: 'blaster', isLocal: !remote, CharacterClass: NativeVisual });
  a.nid = nid; a.owner = owner; a.remote = remote; a.isBot = false;
  a.spawnAt(new f.THREE.Vector3(0, 0, 0), 0);
  a.invuln = 0;
  return a;
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

function receiveTick(f, nm, actor, packet) {
  nm.onMessage('p2', structuredClone(packet));
  const peer = nm.peers.get('p2');
  peer.tr = packet.ts; peer.sim = packet.u;
  nm._sample(actor, packet.ts, DT);
  nm.applyRemote(actor, DT);
}

test('#1101 disconnect adoption preserves the remaining Blaster repeat cooldown', async () => {
  const owner = await runtimeFixture();
  const source = makeActor(owner, { nid: 71, owner: 'p2' });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
  bindActors(owner, sender, [source]);
  source.weaponRunner.cooldown = 30 * DT;

  const packet = sendTick(sender);
  const row = packet.a.find(value => value[0] === source.nid);
  assert.ok(row);
  close(row[22][8], 30 * DT);

  const host = await runtimeFixture();
  const remote = makeActor(host, { nid: 71, owner: 'p2', remote: true });
  const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
  bindActors(host, receiver, [remote]);
  receiveTick(host, receiver, remote, packet);
  receiver.onLeave('p2', false);

  assert.equal(remote.remote, false);
  assert.equal(remote.isBot, true);
  close(remote.weaponRunner.cooldown, 30 * DT);

  host.G.time += DT;
  remote.update(DT);
  close(remote.weaponRunner.cooldown, 29 * DT);
  assert.ok(remote.weaponRunner.cooldown > 0, 'handoff cannot fire again on the first adopted tick');
});

test('#1101 long-idle adoption does not invent a cooldown', async () => {
  const owner = await runtimeFixture();
  const source = makeActor(owner, { nid: 72, owner: 'p2' });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
  bindActors(owner, sender, [source]);
  source.weaponRunner.cooldown = 0;
  const packet = sendTick(sender);

  const host = await runtimeFixture();
  const remote = makeActor(host, { nid: 72, owner: 'p2', remote: true });
  const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
  bindActors(host, receiver, [remote]);
  receiveTick(host, receiver, remote, packet);
  receiver.onLeave('p2', false);
  assert.equal(remote.weaponRunner.cooldown, 0);
});
