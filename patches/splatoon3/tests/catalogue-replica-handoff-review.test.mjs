import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
const subIds = ['beakon', 'splashWall', 'inkMine', 'torpedo'];
const specialIds = ['waveBreaker', 'splattercolorScreen', 'superChump', 'tripleInkstrike'];
function world(id, adopt) {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.camera = new THREE.PerspectiveCamera();
  G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    spawnPads: [[-30, 0, 0], [30, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-40, -.5, -40], max: [40, 0, 40] }] });
  G.physics = new f.Physics(G.level);
  G.match = { state: 'playing', mode: 'turf', actors: G.actors, playing: () => true,
    removeActor(a) { this.actors.splice(this.actors.indexOf(a), 1); } };
  const owner = f.make(); Object.assign(owner, { nid: 7, owner: 'A', remote: true });
  owner.weapon = { ...owner.weapon, ...(subIds.includes(id) ? { sub: id } : { special: id }) };
  const s = { myId: adopt ? 'B' : 'me', hostId: 'B', isHost: adopt, _members: new Set(['me', 'A', 'B']),
    tr: { broadcast() { return true; }, sendTo() { return true; } } };
  const n = new f.NetMatch(s, { id: 'catalogue-replica-handoff', mode: 'turf', map: 'reef' });
  n.match = G.match; n.byNid = new Map([[7, owner]]); n._setupActor(owner); G.netm = n;
  let ghost;
  if (subIds.includes(id)) {
    const p = { v: 1, subId: id, seq: 1, eventSeq: 1, life: 0, sourceLife: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, seed: 1, charge: 0, subPowerAP: 0 };
    n._play('A', [1, 'ac', 'sub', 7, 0, { ...p, phase: 'spawn' }]);
    if (id !== 'torpedo') n._play('A', [1, 'ac', 'sub', 7, 0, { ...p, eventSeq: 2, phase: 'deploy', usesLeft: 2 }]);
    ghost = G.projectiles._s3SubObjects.find(o => o.owner === owner);
    assert.ok(ghost?.ghost, 'control: native catalogue replay created the sub replica');
  } else {
    const kind = { waveBreaker: 'wave', splattercolorScreen: 'screen', superChump: 'decoy', tripleInkstrike: 'marker' }[id];
    const p = { id, action: 'deploy', kind, activation: 1, object: 1, seed: 1, pos: [0, 0, 0], target: [0, 0, 1],
      phase: 'active', age: 0, landedAt: 0,
      ...({waveBreaker:{duration:6,radius:20,hp:480},splattercolorScreen:{duration:10,radius:15,hp:0},
        superChump:{duration:5,radius:7,hp:60},tripleInkstrike:{duration:2,radius:7,hp:0}}[id]),
      specialPowerAP: 0, waveFrame: 160 / 60 };
    // Admission depends on the accepted native use as well as the equipped
    // kit. Build the wire envelope with the production recorder; _tick normally
    // attaches these sequence/tick sidecars before _play.
    const sender = new f.NetMatch({ myId: 'A', hostId: 'B', isHost: false }, {});
    sender._rec(['ev', 'special:use', { actor: { n: 7 }, id }]);
    sender._rec(['ac', 'special', 7, 0, p]);
    const [use, deploy] = JSON.parse(JSON.stringify(sender.out));
    sender.dispose();
    for (const event of [use, deploy]) {
      event._netSeq = event.at(-1); event._netTick = event.at(-2);
    }
    n._peer('A');
    n._play('A', deploy);
    assert.equal(G.projectiles._s3AllSpecialObjects.some(o => o.owner === owner), false,
      'control: a catalogue action alone cannot create the special replica');
    n._play('A', use);
    ghost = G.projectiles._s3AllSpecialObjects.find(o => o.owner === owner);
    assert.ok(ghost?.remote, 'control: native catalogue replay created the special replica');
  }
  return { owner, n, ghost };
}

for (const id of [...subIds, ...specialIds]) for (const boundary of ['leave-remote', 'leave-adopt', 'remove']) {
  test(`${id}: native ${boundary} retires only the departed replica`, () => {
    const w = world(id, boundary === 'leave-adopt');
    try {
      if (boundary === 'remove') w.n._remove(w.owner);
      else w.n.onLeave('A', false);
      assert.equal(w.ghost.dead, true, 'a departed replica must not remain a collider or become a new authority');
      const list = subIds.includes(id) ? f.G.projectiles._s3SubObjects : f.G.projectiles._s3AllSpecialObjects;
      assert.equal(list.includes(w.ghost), false);
      assert.equal(w.ghost.mesh?.parent || null, null);
      if (id === 'beakon') assert.equal(f.G.s3Beakons?.includes(w.ghost) || false, false, 'removed Beakon is no longer a jump destination');
      if (boundary === 'leave-adopt') {
        assert.equal(w.owner.remote, false); assert.equal(w.owner.owner, 'B');
        if (id === 'torpedo') {
          const fresh = f.G.projectiles.throwBomb(w.owner);
          assert.ok(fresh && !fresh.ghost, 'the stale replica cannot block the adopted bot first Torpedo');
        }
      }
    } finally { w.n.dispose(); f.G.netm = null; }
  });
}

for (const id of ['beakon', 'waveBreaker']) test(`${id}: ordinary owner respawn and unrelated departure preserve a deployed replica`, () => {
  const w = world(id, false);
  try {
    w.owner.spawnAt(new f.THREE.Vector3(12, 0, 0), 0); w.n.onLeave('unrelated', false);
    assert.equal(w.ghost.dead, false, 'a new owner life is not a disconnect/removal');
    const list = id === 'beakon' ? f.G.projectiles._s3SubObjects : f.G.projectiles._s3AllSpecialObjects;
    assert.equal(list.includes(w.ghost), true);
  } finally { w.n.dispose(); f.G.netm = null; }
});
