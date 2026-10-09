import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const extraExports = "export { Character } from './inkwave-public/src/game/character.js';\n";
async function makeWorld() {
  const f = await fixture({ productionComposition: true, fullRuntime: true, extraExports });
  const { G, THREE, Physics } = f, V = THREE.Vector3;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  const center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const floor = { id: 0, solid: true, center, half,
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1],
    aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  G.level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    spawnPads: [new V(-80, 0, 0), new V(80, 0, 0)], spawnBarrier: 0, hasRails: false,
    groundHeight: () => 0, queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false, state: 'playing' };
  G.camera = { position: new V() }; G.fx = null; G.audio = null;
  G.projectiles = { list: [], bombs: [], clouds: [], beams: [], sights: new Map(),
    ...Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster',
      'fireSlosh', 'throwBomb', 'fireFlick'].map(k => [k, () => {}])) };
  G.actors = []; G.time = 0;
  return f;
}
function makeActor(f, nid, owner) {
  const a = new f.Actor({ team: 0, name: 'issue 292 Drop Roller', weapon: 'shooter',
    CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a; a.nid = nid; a.owner = owner;
  f.G.scene.add(a.character.root); f.G.actors.push(a);
  a.spawnAt(new f.THREE.Vector3(0, 0, 0), 0);
  a.s3.loadout[2].main = 'dropRoller'; a.setWeapon(a.weaponId);
  return a;
}
function makeNet(f, myId, members, actors, capture) {
  const session = { myId, hostId: 'owner', isHost: myId === 'owner', _members: new Map(members),
    tr: { broadcast: d => { if (capture) capture.value = JSON.parse(JSON.stringify(d)); }, sendTo() {} } };
  const net = new f.NetMatch(session, { id: 'issue-292-drop-roller', map: 'map', difficulty: 'normal' });
  net.bind({ actors, state: 'playing', time: 180, follower: false, removeActor() {} });
  return net;
}
function step(f, actor, count = 1) {
  for (let i = 0; i < count; i++) { f.G.time += 1 / 60; actor.update(1 / 60); }
}
function landWithDirection(f, actor) {
  actor.s3.jumpChargeTime = 1 / 60; actor.s3.jumpFlightTime = .5;
  assert.equal(actor.superJump(new f.THREE.Vector3(12, 0, 0)), true);
  let frames = 0;
  while (actor.superJumpState && frames++ < 600) {
    const jump = actor.superJumpState;
    if (jump.phase === 'flight' && jump.t + 1 / 60 + 1e-10 >= jump.dur) actor.intent.move.set(1, 0, 0);
    step(f, actor);
  }
  assert.ok(frames < 600); assert.equal(actor.superJumpState, null);
  assert.ok(actor.s3.dropRoller, 'the real adapted landing path starts the owner action');
}
function sendSnapshot(net, capture) {
  capture.value = null; net._sendTick();
  assert.ok(capture.value?.k === 't');
  return capture.value;
}
function receiveFrame(net, actor, packet) {
  net.onMessage('owner', JSON.parse(JSON.stringify(packet)));
  const peer = net.peers.get('owner');
  peer.tr = packet.ts; net._sample(actor, packet.ts, 0); net._playEvents(); net.applyRemote(actor, 1 / 60);
}

test('#292 transports one Drop Roller pose owner snapshot without granting remote gameplay AP', async () => {
  const ownerWorld = await makeWorld(), viewerWorld = await makeWorld();
  const owner = makeActor(ownerWorld, 92, 'owner'), remote = makeActor(viewerWorld, 92, 'owner');
  ownerWorld.G.actors = [owner]; viewerWorld.G.actors = [remote];
  const sent = { value: null };
  const sender = makeNet(ownerWorld, 'owner', [['owner', 'Owner'], ['viewer', 'Viewer']], [owner], sent);
  const receiver = makeNet(viewerWorld, 'viewer', [['owner', 'Owner'], ['viewer', 'Viewer']], [remote]);
  let remoteDodgeCalls = 0;
  const remoteTrigger = remote.character._netTrig;
  remote.character._netTrig = function (name, data) {
    if (name === 'dodge') remoteDodgeCalls++;
    return remoteTrigger.call(this, name, data);
  };

  landWithDirection(ownerWorld, owner);
  const ownerAction = { ...owner.s3.dropRoller };
  const first = sendSnapshot(sender, sent);
  assert.deepEqual(first.dr?.[owner.nid]?.[0], 's3drop-v1');
  assert.equal(first.dr[owner.nid][1], ownerAction.id);
  assert.equal(first.dr[owner.nid][3], 1); assert.equal(first.dr[owner.nid][4], 0);
  assert.equal(first.e?.some(e => e[1] === 'tr' && e[3] === 'dodge') ?? false, false,
    'local presentation does not also send a duplicate one-shot trigger');
  receiveFrame(receiver, remote, first);
  assert.equal(remote.remoteDropRollVisual?.id, ownerAction.id);
  assert.equal(remote.remoteDropRollVisual?.remotePresentation, true);
  assert.equal(remoteDodgeCalls, 1, 'one validated owner sidecar starts one remote pose');
  assert.equal(remote.s3.dropRoller, undefined, 'remote actor receives no owner gameplay action');
  assert.equal(remote.s3.dropRollerBuffRemaining || 0, 0, 'remote presentation never grants the temporary buff');
  assert.equal(remote.s3.abilityPoints.runSpeed || 0, owner.s3.abilityPoints.runSpeed || 0);

  step(ownerWorld, owner, 2);
  const second = sendSnapshot(sender, sent);
  assert.equal(second.dr[owner.nid][1], ownerAction.id, 'the sustained owner action keeps its identity');
  receiveFrame(receiver, remote, second);
  assert.equal(remoteDodgeCalls, 1, 'later snapshots sustain the same presentation without replaying it');

  owner.s3.dropRoller = undefined; // owner cancellation before successful completion
  step(ownerWorld, owner);
  const canceled = sendSnapshot(sender, sent);
  receiveFrame(receiver, remote, canceled);
  assert.equal(remote.remoteDropRollVisual, null, 'owner cancellation removes the presentation sidecar');

  remote.remoteDropRollVisual = { remotePresentation: true, id: 999, owner: remote.owner };
  receiver._remoteRespawn(remote);
  assert.equal(remote.remoteDropRollVisual, null, 'remote respawn clears the previous life presentation');
  remote.remoteDropRollVisual = { remotePresentation: true, id: 1000, owner: remote.owner };
  receiver.dispose(); sender.dispose();
  assert.equal(remote.remoteDropRollVisual, null, 'connection disposal clears the presentation proxy');
});
