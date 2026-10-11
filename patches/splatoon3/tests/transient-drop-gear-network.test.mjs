import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

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
  net.bind({ actors, state: 'playing', time: 180, duration:180, follower: false, removeActor() {} });
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


for(const hz of [30,60,120])test(`actual Drop Roller landing buff survives 100ms delivery and owner takeover at ${hz}Hz`,async()=>{
 const o=await makeWorld(),r=await makeWorld();const owner=makeActor(o,92,'owner'),remote=makeActor(r,92,'owner');const cap={value:null};const sender=makeNet(o,'owner',[['owner','Owner'],['viewer','Viewer']],[owner],cap),receiver=makeNet(r,'viewer',[['owner','Owner'],['viewer','Viewer']],[remote]);o.G.netm=sender;r.G.netm=receiver;
 landWithDirection(o,owner);step(o,owner,20);const left=owner.s3.dropRollerBuffRemaining;assert.ok(left>0);const packet=sendSnapshot(sender,cap);for(let i=0;i<Math.round(.1*hz);i++){o.G.time+=1/hz;owner.update(1/hz);r.G.time+=1/hz;receiver.match.time-=1/hz;receiver.update(1/hz);}receiveFrame(receiver,remote,packet);assert.equal(remote.s3.dropRollerBuffRemaining||0,0,'remote presentation grants no gameplay AP');
 for(let i=0;i<hz/2;i++){r.G.time+=1/hz;receiver.update(1/hz);receiver.applyRemote(remote,1/hz);}
 receiver.s.hostId='viewer';receiver.s.isHost=true;receiver.onLeave('owner',true);assert.ok(Math.abs(remote.s3.dropRollerBuffRemaining-(left-.6))<1e-8);assert.equal(remote.s3.modifiers.runSpeed,owner.s3.modifiers.runSpeed);
 for(let i=0;i<3*hz;i++){r.G.time+=1/hz;receiver.update(1/hz);remote.update(1/hz);}
 assert.equal(remote.s3.dropRollerBuffRemaining,0);assert.equal(remote.s3.modifiers.runSpeed,1);
});
test('changing shoes after actual Drop Roller landing sends explicit null before takeover',async()=>{
 const o=await makeWorld(),r=await makeWorld(),owner=makeActor(o,92,'owner'),remote=makeActor(r,92,'owner'),cap={value:null};const sender=makeNet(o,'owner',[['owner','Owner'],['viewer','Viewer']],[owner],cap),receiver=makeNet(r,'viewer',[['owner','Owner'],['viewer','Viewer']],[remote]);o.G.netm=sender;r.G.netm=receiver;
 landWithDirection(o,owner);step(o,owner,20);receiveFrame(receiver,remote,sendSnapshot(sender,cap));owner.s3.loadout[2].main=null;owner.s3RefreshGear();const cancelled=sendSnapshot(sender,cap);assert.equal(cancelled.gb[92][7],null);receiveFrame(receiver,remote,cancelled);receiver.s.hostId='viewer';receiver.s.isHost=true;receiver.onLeave('owner',true);assert.equal(remote.s3.dropRollerBuffRemaining||0,0);assert.equal(remote.s3.modifiers.runSpeed,1);
});
