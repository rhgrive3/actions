import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as sourceFixture } from '../../splatoon3/tests/source-fixture.mjs';

const ACTOR_NID = 17;
const PRESENTATION_TAG = 'inkwave.roller-presentation.v1';
const clone = value => JSON.parse(JSON.stringify(value));

async function makePair() {
  let nowMs = 1000;
  const f = await sourceFixture({ fullRuntime: true, productionComposition: true,
    extraExports: `export { Character } from './inkwave-public/src/game/character.js';`,
    vmPerformance: { now: () => nowMs } });
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  G.actors = [];
  const makeActor = (name, isLocal) => {
    const actor = new f.Actor({ team: 0, name, weapon: 'roller', isLocal,
      CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    actor.nid = ACTOR_NID; actor.owner = 'owner'; actor.ink = 100;
    actor.character.actor = actor; actor.character.onEvent = null; actor._nearCamera = () => false;
    G.scene.add(actor.character.root);
    return actor;
  };
  const owner = makeActor('C1155 owner', true), remote = makeActor('C1155 remote', false);
  G.actors = [owner, remote];
  const members = new Set(['owner', 'viewer']), cfg = { id: 'c1155-presentation', map: 'reef', difficulty: 'normal' };
  const packets = [];
  const sender = new f.NetMatch({ myId: 'owner', hostId: 'owner', isHost: true, _members: members,
    tr: { broadcast: msg => packets.push(clone(msg)), sendTo() {} } }, cfg);
  sender.bind({ actors: [owner], state: 'playing', time: 180, opts: {} });
  const receiver = new f.NetMatch({ myId: 'viewer', hostId: 'owner', isHost: false, _members: members,
    tr: { broadcast() {}, sendTo() {} } }, cfg);
  receiver.bind({ actors: [remote], state: 'playing', time: 180, opts: {} });

  function ownerStep(dt, input) {
    nowMs += dt * 1000; G.time += dt;
    owner.weaponRunner.update(dt, input);
  }
  function snapshot() {
    sender._sendTick();
    assert.ok(packets.length, 'the owner emitted a NetMatch snapshot');
    return packets.at(-1);
  }
  function deliver(packet, dt = 0) {
    receiver.onMessage('owner', clone(packet));
    const peer = receiver._peer('owner'); peer.tr = packet.ts;
    receiver._sample(remote, packet.ts, 0); receiver.applyRemote(remote, dt);
  }
  return { f, G, owner, remote, sender, receiver, packets, ownerStep, snapshot, deliver };
}

test('C1155 full production composition replicates accepted Roller pose mode and epoch only', async () => {
  const pair = await makePair();
  const { f, G, owner, remote, receiver, ownerStep, snapshot, deliver } = pair;
  const poses = new Map();
  let lastEpoch = 0;

  for (const mode of ['horizontal', 'vertical']) {
    owner.weaponRunner.reset(); remote.weaponRunner.reset();
    remote.character.s3RollerFlick = null;
    owner.alive = true; owner.grounded = mode === 'horizontal'; owner.stats.deaths = 0;
    ownerStep(1 / 60, { fire: true, firePressed: true });
    const accepted = owner.weaponRunner.s3RollerAttack;
    assert.ok(accepted, `${mode} input was accepted by the owner runner`);
    assert.equal(accepted.vertical, mode === 'vertical');

    const packet = snapshot();
    const wire = packet.rf?.[ACTOR_NID];
    assert.equal(wire?.[0], PRESENTATION_TAG, 'the optional sidecar carries the bounded Roller pose schema');
    assert.equal(wire[3], 1); assert.equal(wire[4], mode === 'vertical' ? 1 : 0);
    assert.ok(Number.isSafeInteger(wire[2]) && wire[2] > lastEpoch, 'each accepted action gets a newer epoch');
    lastEpoch = wire[2];
    assert.equal(packet.a[0].length, 24, 'the legacy actor row width remains unchanged');
    deliver(packet);

    const presentation = remote.character.s3RollerFlick;
    assert.equal(presentation?.networkRemote, true);
    assert.equal(presentation?.vertical, accepted.vertical);
    assert.equal(presentation?.epoch, wire[2]);
    assert.equal(presentation?.windup, accepted.windup);
    assert.equal(presentation?.interval, accepted.interval);
    assert.equal(presentation?.elapsed, accepted.elapsed);
    assert.equal(remote.weaponRunner.s3RollerAttack, null,
      'remote presentation never creates an authoritative WeaponRunner attack');
    assert.equal(remote.s3?.actions?.roller ?? null, null);

    const channels = remote.character.P.slice();
    remote.character._poseFlick(channels, .1);
    poses.set(mode, channels);

    // The owner sends 20 Hz snapshots while the remote samples at each requested render rate.
    let ownerFrames = 0, rendered = 0;
    const hz = mode === 'horizontal' ? 30 : 120;
    while (ownerFrames < 12) {
      ownerStep(1 / 60, { fire: true }); ownerFrames++;
      if (ownerFrames % 3 === 0) {
        const next = snapshot(); deliver(next);
        assert.equal(remote.character.s3RollerFlick?.epoch, wire[2]);
      }
      rendered += hz / 60;
      while (rendered >= 1) { receiver.applyRemote(remote, 1 / hz); rendered--; }
    }
    assert.ok(remote.character.s3RollerFlick.elapsed >= accepted.elapsed,
      'remote elapsed pose time advances monotonically between 20 Hz snapshots');

    const beforeDuplicate = remote.net.buf.length;
    receiver.onMessage('owner', clone(packet));
    const stale = clone(packet); stale.ts -= .01;
    receiver.onMessage('owner', stale);
    assert.equal(remote.net.buf.length, beforeDuplicate,
      'duplicate and older snapshots cannot rewind accepted presentation');

    const lowerEpoch = clone(snapshot());
    lowerEpoch.ts += .03; lowerEpoch.rf[ACTOR_NID][2] = wire[2] - 1;
    lowerEpoch.rf[ACTOR_NID][10] += 2;
    deliver(lowerEpoch);
    assert.equal(remote.character.s3RollerFlick?.epoch, wire[2],
      'a delayed old action epoch in a newer packet cannot replace the accepted pose');
    const beforeUnauthorized = remote.character.s3RollerFlick;
    receiver.onMessage('intruder', lowerEpoch);
    assert.equal(remote.character.s3RollerFlick, beforeUnauthorized,
      'an unauthorized sender cannot change remote presentation');
  }

  assert.notDeepEqual(poses.get('horizontal'), poses.get('vertical'),
    'accepted mode selects a different real Character swing pose');

  owner.weaponRunner.reset(); owner.stats.deaths = 1; owner.alive = false;
  const death = snapshot(); deliver(death);
  assert.equal(remote.character.s3RollerFlick, null, 'death clears the remote pose timeline');
  owner.alive = true;
  const respawn = snapshot(); deliver(respawn);
  assert.equal(remote.character.s3RollerFlick, null, 'respawn does not revive an earlier flick');

  owner.weapon = f.WEAPONS.shooter;
  const switched = snapshot(); deliver(switched);
  assert.equal(remote.character.s3RollerFlick, null, 'weapon switch clears the remote Roller pose');
  assert.equal(G.actors.length, 2);
});
