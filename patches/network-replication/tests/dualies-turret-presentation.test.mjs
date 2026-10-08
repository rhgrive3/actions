import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { DUALIES_TURRET_FLAG } from '../../splatoon3/runtime/dualies-network.mjs';

test('#1156 full production composition reserves an independent turret pose flag', async () => {
  let time = 1000;
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true, realProjectiles: true,
    vmPerformance: { now: () => time } });
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  const actor = local => {
    const a = new f.Actor({ team: 0, name: 'C1156', weapon: 'dualies', isLocal: local,
      CharacterClass: f.Character, style: { hair: 0 } });
    a.nid = 1156; a.owner = 'owner'; a.grounded = true; a.ink = 100;
    a.character.actor = a; a.character.onEvent = null; a._nearCamera = () => false;
    G.scene.add(a.character.root); return a;
  };
  const owner = actor(true), remote = actor(false); G.actors = [owner, remote];
  const packets = [], members = new Set(['owner', 'viewer']);
  const sender = new f.NetMatch({ myId: 'owner', hostId: 'owner', isHost: true, _members: members,
    tr: { broadcast: m => packets.push(JSON.parse(JSON.stringify(m))), sendTo() {} } }, {});
  const receiver = new f.NetMatch({ myId: 'viewer', hostId: 'owner', isHost: false, _members: members,
    tr: { broadcast() {}, sendTo() {} } }, {});
  sender.bind({ actors: [owner] }); receiver.bind({ actors: [remote] });
  try {
    // Every currently reserved gameplay/swim/Roller/armor/gear flag is below bit27.
    assert.equal(DUALIES_TURRET_FLAG & ((1 << 27) - 1), 0);
    owner.weaponRunner.s3Turret = true;
    sender._sendTick(); const packet = packets.at(-1);
    assert.ok(packet.a[0][10] & DUALIES_TURRET_FLAG);
    receiver.onMessage('owner', packet);
    const peer = receiver._peer('owner'); peer.tr = packet.ts;
    receiver._sample(remote, peer.tr, 1 / 60); receiver.applyRemote(remote, 1 / 60);
    assert.equal(remote.character.s3RemoteTurretPose, true);
    assert.equal(remote.weaponRunner.s3Turret, false);
    const channels = remote.character.P.slice(); remote.character._poseDodge(channels, 0);
    // Clearing the owner stance must retain all independently packed flags.
    const prior = packet.a[0][10] & ~DUALIES_TURRET_FLAG;
    owner.weaponRunner.s3Turret = false; time += 50; G.time += .05;
    sender._sendTick(); const clear = packets.at(-1);
    assert.equal(clear.a[0][10] & DUALIES_TURRET_FLAG, 0);
    assert.equal(clear.a[0][10], prior);
    receiver.onMessage('owner', clear); peer.tr = clear.ts;
    receiver._sample(remote, peer.tr, 1 / 60); receiver.applyRemote(remote, 1 / 60);
    assert.equal(remote.character.s3RemoteTurretPose, false);
  } finally { receiver.dispose(); sender.dispose(); owner.character.dispose(); remote.character.dispose(); }
});
