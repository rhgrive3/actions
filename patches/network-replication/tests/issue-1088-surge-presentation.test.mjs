import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as sourceFixture } from '../../splatoon3/tests/source-fixture.mjs';

const CURRENT_ACTOR_ROW_WIDTH = 24;
const LEGACY_ACTOR_ROW_WIDTH = 22;
const SPECIALS_COUNTER_SLOT = 22;
const ADOPTION_STATE_SLOT = 23;
const SURGE_PRESENTATION_SLOT = 24;

function assertCurrentActorSlots(row, actor) {
  assert.equal(row[SPECIALS_COUNTER_SLOT], actor.stats.specials || 0,
    'the existing special-use counter retains its current slot');
  assert.equal(row[ADOPTION_STATE_SLOT]?.[0], 'inkwave-adoption-v1',
    'the tagged adoption state retains its current slot');
}

function setOwnerLife(actor, life) {
  actor.stats.deaths = life;
  actor.netLife = life;
}

const PRESENTATION_EXPORTS = `
  export { Character } from './inkwave-public/src/game/character.js';
  export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
  export { wallMotionSnapshot } from './patches/splatoon3/runtime/wall-motion.mjs';
`;

async function makePair() {
  let nowMs = 1000;
  const f = await sourceFixture({
    fullRuntime: true,
    productionComposition: true,
    extraExports: PRESENTATION_EXPORTS,
    vmPerformance: { now: () => nowMs },
  });
  const { G, THREE } = f;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  G.camera.position.set(1.4, 1.2, 3);
  G.camera.lookAt(0, .5, 0);
  G.camera.updateMatrixWorld();

  const makeActor = name => {
    const actor = new f.Actor({ team: 0, name, weapon: 'shooter',
      CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    actor.nid = 17;
    actor.owner = 'owner';
    actor.character.actor = actor;
    actor.character.onEvent = null;
    actor._nearCamera = () => false;
    G.scene.add(actor.character.root);
    return actor;
  };
  const owner = makeActor('surge owner');
  const remote = makeActor('surge remote');
  G.actors = [owner, remote];

  const members = new Set(['owner', 'viewer']);
  const cfg = { id: 'c1088-presentation', map: 'reef', difficulty: 'normal' };
  const packets = [];
  const sender = new f.NetMatch({ myId: 'owner', hostId: 'owner', isHost: true, _members: members,
    tr: { broadcast: msg => packets.push(JSON.parse(JSON.stringify(msg))), sendTo() {} } }, cfg);
  sender.bind({ actors: [owner], state: 'playing', time: 180, opts: {} });
  const receiver = new f.NetMatch({ myId: 'viewer', hostId: 'owner', isHost: false, _members: members,
    tr: { broadcast() {}, sendTo() {} } }, cfg);
  receiver.bind({ actors: [remote], state: 'playing', time: 180, opts: {} });

  const deliver = (actor, net, packet, dt) => {
    net.onMessage('owner', packet);
    const peer = net._peer('owner');
    peer.tr = packet.ts;
    net._sample(actor, packet.ts, dt);
    net.applyRemote(actor, dt);
  };

  const step = (dt, jumpHeld = true, mode = 'wall') => {
    nowMs += dt * 1000;
    G.time += dt;
    G.netm = sender;
    if (mode === 'wall') {
      owner.form = 'squid'; owner.submerged = true; owner.climbing = true; owner.grounded = false;
      owner.intent.squid = true; owner.intent.jump = jumpHeld;
      owner.wallN.set(0, 0, 1); owner.anim.wallNormal.copy(owner.wallN);
    } else {
      owner.form = 'kid'; owner.submerged = false; owner.climbing = false; owner.grounded = true;
      owner.intent.squid = false; owner.intent.jump = false;
    }
    f.beforeActions(owner, dt, false);
    owner._finishFrame(dt);
    sender._sendTick();
    const packet = packets.at(-1);
    deliver(remote, receiver, packet, dt);
    return packet;
  };

  return { f, G, owner, remote, sender, receiver, step, deliver,
    advanceWireClock: milliseconds => { nowMs += milliseconds; }, wireTime: () => nowMs / 1000,
    makeActor };
}

const packetCopy = packet => JSON.parse(JSON.stringify(packet));
const close = (actual, expected, epsilon = 1e-5) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) &&
  Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} (±${epsilon})`);

function assertPoseParity(f, owner, remote, label) {
  const ownerMovement = f.movementMotionSnapshot(owner.character);
  const remoteMovement = f.movementMotionSnapshot(remote.character);
  assert.equal(remoteMovement?.phase ?? null, ownerMovement?.phase ?? null, `${label}: movement pose phase`);
  if (ownerMovement?.phase) close(remoteMovement.charge, ownerMovement.charge, 2e-6);

  const ownerWall = f.wallMotionSnapshot(owner.character);
  const remoteWall = f.wallMotionSnapshot(remote.character);
  assert.equal(remoteWall?.phase ?? null, ownerWall?.phase ?? null, `${label}: wall pose phase`);
  if (ownerWall?.phase) {
    close(remoteWall.charge, ownerWall.charge, 2e-6);
    close(remoteWall.shape, ownerWall.shape, 2e-5);
  }
  if (ownerWall?.burstAge != null || remoteWall?.burstAge != null) {
    close(remoteWall?.burstAge, ownerWall?.burstAge, 2e-5);
  }
}

test('C1088 preserves the current actor row and retains explicit Surge end/life markers', async () => {
  const w = await makePair();
  w.owner.stats.specials = 3;
  const untouched = w.step(1 / 60, false, 'normal');
  assert.equal(untouched.a[0].length, CURRENT_ACTOR_ROW_WIDTH, 'ordinary snapshots keep the current wire shape');
  assertCurrentActorSlots(untouched.a[0], w.owner);
  const active = w.step(1 / 60, true);
  assert.equal(active.a[0].length, CURRENT_ACTOR_ROW_WIDTH + 1);
  assertCurrentActorSlots(active.a[0], w.owner);
  assert.equal(active.a[0][SURGE_PRESENTATION_SLOT].phase, 'charge');
  w.owner.s3.actions.surge = null;
  const ended = w.step(1 / 60, false, 'normal');
  assert.equal(ended.a[0].length, CURRENT_ACTOR_ROW_WIDTH + 1, 'a used action still sends its retirement marker');
  assertCurrentActorSlots(ended.a[0], w.owner);
  assert.equal(ended.a[0][SURGE_PRESENTATION_SLOT].phase, 'end');
  assert.equal(ended.a[0][SURGE_PRESENTATION_SLOT].epoch, active.a[0][SURGE_PRESENTATION_SLOT].epoch);
  assert.equal(w.remote.s3?.c1088SurgePresentation, undefined);
  w.owner.stats.deaths++;
  const nextLife = w.step(1 / 60, false, 'normal');
  assertCurrentActorSlots(nextLife.a[0], w.owner);
  assert.equal(nextLife.a[0][SURGE_PRESENTATION_SLOT].phase, 'end');
  assert.equal(nextLife.a[0][SURGE_PRESENTATION_SLOT].life, w.owner.stats.deaths);
});

test('C1088 full-six real NetMatch/Character parity at 30/60/120 Hz and lifecycle controls', async () => {
  const pair = await makePair();
  const { f, G, owner, remote, sender, receiver, step, deliver } = pair;
  let currentChargePacket = null;
  let firstBurstPacket = null;
  let reconnectChecked = false;
  let malformedAndLegacyChecked = false;
  let life = 0;

  const inject = (source, payload, omitSidecar = false) => {
    pair.advanceWireClock(2);
    const packet = packetCopy(source);
    packet.ts = Math.round(pair.wireTime() * 1000) / 1000;
    delete packet.e;
    const adoption = packet.a[0][ADOPTION_STATE_SLOT];
    if (Array.isArray(adoption) && Number.isSafeInteger(adoption[2])) {
      // Each injected presentation variant represents a new owner snapshot, not a replay.
      const sequence = Math.max(adoption[2], remote.net?._adoptionSeq || 0,
        owner._adoptionSequence || 0) + 1;
      adoption[2] = sequence;
      owner._adoptionSequence = sequence;
    }
    if (omitSidecar) delete packet.a[0][SURGE_PRESENTATION_SLOT];
    else packet.a[0][SURGE_PRESENTATION_SLOT] = JSON.parse(JSON.stringify(payload));
    deliver(remote, receiver, packet, 1 / 60);
    return packet;
  };

  for (const hz of [30, 60, 120]) {
    owner.reset(); remote.reset();
    setOwnerLife(owner, life);
    owner.stats.specials = 3;
    const dt = 1 / hz;
    for (let i = 0; i < hz / 5; i++) {
      currentChargePacket = step(dt, true);
      assertCurrentActorSlots(currentChargePacket.a[0], owner);
      const wire = currentChargePacket.a[0][SURGE_PRESENTATION_SLOT];
      assert.equal(wire?.tag, 'inkwave.s3.surge.v1');
      assert.equal(wire.life, owner.stats.deaths);
      assert.equal(wire.phase, 'charge');
      assert.ok(Number.isSafeInteger(wire.epoch) && wire.epoch > 0);
      assert.ok(Number.isFinite(wire.charge) && wire.charge > 0 && wire.charge <= 1);
      assert.equal(wire.time, 0);
      assert.equal(wire.sampleAge, 0);
      assertPoseParity(f, owner, remote, `${hz}Hz charge`);
      assert.equal(remote.s3?.actions?.surge ?? null, null,
        'remote presentation never enters authoritative movement actions');
    }

    if (hz === 30) {
      const beforeDuplicate = receiver.stats.in;
      receiver.onMessage('owner', currentChargePacket);
      const stalePacket = packetCopy(currentChargePacket);
      stalePacket.ts -= .01;
      receiver.onMessage('owner', stalePacket);
      assert.equal(receiver.stats.in, beforeDuplicate,
        'duplicate and older NetMatch snapshots are rejected by the existing ordered tick gate');
      const beforeUnauthorized = { ...remote.net.c1088SurgeState,
        presentation: { ...remote.s3.c1088SurgePresentation } };
      receiver.onMessage('intruder', currentChargePacket);
      assert.deepEqual({ ...remote.net.c1088SurgeState,
        presentation: { ...remote.s3.c1088SurgePresentation } }, beforeUnauthorized,
        'a non-owner sender cannot alter the authorized presentation timeline');

      const active = remote.s3.c1088SurgePresentation;
      const oldEpoch = { ...currentChargePacket.a[0][SURGE_PRESENTATION_SLOT], epoch: active.epoch - 1,
        phase: 'end', charge: 0, time: 0 };
      inject(currentChargePacket, oldEpoch);
      assert.equal(remote.s3.c1088SurgePresentation?.epoch, active.epoch,
        'a newer packet carrying a stale action epoch cannot rewind the pose');

      const oldLife = { ...currentChargePacket.a[0][SURGE_PRESENTATION_SLOT], life: 0 };
      setOwnerLife(owner, 1);
      currentChargePacket = step(dt, true);
      assert.equal(currentChargePacket.a[0][SURGE_PRESENTATION_SLOT].life, 1);
      assert.equal(remote.s3.c1088SurgePresentation?.life, 1,
        'owner life change retires the previous presentation before accepting the new life');
      inject(currentChargePacket, oldLife);
      assert.equal(remote.s3.c1088SurgePresentation?.life, 1,
        'a delayed sample from the prior actor life cannot restore its pose');
      assertPoseParity(f, owner, remote, 'life change');
    }

    let sawBurst = false;
    let sawEnd = false;
    for (let i = 0; i < hz * 2; i++) {
      const packet = step(dt, false);
      assertCurrentActorSlots(packet.a[0], owner);
      const wire = packet.a[0][SURGE_PRESENTATION_SLOT];
      if (wire.phase === 'burst') {
        sawBurst = true;
        assert.ok(Number.isFinite(wire.time) && wire.time > 0);
        assertPoseParity(f, owner, remote, `${hz}Hz burst`);
        assert.equal(remote.s3?.actions?.surge ?? null, null,
          'remote burst remains presentation state and grants no movement or armor credit');

        if (hz === 30 && !reconnectChecked) {
          firstBurstPacket = packet;
          const reconnected = pair.makeActor('surge reconnect');
          const reconnectNet = new f.NetMatch({ myId: 'viewer2', hostId: 'owner', isHost: false,
            _members: new Set(['owner', 'viewer2']), tr: { broadcast() {}, sendTo() {} } },
            { id: 'c1088-reconnect', map: 'reef', difficulty: 'normal' });
          reconnectNet.bind({ actors: [reconnected], state: 'playing', time: 180, opts: {} });
          reconnectNet.onMessage('owner', firstBurstPacket);
          const peer = reconnectNet._peer('owner');
          peer.tr = firstBurstPacket.ts + .01;
          reconnectNet._sample(reconnected, peer.tr, 0);
          reconnectNet.applyRemote(reconnected, 0);
          assert.equal(reconnected.s3.c1088SurgePresentation?.phase, 'burst');
          close(reconnected.s3.c1088SurgePresentation.sampleAge, .01, .0011);
          assert.equal(f.movementMotionSnapshot(reconnected.character)?.phase, 'surge-burst',
            'a fresh remote can reconstruct a sustained mid-action burst without a prior trigger');
          assert.equal(f.wallMotionSnapshot(reconnected.character)?.phase, 'launch');
          reconnectChecked = true;

          const stalePhase = { ...wire, phase: 'charge', time: 0 };
          inject(packet, stalePhase);
          assert.equal(remote.s3.c1088SurgePresentation?.phase, 'burst',
            'a same-epoch charge packet cannot roll a burst backward');

          const malformed = { ...wire, charge: null };
          inject(packet, malformed);
          assert.equal(remote.s3?.c1088SurgePresentation, undefined,
            'malformed finite-state fields clear the remote presentation');
          const malformedPhase = { ...wire, phase: 'toString' };
          inject(packet, malformedPhase);
          assert.equal(remote.s3?.c1088SurgePresentation, undefined,
            'unknown phase names inherited from object prototypes cannot create a remote pose');
          const legacy = packetCopy(packet);
          pair.advanceWireClock(2);
          legacy.ts = Math.round(pair.wireTime() * 1000) / 1000;
          delete legacy.e;
          legacy.a[0] = legacy.a[0].slice(0, LEGACY_ACTOR_ROW_WIDTH);
          deliver(remote, receiver, legacy, 1 / 60);
          assert.equal(remote.s3?.c1088SurgePresentation, undefined,
            'legacy 22-column snapshots remain accepted and clear stale remote poses');
          malformedAndLegacyChecked = true;
        }
      } else if (wire.phase === 'end') {
        sawEnd = true;
        assert.equal(remote.s3?.c1088SurgePresentation, undefined);
        assertPoseParity(f, owner, remote, `${hz}Hz end`);
        break;
      }
    }
    assert.ok(sawBurst, `${hz}Hz owner entered the calibrated burst`);
    assert.ok(sawEnd, `${hz}Hz owner sent an explicit end state`);
    life = owner.stats.deaths + 1;
  }

  assert.ok(firstBurstPacket && reconnectChecked && malformedAndLegacyChecked);

  owner.reset(); remote.reset();
  setOwnerLife(owner, life);
  receiver.match.range = true;
  G.match.range = true;
  const normalBefore = { x: owner.pos.x, y: owner.pos.y, z: owner.pos.z,
    vx: owner.vel.x, vy: owner.vel.y, vz: owner.vel.z, hp: owner.hp, ink: owner.ink,
    special: owner.special, turf: owner.stats.turf, splats: owner.stats.splats, deaths: owner.stats.deaths };
  const normalPacket = step(1 / 30, false, 'normal');
  const normalAfter = { x: owner.pos.x, y: owner.pos.y, z: owner.pos.z,
    vx: owner.vel.x, vy: owner.vel.y, vz: owner.vel.z, hp: owner.hp, ink: owner.ink,
    special: owner.special, turf: owner.stats.turf, splats: owner.stats.splats, deaths: owner.stats.deaths };
  assert.deepEqual(normalAfter, normalBefore,
    'ordinary local gameplay fields stay unchanged by presentation serialization');
  assert.equal(normalPacket.a[0][SURGE_PRESENTATION_SLOT].phase, 'end');
  assert.equal(remote.s3?.c1088SurgePresentation, undefined,
    'normal gameplay and the range-flagged control have no active surge pose');
  assert.equal(remote.s3?.actions?.surge ?? null, null);
  assert.equal(remote.s3?.actions?.armor ?? null, null);

  owner.reset(); remote.reset(); setOwnerLife(owner, life);
  const active = step(1 / 60, true);
  assert.equal(remote.s3.c1088SurgePresentation?.phase, 'charge');
  remote.net.ready = false;
  receiver.applyRemote(remote, 1 / 60);
  assert.equal(remote.s3?.c1088SurgePresentation, undefined);
  assert.equal(remote.net?.c1088SurgeState, undefined,
    'buffer reset clears the prior life/epoch so a reused remote actor can reconnect');
  const reconnectPair = await makePair();
  const reconnected = reconnectPair.step(1 / 60, true);
  const reconnectedRemote = reconnectPair.remote;
  assert.equal(reconnectedRemote.s3.c1088SurgePresentation?.life, 0);
  assert.equal(reconnectedRemote.s3.c1088SurgePresentation?.phase, 'charge');
  reconnectedRemote.owner = 'viewer';
  reconnectPair.G.projectiles.list = [];
  reconnectPair.G.projectiles.bombs = [];
  reconnectPair.G.projectiles.clouds = [];
  reconnectPair.G.projectiles.beams = [];
  reconnectPair.G.projectiles.beamPool = [];
  reconnectPair.G.projectiles.sights = new Map();
  reconnectPair.receiver._adopt(reconnectedRemote);
  assert.equal(reconnectedRemote.remote, false);
  assert.equal(reconnectedRemote.s3?.c1088SurgePresentation, undefined,
    'ownership adoption clears the remote-only pose');
  assert.equal(reconnectedRemote.net?.c1088SurgeState, undefined);
  assert.equal(reconnectedRemote.s3?.actions?.surge ?? null, null);
  assert.equal(active.a[0][SURGE_PRESENTATION_SLOT].phase, 'charge');
  assert.equal(reconnected.a[0][SURGE_PRESENTATION_SLOT].life, 0);
  assert.equal(reconnected.a[0][SURGE_PRESENTATION_SLOT].phase, 'charge');
});
