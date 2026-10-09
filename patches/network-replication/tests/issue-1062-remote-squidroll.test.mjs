import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const extraExports = `
  export { Character } from './inkwave-public/src/game/character.js';
  export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
  export { squidrollMotionSnapshot } from './patches/splatoon3/runtime/squidroll-motion.mjs';
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
    groundHeight: () => 0, queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
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
  const a = new f.Actor({ team: 0, name: 'issue 1062 Roll probe', weapon: 'shooter',
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
  const net = new f.NetMatch(session, { id: 'issue-1062-roll', map: 'map', difficulty: 'normal' });
  net.bind({ actors, state: 'playing', time: 180, follower: false, removeActor() {} });
  return { net, session };
}
function triggerSpy(actor) {
  const calls = [], trigger = actor.character.trigger;
  actor.character.trigger = function (name, arg) { calls.push(name); return trigger.call(this, name, arg); };
  return calls;
}
function step(f, actor, dt) { f.G.time += dt; actor.update(dt); }
function prepOwnInkSwim(f, actor) {
  actor.groundTeam = 1;
  for (let i = 0; i < 45; i++) {
    actor.intent.squid = true; actor.intent.jump = false; actor.intent.move.set(0, 0, 1);
    step(f, actor, 1 / 60);
  }
  assert.equal(actor.submerged, true, 'owner reaches submerged form in own ink');
}
function startOwnerRoll(f, actor, moveX, moveZ) {
  actor.intent.jump = false; step(f, actor, 1 / 60); // a fresh B press is required between chained launches
  const actions = actor.s3.actions;
  actions.roll = null; actions.surge = null; actor.s3.roll = null;
  actor.form = 'squid'; actor.submerged = true; actor.grounded = true; actor.climbing = false;
  actor.groundTeam = 1; actor.specialActive = null; actor.superJumpState = null;
  actor.ground.hit = true; actor.ground.face = 0; actor.vel.set(0, 0, 11.52);
  actor.intent.squid = true; actor.intent.move.set(moveX, 0, moveZ); actor.intent.jump = true;
  step(f, actor, 1 / 60);
  return actor.s3.actions.roll;
}
function sendSnapshot(net, capture) {
  capture.value = null; net._sendTick();
  assert.ok(capture.value?.k === 't');
  return capture.value;
}
function receiveFrame(f, net, actor, packet, dt = 1 / 60) {
  const previousLength = actor.net.buf.length;
  net.onMessage('owner', JSON.parse(JSON.stringify(packet)));
  const peer = net.peers.get('owner');
  assert.equal(peer.lastTs, packet.ts, 'fresh production snapshot passes the receiver replay gate');
  assert.equal(actor.net.buf.at(-1)?.t, packet.ts, 'the receiver appends this exact owner snapshot');
  assert.equal(actor.net.buf.length, previousLength + 1, 'accepted owner snapshot adds one remote sample');
  peer.tr = packet.ts; net._sample(actor, packet.ts, 0); net._playEvents(); net.applyRemote(actor, dt);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('full production Roll snapshots sustain remote pose without transferring gameplay authority', async () => {
  const ownerWorld = await makeWorld(), viewerWorld = await makeWorld();
  const owner = makeActor(ownerWorld, 77, 'owner'), remote = makeActor(viewerWorld, 77, 'owner');
  ownerWorld.G.actors = [owner]; viewerWorld.G.actors = [remote];
  const ownerCalls = triggerSpy(owner), remoteCalls = triggerSpy(remote), sent = { value: null };
  const sender = makeNet(ownerWorld, 'owner', [['owner', 'Owner'], ['viewer', 'Viewer']], [owner], sent).net;
  const receiver = makeNet(viewerWorld, 'viewer', [['owner', 'Owner'], ['viewer', 'Viewer']], [remote]).net;

  prepOwnInkSwim(ownerWorld, owner);
  owner.vel.set(0, 0, 11.52); owner.intent.move.set(0, 0, -1); owner.intent.jump = true;
  step(ownerWorld, owner, 1 / 60);
  const firstAction = owner.s3.actions.roll;
  assert.ok(firstAction, 'the actual owner movement runtime admits the floor Roll');
  assert.equal(ownerWorld.movementMotionSnapshot(owner.character)?.phase, 'roll');
  const authorityBeforeSend = { ...firstAction };
  const first = sendSnapshot(sender, sent), row = first.a.find(item => item[0] === owner.nid);
  const firstMeta = first.sq?.[owner.nid];
  assert.equal(row.length, 24, 'combined adoption extension occupies its one tagged slot');
  assert.equal(row[21], owner.stats.specials || 0, 'existing special counter retains slot 21');
  assert.equal(row[23][0], 'inkwave-adoption-v1', 'Roll sidecar does not occupy the adoption slot');
  assert.deepEqual(firstMeta?.[0], 's3roll-v1');
  assert.ok(firstMeta[1] > 0 && firstMeta[2] > 0 && firstMeta[2] <= ownerWorld.profile.movement.roll.duration);
  assert.deepEqual({ ...firstAction }, authorityBeforeSend, 'packing does not mutate owner Roll/gameplay state');
  receiveFrame(viewerWorld, receiver, remote, first, 1 / 30);
  const firstPose = viewerWorld.movementMotionSnapshot(remote.character);
  assert.equal(firstPose?.phase, 'roll', 'actual owner snapshot reaches remote _finishFrame and Character pose');
  assert.equal(remote.remoteSquidrollVisual?.id, firstMeta[1]);
  assert.equal(remote.anim.movementMotion.actions.roll, remote.remoteSquidrollVisual,
    'movement-motion reads the remote-only presentation proxy');
  assert.equal(remote.remoteSquidrollVisual.vz, firstMeta[4], 'Roll direction follows the owner launch vector');
  assert.equal(remote.s3?.actions?.roll ?? null, null, 'remote visual proxy is not a gameplay Roll action');
  assert.equal(remote.invuln, 0, 'Roll presentation adds no armor');
  assert.deepEqual(Array.from(remote.vel.toArray()), row.slice(4, 7), 'presentation launch vector does not replace replicated velocity');
  assert.ok(ownerCalls.includes('squidroll') && remoteCalls.includes('squidroll'));

  owner.intent.jump = false; step(ownerWorld, owner, 1 / 20); await delay(15);
  const second = sendSnapshot(sender, sent), secondMeta = second.sq?.[owner.nid];
  assert.equal(secondMeta[1], firstMeta[1], 'same action keeps one identity across owner snapshots');
  assert.ok(secondMeta[2] < firstMeta[2], 'remaining action time decreases in later snapshots');
  assert.equal(second.e?.some(e => e[1] === 'tr' && e[3] === 'squidroll') ?? false, false,
    'sustained pose does not depend on repeating the one-shot event');
  receiveFrame(viewerWorld, receiver, remote, second, 1 / 120);
  const secondPose = viewerWorld.movementMotionSnapshot(remote.character);
  assert.equal(secondPose?.phase, 'roll');
  assert.ok(secondPose.rollAge > firstPose.rollAge, 'new owner samples advance pose age without restarting it');

  const rollEvent = first.e?.find(e => e[1] === 'tr' && e[3] === 'squidroll');
  assert.ok(rollEvent);
  const duplicateEvent = [...rollEvent];
  duplicateEvent._netTick = rollEvent.at(-2); duplicateEvent._netSeq = rollEvent.at(-1);
  const triggerCount = remoteCalls.filter(name => name === 'squidroll').length, ageBeforeDuplicate = secondPose.rollAge;
  receiver._play('owner', duplicateEvent); receiver._play('owner', duplicateEvent);
  assert.equal(remoteCalls.filter(name => name === 'squidroll').length, triggerCount, 'duplicate event sequence is ignored');
  assert.equal(viewerWorld.movementMotionSnapshot(remote.character).rollAge, ageBeforeDuplicate,
    'duplicate event does not reset the sustained action age');
  const buffered = remote.net.buf.length, acceptedTs = receiver.peers.get('owner').lastTs;
  receiver.onMessage('owner', JSON.parse(JSON.stringify(first)));
  assert.equal(remote.net.buf.length, buffered, 'stale snapshot is rejected before sample insertion');
  assert.equal(receiver.peers.get('owner').lastTs, acceptedTs, 'stale packet cannot rewind owner tick authority');

  const late = makeActor(viewerWorld, 77, 'owner'); viewerWorld.G.actors = [late];
  const lateNet = makeNet(viewerWorld, 'late', [['owner', 'Owner'], ['late', 'Late Viewer']], [late]).net;
  receiveFrame(viewerWorld, lateNet, late, second, 1 / 60);
  const duration = viewerWorld.profile.movement.roll.duration;
  const latePose = viewerWorld.movementMotionSnapshot(late.character);
  assert.equal(latePose?.phase, 'roll', 'late first snapshot enters the already-running action');
  assert.ok(Math.abs(latePose.rollAge - (duration - secondMeta[2])) < 1e-8,
    'late observer starts at the owner snapshot remaining time instead of full duration');
  assert.equal(late.s3?.actions?.roll ?? null, null, 'late proxy receives presentation metadata only');

  const chainedAction = startOwnerRoll(ownerWorld, owner, -1, 0);
  assert.ok(chainedAction, 'the real owner admission path launches the next Roll');
  await delay(15);
  const chained = sendSnapshot(sender, sent), chainedMeta = chained.sq?.[owner.nid];
  assert.ok(chainedMeta[1] > firstMeta[1], 'a chained action receives a distinct owner identity');
  receiveFrame(viewerWorld, receiver, remote, chained, 1 / 60);
  assert.equal(remote.remoteSquidrollVisual?.id, chainedMeta[1]);
  assert.equal(viewerWorld.movementMotionSnapshot(remote.character)?.phase, 'roll');
  assert.ok(remote.remoteSquidrollVisual.vx < -0.99 && Math.abs(remote.remoteSquidrollVisual.vz) < 1e-6,
    'the next action follows its new owner launch vector');

  await delay(15);
  step(ownerWorld, owner, 1 / 60); // each production adoption row needs a newer owner simulation tick
  const malformed = sendSnapshot(sender, sent);
  assert.equal(malformed.sq?.[owner.nid]?.length, 5, 'malformed case starts from an actual valid production sidecar');
  malformed.sq[owner.nid] = [...malformed.sq[owner.nid], 7];
  receiveFrame(viewerWorld, receiver, remote, malformed);
  assert.equal(remote.net.buf.at(-1).rollId, 0, 'wrong tagged sidecar shape is rejected');
  assert.equal(remote.remoteSquidrollVisual, null);
  await delay(15);
  step(ownerWorld, owner, 1 / 60);
  const legacy = sendSnapshot(sender, sent); delete legacy.sq;
  legacy.a = legacy.a.map(row => row.slice(0, 22)); // actual pre-adoption peers
  receiveFrame(viewerWorld, receiver, remote, legacy);
  assert.equal(remote.net.buf.at(-1).rollId, 0, 'legacy row without optional metadata stays safe');
  assert.equal(remote.remoteSquidrollVisual, null);

  await delay(15);
  step(ownerWorld, owner, 1 / 60);
  const recovery = sendSnapshot(sender, sent);
  receiveFrame(viewerWorld, receiver, remote, recovery);
  assert.equal(remote.remoteSquidrollVisual?.id, chainedMeta[1], 'a later valid owner snapshot restores the same action');
  owner.character.trigger('movement_cancel'); await delay(15);
  step(ownerWorld, owner, 1 / 60);
  const interrupted = sendSnapshot(sender, sent);
  assert.equal(interrupted.sq?.[owner.nid]?.[1], chainedMeta[1], 'the control packet still carries the current action identity');
  receiveFrame(viewerWorld, receiver, remote, interrupted);
  assert.equal(remote.remoteSquidrollVisual, null, 'owner cancel event blocks the matching visual action');
  assert.notEqual(viewerWorld.movementMotionSnapshot(remote.character)?.phase, 'roll');
  owner.form = 'kid'; await delay(15);
  step(ownerWorld, owner, 1 / 60);
  const formChange = sendSnapshot(sender, sent);
  receiveFrame(viewerWorld, receiver, remote, formChange);
  assert.equal(remote.remoteSquidrollVisual, null, 'form change clears presentation metadata');

  const canceledAction = startOwnerRoll(ownerWorld, owner, 0, -1);
  assert.ok(canceledAction);
  await delay(15);
  const beforeCancel = sendSnapshot(sender, sent);
  receiveFrame(viewerWorld, receiver, remote, beforeCancel);
  assert.ok(remote.remoteSquidrollVisual);
  owner.intent.jump = false; owner.s3.actions.roll = null; owner.s3.roll = null; await delay(15);
  step(ownerWorld, owner, 1 / 60);
  const canceled = sendSnapshot(sender, sent);
  receiveFrame(viewerWorld, receiver, remote, canceled);
  assert.equal(remote.remoteSquidrollVisual, null, 'owner cancellation marker clears the remote visual action');

  assert.equal(late.remoteSquidrollVisual?.id, secondMeta[1]);
  lateNet._remoteSplat(late, null, 'test');
  assert.equal(late.remoteSquidrollVisual, null, 'death clears the visual proxy');
  late.remoteSquidrollVisual = { remotePresentation: true, id: 90, owner: late.owner, remaining: .1, vx: 1, vz: 0 };
  lateNet._remoteRespawn(late);
  assert.equal(late.remoteSquidrollVisual, null, 'respawn clears the visual proxy');
  late.remoteSquidrollVisual = { remotePresentation: true, id: 91, owner: late.owner, remaining: .1, vx: 1, vz: 0 };
  lateNet.s.hostId = 'late'; lateNet.onLeave('owner', true);
  assert.equal(late.owner, 'late'); assert.equal(late.remoteSquidrollVisual, null, 'ownership handoff clears old owner presentation');
  late.remoteSquidrollVisual = { remotePresentation: true, id: 92, owner: late.owner, remaining: .1, vx: 1, vz: 0 };
  lateNet.dispose();
  assert.equal(late.remoteSquidrollVisual, null, 'connection disposal clears all remote presentation proxies');

  const ordinary = makeActor(ownerWorld, 78, 'owner'); ownerWorld.G.actors = [ordinary];
  prepOwnInkSwim(ownerWorld, ordinary); ordinary.vel.set(0, 0, 11.52);
  ordinary.intent.move.set(0, 0, 1); ordinary.intent.jump = true; step(ownerWorld, ordinary, 1 / 60);
  assert.equal(ordinary.s3?.actions?.roll ?? null, null, 'same-speed ordinary squid jump does not admit a Roll');
  assert.notEqual(ownerWorld.movementMotionSnapshot(ordinary.character)?.phase, 'roll');
  assert.equal(ownerCalls.filter(name => name === 'squidroll').length, 3,
    'only the three real owner Roll admissions emitted Roll triggers');
  sender.dispose(); receiver.dispose();
});
