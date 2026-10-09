import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const extraExports = `
  export { Character } from './inkwave-public/src/game/character.js';
  export { CHARACTER_TIMERS } from './inkwave-public/src/game/character.js';
  export { dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
`;

function fakePerformance(seconds) {
  let milliseconds = seconds * 1000;
  return { now: () => milliseconds, set(value) { milliseconds = value * 1000; } };
}

async function makeWorld(startTime) {
  const clock = fakePerformance(startTime);
  const f = await fixture({ productionComposition: true, fullRuntime: true, extraExports, vmPerformance: clock });
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
  // The fixture uses performance time for sender epochs. Keep the owner's
  // simulation tick advancing too, or strict snapshot admission drops every
  // post-baseline sample as a duplicate tick before its sidecar can be read.
  const setPerformanceTime = clock.set;
  clock.set = seconds => {
    setPerformanceTime(seconds);
    G.time = Math.max(G.time, seconds - startTime);
  };
  return { ...f, clock };
}

function makeActor(f, nid, owner) {
  const a = new f.Actor({ team: 0, name: 'issue 1163 Dualies clock probe', weapon: 'dualies',
    CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a; a.character.onEvent = null;
  a.nid = nid; a.owner = owner; a.ink = 100;
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  f.G.scene.add(a.character.root); f.G.actors.push(a);
  return a;
}

function makeNet(f, myId, hostId, actors, capture) {
  const session = { myId, hostId, isHost: myId === hostId,
    _members: new Map([[hostId, 'Owner'], [myId, myId]]),
    tr: { broadcast: message => { if (capture) capture.value = structuredClone(message); }, sendTo() {} } };
  const net = new f.NetMatch(session, { id: 'issue-1163-dodge-clock', map: 'map', difficulty: 'normal' });
  net.bind({ actors, boss: null, state: 'playing', time: 180, follower: false, removeActor() {} });
  return net;
}

function sendAt(net, clock, seconds) {
  clock.set(seconds);
  const capture = { value: null };
  net.s.tr.broadcast = message => { capture.value = structuredClone(message); };
  net._sendTick();
  assert.equal(capture.value?.k, 't');
  return capture.value;
}

function receivePacket(net, from, packet) {
  net.onMessage(from, structuredClone(packet));
  return net.peers.get(from);
}

function renderAt(net, actors, playbackTime, dt = 1 / 60, playEvents = true) {
  const peer = net.peers.get('owner');
  peer.tr = playbackTime;
  for (const actor of actors) net._sample(actor, playbackTime, dt);
  if (playEvents) net._playEvents();
  for (const actor of actors) net.applyRemote(actor, dt);
  return peer;
}

function renderActor(net, actor, playbackTime, dt) {
  const peer = net.peers.get(actor.owner);
  peer.tr = playbackTime;
  net._sample(actor, playbackTime, dt);
  net.applyRemote(actor, dt);
  return peer;
}

function nextSequenceAfter(packet) {
  return Math.max(...packet.e.map(event => event[event.length - 1])) + 1;
}

test('remote Dualies pose uses the accepted sender epoch across snapshot boundaries and lifecycle changes', async () => {
  const start = 100, world = await makeWorld(start);
  const owners = [77, 78, 79, 80, 81, 82].map(nid => makeActor(world, nid, 'owner'));
  const remotes = [77, 78, 79, 80, 81, 82].map(nid => makeActor(world, nid, 'owner'));
  for (const actor of [...owners, ...remotes]) actor.spawnAt(new world.THREE.Vector3(0, 0, 0), 0);
  world.G.actors = [...owners, ...remotes];
  const sender = makeNet(world, 'owner', 'owner', owners);
  const receiver = makeNet(world, 'viewer', 'owner', remotes);

  try {
    const first = sendAt(sender, world.clock, start);
    receivePacket(receiver, 'owner', first);
    renderAt(receiver, remotes, start);
    for (const actor of owners) { actor.intent.fire = true; actor.intent.move.set(1, 0, 0); }

    // IDs 77/79/80/81/82 start one 60 Hz tick after a 20 Hz sample; ID 78
    // starts two ticks after it, one fixed tick before the next 20 Hz sample.
    world.G.netm = sender;
    world.clock.set(start + 1 / 60);
    for (const nid of [77, 79, 80, 81, 82]) {
      const actor = owners.find(item => item.nid === nid);
      assert.equal(actor.weaponRunner.tryDodge(actor.intent.move), true);
    }
    world.clock.set(start + 2 / 60);
    const before78 = owners.find(item => item.nid === 78);
    assert.equal(before78.weaponRunner.tryDodge(before78.intent.move), true);
    const accepted = new Map(owners.map(actor => [actor.nid, {
      ink: actor.ink, t: actor.weaponRunner.dodge.t, dur: actor.weaponRunner.dodge.dur,
      startup: actor.weaponRunner.dodge.startup, startupDur: actor.weaponRunner.dodge.startupDur,
      token: actor.weaponRunner.dodge.token,
    }]));

    const boundary = sendAt(sender, world.clock, start + 3 / 60);
    const nextSeq = nextSequenceAfter(boundary);
    const dodgeEvents = boundary.e?.filter(event => event[1] === 'tr' && event[3] === 'dodge') || [];
    assert.equal(dodgeEvents.length, owners.length, 'each accepted action used the existing timestamped trigger lane');
    const event77 = dodgeEvents.find(event => event[2] === 77), event78 = dodgeEvents.find(event => event[2] === 78);
    assert.ok(event77 && event78);
    assert.equal(event77[4].start, event77[0], 'accepted epoch exactly matches the recorded sender timestamp');
    assert.equal(boundary.rl[77].start, event77[4].start, 'snapshot recovery shares the accepted event epoch');
    assert.equal(boundary.rl[77].life, owners[0].netLife);
    assert.equal(boundary.rl[77].tp, owners[0].netTp ?? 0);

    // Simulate an event loss for 79 (recovery uses the optional named sidecar)
    // and both event and sidecar loss for 82 (a bare bit must stay inert).
    const receivedBoundary = structuredClone(boundary);
    receivedBoundary.e = receivedBoundary.e.filter(event => !(event[1] === 'tr' && [79, 82].includes(event[2]) && event[3] === 'dodge'));
    delete receivedBoundary.rl[82];
    receivePacket(receiver, 'owner', receivedBoundary);
    receivePacket(receiver, 'owner', sendAt(sender, world.clock, start + 2 / 20));
    receivePacket(receiver, 'owner', sendAt(sender, world.clock, start + 3 / 20));

    // These events play before their next 20 Hz state sample. Their own
    // sender epochs distinguish the two sides of the 20 Hz boundary.
    renderAt(receiver, remotes, start + 4 / 100);
    const remoteById = new Map(remotes.map(actor => [actor.nid, actor]));
    for (const nid of [77, 78, 80, 81]) {
      const actor = remoteById.get(nid);
      assert.equal(world.dualiesMotionSnapshot(actor.character)?.phase, 'startup', `actor ${nid} starts from its timestamped action`);
      assert.ok(actor.remoteDodgeClock, `actor ${nid} keeps a separate presentation clock`);
      assert.equal(actor.weaponRunner.dodge, null, `actor ${nid} does not allocate an authoritative gameplay dodge`);
    }
    assert.equal(remoteById.get(77).remoteDodgeClock.epoch, event77[0]);
    assert.equal(remoteById.get(78).remoteDodgeClock.epoch, event78[0]);
    assert.equal(remoteById.get(79).remoteDodgeClock, undefined, 'a lost trigger waits for authoritative epoch metadata');
    assert.equal(world.dualiesMotionSnapshot(remoteById.get(79).character)?.phase, null);
    assert.equal(remoteById.get(82).remoteDodgeClock, undefined, 'F.dodge alone does not invent a presentation epoch');

    // Two proxies receive real accepted event metadata at the same sender
    // epoch, before either proxy has a reconstructed Runner dodge. Character's
    // unrelated native T_DODGE ages must not split native stance/aim/feet.
    const early = remoteById.get(77), stale = remoteById.get(80), T = world.CHARACTER_TIMERS;
    assert.equal(early.weaponRunner.dodge, null);
    assert.equal(stale.weaponRunner.dodge, null);
    early.character.tr[T.T_DODGE] = .02;
    stale.character.tr[T.T_DODGE] = 2;
    early._finishFrame(1 / 60);
    stale._finishFrame(1 / 60);
    const admissionState = actor => ({ lockW: actor.character.lockW, wAim: actor.character.wAim,
      stance: [...actor.character.stance], plantW: actor.character.plantW,
      feet: actor.character.feet.map(foot => [foot.planted, foot.sw, foot.disp.toArray()]) });
    assert.deepEqual(admissionState(early), admissionState(stale),
      'accepted sender clock governs native admission independently of local Character timer age');
    assert.equal(world.dualiesMotionSnapshot(early.character)?.phase, 'startup');
    assert.equal(world.dualiesMotionSnapshot(stale.character)?.phase, 'startup');

    renderAt(receiver, remotes, start + 55 / 1000);
    assert.equal(remoteById.get(79).remoteDodgeClock.source, 'snapshot', 'lost trigger recovers from the exact start sidecar');
    assert.equal(remoteById.get(79).remoteDodgeClock.epoch, boundary.rl[79].start);
    assert.ok(remoteById.get(79).remoteDodgeClock.playbackTime > remoteById.get(79).remoteDodgeClock.epoch,
      'recovery preserves elapsed sender time instead of starting at zero');
    assert.equal(remoteById.get(82).remoteDodgeClock, undefined, 'a bit without epoch metadata remains inert after the sample');

    const recovered79 = remoteById.get(79), event79 = dodgeEvents.find(event => event[2] === 79);
    receiver._remoteSplat(recovered79, null, 'test');
    assert.equal(recovered79.remoteDodgeClock, undefined, 'death retires the recovered action epoch');
    receiver._remoteRespawn(recovered79);
    const oldLife = event79[4].life, oldTp = event79[4].tp;
    const respawnAt = event79[0] + .02;
    const spawn = [respawnAt, 'tr', 79, 'spawn', { life: oldLife + 1, tp: oldTp + 1 }, 0, nextSeq];
    spawn._netSeq = nextSeq;
    receiver.peers.get('owner').tr = respawnAt + .002;
    receiver._play('owner', spawn);
    const staleLifeAt = respawnAt + .001;
    const priorLifeAction = [staleLifeAt, 'tr', 79, 'dodge', {
      ...event79[4], token: event79[4].token + 1, start: staleLifeAt,
    }, 0, nextSeq + 1];
    priorLifeAction._netSeq = nextSeq + 1;
    receiver._play('owner', priorLifeAction);
    assert.equal(recovered79.remoteDodgeClock, undefined, 'an old-life action with a newer token cannot replay after timestamped respawn');
    const staleTpAt = respawnAt + .0015;
    const staleTp = [staleTpAt, 'tr', 79, 'dodge', {
      ...priorLifeAction[4], token: event79[4].token + 2, start: staleTpAt, life: oldLife + 1, tp: oldTp,
    }, 0, nextSeq + 2];
    staleTp._netSeq = nextSeq + 2;
    receiver._play('owner', staleTp);
    assert.equal(recovered79.remoteDodgeClock, undefined, 'a pre-teleport action epoch cannot cross the respawn teleport');

    // Each duplicate frame rate advances the actual composed Character pose
    // on the same sender timeline; dt only changes animation integration.
    const rates = [[77, 30], [80, 60], [81, 120]], progress = [];
    for (const [nid, hz] of rates) {
      const actor = remoteById.get(nid), frames = hz / 10, dt = 1 / hz;
      for (let i = 1; i <= frames; i++) renderActor(receiver, actor, start + .055 + i * dt, dt);
      const pose = world.dualiesMotionSnapshot(actor.character);
      const clock = actor.remoteDodgeClock;
      const expected = Math.max(0, Math.min(1, (clock.playbackTime - clock.epoch - clock.startupDur) / clock.duration));
      assert.equal(pose.phase, 'roll', `${hz} Hz enters roll in order after startup`);
      assert.ok(Math.abs(pose.progress - expected) < 1e-8, `${hz} Hz progress uses sender time`);
      progress.push(pose.progress);
    }
    assert.ok(Math.max(...progress) - Math.min(...progress) < 1e-8, '30/60/120 Hz render rates agree at the same sender time');

    const remote77 = remoteById.get(77), firstToken = remote77.remoteDodgeClock.token;
    const firstSeq = event77[event77.length - 1];
    const laterEpoch = start + .4;
    const later = [laterEpoch, 'tr', 77, 'dodge', { ...event77[4], token: firstToken + 1, start: laterEpoch }, 0, nextSeq + 3];
    later._netSeq = nextSeq + 3;
    receiver.peers.get('owner').tr = laterEpoch + .001;
    receiver._play('owner', later);
    assert.equal(remote77.remoteDodgeClock.token, firstToken + 1, 'a distinct newer roll epoch is accepted');
    const reordered = [...event77]; reordered[reordered.length - 1] = nextSeq + 4; reordered._netSeq = nextSeq + 4;
    receiver._play('owner', reordered);
    assert.equal(remote77.remoteDodgeClock.token, firstToken + 1, 'a later-delivered older action cannot rewind the newer roll');
    const duplicate = [...later]; duplicate[duplicate.length - 1] = nextSeq + 5; duplicate._netSeq = nextSeq + 5;
    receiver._play('owner', duplicate);
    assert.equal(remote77.remoteDodgeClock.token, firstToken + 1, 'a duplicate token cannot restart the action');
    const staleLife = [laterEpoch + .01, 'tr', 77, 'dodge', { ...later[4], token: firstToken + 2,
      start: laterEpoch + .01, life: 0 }, 0, nextSeq + 6];
    staleLife._netSeq = nextSeq + 6;
    receiver._play('owner', staleLife);
    assert.equal(remote77.remoteDodgeClock.token, firstToken + 1, 'a stale life cannot replace a current action');

    remote77.setWeapon('shooter');
    assert.equal(remote77.remoteDodgeClock, undefined, 'weapon change retires a live remote Dualies pose');
    remote77.setWeapon('dualies');
    const afterWeaponSwitch = [...duplicate];
    afterWeaponSwitch[afterWeaponSwitch.length - 1] = nextSeq + 7; afterWeaponSwitch._netSeq = nextSeq + 7;
    receiver._play('owner', afterWeaponSwitch);
    assert.equal(remote77.remoteDodgeClock, undefined, 'switching back cannot replay the prior action token');

    receiver.s.hostId = 'successor';
    receiver.onLeave('owner', true);
    assert.equal(remote77.owner, 'successor');
    assert.equal(remote77.remoteDodgeClock, undefined, 'owner handoff clears the prior sender clock');
    receiver._peer('owner').tr = laterEpoch + .02;
    const oldOwnerEvent = [...later]; oldOwnerEvent[oldOwnerEvent.length - 1] = nextSeq + 10; oldOwnerEvent._netSeq = nextSeq + 10;
    receiver._play('owner', oldOwnerEvent);
    assert.equal(remote77.remoteDodgeClock, undefined, 'the previous owner cannot restart a handed-off actor');
    const successorEpoch = laterEpoch + .03;
    const successor = [successorEpoch, 'tr', 77, 'dodge', { ...later[4], token: 1, start: successorEpoch }, 0, 1];
    successor._netSeq = 1;
    receiver._peer('successor').tr = successorEpoch + .001;
    receiver._play('successor', successor);
    assert.equal(remote77.remoteDodgeClock.owner, 'successor', 'the new owner can establish its own action epoch');
    assert.equal(remote77.remoteDodgeClock.token, 1);

    const lifecycleOwner = owners.find(actor => actor.nid === 82);
    lifecycleOwner.netLife++;
    lifecycleOwner.netTp = (lifecycleOwner.netTp || 0) + 1;
    lifecycleOwner.character.trigger('spawn');
    const spawnRecord = sender.out.at(-1);
    assert.equal(spawnRecord[1], 'tr');
    assert.equal(spawnRecord[3], 'spawn');
    assert.equal(spawnRecord[4].life, lifecycleOwner.netLife, 'the existing spawn trigger records the authoritative owner life');
    assert.equal(spawnRecord[4].tp, lifecycleOwner.netTp, 'the existing spawn trigger records the teleport epoch');

    for (const actor of owners) {
      const current = accepted.get(actor.nid);
      assert.deepEqual({ ink: actor.ink, t: actor.weaponRunner.dodge.t, dur: actor.weaponRunner.dodge.dur,
        startup: actor.weaponRunner.dodge.startup, startupDur: actor.weaponRunner.dodge.startupDur,
        token: actor.weaponRunner.dodge.token }, current,
      `metadata capture leaves actor ${actor.nid}'s owner dodge movement, resource and token unchanged`);
    }
  } finally {
    sender.dispose(); receiver.dispose(); world.G.actors.forEach(a => a.character.dispose());
  }
});


test('#1163 metadata preserves canonical paint return values and shared event sequence', async () => {
  const world = await makeWorld(10);
  const owner = makeActor(world, 91, 'owner');
  const sender = makeNet(world, 'owner', 'owner', [owner]);
  try {
    sender._eventSeq = 2;
    sender.s._inkwaveEventSeq = 100;
    const paint = sender.recSplat(new world.THREE.Vector3(0, 0, 0), 0.4, 0, { seed: 1 });
    assert.equal(paint.seq, 101, 'paint uses the session watermark rather than restarting at the match-local counter');
    assert.equal(sender.out.at(-1)._netSeq, paint.seq);
    const next = sender._rec(['ev', 'actor:jump', {}]);
    assert.equal(next, sender.out.at(-1), 'the recorder still returns its canonical event row');
    assert.equal(next._netSeq, 102, 'non-dodge gameplay events retain one monotonic sequence owner');
  } finally { sender.dispose(); owner.character.dispose(); }
});
