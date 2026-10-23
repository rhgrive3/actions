import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
  extraExports: "export { hasReceiverTorpedoObservation } from './patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs';" });
const ids = ['burst', 'fizzy', 'toxicMist', 'angleShooter', 'splashWall', 'beakon', 'inkMine', 'torpedo'];
const config = { id: 'catalogue-life-order', mode: 'turf', map: 'reef' };
function session(myId, sent) {
  return { myId, hostId: 'B', isHost: myId === 'B', _members: new Set(['A', 'B']),
    tr: { broadcast(d) { sent.push(JSON.parse(JSON.stringify(d))); return true; }, sendTo() { return true; } } };
}
function world(id) {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.level = new f.Level({ bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    spawnPads: [[-50, 0, 0], [50, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-60, -.5, -60], max: [60, 0, 60] }] });
  G.physics = new f.Physics(G.level);
  const source = f.make(), proxy = f.make();
  for (const a of [source, proxy]) { Object.assign(a, { nid: 7, owner: 'A' }); a.weapon = { ...a.weapon, sub: id }; }
  const match = actors => ({ state: 'playing', mode: 'turf', time: 180, actors, playing: () => true });
  const sent = [], sender = new f.NetMatch(session('A', sent), config), receiver = new f.NetMatch(session('B', []), config);
  sender.bind(match([source])); receiver.bind(match([proxy]));
  return { source, proxy, sent, sender, receiver };
}

for (const hz of [30, 60, 120]) for (const life of [0, 2]) for (const id of ids) {
  test(`${id} native catalogue birth survives sample/event ordering, life ${life}/${hz}Hz`, () => {
    const w = world(id), { G } = f;
    try {
      G.match = w.sender.match; G.netm = w.sender; G.actors = [w.source];
      for (let i = 0; i < life; i++) w.source.spawnAt(new f.THREE.Vector3(40, 0, 0), 0);
      w.source.weapon = { ...w.source.weapon, sub: id };
      const object = G.projectiles.throwBomb(w.source); assert.ok(object);
      w.sender._sendTick(); const packet = w.sent.at(-1);
      const birth = packet.e.find(e => e[1] === 'ac' && e[2] === 'sub' && e[5].phase === 'spawn');
      assert.ok(birth, 'actual source action emits a catalogue birth');
      G.match = w.receiver.match; G.netm = w.receiver; G.actors = [w.proxy];
      w.receiver.onMessage('A', packet);
      assert.equal(w.proxy.net.lastLife, life);
      const peer = w.receiver.peers.get('A'); peer.tr = packet.ts + .001; peer.sim = packet.u;
      w.receiver._sample(w.proxy, peer.tr, 1 / hz);
      assert.equal(w.proxy.netLife || 0, 0, 'Actor display has not consumed the newly sampled life');
      w.receiver._playEvents();
      const ghosts = G.projectiles._s3SubObjects.filter(o => o.owner === w.proxy);
      assert.equal(ghosts.length, 1, 'accepted same-life sub birth must create its replica');
      assert.equal(ghosts[0].sourceLife, life, 'object identity uses the admitted source life');
      assert.equal(ghosts[0].ghost, true, 'this remains a replica, never a second authority');
      if (id === 'torpedo') assert.equal(f.hasReceiverTorpedoObservation(ghosts[0]), true,
        'the accepted source birth still enrolls its limited receiver trajectory');
      w.receiver.applyRemote(w.proxy, 1 / hz); assert.equal(w.proxy.netLife, life);
      if (life) {
        const stale = birth.slice(), seq = (peer._lastEventSeq || 0) + 1;
        stale[4] = 0; stale[5] = { ...birth[5], life: 0, sourceLife: 0, seq: birth[5].seq + 1 };
        stale[7] = seq; w.receiver._play('A', stale);
        assert.equal(G.projectiles._s3SubObjects.filter(o => o.owner === w.proxy).length, 1,
          'new serial cannot authorize an old-life birth');
      }
    } finally { w.receiver.dispose(); w.sender.dispose(); G.netm = null; }
  });
}

for (const bad of [{ pops: -1, fuse: .2 }, { pops: 1, fuse: -1 }, { pops: 1, fuse: .7 }]) {
  test(`malformed Fizzy hop is rejected without moving its existing replica: ${JSON.stringify(bad)}`, () => {
    const w = world('fizzy'), { G } = f;
    try {
      G.match = w.sender.match; G.netm = w.sender; G.actors = [w.source];
      G.projectiles.throwBomb(w.source); w.sender._sendTick(); const packet = w.sent.at(-1);
      const birth = packet.e.find(e => e[1] === 'ac' && e[2] === 'sub' && e[5].phase === 'spawn');
      G.match = w.receiver.match; G.netm = w.receiver; G.actors = [w.proxy];
      w.receiver.onMessage('A', packet);
      const peer = w.receiver.peers.get('A'); peer.tr = packet.ts + .001; peer.sim = packet.u;
      w.receiver._sample(w.proxy, peer.tr, 1 / 60); w.receiver._playEvents();
      const ghost = G.projectiles._s3SubObjects.find(o => o.owner === w.proxy); assert.ok(ghost);
      const state = () => JSON.stringify({ pos: ghost.pos.toArray(), prev: ghost.prev.toArray(), vel: ghost.vel.toArray(),
        phase: ghost.phase, age: ghost.age, fuse: ghost.fuse, pops: ghost.pops });
      const before = state(), hop = birth.slice();
      hop[5] = { ...birth[5], phase: 'fizzyHop', x: 20, vx: 90, ...bad };
      hop[7] = (peer._lastEventSeq || 0) + 1;
      w.receiver._play('A', hop);
      assert.equal(state(), before, 'all state remains at the accepted birth');
    } finally { w.receiver.dispose(); w.sender.dispose(); G.netm = null; }
  });
}
