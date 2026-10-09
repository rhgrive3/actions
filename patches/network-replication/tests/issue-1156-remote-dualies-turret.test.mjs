// #1156: Remote Dualies lose the sustained post-roll turret pose because the
// owner's accepted s3Turret state never reaches the ghost. Reproduction and
// acceptance run through the complete production adapter composition
// (Touch -> Reliability -> Quality -> Network -> Range) with the installed
// native runtime and a real NetMatch/Character pair. Presentation only: the
// ghost never runs authoritative _dualies(), and no packet column changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const extraExports = `
  export { Character } from './inkwave-public/src/game/character.js';
  export { dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
`;
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
    groundHeight: () => 0, queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return true; } };
  G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.camera = { position: new V() }; G.fx = null; G.audio = null;
  G.projectiles = { list: [], bombs: [], clouds: [], beams: [], sights: new Map(),
    ...Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster',
      'fireSlosh', 'throwBomb', 'fireFlick'].map(k => [k, () => {}])) };
  G.actors = []; G.time = 0;
  return f;
}
function makeActor(f, nid, owner) {
  const a = new f.Actor({ team: 0, name: 'issue 1156 turret probe', weapon: 'dualies',
    CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a; a.character.onEvent = null;
  a.nid = nid; a.owner = owner; a.ink = 100;
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  f.G.scene.add(a.character.root); f.G.actors.push(a);
  return a;
}
function makeNet(f, myId, members, actors, capture) {
  const session = { myId, hostId: 'owner', isHost: myId === 'owner', _members: new Map(members),
    tr: { broadcast: d => { if (capture) capture.value = JSON.parse(JSON.stringify(d)); }, sendTo() {} } };
  const net = new f.NetMatch(session, { id: 'issue-1156-turret', map: 'map', difficulty: 'normal' });
  net.bind({ actors, state: 'playing', time: 180, follower: false, removeActor() {} });
  return { net, session };
}
function step(f, actor, dt) { f.G.time += dt; actor.update(dt); }
function sendSnapshot(net, capture) {
  capture.value = null; net._sendTick();
  assert.ok(capture.value?.k === 't');
  return capture.value;
}
function receiveFrame(f, net, actor, packet, dt = 1 / 60) {
  net.onMessage('owner', JSON.parse(JSON.stringify(packet)));
  const peer = net.peers.get('owner');
  peer.tr = packet.ts; net._sample(actor, packet.ts, 0); net._playEvents(); net.applyRemote(actor, dt);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Owner path: real dodge admission, roll to completion (native weapons.mjs sets
// s3Turret at completion), then a stationary ZR hold until lockT expires while
// s3Turret stays accepted — the sustained post-roll turret of Splatoon 3.
async function ownerSustainedTurret(ownerWorld, owner) {
  owner.intent.move.set(0, 0, 1); owner.intent.jump = true;
  step(ownerWorld, owner, 1 / 60);
  owner.intent.jump = false;
  for (let i = 0; i < 180 && owner.weaponRunner.dodge; i++) step(ownerWorld, owner, 1 / 60);
  assert.equal(owner.weaponRunner.dodge, null, 'owner roll completes natively');
  assert.equal(owner.weaponRunner.s3Turret, true, 'owner enters the native post-roll turret');
  owner.intent.move.set(0, 0, 0); owner.intent.fire = true;
  for (let i = 0; i < 45; i++) step(ownerWorld, owner, 1 / 60);
  assert.equal(owner.weaponRunner.lockT, 0, 'movement lock expired while ZR stayed held');
  assert.equal(owner.weaponRunner.s3Turret, true, 'owner sustains the turret after lock end');
}

test('#1156 accepted owner s3Turret keeps the remote Dualies planted pose past lock end', async () => {
  const ownerWorld = await makeWorld(), viewerWorld = await makeWorld();
  const owner = makeActor(ownerWorld, 88, 'owner'), remote = makeActor(viewerWorld, 88, 'owner');
  ownerWorld.G.actors = [owner]; viewerWorld.G.actors = [remote];
  const sent = { value: null };
  const sender = makeNet(ownerWorld, 'owner', [['owner', 'Owner'], ['viewer', 'Viewer']], [owner], sent).net;
  const receiver = makeNet(viewerWorld, 'viewer', [['owner', 'Owner'], ['viewer', 'Viewer']], [remote]).net;

  await ownerSustainedTurret(ownerWorld, owner);

  const first = sendSnapshot(sender, sent);
  const row = first.a.find(item => item[0] === owner.nid);
  assert.equal(row.length, 23, 'snapshot columns stay byte-compatible for legacy peers');
  receiveFrame(viewerWorld, receiver, remote, first, 1 / 60);
  assert.equal(remote.weaponRunner.s3Turret, true,
    'the accepted owner turret state reaches the remote presentation runner');
  assert.equal(viewerWorld.dualiesMotionSnapshot(remote.character)?.phase, 'plant',
    'the remote Character keeps the planted post-roll pose while lockT is already 0');
  assert.equal(remote.weaponRunner.lockT, 0, 'the pose outlives the replicated movement lock');
  assert.equal(remote.s3?.actions?.roll ?? null, null, 'presentation state never starts remote gameplay actions');
  assert.equal(viewerWorld.G.projectiles.list.length, 0, 'the ghost never runs authoritative fire logic');
});

